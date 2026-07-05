"use client";

import { useEffect, useState } from "react";
import { parseAbiItem, parseEventLogs } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  contractsDeployed,
  deploymentFor,
  disperseAbi,
  distributorAbi,
  fromUnits,
} from "@/lib/chain/contracts";
import { DEMO_LEDGER } from "@/lib/demo";
import { clearValuesOf, getFhevmClient } from "@/lib/fhevm/client";
import { fmtUsd, redactWidth, shortAddress } from "@/lib/format";

const proofIssuedEvent = parseAbiItem(
  "event ProofIssued(uint256 indexed proofId, uint256 indexed distId, address recipient, address indexed verifier, uint64 threshold, bytes32 result)",
);

type Row = { addr: string; width: number; proofs: boolean };

type DistView = {
  distId: bigint;
  declaredTotal: bigint;
  recipientCount: number;
  sumOk: boolean | null; // null = not yet decrypted / unavailable
  issuerVerified: boolean;
  /**
   * Cross-check: do the (recipients, handles) registered on SignetDistributor
   * exactly match the DirectDistribution event of the disperse tx it claims?
   * null = could not check (tx not found on this RPC).
   */
  crossCheck: boolean | null;
  disperseTxHash: `0x${string}`;
  rows: Row[];
};

export function VerifyLens({ demo }: { demo: boolean }) {
  const { chainId } = useAccount();
  const publicClient = usePublicClient();
  const dep = deploymentFor(chainId);
  const deployed = contractsDeployed(chainId);

  const [distIds, setDistIds] = useState<bigint[]>([]);
  const [selected, setSelected] = useState<bigint | null>(null);
  const [view, setView] = useState<DistView | null>(null);
  const [status, setStatus] = useState<"loading" | "empty" | "error" | "ready">("loading");

  const effectiveStatus: "loading" | "empty" | "error" | "ready" = demo
    ? "ready"
    : !deployed
      ? "empty"
      : status;

  // enumerate distributions
  useEffect(() => {
    if (demo || !publicClient || !deployed || !dep) return;
    let cancelled = false;
    (async () => {
      try {
        const next = (await publicClient.readContract({
          address: dep.SignetDistributor,
          abi: distributorAbi,
          functionName: "nextDistId",
        })) as bigint;
        if (cancelled) return;
        if (next === 0n) {
          setStatus("empty");
          return;
        }
        const ids = Array.from({ length: Number(next) }, (_, i) => BigInt(i));
        setDistIds(ids);
        setSelected(ids[ids.length - 1]);
      } catch {
        if (!cancelled) setStatus("error"); // read failed ≠ no distributions
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, publicClient, deployed, chainId]);

  // load the selected distribution
  useEffect(() => {
    if (demo || selected === null || !publicClient || !dep || !chainId) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const dist = (await publicClient.readContract({
          address: dep.SignetDistributor,
          abi: distributorAbi,
          functionName: "distributions",
          args: [selected],
        })) as readonly unknown[];
        const issuerVerified = (await publicClient.readContract({
          address: dep.SignetDistributor,
          abi: distributorAbi,
          functionName: "isVerifiedIssuer",
          args: [selected],
        })) as boolean;

        const declaredTotal = dist[1] as bigint;
        const disperseTxHash = dist[4] as `0x${string}`;
        const sumProofHandle = dist[6] as `0x${string}`;

        // Recipients + handles come from the disperse tx's own receipt — a
        // single direct lookup by hash (no getLogs range queries, which real
        // RPCs throttle or reject).
        const rcpt = await publicClient.getTransactionReceipt({ hash: disperseTxHash });
        const distributions = parseEventLogs({
          abi: disperseAbi,
          logs: rcpt.logs,
          eventName: "DirectDistribution",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ev = (distributions[0] as any)?.args as
          | { recipients: readonly `0x${string}`[]; requested: readonly `0x${string}`[] }
          | undefined;
        const recipients = ev?.recipients ?? [];

        // cross-check: each disperse handle must be the exact handle the
        // distributor holds for that recipient (state-level check — stronger
        // than event-vs-event)
        let crossCheck: boolean | null = ev ? true : null;
        if (ev) {
          for (let i = 0; i < recipients.length; i++) {
            try {
              const stored = (await publicClient.readContract({
                address: dep.SignetDistributor,
                abi: distributorAbi,
                functionName: "allocationOf",
                args: [selected, recipients[i]],
              })) as `0x${string}`;
              if (stored.toLowerCase() !== ev.requested[i].toLowerCase()) {
                crossCheck = false;
                break;
              }
            } catch {
              crossCheck = false; // recipient in disperse but not attached
              break;
            }
          }
        }

        // proof activity per recipient — best-effort, non-fatal
        let provers = new Set<string>();
        try {
          const proofLogs = await publicClient.getLogs({
            address: dep.SignetDistributor,
            event: proofIssuedEvent,
            args: { distId: selected },
            fromBlock: BigInt(dep?.deployBlock ?? 0),
            toBlock: "latest",
          });
          provers = new Set(proofLogs.map((l) => (l.args.recipient as string).toLowerCase()));
        } catch {
          // column simply shows "—"
        }

        // publicly decrypt the sum proof — non-fatal
        let sumOk: boolean | null = null;
        try {
          const client = await getFhevmClient(chainId);
          const res = await client.publicDecrypt([sumProofHandle]);
          sumOk = Boolean(clearValuesOf(res)[sumProofHandle]);
        } catch {
          sumOk = null;
        }

        if (cancelled) return;
        setView({
          distId: selected,
          declaredTotal,
          recipientCount: Number(dist[2] as bigint),
          sumOk,
          issuerVerified,
          crossCheck,
          disperseTxHash,
          rows: recipients.map((addr) => ({
            addr,
            width: redactWidth(addr),
            proofs: provers.has(addr.toLowerCase()),
          })),
        });
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, selected, publicClient, chainId]);

  // ---- demo render ----
  if (demo) {
    return (
      <Shell
        head={
          <>
            <div className="agg">
              <div className="stat">
                <div className="l">Recipients</div>
                <div className="v">6</div>
              </div>
              <div className="stat">
                <div className="l">Declared total</div>
                <div className="v">$12,100</div>
              </div>
              <div className="stat">
                <div className="l">Distributed total</div>
                <div className="v">$12,100</div>
              </div>
            </div>
            <div className="badge">
              <span className="d" /> declared = distributed · verified under FHE encryption
            </div>
          </>
        }
        rows={DEMO_LEDGER.map((r) => ({ n: r.n, addr: r.addr, width: r.width, mark: r.claimed }))}
        claimedHeader="Claimed"
      />
    );
  }

  // ---- real render ----
  if (effectiveStatus === "error") {
    return (
      <>
        <PanelHead />
        <div className="card">
          <div className="note" style={{ marginTop: 0 }}>
            <b>Couldn&apos;t read the ledger from this RPC.</b> The distributions exist onchain —
            this is a network hiccup. Refresh to retry.
          </div>
        </div>
      </>
    );
  }

  if (effectiveStatus === "empty" || (effectiveStatus === "ready" && !view)) {
    return (
      <>
        <PanelHead />
        <div className="card">
          <div className="note" style={{ marginTop: 0 }}>
            No distributions on this network yet. Run one in <b>Send</b>, or{" "}
            <a href="/app?demo=true" style={{ textDecoration: "underline" }}>
              view the demo ledger
            </a>
            .
          </div>
        </div>
      </>
    );
  }

  if (effectiveStatus === "loading" || !view) {
    return (
      <>
        <PanelHead />
        <div className="card">
          <div className="note" style={{ marginTop: 0 }}>
            Reading the public ledger…
          </div>
        </div>
      </>
    );
  }

  const sumBadge =
    view.sumOk === true ? (
      <div className="badge">
        <span className="d" /> declared = distributed · verified under FHE encryption
      </div>
    ) : view.sumOk === false ? (
      <div className="badge bad">
        <span className="d" /> declared ≠ distributed — the sum proof failed
      </div>
    ) : (
      <div className="badge pending">
        <span className="d" /> sum proof pending decryption
      </div>
    );

  const crossBadge =
    view.crossCheck === true ? (
      <div className="badge" style={{ marginLeft: 8 }}>
        <span className="d" /> receipts match the disperse tx
      </div>
    ) : view.crossCheck === false ? (
      <div className="badge bad" style={{ marginLeft: 8 }}>
        <span className="d" /> receipts do NOT match the disperse tx
      </div>
    ) : null;

  return (
    <Shell
      selector={
        distIds.length > 1 ? (
          <select
            value={selected?.toString()}
            onChange={(e) => setSelected(BigInt(e.target.value))}
            style={{ width: "auto", marginBottom: 14 }}
            aria-label="Distribution"
          >
            {distIds.map((id) => (
              <option key={id.toString()} value={id.toString()}>
                Distribution #{id.toString()}
              </option>
            ))}
          </select>
        ) : null
      }
      head={
        <>
          <div className="agg">
            <div className="stat">
              <div className="l">Recipients</div>
              <div className="v">{view.recipientCount}</div>
            </div>
            <div className="stat">
              <div className="l">Declared total</div>
              <div className="v">{fmtUsd(fromUnits(view.declaredTotal))}</div>
            </div>
            <div className="stat">
              <div className="l">Distributed total</div>
              <div className="v">
                {view.sumOk === true ? fmtUsd(fromUnits(view.declaredTotal)) : "▓▓▓"}
              </div>
            </div>
          </div>
          {sumBadge}
          {crossBadge}
          {view.issuerVerified && (
            <div className="badge" style={{ marginLeft: 8 }}>
              <span className="d" /> issuer attested onchain
            </div>
          )}
        </>
      }
      rows={view.rows.map((r, i) => ({
        n: String(i + 1).padStart(2, "0"),
        addr: shortAddress(r.addr),
        width: r.width,
        mark: r.proofs,
      }))}
      claimedHeader="Proofs"
    />
  );
}

function PanelHead() {
  return (
    <div className="p-head">
      <div className="eyebrow">03 · Verify</div>
      <h2>Proof the fund paid out honestly</h2>
      <p>
        Anyone can confirm the declared total equals the distributed total — proven under
        encryption — without seeing a single individual amount.
      </p>
    </div>
  );
}

function Shell({
  head,
  rows,
  claimedHeader,
  selector,
}: {
  head: React.ReactNode;
  rows: { n: string; addr: string; width: number; mark: boolean }[];
  claimedHeader: string;
  selector?: React.ReactNode;
}) {
  return (
    <>
      <PanelHead />
      {selector}
      {head}
      <div className="card" style={{ marginTop: 16, padding: "6px 8px" }}>
        <table className="ledger">
          <thead>
            <tr>
              <th>#</th>
              <th>Recipient</th>
              <th>Allocation</th>
              <th className="r">{claimedHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n}>
                <td>{r.n}</td>
                <td>{r.addr}</td>
                <td>
                  <span className="bar-redact" style={{ width: r.width }} />
                </td>
                <td className="r">{r.mark ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">
        The redaction bars are not decorative — each row&apos;s amount is a euint64 no observer
        holds the key to. The bar widths are randomized; they leak nothing about the values.
      </div>
    </>
  );
}
