import Link from "next/link";
import { Guilloche } from "@/components/Guilloche";
import { HeroReceipt } from "@/components/HeroReceipt";
import { Seal } from "@/components/Seal";

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
          <div>
            <div className="eyebrow">Confidential distribution · built on TokenOps</div>
            <h1 className="hero-h1">
              Prove you were paid.
              <br />
              <em>Never show how much.</em>
            </h1>
            <p className="lede">
              Signet sends confidential payments to many people at once — then hands each recipient
              a sealed receipt they can prove things with. &ldquo;Paid by a verified fund.&rdquo;
              &ldquo;At least $2,000.&rdquo; The exact number stays sealed. Forever.
            </p>
            <div className="hero-cta">
              <Link className="btn" href="/app?demo=true">
                Open the app →
              </Link>
              <a className="btn btn-ghost" href="#how">
                See how it works
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
          <HeroReceipt />
        </div>
      </section>

      <section id="problem" className="land two">
        <div className="wrap">
          <div className="sec-head">
            <div className="eyebrow">The problem</div>
            <h2>You need to prove income. You don&apos;t want to publish it.</h2>
            <p>
              A worker gets paid by a DAO or a fund. Later a lender, a landlord, or a grant program
              asks for proof. Today both answers are bad.
            </p>
          </div>
          <div className="cols">
            <div className="col bad">
              <span className="tag">Today · option A</span>
              <h3>Show the real number</h3>
              <p>
                A bank statement, the exact figure, handed to a stranger — and if it&apos;s onchain
                in a normal app, published forever.
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
        </div>
      </section>

      <section id="how" className="land">
        <div className="wrap">
          <div className="sec-head">
            <div className="eyebrow">How it works</div>
            <h2>One dataset. Three lenses. One truth each.</h2>
            <p>
              The confidential payment is the boring plumbing everyone has. What each payout leaves
              behind is the product.
            </p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="n">01 · Send</div>
              <h4>Pay everyone at once</h4>
              <p>
                Paste a list of recipients and amounts. One confidential disperse through the
                TokenOps SDK. Amounts sealed onchain as ERC-7984.
              </p>
              <div className="who">Operator sees the full roster</div>
            </div>
            <div className="step">
              <div className="n">02 · Claim</div>
              <h4>Unseal your own slice</h4>
              <p>
                Connect — your allocation surfaces automatically. Sign once, and the redaction bar
                lifts to reveal your figure. Only yours.
              </p>
              <div className="who">Recipient sees one number</div>
            </div>
            <div className="step">
              <div className="n">03 · Verify</div>
              <h4>Prove the fund was honest</h4>
              <p>
                The public ledger shows the recipient count and that declared total equals
                distributed total — proven under encryption. Every row redacted.
              </p>
              <div className="who">Anyone sees the aggregate</div>
            </div>
          </div>
        </div>
      </section>

      <section id="proof" className="land two">
        <div className="wrap">
          <div className="sec-head">
            <div className="eyebrow">The differentiator</div>
            <h2>Ask the box a question while it&apos;s still locked.</h2>
            <p>
              The amount sits inside a sealed box. Most apps only let you open your own box to peek.
              Signet lets you ask a question <em>of the box without opening it</em> — and hand the
              yes / no to whoever&apos;s asking.
            </p>
          </div>
          <div className="proof-sec">
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
            <ul className="mech">
              <li>
                <span className="k">i</span>
                <span>
                  Your allocation is an encrypted <b>euint64</b>. Only you hold the key to the raw
                  value.
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
          </div>
        </div>
      </section>

      <section className="land band">
        <div className="wrap">
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
            <a className="btn btn-ghost" href="#how">
              Read how it works
            </a>
          </div>
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
