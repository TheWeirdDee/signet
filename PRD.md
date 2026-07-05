# Signet — Product Requirements

*Confidential distribution rail where the payout is the boring part and the portable proof-of-receipt is the product.*

Zama Developer Program · Season 3 · Special Bounty Track × TokenOps
Target: single winner, 2,500 cUSDT · Deploy: Sepolia · Deadline: Jul 7

---

## 1. Thesis

Everyone building on the TokenOps SDK ships the same thing: send tokens to many people in one transaction, amounts encrypted onchain, each recipient decrypts their own slice. That's the SDK's stock function — a sealed group payment. It is a commodity, and the bounty rubric does not score novelty.

Signet keeps the sealed payment as boring plumbing and staples a thesis on top:

**After you're paid, you hold a receipt you can prove things with — without ever revealing the amount.**

The settlement is the primitive. The durable, portable, selectively-disclosable proof-of-receipt is the product. This is the same move that separates a payment protocol from a payment app: the value isn't the transfer, it's the credential the transfer leaves behind that another party can read.

## 2. Problem

A borderless worker gets paid by a DAO, a fund, or a client in confidential stablecoins. Later they need to *prove* they were paid — for a loan, a visa, a rental, a larger grant application. Today they have two bad options:

- Show the real number (bank statement, the exact figure) — exposing income they'd rather keep private, permanently and to a stranger.
- Show an onchain record — where in a normal app the amount is public forever, and even in a "confidential" app the fact of receipt is provable only by revealing the cleartext to the verifier.

A PDF receipt gets Photoshopped. A public number can't be un-published. There's no way today to answer *"were you paid at least X by a verified party?"* with a trustworthy yes while the exact number stays sealed.

## 3. What Signet is

A confidential distribution app with one added layer: every payout mints each recipient a **proof-of-receipt** they own and control. From that receipt, the recipient can generate **selective-disclosure proofs** — statements a third party can verify without ever seeing the amount:

- "I was paid by this verified fund." (existence + issuer)
- "My allocation was at least $2,000." (threshold, exact figure sealed)
- "This receipt is from distribution #47, dated June." (provenance)

The operator, in parallel, accrues a verifiable honest-distribution record: each distribution's encrypted sum-proof (declared total = distributed total, proven under encryption) compounds into a portable reputation another protocol can read.

## 4. Users and core flows

**Operator** (fund, DAO, employer, grant program): configures a list of recipients and amounts, executes one confidential disperse. Sees the full roster. Accrues honest-distribution reputation.

**Recipient** (borderless worker, grantee, contributor): claims and decrypts their own allocation once, then later issues selective-disclosure proofs against it. Sees only their own slice.

**Verifier** (lender, landlord, grant reviewer, or the public): checks a proof — "≥ $2,000, from a verified fund, sealed" — resolves to a trustworthy yes/no. Never sees the amount. The public verifier sees only aggregate: N recipients, declared total = distributed total, every row redacted.

## 5. The three views (this is the whole UI and the whole demo)

Same underlying data, three different truths rendered live. The lens control between them is the core interaction and it films itself.

**Send** — operator pastes or CSV-imports addresses + amounts; a running total sits up top; one button fires a single confidential disperse through the TokenOps SDK. ERC-7984, amounts encrypted onchain.

**Claim** — recipient connects; their allocation auto-surfaces (no contract address to paste); they sign once (EIP-712); a redaction bar over their amount lifts to reveal the real figure underneath. Only theirs. This is the first fifteen seconds of the video.

**Verify** — the public ledger: N recipients, "declared total = distributed total" proven under encryption, every individual row present but redacted. Provably honest, zero exposure. This is the answer to "why not a spreadsheet."

**Prove** (the differentiator, lives inside Claim) — recipient picks a fact to disclose ("at least $2,000", "paid by verified fund"), presses the wax seal, and Signet stamps a shareable proof card. The amount never leaves its envelope; only the proven predicate does.

## 6. The credential and selective-disclosure model

This is what makes Signet not a copy-paste. It is FHE-native, not hand-waved.

- Each recipient's allocation is an encrypted `euint64` held under the Zama ACL. Only the recipient is granted decryption rights to the raw value (`FHE.allow(handle, recipient)`).
- **Selective disclosure via encrypted comparison.** To prove "allocation ≥ threshold" without revealing the allocation, the contract computes `FHE.ge(allocation, FHE.asEuint64(threshold))` *on the ciphertext*, producing an encrypted boolean `ebool`. The contract grants the verifier decryption rights to only that boolean. The verifier decrypts a single `true`/`false`. The amount is never decryptable by the verifier.
- **Issuer authenticity.** The distribution is stamped by a verified operator identity (an onchain issuer registry / signed attestation). A proof therefore carries "paid by *this* fund," and can't be minted by an impostor — the anti-forgery property a PDF lacks.
- **Portability.** The proof is an onchain-verifiable artifact (predicate + issuer + distribution id), readable by any other protocol — lending, KYC, grants. This is the composable, durable output; the disperse alone leaves nothing downstream.

### Verified technical realities (do not overclaim)

- Amounts are confidential. **Recipient addresses are not.** Granting decryption via `FHE.allow(handle, recipientAddress)` is a public transaction with the address in cleartext; membership is enumerable from events. Signet does **not** claim a hidden recipient list. (Hiding it would require a stealth-address / claim-code layer — out of scope for this build.)
- The recipient decrypt is an EIP-712 user-decryption: the recipient signs **once per session**; subsequent decrypts are cached, no repeated popups. This is materially smoother than incumbents that re-prompt per claim, and it is a scored, on-screen advantage.
- Disperse is TokenOps' most mature surface (live on Sepolia and mainnet), the safest settlement primitive to build on.

## 7. Scope for the bounty

**In:**
- ERC-7984 confidential token (deployed by us) + TokenOps SDK disperse for settlement.
- Three-view frontend (Send / Claim / Verify) with the redaction-reveal and lens switch.
- Selective-disclosure proof via `FHE.ge` encrypted comparison + verifier-scoped boolean decryption.
- Operator issuer attestation so proofs carry a verified source.
- Public sum-proof (declared = distributed) surfaced in Verify.
- Deployed demo on a real domain; interactive demo mode (no wallet needed) for the video and judges.
- Docs, 3-min real-person video, X thread.

**Out (explicitly, to stay honest and shippable):**
- Hidden recipient list (verified not natively possible).
- Vesting/airdrop products (disperse only).
- Cross-protocol reputation *consumers* (we mint the credential; we don't build the lender that reads it — we show the shape).

## 8. Mapping to judging criteria

- **UX / frontend quality (primary):** security-print design language, the redaction-lift and wax-seal-stamp signature interactions, the three-lens single-surface framing.
- **Functionality:** end-to-end — operator configures + disperses, recipient decrypts, recipient proves, verifier checks. All real onchain except demo mode.
- **Demo quality:** the reveal and the proof-stamp are pre-built hero moments; demo mode makes the 3 minutes wallet-free and clean.
- **Real-world viability:** proof-of-income-without-exposure is a concrete, universal borderless-work problem, not a crypto toy.
- **Code quality:** typed, tested SDK integration; documented contracts; clean separation of settlement vs credential layers.

## 9. Non-goals / anti-patterns

- Do not build another generic "confidential airdrop dashboard." The disperse is deliberately unglamorous; the credential layer is the product.
- Do not claim privacy properties FHE doesn't deliver (recipient-list confidentiality).
- Do not bolt a "decrypt" button next to a hidden number and call it UX — the reveal is a designed physical moment.

## 10. Naming and submission checklist

- Name: **Signet.** No "Zama" in the name (bounty rule). Confirm npm + domain availability before launch.
- Deploy on Sepolia. Use `@tokenops/sdk` from the npm registry. Use ERC-7984.
- 3-min video must be a **real person** — no AI voice/video.
- Publish an X thread tagging the program.
- One submission per email, non-editable — submit final only.
