"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { parseEventLogs } from "viem";
import { useAccount, usePublicClient, useSignTypedData } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { Seal } from "@/components/Seal";
import { useToast } from "@/components/Toast";
import {
  contractsDeployed,
  deploymentFor,
  disperseAbi,
  distributorAbi,
  fromUnits,
  LOCAL_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  ZERO_ADDRESS,
} from "@/lib/chain/contracts";
import { getFhevmClient } from "@/lib/fhevm/client";
import { getOrCreateSession, sessionDecrypt } from "@/lib/fhevm/session";
import { fmtUsd, shortAddress } from "@/lib/format";

/**
 * The verifier-facing proof view — what a shared /p/<proofId> link opens.
 *
 * Trust model (deliberate): everything shown here is read ONCHAIN from the
 * proofId — the distribution id, the threshold, the recipient, the issuer's
 * verified status via proofId → distId → verifiedIssuer, and a cross-check
 * that the recipient's receipt handle appears verbatim in the disperse
 * transaction's own DirectDistribution event. Nothing is taken from the
 * sharer's client. The encrypted boolean can be decrypted only by the wallet
 * the recipient scoped it to.
 *
 * Route forms:
 *   /p/<n>   — FHE threshold proof record n
 *   /p/d<n>  — issuer-attestation view for distribution n (public facts only)
 *   /p/demo  — mocked card for demo mode
 */

type ProofData = {
  kind: "fhe";
  proofId: bigint;
  distId: bigint;
  recipient: `0x${string}`;
  verifier: `0x${string}`;
  threshold: bigint;
  issuedAt: number;
  resultHandle: `0x${string}`;
  issuer: `0x${string}`;
  issuerVerified: boolean;
  crossCheck: boolean | null;
};

type DistData = {
  kind: "dist";
  distId: bigint;
  issuer: `0x${string}`;
  issuerVerified: boolean;
  declaredTotal: bigint;
};

export function ProofView({ proofId }: { proofId: string }) {
  const toast = useToast();
  const { address, isConnected, chainId: connectedChainId } = useAccount();

  // A verifier may open this link without a wallet — read from the chain
  // that actually has a deployment (Sepolia once live, localhost in dev).
  const chainId =
    connectedChainId && contractsDeployed(connectedChainId)
      ? connectedChainId
      : contractsDeployed(SEPOLIA_CHAIN_ID)
        ? SEPOLIA_CHAIN_ID
        : LOCAL_CHAIN_ID;
  const dep = deploymentFor(chainId);
  const deployed = contractsDeployed(chainId);
  const publicClient = usePublicClient({ chainId });
  const { signTypedDataAsync } = useSignTypedData();

  const isDemo = proofId === "demo";
  const isDist = /^d\d+$/.test(proofId);
  const isFhe = /^\d+$/.test(proofId);

  const [data, setData] = useState<ProofData | DistData | null>(null);
  const [status, setStatus] = useState<"loading" | "notfound" | "ready">("loading");
  const [verdict, setVerdict] = useState<"TRUE" | "FALSE" | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const effectiveStatus: "loading" | "notfound" | "ready" = isDemo
    ? "ready"
    : (!isDist && !isFhe) || !deployed
      ? "notfound"
      : status;

  useEffect(() => {
    if (isDemo || (!isDist && !isFhe) || !publicClient || !deployed || !dep) return;
    let cancelled = false;
    (async () => {
      try {
        if (isFhe) {
          const p = (await publicClient.readContract({
            address: dep.SignetDistributor,
            abi: distributorAbi,
            functionName: "proofs",
            args: [BigInt(proofId)],
          })) as readonly unknown[];
          const recipient = p[1] as `0x${string}`;
          if (recipient === ZERO_ADDRESS) {
            if (!cancelled) setStatus("notfound");
            return;
          }
          const distId = p[0] as bigint;
          // issuer status is read onchain from proofId → distId, never from the sharer
          const dist = (await publicClient.readContract({
            address: dep.SignetDistributor,
            abi: distributorAbi,
            functionName: "distributions",
            args: [distId],
          })) as readonly unknown[];
          const issuerVerified = (await publicClient.readContract({
            address: dep.SignetDistributor,
            abi: distributorAbi,
            functionName: "isVerifiedIssuer",
            args: [distId],
          })) as boolean;

          // cross-check: the recipient's receipt handle must appear, paired
          // with the recipient, in the disperse tx's own event
          let crossCheck: boolean | null = null;
          try {
            const allocation = (await publicClient.readContract({
              address: dep.SignetDistributor,
              abi: distributorAbi,
              functionName: "allocationOf",
              args: [distId, recipient],
            })) as `0x${string}`;
            const rcpt = await publicClient.getTransactionReceipt({
              hash: dist[4] as `0x${string}`,
            });
            const events = parseEventLogs({
              abi: disperseAbi,
              logs: rcpt.logs,
              eventName: "DirectDistribution",
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ev = (events[0] as any)?.args as
              | { recipients: readonly string[]; requested: readonly string[] }
              | undefined;
            if (ev) {
              const idx = ev.recipients.findIndex(
                (r) => r.toLowerCase() === recipient.toLowerCase(),
              );
              crossCheck = idx >= 0 && ev.requested[idx].toLowerCase() === allocation.toLowerCase();
            }
          } catch {
            crossCheck = null;
          }

          if (cancelled) return;
          setData({
            kind: "fhe",
            proofId: BigInt(proofId),
            distId,
            recipient,
            verifier: p[2] as `0x${string}`,
            threshold: p[3] as bigint,
            issuedAt: Number(p[4] as bigint),
            resultHandle: p[5] as `0x${string}`,
            issuer: dist[0] as `0x${string}`,
            issuerVerified,
            crossCheck,
          });
          setStatus("ready");
        } else {
          const distId = BigInt(proofId.slice(1));
          const dist = (await publicClient.readContract({
            address: dep.SignetDistributor,
            abi: distributorAbi,
            functionName: "distributions",
            args: [distId],
          })) as readonly unknown[];
          if (!(dist[3] as boolean)) {
            if (!cancelled) setStatus("notfound");
            return;
          }
          const issuerVerified = (await publicClient.readContract({
            address: dep.SignetDistributor,
            abi: distributorAbi,
            functionName: "isVerifiedIssuer",
            args: [distId],
          })) as boolean;
          if (cancelled) return;
          setData({
            kind: "dist",
            distId,
            issuer: dist[0] as `0x${string}`,
            issuerVerified,
            declaredTotal: dist[1] as bigint,
          });
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("notfound");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, isDist, isFhe, proofId, publicClient, deployed, chainId]);

  const decrypt = useCallback(async () => {
    if (!data || data.kind !== "fhe" || !address || decrypting || !dep) return;
    setDecrypting(true);
    try {
      const client = await getFhevmClient(chainId);
      const { session } = await getOrCreateSession(client, chainId, address, async (args) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signTypedDataAsync(args as any),
      );
      const res = await sessionDecrypt(client, session, [
        { handle: data.resultHandle, contractAddress: dep.SignetDistributor },
      ]);
      setVerdict(res[data.resultHandle] ? "TRUE" : "FALSE");
      toast("Boolean decrypted — the amount was never in your reach");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast(
        msg.toLowerCase().includes("not")
          ? "Decryption refused — this proof is scoped to its designated verifier"
          : "Decrypt failed: " + msg.slice(0, 100),
      );
    } finally {
      setDecrypting(false);
    }
  }, [data, address, decrypting, chainId, dep, signTypedDataAsync, toast]);

  const mayDecrypt =
    data?.kind === "fhe" &&
    address &&
    connectedChainId === chainId &&
    (address.toLowerCase() === data.verifier.toLowerCase() ||
      address.toLowerCase() === data.recipient.toLowerCase());

  return (
    <>
      <header className="site-header">
        <div className="wrap-app bar" style={{ height: 60 }}>
          <Link className="brand" href="/" style={{ fontSize: 21, gap: 10 }}>
            <Seal className="seal-sm" style={{ width: 26, height: 26 }} />
            Signet
          </Link>
          {!isDemo && <ConnectButton />}
        </div>
      </header>

      <main className="wrap-app app-main" style={{ paddingTop: 40, maxWidth: 720 }}>
        <div className="p-head">
          <div className="eyebrow">Sealed disclosure</div>
          <h2>Verify without seeing the number</h2>
          <p>
            Every fact below is read onchain from the proof record. The exact amount is an
            encrypted euint64 — this page can never show it.
          </p>
        </div>

        {effectiveStatus === "loading" && (
          <div className="card">
            <div className="note" style={{ marginTop: 0 }}>
              Reading the proof record onchain…
            </div>
          </div>
        )}

        {effectiveStatus === "notfound" && (
          <div className="card">
            <div className="note" style={{ marginTop: 0 }}>
              No proof found at this link{deployed ? "" : " (contracts not deployed on this network)"}.{" "}
              <Link href="/app?demo=true" style={{ textDecoration: "underline" }}>
                See the demo instead
              </Link>
              .
            </div>
          </div>
        )}

        {effectiveStatus === "ready" && isDemo && (
          <div className="proofcard">
            <div className="ptitle">Disclosure · to Northwind Lending</div>
            <div>
              <div className="pred">
                <span>allocation ≥ $2,000</span>
                <span className="yes">→ TRUE</span>
              </div>
              <div className="pred">
                <span>issued by verified fund</span>
                <span className="yes">→ TRUE</span>
              </div>
            </div>
            <div className="note" style={{ marginTop: 4 }}>
              exact amount <span className="redact-inline">▓▓▓▓▓</span> — never decrypted by
              verifier
            </div>
            <Seal className="stamp hit" />
          </div>
        )}

        {effectiveStatus === "ready" && data?.kind === "fhe" && (
          <>
            <div className="proofcard">
              <div className="ptitle">
                Disclosure · proof #{data.proofId.toString()} · distribution #
                {data.distId.toString()}
              </div>
              <div>
                <div className="pred">
                  <span>allocation ≥ {fmtUsd(fromUnits(data.threshold))}</span>
                  {verdict ? (
                    <span className={verdict === "TRUE" ? "yes" : "no"}>→ {verdict}</span>
                  ) : (
                    <span className="redact-inline">▓▓▓▓</span>
                  )}
                </div>
                <div className="pred">
                  <span>issued by verified fund</span>
                  <span className={data.issuerVerified ? "yes" : "no"}>
                    → {data.issuerVerified ? "TRUE" : "FALSE"}
                  </span>
                </div>
              </div>
              <div className="note" style={{ marginTop: 4 }}>
                exact amount <span className="redact-inline">▓▓▓▓▓</span> — never decryptable by
                this page or the verifier
              </div>
              <Seal className="stamp hit" />
            </div>

            <div className="card" style={{ marginTop: 18 }}>
              <div className="rr">
                <span className="k">Recipient</span>
                <span className="s">{shortAddress(data.recipient)}</span>
              </div>
              <div className="rr">
                <span className="k">Issuer</span>
                <span className="s">
                  {shortAddress(data.issuer)}{" "}
                  {data.issuerVerified ? "· ✓ attested onchain" : "· unattested"}
                </span>
              </div>
              <div className="rr">
                <span className="k">Receipt provenance</span>
                <span
                  className="s"
                  style={{
                    color:
                      data.crossCheck === true
                        ? "var(--ok)"
                        : data.crossCheck === false
                          ? "var(--wax)"
                          : undefined,
                  }}
                >
                  {data.crossCheck === true
                    ? "✓ matches the disperse transaction"
                    : data.crossCheck === false
                      ? "✗ does NOT match the disperse transaction"
                      : "could not verify against the disperse tx"}
                </span>
              </div>
              <div className="rr">
                <span className="k">Scoped verifier</span>
                <span className="s">{shortAddress(data.verifier)}</span>
              </div>
              <div className="rr">
                <span className="k">Encrypted answer</span>
                {verdict ? (
                  <span
                    className="mono"
                    style={{
                      color: verdict === "TRUE" ? "var(--ok)" : "var(--wax)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {verdict}
                  </span>
                ) : mayDecrypt ? (
                  <button className="btn" onClick={decrypt} disabled={decrypting}>
                    {decrypting
                      ? chainId === SEPOLIA_CHAIN_ID
                        ? "Decrypting via KMS (~15s)…"
                        : "Decrypting…"
                      : "Decrypt the answer"}
                  </button>
                ) : (
                  <span className="s">
                    {isConnected
                      ? "scoped to the designated verifier — this wallet can't decrypt it"
                      : "connect the designated verifier wallet to decrypt"}
                  </span>
                )}
              </div>
              <div className="note">
                The boolean was computed on the ciphertext with <b>FHE.ge</b>. Decryption rights
                cover exactly two keys: the recipient&apos;s and the verifier&apos;s. Issuer status
                and receipt provenance are read live from the chain — not from whoever shared this
                link.
              </div>
            </div>
          </>
        )}

        {effectiveStatus === "ready" && data?.kind === "dist" && (
          <div className="proofcard">
            <div className="ptitle">Attestation · distribution #{data.distId.toString()}</div>
            <div>
              <div className="pred">
                <span>issued by verified fund</span>
                <span className={data.issuerVerified ? "yes" : "no"}>
                  → {data.issuerVerified ? "TRUE" : "FALSE"}
                </span>
              </div>
              <div className="pred">
                <span>issuer</span>
                <span>{shortAddress(data.issuer)}</span>
              </div>
              <div className="pred">
                <span>declared total (public)</span>
                <span>{fmtUsd(fromUnits(data.declaredTotal))}</span>
              </div>
            </div>
            <div className="note" style={{ marginTop: 4 }}>
              individual amounts <span className="redact-inline">▓▓▓▓▓</span> — sealed euint64s,
              not part of this attestation
            </div>
            <Seal className="stamp hit" />
          </div>
        )}
      </main>
    </>
  );
}
