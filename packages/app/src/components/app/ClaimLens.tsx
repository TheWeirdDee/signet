"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress, parseEventLogs } from "viem";
import { useAccount, usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { RedactionSlot } from "@/components/RedactionSlot";
import { Seal } from "@/components/Seal";
import { useToast } from "@/components/Toast";
import {
  contractsDeployed,
  deploymentFor,
  distributorAbi,
  fromUnits,
  SEPOLIA_CHAIN_ID,
  toUnits,
} from "@/lib/chain/contracts";
import { DEMO_CLAIM, DEMO_PRED_TEXT, DEMO_PROOF_LINK, type PredicateKey } from "@/lib/demo";
import { getFhevmClient } from "@/lib/fhevm/client";
import { getOrCreateSession, loadSession, sessionDecrypt } from "@/lib/fhevm/session";
import { fmtUsd, receiptNumber } from "@/lib/format";

type Receipt = {
  distId: bigint;
  issuer: `0x${string}`;
  issuerVerified: boolean;
};

type ProofRow = [string, string];

export function ClaimLens({ demo }: { demo: boolean }) {
  const toast = useToast();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const dep = deploymentFor(chainId);
  const deployed = contractsDeployed(chainId);
  const onSepolia = chainId === SEPOLIA_CHAIN_ID;

  // receipt discovery (real mode)
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<"loading" | "none" | "ready">("loading");

  // decrypt state
  const [revealed, setRevealed] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [decryptPhase, setDecryptPhase] = useState<"idle" | "signing" | "kms">("idle");
  const [claimNote, setClaimNote] = useState<React.ReactNode>(
    <>
      EIP-712 signature — signed <b>once per session</b>, then cached. No repeated popups.
    </>,
  );

  // prove state
  const [pred, setPred] = useState<PredicateKey>("ge");
  const [verifier, setVerifier] = useState(demo ? DEMO_CLAIM.verifier : "");
  const [threshold, setThreshold] = useState(2000);
  const [sealing, setSealing] = useState(false);
  const [proofRows, setProofRows] = useState<ProofRow[] | null>(null);
  const [proofFor, setProofFor] = useState("");
  const [proofLink, setProofLink] = useState("");
  const [stampKey, setStampKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const effectiveReceiptStatus: "loading" | "none" | "ready" = demo
    ? "ready"
    : !address || !deployed
      ? "none"
      : receiptStatus;

  // ---- discover the caller's latest allocation (real mode) ----
  // Direct reads, newest distribution first — unbounded getLogs from block 0
  // gets rejected by real-network RPCs (range limits), so events are not used.
  useEffect(() => {
    if (demo || !address || !publicClient || !deployed || !dep) return;
    let cancelled = false;
    (async () => {
      try {
        setReceiptStatus("loading");
        const next = (await publicClient.readContract({
          address: dep.SignetDistributor,
          abi: distributorAbi,
          functionName: "nextDistId",
        })) as bigint;
        let distId: bigint | null = null;
        for (let i = next - 1n; i >= 0n && !cancelled; i--) {
          const has = (await publicClient.readContract({
            address: dep.SignetDistributor,
            abi: distributorAbi,
            functionName: "hasAllocation",
            args: [i, address],
          })) as boolean;
          if (has) {
            distId = i;
            break;
          }
        }
        if (cancelled) return;
        if (distId === null) {
          setReceiptStatus("none");
          return;
        }
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
        if (cancelled) return;
        setReceipt({ distId, issuer: dist[0] as `0x${string}`, issuerVerified });
        setReceiptStatus("ready");
      } catch {
        if (!cancelled) setReceiptStatus("none");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, address, publicClient, deployed, chainId]);

  // reset decrypt state when the account changes (adjust-state-during-render pattern)
  const [prevAddress, setPrevAddress] = useState(address);
  if (prevAddress !== address) {
    setPrevAddress(address);
    setRevealed(false);
    setAmount("");
    setProofRows(null);
    setReceiptStatus("loading");
  }

  // ---- sign once, decrypt ----
  const signToDecrypt = useCallback(async () => {
    if (revealed || decryptPhase !== "idle") return;
    if (demo) {
      setDecryptPhase("signing");
      setTimeout(() => {
        setAmount(DEMO_CLAIM.amount);
        setRevealed(true);
        setDecryptPhase("idle");
        setClaimNote(
          <>
            Session key cached — future decrypts need <b>no signature</b>. Now disclose a fact →
          </>,
        );
        toast("Allocation decrypted — visible only to you");
      }, 1050);
      return;
    }
    if (!address || !publicClient || !receipt || !chainId || !dep) return;
    try {
      const client = await getFhevmClient(chainId);
      const hadSession = loadSession(chainId, address) !== null;
      setDecryptPhase(hadSession ? "kms" : "signing");
      const { session } = await getOrCreateSession(client, chainId, address, async (args) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signTypedDataAsync(args as any),
      );
      setDecryptPhase("kms");
      const handle = (await publicClient.readContract({
        address: dep.SignetDistributor,
        abi: distributorAbi,
        functionName: "allocationOf",
        args: [receipt.distId, address],
      })) as `0x${string}`;
      const results = await sessionDecrypt(client, session, [
        { handle, contractAddress: dep.SignetDistributor },
      ]);
      const clear = BigInt(results[handle] as bigint);
      setAmount(fmtUsd(fromUnits(clear)) + ".00");
      setRevealed(true);
      setClaimNote(
        hadSession ? (
          <>
            Decrypted from the <b>cached session</b> — no signature needed.
          </>
        ) : (
          <>
            Session key cached — future decrypts need <b>no signature</b>. Now disclose a fact →
          </>
        ),
      );
      toast("Allocation decrypted — visible only to you");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast("Decrypt failed: " + msg.slice(0, 120));
    } finally {
      setDecryptPhase("idle");
    }
  }, [demo, revealed, decryptPhase, address, publicClient, receipt, chainId, dep, signTypedDataAsync, toast]);

  // ---- seal the proof ----
  const sealProof = useCallback(async () => {
    if (sealing) return;
    const who = verifier || "the verifier";

    if (demo) {
      setProofFor("Disclosure · to " + who);
      setProofRows(DEMO_PRED_TEXT[pred]);
      setProofLink(DEMO_PROOF_LINK);
      setStampKey((k) => k + 1);
      setTimeout(() => toast("Proof sealed — amount never disclosed"), 480);
      return;
    }

    if (!address || !publicClient || !receipt || !chainId || !dep) return;
    const rows: ProofRow[] = [];
    try {
      setSealing(true);
      let link = "";

      if (pred === "ge" || pred === "both") {
        if (!isAddress(verifier)) {
          toast("Enter the verifier's 0x address — they get rights to the boolean only");
          setSealing(false);
          return;
        }
        const hash = await writeContractAsync({
          address: dep.SignetDistributor,
          abi: distributorAbi,
          functionName: "proveAtLeast",
          args: [receipt.distId, toUnits(threshold), verifier as `0x${string}`],
        });
        const rcpt = await publicClient.waitForTransactionReceipt({ hash });
        const issued = parseEventLogs({
          abi: distributorAbi,
          logs: rcpt.logs,
          eventName: "ProofIssued",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const args = (issued[0] as any).args as { proofId: bigint; result: `0x${string}` };

        // The recipient holds ACL rights on the result too — show it live.
        const client = await getFhevmClient(chainId);
        const session = loadSession(chainId, address);
        let verdict = "sealed";
        if (session) {
          const res = await sessionDecrypt(client, session, [
            { handle: args.result, contractAddress: dep.SignetDistributor },
          ]);
          verdict = res[args.result] ? "TRUE" : "FALSE";
        }
        rows.push([`allocation ≥ ${fmtUsd(threshold)}`, verdict]);
        link = `${window.location.origin}/p/${args.proofId.toString()}`;
      }

      if (pred === "issuer" || pred === "both") {
        rows.push(["issued by verified fund", receipt.issuerVerified ? "TRUE" : "FALSE"]);
        if (!link) link = `${window.location.origin}/p/d${receipt.distId.toString()}`;
      }

      setProofFor("Disclosure · to " + who);
      setProofRows(rows);
      setProofLink(link);
      setStampKey((k) => k + 1);
      setTimeout(() => toast("Proof sealed — amount never disclosed"), 480);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast("Proof failed: " + msg.slice(0, 120));
    } finally {
      setSealing(false);
    }
  }, [demo, sealing, pred, verifier, threshold, address, publicClient, receipt, chainId, dep, writeContractAsync, toast]);

  const copyLink = useCallback(async () => {
    if (demo) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast(`${DEMO_PROOF_LINK} — verifiable, no amount inside`);
      return;
    }
    try {
      await navigator.clipboard.writeText(proofLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast(proofLink.replace(/^https?:\/\//, "") + " — verifiable, no amount inside");
    } catch {
      toast(proofLink);
    }
  }, [demo, proofLink, toast]);

  // ---- render ----
  const issuerName = demo ? DEMO_CLAIM.issuer : receipt ? receipt.issuer : "—";
  const receiptNo = demo ? DEMO_CLAIM.receiptNo : receipt ? receiptNumber(receipt.distId) : "…";
  const issuerVerified = demo ? true : (receipt?.issuerVerified ?? false);

  const decryptLabel =
    decryptPhase === "signing"
      ? "Signing (EIP-712)…"
      : decryptPhase === "kms"
        ? onSepolia
          ? "Decrypting via KMS…"
          : "Decrypting…"
        : revealed
          ? "Decrypted ✓"
          : "Sign to decrypt";

  const emptyState = useMemo(() => {
    if (demo) return null;
    if (!isConnected)
      return (
        <>
          Connect a wallet — your allocation surfaces automatically. Or{" "}
          <a href="/app?demo=true" style={{ textDecoration: "underline" }}>
            use demo mode
          </a>
          .
        </>
      );
    if (effectiveReceiptStatus === "loading") return <>Looking for your allocation…</>;
    if (effectiveReceiptStatus === "none")
      return (
        <>
          No allocation found for this address yet. Run a distribution in <b>Send</b> that includes
          this address, then come back.
        </>
      );
    return null;
  }, [demo, isConnected, effectiveReceiptStatus]);

  return (
    <>
      <div className="p-head">
        <div className="eyebrow">02 · Claim</div>
        <h2>Unseal your slice — then prove things with it</h2>
        <p>
          Your allocation surfaced automatically. Sign once to decrypt it. Then disclose a fact
          about it to anyone, without revealing the number.
        </p>
      </div>

      {emptyState ? (
        <div className="card">
          <div className="note" style={{ marginTop: 0 }}>
            {emptyState}
          </div>
        </div>
      ) : (
        <>
          <div className="row-split">
            {/* receipt */}
            <div className="receipt">
              <div className="rr">
                <span className="r-title" style={{ letterSpacing: ".14em" }}>
                  Proof of Receipt · {receiptNo}
                </span>
                <span className="s">{demo ? DEMO_CLAIM.network : onSepolia ? "sepolia" : "localhost"}</span>
              </div>
              <div className="rr">
                <div>
                  <div className="k">Your allocation</div>
                  <div className="s">euint64 · encrypted onchain</div>
                </div>
                <RedactionSlot value={amount || "$—"} open={revealed} />
              </div>
              <div className="rr">
                <div>
                  <div className="k">Issued by</div>
                  <div className="s">{issuerName}</div>
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: issuerVerified ? "var(--ok)" : "var(--muted)" }}
                >
                  {issuerVerified ? "✓ verified" : "unattested"}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 16,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Seal className="seal" style={{ width: 38, height: 38 }} />
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: ".05em",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    sealed with the
                    <br />
                    fund&apos;s signet
                  </span>
                </div>
                <button
                  className="btn"
                  onClick={signToDecrypt}
                  disabled={decryptPhase !== "idle" || revealed}
                >
                  {decryptLabel}
                </button>
              </div>
              <div className="note">
                {decryptPhase === "kms" && onSepolia ? (
                  <>
                    The Zama KMS is re-encrypting your value — this genuinely takes{" "}
                    <b>~10–15 seconds</b> on a real network. Your amount never travels in cleartext.
                  </>
                ) : (
                  claimNote
                )}
              </div>
            </div>

            {/* prove */}
            <div
              className="card"
              style={revealed ? undefined : { opacity: 0.5, pointerEvents: "none" }}
            >
              <label className="fld" htmlFor="verifier">
                Disclose a fact — to whom?
              </label>
              <input
                id="verifier"
                spellCheck={false}
                value={verifier}
                placeholder={demo ? undefined : "0x… verifier address"}
                onChange={(e) => setVerifier(e.target.value)}
                style={{ marginBottom: 14 }}
              />
              <div className="disclose">
                <div
                  className={`opt${pred === "ge" ? " sel" : ""}`}
                  onClick={() => setPred("ge")}
                  role="radio"
                  aria-checked={pred === "ge"}
                  tabIndex={0}
                >
                  <span className="dot" />
                  <span className="t">
                    Allocation is at least{" "}
                    {demo ? (
                      "$2,000"
                    ) : (
                      <input
                        type="number"
                        value={threshold}
                        min={1}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 1))}
                        style={{ width: 90, padding: "2px 6px", fontSize: 13, display: "inline-block" }}
                        aria-label="Threshold in USD"
                      />
                    )}
                    <small>FHE.ge(allocation, {demo ? 2000 : threshold}) → ebool</small>
                  </span>
                </div>
                <div
                  className={`opt${pred === "issuer" ? " sel" : ""}`}
                  onClick={() => setPred("issuer")}
                  role="radio"
                  aria-checked={pred === "issuer"}
                  tabIndex={0}
                >
                  <span className="dot" />
                  <span className="t">
                    Paid by a verified fund
                    <small>issuer attestation · onchain</small>
                  </span>
                </div>
                <div
                  className={`opt${pred === "both" ? " sel" : ""}`}
                  onClick={() => setPred("both")}
                  role="radio"
                  aria-checked={pred === "both"}
                  tabIndex={0}
                >
                  <span className="dot" />
                  <span className="t">
                    Both of the above
                    <small>threshold + verified issuer</small>
                  </span>
                </div>
              </div>
              <button
                className="btn btn-wax"
                style={{ width: "100%", marginTop: 16 }}
                onClick={sealProof}
                disabled={sealing}
              >
                {sealing ? "Sealing…" : "Seal the proof"}
              </button>
              <div className="note">
                The verifier is granted rights to decrypt only the resulting boolean. Your amount is
                never in their reach.
              </div>
            </div>
          </div>

          {/* generated proof */}
          {proofRows && (
            <div className="card" style={{ marginTop: 18 }}>
              <div
                className="row-split"
                style={{ gridTemplateColumns: "1fr .8fr", alignItems: "center" }}
              >
                <div className="proofcard">
                  <div className="ptitle">{proofFor}</div>
                  <div>
                    {proofRows.map((p, i) => (
                      <div className="pred" key={i}>
                        <span>{p[0]}</span>
                        <span className={p[1] === "FALSE" ? "no" : "yes"}>→ {p[1]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="note" style={{ marginTop: 4 }}>
                    exact amount <span className="redact-inline">▓▓▓▓▓</span> — never decrypted by
                    verifier
                  </div>
                  <Seal key={stampKey} className="stamp hit" />
                </div>
                <div>
                  <div className="note" style={{ marginTop: 0 }}>
                    <b>What just happened:</b> the contract compared your encrypted balance to the
                    threshold <b>on the ciphertext</b>, produced an encrypted boolean, and scoped
                    its decryption to the verifier alone.
                  </div>
                  <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={copyLink}>
                    {copied ? "Link copied ✓" : "Copy shareable link"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
