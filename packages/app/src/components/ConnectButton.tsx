"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { type Connector, useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { useToast } from "@/components/Toast";
import { shortAddress } from "@/lib/format";

/**
 * Wallet chooser. All EIP-6963 injected providers are listed for the user to
 * pick — no auto-select, no hardcoded default. The generic "injected"
 * fallback connector is hidden whenever discovered wallets exist (it would
 * duplicate one of them nondeterministically).
 */
export function ConnectButton() {
  const toast = useToast();
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);

  const choices = useMemo(() => {
    const discovered = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
    if (discovered.length > 0) {
      // hide the generic fallback — it duplicates one of the discovered wallets
      return connectors.filter((c) => !(c.type === "injected" && c.id === "injected"));
    }
    return [...connectors];
  }, [connectors]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function pick(connector: Connector) {
    try {
      await connectAsync({ connector });
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast(msg.toLowerCase().includes("reject") ? "Connection request rejected" : msg.slice(0, 120));
    }
  }

  const supported = chainId === hardhat.id || chainId === sepolia.id;
  if (isConnected && !supported) {
    return (
      <button className="btn btn-wax" onClick={() => switchChain({ chainId: sepolia.id })}>
        Switch network
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <button className="btn btn-ghost" onClick={() => disconnect()} title="Disconnect">
        {shortAddress(address)}
      </button>
    );
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Connect wallet
      </button>
      {/* portal to <body>: the sticky header's backdrop-filter would otherwise
          become the containing block for position:fixed and pin the modal to
          the header instead of the viewport center */}
      {open &&
        createPortal(
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a wallet"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="card modal-card">
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
            >
              <label className="fld" style={{ marginBottom: 0 }}>
                Choose a wallet
              </label>
              <button
                className="mono"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--muted)",
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
            <div className="disclose" style={{ marginTop: 14 }}>
              {choices.length === 0 && (
                <div className="note" style={{ marginTop: 0 }}>
                  No injected wallet detected. Install MetaMask (or another EIP-6963 wallet) and
                  reload.
                </div>
              )}
              {choices.map((c) => (
                <button
                  key={c.uid}
                  className="opt"
                  style={{ width: "100%", textAlign: "left", font: "inherit" }}
                  disabled={isPending}
                  onClick={() => pick(c)}
                >
                  {c.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icon} alt="" width={22} height={22} style={{ borderRadius: 4 }} />
                  ) : (
                    <span className="dot" />
                  )}
                  <span className="t">
                    {c.name}
                    <small>{c.id === "injected" ? "legacy injected provider" : c.id}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="note">
              Every detected wallet is listed — nothing is auto-selected.
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
