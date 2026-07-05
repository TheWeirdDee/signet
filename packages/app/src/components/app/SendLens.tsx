"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatEther, isAddress } from "viem";
import { useAccount, usePublicClient, useSignTypedData, useWalletClient } from "wagmi";
import { useToast } from "@/components/Toast";
import { contractsDeployed, deploymentFor, SEPOLIA_CHAIN_ID, toUnits } from "@/lib/chain/contracts";
import { DEMO_ROWS, DEMO_TX_HASH, parseRows } from "@/lib/demo";
import { runDisperse, type DisperseStage } from "@/lib/disperse";
import { fmtUsd, shortAddress } from "@/lib/format";

/** Prefill for the local node: well-known hardhat accounts #2–#7, mock amounts. */
const LOCAL_ROWS = `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC , 2350
0x90F79bf6EB2c4f870365E785982E1f101E93b906 , 1800
0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 , 3200
0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc , 1250
0x976EA74026E726554dB657fA54763abd0C3a0aa9 , 2600
0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 , 900`;

type Stage = "idle" | DisperseStage | "done";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "Seal & disperse",
  approving: "Approving disperse operator…",
  encrypting: "Encrypting amounts…",
  dispersing: "Dispersing (confidential)…",
  verifying: "Verifying settlement…",
  disclosing: "Disclosing receipts…",
  registering: "Sealing distribution…",
  done: "Sealed ✓",
};

/** The sealing ceremony, in order — rendered as a live checklist mid-flow. */
const CEREMONY: { key: DisperseStage; label: string; hint: string }[] = [
  { key: "approving", label: "Approve disperse operator", hint: "one-time ERC-7984 approval" },
  { key: "encrypting", label: "Encrypt amounts client-side", hint: "euint64 · never cleartext onchain" },
  { key: "dispersing", label: "Confidential disperse", hint: "one tx · TokenOps SDK" },
  { key: "verifying", label: "Verify settlement integrity", hint: "transferred must equal allocated" },
  { key: "disclosing", label: "Disclose receipts", hint: "compute rights → distributor" },
  { key: "registering", label: "Seal receipts + sum-proof", hint: "verified onchain attach" },
];

export function SendLens({ demo }: { demo: boolean }) {
  const toast = useToast();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { signTypedDataAsync } = useSignTypedData();

  const [text, setText] = useState(demo ? DEMO_ROWS : LOCAL_ROWS);
  const [stage, setStage] = useState<Stage>("idle");
  const [reached, setReached] = useState<Set<DisperseStage>>(new Set());
  const [feeWei, setFeeWei] = useState<bigint | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<React.ReactNode>(
    "One confidential disperse. The declared total is committed publicly; individual amounts stay encrypted.",
  );

  const rows = useMemo(() => parseRows(text), [text]);
  const total = useMemo(() => rows.reduce((a, r) => a + r.amount, 0), [rows]);
  const dep = deploymentFor(chainId);

  // fee preview: the TokenOps singleton charges a per-recipient ETH gas fee
  // in direct mode — surface it before the user commits
  useEffect(() => {
    if (demo || chainId !== SEPOLIA_CHAIN_ID || !publicClient || !dep) return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = (await publicClient.readContract({
          address: dep.Disperse,
          abi: [
            {
              type: "function",
              name: "feeConfig",
              stateMutability: "view",
              inputs: [],
              outputs: [
                { name: "gasFeeEnabled", type: "bool" },
                { name: "tokenFeeEnabled", type: "bool" },
                { name: "defaultGasFee", type: "uint96" },
                { name: "defaultTokenFee", type: "uint16" },
              ],
            },
          ] as const,
          functionName: "feeConfig",
        })) as readonly [boolean, boolean, bigint, number];
        if (!cancelled) setFeeWei(cfg[0] ? cfg[2] : 0n);
      } catch {
        if (!cancelled) setFeeWei(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, chainId, publicClient]);

  function importCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^(address|recipient)/i.test(l)) // drop a header row
        .map((l) => l.replace(/[;\t]/g, ","))
        .join("\n");
      if (raw) {
        setText(raw);
        toast(`Imported ${raw.split("\n").length} rows from ${file.name}`);
      } else {
        toast("That file had no usable rows — expected `address, amount` lines");
      }
    };
    reader.readAsText(file);
  }

  async function disperseDemo() {
    setStage("encrypting");
    setTimeout(() => setStage("registering"), 900);
    setTimeout(() => {
      setStage("done");
      setNote(
        <>
          Dispersed in one transaction · <b>{DEMO_TX_HASH}</b>. Amounts encrypted; declared total
          committed publicly. Switch to <b>Verify</b> to see the honest-payout proof.
        </>,
      );
      toast("Distribution sealed — one confidential disperse");
    }, 1900);
    setTimeout(() => setStage("idle"), 4200);
  }

  async function disperseReal() {
    if (!address || !publicClient || !walletClient || !chainId) return;
    const targets = rows.filter((r) => isAddress(r.label) && r.amount > 0);
    if (targets.length === 0) {
      toast("No valid rows — use `0xaddress , amount` per line");
      return;
    }
    if (targets.length !== rows.length) {
      toast(`Skipping ${rows.length - targets.length} row(s) without a valid 0x address`);
    }
    if (targets.length > 20) {
      toast("Direct-mode disperse is capped at 20 recipients per batch");
      return;
    }

    try {
      setReached(new Set());
      const outcome = await runDisperse({
        chainId,
        account: address,
        recipients: targets.map((r) => r.label as `0x${string}`),
        amountsUnits: targets.map((r) => toUnits(r.amount)),
        publicClient,
        walletClient,
        signTypedData: (args) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          signTypedDataAsync(args as any),
        onStage: (s) => {
          setStage(s);
          setReached((prev) => new Set(prev).add(s));
        },
      });
      setReached((prev) => {
        const all = new Set(prev);
        CEREMONY.forEach((c) => all.add(c.key));
        return all;
      });

      setStage("done");
      setNote(
        <>
          Distribution <b>#{outcome.distId.toString()}</b> sealed · disperse tx{" "}
          <b>{shortAddress(outcome.disperseTxHash)}</b>
          {chainId === SEPOLIA_CHAIN_ID && (
            <>
              {" "}
              (
              <a
                href={`https://sepolia.etherscan.io/tx/${outcome.disperseTxHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "underline" }}
              >
                explorer
              </a>
              )
            </>
          )}
          . Settlement verified: every transferred amount equals its allocation. Switch to{" "}
          <b>Verify</b> for the honest-payout proof.
        </>,
      );
      toast(`Distribution #${outcome.distId} sealed — ${outcome.recipientCount} confidential allocations`);
      setTimeout(() => setStage("idle"), 4200);
    } catch (e) {
      setStage("idle");
      const msg = e instanceof Error ? e.message : String(e);
      setNote(
        <>
          <b>Failed:</b> {msg.slice(0, 260)}
        </>,
      );
      toast(msg.startsWith("Settlement incomplete") ? "Settlement incomplete — aborted" : "Disperse failed — see note");
    }
  }

  const busy = stage !== "idle" && stage !== "done";
  const deployed = contractsDeployed(chainId);
  const canSend = demo || (isConnected && deployed);

  return (
    <>
      <div className="p-head">
        <div className="eyebrow">01 · Send</div>
        <h2>Pay everyone at once — amounts sealed</h2>
        <p>
          Paste recipients and amounts, or import a CSV. One confidential disperse through the
          TokenOps SDK. Nothing here lands onchain in cleartext except the addresses.
        </p>
      </div>
      <div className="row-split">
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <label className="fld" htmlFor="rlist">
              Recipients · address, amount (USD)
            </label>
            {!demo && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.txt"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importCsv(f);
                    e.target.value = "";
                  }}
                />
                <button
                  className="btn btn-ghost"
                  style={{ padding: "7px 12px", fontSize: 11 }}
                  onClick={() => fileInput.current?.click()}
                >
                  Import CSV
                </button>
              </>
            )}
          </div>
          <textarea
            id="rlist"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="note">
            <b>ERC-7984:</b> each amount is encrypted client-side into a euint64 before it ever
            touches the chain. Addresses are public — Signet does not hide the recipient list.
          </div>
        </div>
        <div className="card">
          <label className="fld">Distribution</label>
          <div className="rr">
            <span className="k">Recipients</span>
            <span className="mono">{rows.length}</span>
          </div>
          <div className="rr">
            <span className="k">Token</span>
            <span className="s">cUSDT · ERC-7984</span>
          </div>
          <div className="rr">
            <span className="k">Network</span>
            <span className="s">
              {demo ? "Sepolia" : chainId === SEPOLIA_CHAIN_ID ? "Sepolia" : "Localhost · 31337"}
            </span>
          </div>
          {!demo && chainId === SEPOLIA_CHAIN_ID && feeWei !== null && (
            <div className="rr">
              <span className="k">Disperse fee</span>
              <span className="s">
                {formatEther(feeWei * BigInt(Math.max(rows.length, 1)))} ETH · {rows.length} ×{" "}
                {formatEther(feeWei)}
              </span>
            </div>
          )}
          <div className="tot">
            <span className="l">Declared total</span>
            <span className="v">
              {fmtUsd(total)}
              <small>.00</small>
            </span>
          </div>
          <button
            className="btn btn-wax"
            style={{ width: "100%", marginTop: 6 }}
            disabled={busy || !canSend}
            onClick={demo ? disperseDemo : disperseReal}
          >
            {STAGE_LABEL[stage]}
          </button>
          {/* the sealing ceremony — live walkthrough of what's happening */}
          {!demo && (busy || (stage === "done" && reached.size > 0)) && (
            <div style={{ marginTop: 10 }}>
              {CEREMONY.map((c) => {
                const isCurrent = stage === c.key;
                const isDone = reached.has(c.key) && !isCurrent;
                return (
                  <div
                    className="rr"
                    key={c.key}
                    style={{ padding: "8px 0", opacity: isDone || isCurrent ? 1 : 0.45 }}
                  >
                    <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                      <span
                        className="mono"
                        style={{
                          marginRight: 8,
                          color: isDone ? "var(--ok)" : isCurrent ? "var(--wax)" : "var(--muted)",
                        }}
                      >
                        {isDone ? "✓" : isCurrent ? "●" : "○"}
                      </span>
                      {c.label}
                    </span>
                    <span className="s">{c.hint}</span>
                  </div>
                );
              })}
            </div>
          )}
          {!demo && !isConnected && (
            <div className="note">
              Connect a wallet to disperse — or{" "}
              <a href="/app?demo=true" style={{ textDecoration: "underline" }}>
                use demo mode
              </a>
              .
            </div>
          )}
          {!demo && isConnected && !deployed && (
            <div className="note">
              <b>Contracts not deployed on this network.</b> Locally: run{" "}
              <b>npm run node:local</b> then <b>npm run deploy:local</b> in packages/contracts.
            </div>
          )}
          <div className="note">{note}</div>
        </div>
      </div>
    </>
  );
}
