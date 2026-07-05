# AGENTS.md — Signet build handoff

You are implementing **Signet**, a confidential distribution dApp for the Zama Season 3 Special Bounty (TokenOps track). The product thesis, screens, and design language are already decided — see `PRD.md`, `signet-landing.html`, and `signet-app.html`. Your job is to turn the mocked prototype into a real, deployed app on Sepolia. **Do not redesign.** Port the exact visual language and interactions from the two HTML files.

## Non-negotiables (bounty rules)

- Settlement uses the **TokenOps SDK** (`@tokenops/sdk`, npm) for the confidential **disperse** flow.
- Tokens are **ERC-7984** confidential tokens.
- Deploy on **Sepolia**.
- Do **not** put "Zama" in the project name.
- Do **not** claim a hidden recipient list — recipient addresses are public onchain (verified). Amounts are confidential; the recipient list is not.

## What makes this app not a clone

The disperse is commodity plumbing. Signet's product is the **portable proof-of-receipt**: after a payout, a recipient can prove facts about their allocation (e.g. "≥ $2,000", "paid by a verified fund") to a third party **without revealing the amount**, via FHE encrypted comparison. Build that layer with as much care as the disperse.

## Stack

- Next.js (App Router) + TypeScript + Tailwind. Divine's default.
- wagmi + viem for wallet/chain.
- `@tokenops/sdk` for disperse + its React hooks (`@tokenops/sdk/<product>/react`).
- `@zama-fhe/relayer-sdk` (or the TokenOps-re-exported encryptor) for client-side encryption and EIP-712 user-decryption.
- Contracts: Hardhat + `@fhevm/solidity` + `@openzeppelin/confidential-contracts`.

## Architecture — two layers, kept separate

**Layer 1 · Settlement (use the SDK, don't reinvent).**
1. Deploy `SignetToken` (ERC-7984) — the confidential cUSDT-style token for the demo.
2. Operator builds a recipient/amount list. Amounts are encrypted client-side to `euint64`.
3. Fire a single confidential **disperse** via the TokenOps SDK factory pattern (`createManager` → disperse). This moves encrypted balances to recipients in one tx.

**Layer 2 · Receipt & proof (Signet's addition — `SignetDistributor.sol`).**
1. On disperse, record each recipient's encrypted allocation + the distribution's `issuer` and public `declaredTotal`.
2. `FHE.allow(allocation, recipient)` so only the recipient can decrypt their raw value.
3. `proveAtLeast(distId, threshold, verifier)` — recipient calls; contract computes `FHE.ge(allocation, FHE.asEuint64(threshold))` → `ebool`, then `FHE.allow(ebool, verifier)`. Verifier decrypts one boolean; amount stays sealed.
4. Issuer attestation: a small registry mapping `issuer → verified`, so proofs carry "paid by a verified fund" and can't be minted by an impostor.
5. Sum-proof for the Verify view: `declaredTotal` is public; assert the encrypted running sum equals it.

## Screen ↔ code mapping (from `signet-app.html`)

- **Send** → operator form → encrypt amounts → TokenOps disperse → record in `SignetDistributor`. Show one tx hash. Keep the live-total and "Seal & disperse" states.
- **Claim** → `useUserDecrypt`-style flow: recipient signs EIP-712 **once per session** (cache the keypair), redaction slot lifts to reveal the decrypted figure. Then **Prove**: predicate selector → `proveAtLeast` / issuer proof → stamp the proof card. Port the wax-seal stamp animation exactly.
- **Verify** → read `declaredTotal`, recipient count, claimed flags; render redacted rows + the "declared = distributed, verified under FHE" badge.

## Decrypt UX (scored — get it right)

Use the EIP-712 user-decryption: generate a keypair, sign the "allow" message **once**, cache for the session, decrypt via the relayer. Do **not** re-prompt per claim. This is a deliberate, on-screen advantage over incumbents (ZamaDrop re-prompts + ~15s per claim). The reveal must feel instant after the single signature.

## Demo mode (keep it)

Preserve a wallet-free `?demo=true` path that runs the whole three-lens flow on mocked data — this is what the 3-minute video records against and what judges click first. Real chain path behind a wallet connect; demo path fully client-side.

## Build order

1. Contracts: `SignetToken` (ERC-7984) + `SignetDistributor` (allocations, `proveAtLeast`, issuer registry, sum assertion). Hardhat tests for the `FHE.ge` proof path and per-recipient ACL isolation.
2. Deploy to Sepolia; wire addresses into the frontend config.
3. Frontend shell in the Signet design language (port tokens from the HTML: paper `#E7E3D6`, ink `#17231C`, wax `#8A2A3B`, gilt `#9C7C3C`; Libre Caslon Display / Hanken Grotesk / IBM Plex Mono; guilloché + seal + redaction slot).
4. Send → TokenOps disperse integration.
5. Claim → EIP-712 one-sign decrypt + redaction reveal.
6. Prove → `proveAtLeast` + verifier-scoped ebool decryption + proof card + shareable link.
7. Verify → aggregate + sum-proof + redacted ledger.
8. Demo mode parity across all three lenses.
9. Deploy to Vercel on a custom domain (buy one — it reads as production and scores real-world viability).

## Quality bar

- Typed throughout; tests on the contract proof path.
- Responsive to mobile; visible keyboard focus; `prefers-reduced-motion` respected.
- The reveal and the proof-stamp are the two hero interactions — spend polish there, keep everything else quiet.

---

## Claude Code kickoff prompt

> Build Signet, a confidential token distribution dApp on Zama/FHEVM, deploying to Sepolia. Read `PRD.md` and `AGENTS.md` in full first; open `signet-app.html` and `signet-landing.html` and treat them as the exact design and interaction spec — port the security-print visual language (document paper `#E7E3D6`, intaglio ink `#17231C`, sealing-wax oxblood `#8A2A3B`, aged gilt `#9C7C3C`; Libre Caslon Display + Hanken Grotesk + IBM Plex Mono; guilloché rosette, wax seal, debossed redaction slot) rather than inventing new UI.
>
> Scaffold a Next.js (App Router) + TypeScript + Tailwind app with wagmi/viem. Use `@tokenops/sdk` for the confidential disperse and ERC-7984 tokens. Implement two contracts with Hardhat + `@fhevm/solidity` + `@openzeppelin/confidential-contracts`: `SignetToken` (ERC-7984 confidential token) and `SignetDistributor` (records encrypted `euint64` allocations per recipient with `FHE.allow(allocation, recipient)`; an issuer-verification registry; a public `declaredTotal` with an encrypted-sum assertion; and `proveAtLeast(uint256 distId, uint64 threshold, address verifier)` that computes `FHE.ge(allocation, FHE.asEuint64(threshold))` and grants the verifier decryption of only the resulting `ebool`). Write Hardhat tests for the proof path and for per-recipient ACL isolation.
>
> Build the three lenses — Send (operator disperse), Claim (recipient EIP-712 one-sign decrypt + redaction reveal + the Prove flow), Verify (public redacted ledger + sum-proof badge). Use EIP-712 user-decryption signed once per session and cached; never re-prompt per decrypt. Keep a wallet-free `?demo=true` mode with full three-lens parity on mocked data for the demo video. Deploy contracts to Sepolia and the app to Vercel. Do not use "Zama" in the project name, and do not claim the recipient list is hidden — only amounts are confidential.
>
> I (Divine) hold credentials, approvals, and deploys — pause and ask before any onchain deploy or funded transaction, and surface each Sepolia address for me to confirm.
