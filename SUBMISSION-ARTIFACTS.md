# Signet — real-chain proof artifacts (Sepolia)

The demo video uses `?demo=true` for flow; **these transactions prove the
product is real onchain**. Recorded 2026-07-05 from the owner-run round-trip
(`packages/contracts/scripts/sepolia-roundtrip.mjs` — all checks passed).

## Contracts

| contract | address |
|---|---|
| SignetToken (ERC-7984, cUSDT) | [`0x46fEF55EcA3CeA2C1C374c5c30a6CFF7521c3150`](https://sepolia.etherscan.io/address/0x46fEF55EcA3CeA2C1C374c5c30a6CFF7521c3150) |
| SignetDistributor | [`0xa73723023a25fB400A153AE82F7A87B93d305f49`](https://sepolia.etherscan.io/address/0xa73723023a25fB400A153AE82F7A87B93d305f49) |
| TokenOps DisperseConfidential (settlement rail) | [`0x710dD9885Cc9986EfD234E7719483147a6d8DBb4`](https://sepolia.etherscan.io/address/0x710dD9885Cc9986EfD234E7719483147a6d8DBb4) |

Operator / verified issuer: `0x97f32Ba0b4DD5c274DFD9C2A7e6Aa403a9B7dE8d`

## Distribution #0 (the round-trip)

| step | tx |
|---|---|
| Confidential disperse via `@tokenops/sdk` (direct mode, 2 recipients, encrypted euint64 amounts) | [`0x448e1a03…dfdaa9a`](https://sepolia.etherscan.io/tx/0x448e1a03995242507a0af461f2885e6af6e2aae48a1717ffb232c4489dfdaa9a) |
| `registerDistribution` (verified attach + encrypted sum-proof) | [`0xc99fec5c…d84dfb`](https://sepolia.etherscan.io/tx/0xc99fec5c8070efe02aef775e8d1d61d59bec7ff4ae1480cb4e2a168622d84dfb) |
| `proveAtLeast(≥ $2,000)` → proof #0, scoped to verifier `0x7feFBF42…7665` | [`0xd964724c…e52359`](https://sepolia.etherscan.io/tx/0xd964724c5ff0886e10f20214a07d03038d8b61c24edeebdfb639306609e52359) |

Handle-disclosure tx (singleton → distributor compute ACL):
[`0xbbdf5c7e…f86f75`](https://sepolia.etherscan.io/tx/0xbbdf5c7e6921bce9d19cef3b84fb38bd355c8bbc199a0f2c49165a2575f86f75)

**Shareable proof link (live):** https://signet-app-two.vercel.app/p/0

**Live app:** https://signet-app-two.vercel.app · demo mode:
https://signet-app-two.vercel.app/app?demo=true

## What the round-trip verified against the REAL relayer/KMS

- Settlement guard: every `transferred` amount equals its `requested` allocation.
- Recipient (`0x8C62431d…F90e`) decrypted their own allocation via one EIP-712 signature.
- The verifier decrypted the proof ebool → `TRUE`.
- The verifier could **NOT** decrypt the raw amount (real ACL rejection).
- The public sum-proof (`declared = distributed`) decrypted `TRUE` with no authorization.
