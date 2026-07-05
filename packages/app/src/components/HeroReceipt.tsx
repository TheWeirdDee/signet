"use client";

import { useEffect, useRef, useState } from "react";
import { RedactionSlot } from "@/components/RedactionSlot";
import { Seal } from "@/components/Seal";

/** The landing hero receipt — reveal toggles, then auto-seals after 4.2s. */
export function HeroReceipt() {
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const toggle = () => {
    const on = !revealed;
    setRevealed(on);
    clearTimeout(timer.current);
    if (on) timer.current = setTimeout(() => setRevealed(false), 4200);
  };

  return (
    <div className={`receipt shadowed${revealed ? " revealed" : ""}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="r-title">Proof of Receipt</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          № 047 · sepolia
        </span>
      </div>
      <hr className="rule" style={{ margin: "14px 0" }} />
      <div className="rr">
        <div>
          <div className="k">Your allocation</div>
          <div className="s">euint64 · encrypted onchain</div>
        </div>
        <RedactionSlot value="$2,350.00" open={revealed} />
      </div>
      <div className="rr">
        <div>
          <div className="k">Issued by</div>
          <div className="s">Meridian Grants Fund</div>
        </div>
        <div className="stamp-txt">
          <b>Verified</b>
          <br />
          attested onchain
        </div>
      </div>
      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div className="stamp-line">
          <Seal className="seal-sm" />
          <div className="stamp-txt">
            Sealed with the fund&apos;s
            <br />
            <b>signet</b> — cannot be forged
          </div>
        </div>
        <button className="reveal-btn" onClick={toggle} aria-pressed={revealed}>
          {revealed ? "Sealed again" : "Sign to reveal"}
        </button>
      </div>
    </div>
  );
}
