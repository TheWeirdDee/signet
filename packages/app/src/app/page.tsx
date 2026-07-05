import Link from "next/link";
import { Guilloche } from "@/components/Guilloche";
import { HeroReceipt } from "@/components/HeroReceipt";
import { Reveal } from "@/components/Reveal";
import { Seal } from "@/components/Seal";

const CEREMONY = [
  "approve once",
  "encrypt client-side",
  "confidential disperse",
  "verify settlement",
  "disclose receipts",
  "seal + sum-proof",
];

export default function Landing() {
  return (
    <>
      <header className="site-header">
        <div className="wrap bar">
          <Link className="brand" href="/">
            <Seal className="seal-sm" style={{ width: 26, height: 26 }} />
            Signet
          </Link>
          <div className="nav-links">
            <a href="#problem">Problem</a>
            <a href="#how">How it works</a>
            <a href="#run">Run one</a>
            <a href="#proof">The proof</a>
            <Link className="btn btn-ghost" href="/app?demo=true" style={{ marginLeft: 26 }}>
              Open the app
            </Link>
          </div>
        </div>
      </header>

      <section className="hero">
        <Guilloche />
        <div className="wrap hero-grid">
          <Reveal>
            <div>
              <div className="eyebrow">Confidential distribution · built on TokenOps</div>
              <h1 className="hero-h1">
                Prove you were paid.
                <br />
                <em>Never show how much.</em>
              </h1>
              <p className="lede">
                Signet sends confidential payments to many people at once — then hands each
                recipient a sealed receipt they can prove things with. &ldquo;Paid by a verified
                fund.&rdquo; &ldquo;At least $2,000.&rdquo; The exact number stays sealed. Forever.
              </p>
              <div className="hero-cta">
                <Link className="btn" href="/app?demo=true">
                  Open the app →
                </Link>
                <a className="btn btn-ghost" href="#run">
                  Run a distribution
                </a>
              </div>
              <div className="hero-meta">
                <div>
                  <b>Sealed</b>amounts, onchain
                </div>
                <div>
                  <b>Yours</b>portable receipt
                </div>
                <div>
                  <b>One sign</b>to decrypt
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.15} y={26}>
            <HeroReceipt />
          </Reveal>
        </div>
      </section>

      <section id="problem" className="land two">
        <div className="wrap">
          <Reveal>
            <div className="sec-head">
              <div className="eyebrow">The problem</div>
              <h2>You need to prove income. You don&apos;t want to publish it.</h2>
              <p>
                A worker gets paid by a DAO or a fund. Later a lender, a landlord, or a grant
                program asks for proof. Today both answers are bad.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="cols">
              <div className="col bad">
                <span className="tag">Today · option A</span>
                <h3>Show the real number</h3>
                <p>
                  A bank statement, the exact figure, handed to a stranger — and if it&apos;s
                  onchain in a normal app, published forever.
                </p>
                <ul>
                  <li>Exposes income you&apos;d rather keep private</li>
                  <li>Permanent, to anyone who asks</li>
                  <li>Can&apos;t be un-published</li>
                </ul>
              </div>
              <div className="col good">
                <span className="tag">With Signet</span>
                <h3>Prove the fact, seal the number</h3>
                <p>
                  Answer &ldquo;were you paid at least X by a verified party?&rdquo; with a
                  trustworthy yes — while the exact amount never leaves its envelope.
                </p>
                <ul>
                  <li>Verifier gets a provable yes / no</li>
                  <li>Amount stays encrypted, always</li>
                  <li>Carries the payer&apos;s seal — can&apos;t be faked</li>
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="how" className="land">
        <div className="wrap">
          <Reveal>
            <div className="sec-head">
              <div className="eyebrow">How it works</div>
              <h2>One dataset. Three lenses. One truth each.</h2>
              <p>
                The confidential payment is the boring plumbing everyone has. What each payout
                leaves behind is the product.
              </p>
            </div>
          </Reveal>
          <div className="steps">
            {[
              {
                n: "01 · Send",
                h: "Pay everyone at once",
                p: "Paste a list of recipients and amounts. One confidential disperse through the TokenOps SDK. Amounts sealed onchain as ERC-7984.",
                who: "Operator sees the full roster",
              },
              {
                n: "02 · Claim",
                h: "Unseal your own slice",
                p: "Connect — your allocation surfaces automatically. Sign once, and the redaction bar lifts to reveal your figure. Only yours.",
                who: "Recipient sees one number",
              },
              {
                n: "03 · Verify",
                h: "Prove the fund was honest",
                p: "The public ledger shows the recipient count and that declared total equals distributed total — proven under encryption. Every row redacted.",
                who: "Anyone sees the aggregate",
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 0.12}>
                <div className="step">
                  <div className="n">{s.n}</div>
                  <h4>{s.h}</h4>
                  <p>{s.p}</p>
                  <div className="who">{s.who}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ the operator walkthrough ============ */}
      <section id="run" className="land two">
        <div className="wrap">
          <Reveal>
            <div className="sec-head">
              <div className="eyebrow">Run a distribution</div>
              <h2>From roster to sealed receipts, in five steps.</h2>
              <p>
                This is the whole operator experience — investor payouts, team salaries, grant
                rounds. No spreadsheet leaves your machine; no amount ever touches the chain in
                cleartext.
              </p>
            </div>
          </Reveal>

          <ol className="wt-list">
            {[
              {
                h: "Connect as the operator",
                p: "Open the app and connect — every installed wallet is listed, you choose. You hold the cUSDT (ERC-7984) you're distributing and a little ETH for the disperse fee. The Send lens is your desk.",
                hint: "wallet chooser · Sepolia · Send lens",
              },
              {
                h: "Paste the roster — or import a CSV",
                p: "One line per recipient: address, amount. The declared total recalculates live as you type — that figure becomes your public commitment, the number the encrypted sum-proof will be checked against.",
                hint: "0x… , 2350 — one line each",
              },
              {
                h: "Review the docket",
                p: "Recipient count, token, network, the exact per-recipient fee read live from the TokenOps contract, and your declared total. Everything is still local — amounts are about to be encrypted in your browser, before anything is sent.",
                hint: "fee preview · declared total · nothing onchain yet",
              },
              {
                h: "Seal & disperse — the ceremony runs itself",
                p: "One button. A live checklist narrates each stage as it completes, and the flow refuses to leave receipts behind unless every recipient verifiably received their full allocation — a partial settlement aborts loudly before anything is registered.",
                hint: "~3 wallet confirmations · one confidential disperse",
              },
              {
                h: "Hand it off",
                p: "Each recipient connects and their sealed slice surfaces automatically — one signature to unseal it, then they can mint proofs against it. The Verify lens shows the public sum-proof: declared equals distributed, proven under encryption. All you share is the link.",
                hint: "recipients claim · public verifies · you're done",
              },
            ].map((s, i) => (
              <Reveal key={s.h} delay={i * 0.08}>
                <li className="wt-item">
                  <span className="num" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h4>{s.h}</h4>
                    <p>{s.p}</p>
                    <div className="mono wt-hint">{s.hint}</div>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>

          <Reveal delay={0.1}>
            <div className="ceremony-strip" aria-label="The sealing ceremony stages">
              {CEREMONY.map((c, i) => (
                <span className="chip" key={c}>
                  <i>{i + 1}</i>
                  {c}
                </span>
              ))}
            </div>
            <div className="hero-cta" style={{ marginTop: 26 }}>
              <Link className="btn" href="/app">
                Open Send →
              </Link>
              <Link className="btn btn-ghost" href="/app?demo=true">
                Try it wallet-free first
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="proof" className="land">
        <div className="wrap">
          <Reveal>
            <div className="sec-head">
              <div className="eyebrow">The differentiator</div>
              <h2>Ask the box a question while it&apos;s still locked.</h2>
              <p>
                The amount sits inside a sealed box. Most apps only let you open your own box to
                peek. Signet lets you ask a question <em>of the box without opening it</em> — and
                hand the yes / no to whoever&apos;s asking.
              </p>
            </div>
          </Reveal>
          <div className="proof-sec">
            <Reveal>
              <div className="proof-card">
                <Seal className="stamp-badge" />
                <div className="r-title" style={{ marginBottom: 14 }}>
                  Disclosure · to Northwind Lending
                </div>
                <div className="predicate">
                  allocation ≥ $2,000 → <span className="ok">TRUE</span>
                </div>
                <div className="predicate">
                  issued by verified fund → <span className="ok">TRUE</span>
                </div>
                <div className="hidden-note">exact amount ▓▓▓▓▓ — never decrypted by verifier</div>
              </div>
            </Reveal>
            <Reveal delay={0.12}>
              <ul className="mech">
                <li>
                  <span className="k">i</span>
                  <span>
                    Your allocation is an encrypted <b>euint64</b>. Only you hold the key to the
                    raw value.
                  </span>
                </li>
                <li>
                  <span className="k">ii</span>
                  <span>
                    To prove &ldquo;≥ $2,000&rdquo;, the contract computes{" "}
                    <b>FHE.ge(allocation, 2000)</b> <em>on the ciphertext</em> — producing an
                    encrypted <b>ebool</b>.
                  </span>
                </li>
                <li>
                  <span className="k">iii</span>
                  <span>
                    The verifier is granted rights to decrypt only that boolean. They read one{" "}
                    <b>true</b>. The amount is never in reach.
                  </span>
                </li>
                <li>
                  <span className="k">iv</span>
                  <span>
                    The proof carries the fund&apos;s onchain <b>signet</b>, so it can&apos;t be
                    minted by an impostor — the anti-forgery a PDF lacks.
                  </span>
                </li>
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="land band">
        <div className="wrap">
          <Reveal>
            <h2>
              Settlement is a commodity.
              <br />
              The receipt is the product.
            </h2>
            <p>
              Signet is a confidential distribution rail where the payout is the boring part — and
              the portable proof-of-receipt is the thing you keep.
            </p>
            <div className="hero-cta" style={{ justifyContent: "center" }}>
              <Link className="btn" href="/app?demo=true">
                Open the app →
              </Link>
              <a className="btn btn-ghost" href="#run">
                Read the walkthrough
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="site-footer">
        <div className="wrap foot">
          <Link className="brand" href="/" style={{ fontSize: 18 }}>
            <Seal className="seal-sm" style={{ width: 26, height: 26 }} />
            Signet
          </Link>
          <p className="fine">
            Built on the Zama Protocol with the TokenOps SDK · ERC-7984 confidential tokens ·
            Sepolia. Amounts are confidential; recipient addresses are public onchain by design.
            Signet does not claim a hidden recipient list.
          </p>
        </div>
      </footer>
    </>
  );
}
