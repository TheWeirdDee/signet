"use client";

import Link from "next/link";
import { useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { Seal } from "@/components/Seal";
import { ClaimLens } from "./ClaimLens";
import { SendLens } from "./SendLens";
import { VerifyLens } from "./VerifyLens";

type View = "send" | "claim" | "verify";
const WHO: Record<View, string> = { send: "Operator", claim: "Recipient", verify: "Public" };

export function AppShell({ demo }: { demo: boolean }) {
  const [view, setView] = useState<View>("send");

  return (
    <>
      {demo && (
        <div className="demo-flag">
          Demo mode — <b>no wallet needed</b> · every value is mocked to show the flow ·{" "}
          <Link href="/app" style={{ textDecoration: "underline" }}>
            switch to live
          </Link>
        </div>
      )}
      <header className="site-header">
        <div className="wrap-app bar" style={{ height: 60 }}>
          <Link className="brand" href="/" style={{ fontSize: 21, gap: 10 }}>
            <Seal className="seal-sm" style={{ width: 26, height: 26 }} />
            Signet
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="who-pill">
              viewing as · <b>{WHO[view]}</b>
            </div>
            {!demo && <ConnectButton />}
          </div>
        </div>
      </header>

      <div className="lens-wrap">
        <div className="lens" role="tablist" aria-label="View">
          {(["send", "claim", "verify"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
              <span className="sub">{WHO[v].toLowerCase()}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="wrap-app app-main">
        {view === "send" && (
          <section className="panel">
            <SendLens demo={demo} />
          </section>
        )}
        {view === "claim" && (
          <section className="panel">
            <ClaimLens demo={demo} />
          </section>
        )}
        {view === "verify" && (
          <section className="panel">
            <VerifyLens demo={demo} />
          </section>
        )}
      </main>
    </>
  );
}
