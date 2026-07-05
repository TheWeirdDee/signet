# Signet — submission kit

## 3-minute video script (real person — no AI voice/video, per bounty rule)

Record against demo mode (`?demo=true`) so it's wallet-free and clean. Aim for ~2:50.

**[0:00–0:20] The hook — the problem, not the tech.**
On camera: "A freelancer gets paid by a DAO. Later they need to prove that income — for a loan, a visa, an apartment. Today they either hand over their exact bank statement, or point at an onchain record that's public forever. Both mean exposing a number you'd rather keep private." Cut to the landing hero: *Prove you were paid. Never show how much.*

**[0:20–0:40] The thesis.**
"Everyone building confidential payments hides the amount while it sits there. Signet does one more thing: it lets you prove facts about that amount — without ever revealing it. Let me show you." Open the app in demo mode.

**[0:40–1:20] Send.**
"A fund pays six contributors in one confidential transaction." Show the recipient list, the running total, hit *Seal & disperse*. "Amounts are encrypted as ERC-7984 tokens through the TokenOps SDK. One transaction, six sealed allocations."

**[1:20–2:05] Claim — the hero moment.**
Switch to the Claim lens. "As a recipient, my allocation surfaced automatically. I sign once —" click *Sign to decrypt*, let the redaction bar lift "— and only I can see my figure. Now the part nobody else does." Pick *at least $2,000*, set the verifier to a lender, press *Seal the proof*. Let the wax seal stamp. "I just proved to a lender that I earned at least two thousand — from a verified fund — and my actual number, $2,350, was never revealed. Under the hood, the contract compared my encrypted balance to the threshold *on the ciphertext* and handed the lender a single yes."

**[2:05–2:35] Verify.**
Switch to Verify. "And anyone can confirm the fund paid out honestly — declared total equals distributed total, proven under encryption — while every individual amount stays redacted."

**[2:35–2:50] Close.**
On camera: "Settlement is a commodity. The receipt you can prove things with is the product. That's Signet." Show the URL.

*Delivery notes: real face on camera at open and close (rule requires a real-person pitch). Keep screen capture crisp; let the two hero animations — the redaction lift and the seal stamp — breathe. Don't rush them.*

---

## X thread draft

**1/**
Confidential payments hide the amount while it sits onchain.

But what happens when you need to *prove* you were paid — for a loan, a visa, a grant — without publishing the number?

Meet Signet. 🧵

**2/**
The problem: a borderless worker gets paid by a DAO. Later a lender asks for proof of income.

Option A: show the exact figure. Exposed, permanently.
Option B: point at an onchain record. Public forever.

Both are bad.

**3/**
Signet's move: keep the confidential payout as boring plumbing — then hand each recipient a sealed receipt they can *prove things with*.

"Paid by a verified fund." "At least $2,000." The exact amount stays sealed. Forever.

**4/**
How? FHE encrypted comparison.

To prove "allocation ≥ $2,000," the contract runs `FHE.ge` on the *ciphertext* and gives the verifier one encrypted boolean to decrypt.

They read a single ✓. Your number is never in reach.

**5/**
Three lenses, one dataset:
→ Send: disperse confidential amounts in one tx (TokenOps SDK, ERC-7984)
→ Claim: sign once, unseal only your slice, then prove facts about it
→ Verify: public proof that declared total = distributed total, every row redacted

**6/**
Built on the @zama_fhe Protocol with the TokenOps SDK. ERC-7984 confidential tokens, Sepolia.

Honest scope: amounts are confidential; recipient addresses are public onchain. We don't claim otherwise.

Demo + code 👇
#ZamaDeveloperProgram

*(Fill in live links; tag per the program's current handle/hashtag; keep the real-person video pinned.)*

---

## Submission checklist

- [ ] Project name has no "Zama" in it — **Signet** ✓
- [ ] Confirm `signet` npm/domain availability before launch
- [ ] Uses `@tokenops/sdk` from the npm registry (disperse)
- [ ] Uses ERC-7984 confidential tokens
- [ ] Both smart contract + frontend implemented
- [ ] Deployed demo on a website (custom domain preferred)
- [ ] Deployed on Sepolia
- [ ] Clear project documentation (README, PRD)
- [ ] 3-min video — **real person**, no AI voice/video
- [ ] X thread published, tagged, hashtagged
- [ ] Recipients can verify + decrypt their own allocation ✓ (Claim)
- [ ] Amounts remain confidential onchain ✓
- [ ] Correct email on the form — **single, non-editable submission; submit final only**
