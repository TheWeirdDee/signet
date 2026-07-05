# Signet — Sepolia runbook (owner-run, step by step)

Every command below is run by **you** (Divine). The tooling gates hard on
chainId 11155111 — a wrong RPC fails loudly before anything is sent.

## 0. Prerequisites — fix these first

1. **Your RPC URL is currently a MAINNET endpoint.** The one you shared reads
   `eth-mainnet.g.alchemy.com` — Sepolia must be
   `https://eth-sepolia.g.alchemy.com/v2/<key>` (create a Sepolia app in the
   Alchemy dashboard if needed).
2. **Rotate the Alchemy key** you pasted in chat (it's now in a conversation
   log). Put the new one only in `.env`.
3. Copy `.env.example` → `.env` at the repo root and fill in:
   `SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY` (operator
   `0x97f32Ba0b4DD5c274DFD9C2A7e6Aa403a9B7dE8d`), `RECIPIENT_PRIVATE_KEY`
   (key of one of your four recipient wallets), optional
   `VERIFIER_PRIVATE_KEY`, and `NEXT_PUBLIC_SEPOLIA_RPC_URL`.
4. Budget check: 0.05 ETH on the operator is enough — deploys ≈ 0.01–0.02,
   the TokenOps direct-mode fee is 0.001 ETH × recipients per disperse
   (0.002 for the round-trip's two recipients), plus ordinary gas.

All secrets live in **one file: `.env` at the repo root** (gitignored — it
never leaves your machine, and nothing is ever typed into a terminal). The
scripts load it automatically. Edit it in VS Code and fill in
`SEPOLIA_PRIVATE_KEY` (and, before step 2, `RECIPIENT_PRIVATE_KEY`).

> `.env` files are hidden by some file explorers. In VS Code it's visible in
> the file tree at the repo root; or open it directly: `code .env`.

## 1. Deploy (2 contracts + 1 attestation tx)

```powershell
npm run deploy:sepolia --workspace @signet/contracts
```

Prints `SignetToken` and `SignetDistributor` addresses and writes them into
`packages/app/src/lib/chain/gen/deployments.sepolia.json`. **Send me both
addresses to confirm before going further.**

Optional but recommended (scores as polish): verify both contracts on
Etherscan/Sourcify.

## 2. Round-trip proof (THE submission artifact)

Fill `RECIPIENT_PRIVATE_KEY` (and optionally `VERIFIER_PRIVATE_KEY`) in the
same `.env` file, then from the repo root:

```bash
node packages/contracts/scripts/sepolia-roundtrip.mjs
```

This is the isolated real-relayer test (Step 4): real Zama KMS encryption,
TokenOps SDK disperse, settlement guard, disclosure, registration, recipient
decrypt, proveAtLeast, verifier decrypt, public sum-proof. Expect a few
minutes — each real KMS decrypt takes ~10–15s.

On success it prints **disperse / register / prove tx hashes + a `/p/<proofId>`
link**. Save all four — the video shows demo mode for flow, but these are what
prove it's real. If any check fails, stop and send me the output.

## 3. Frontend against Sepolia

```powershell
npm run build --workspace @signet/app     # picks up the new addresses
npm run start --workspace @signet/app
```

Open `http://localhost:3000/app`, connect the operator wallet on Sepolia, and
click through Send → Claim (recipient wallet) → Verify, plus the round-trip's
`/p/<proofId>` with the verifier wallet. First in-browser check of the
self-hosted relayer bundle happens here — if anything misbehaves, send me the
browser console output.

## 4. Vercel

- Project root: `packages/app`. Build command `npm run build`, install command
  `npm install --legacy-peer-deps` (TokenOps SDK peers on wagmi v2; we use its
  viem client only).
- Set env var `NEXT_PUBLIC_SEPOLIA_RPC_URL` in the Vercel dashboard
  (browser-safe, rate-limited key).
- `deployments.sepolia.json` is committed after step 1, so the build needs no
  other configuration. Custom domain: point it at the Vercel project —
  it reads as production and scores real-world viability.

## What to verify after each step

- After deploy: both addresses respond on Sepolia Etherscan; `verifiedIssuer(operator)` is true.
- After round-trip: all checks PASS; the `/p/<proofId>` page shows
  "✓ matches the disperse transaction" provenance and the verifier wallet can
  decrypt exactly one boolean.
- After Vercel: `?demo=true` parity + the real `/p/<proofId>` both load on the
  public domain.
