TokenOps SDK — Developer Feedback Report

This feedback is compiled from my experience integrating the TokenOps SDK (@tokenops/sdk v1.1.1) into Signet, a confidential token distribution and selective disclosure proof dApp on Sepolia, built for the Zama Season 3 Developer Program Special Bounty (TokenOps Track).

Signet implements a two-layer architecture:
1. Confidential Settlement (Layer 1): Using the TokenOps SDK confidential disperse (direct mode) to send ERC-7984 confidential tokens.
2. Selective Disclosure Receipts (Layer 2): Using my custom contract SignetDistributor.sol to allow recipients to run FHE-encrypted computations (FHE.ge / proveAtLeast) on top of the disperse's own FHE ciphertexts.

Below is my detailed, constructive feedback on the developer experience (DX) and integration lifecycle of the SDK.

---

What Went Well (The High Points)

1. Reliable Sepolia Settlement
Once configured and deployed, the direct-mode confidential disperse operates flawlessly on Sepolia. Transactions settle correctly, and encrypted balances are updated reliably under FHE.

2. Automatic and Clean Log Parsing
The SDK’s JS/TS interface (createConfidentialDisperseClient -> disperse) is well-designed in its return values. By parsing transaction logs internally and returning the exact requested and transferred FHE handles from the receipt:

const result = await tokenops.disperse({ ... });
const { requested, transferred } = result.distributions[0];

It saved me from writing tedious manual log decoding, event filters, or ABI-parsing boilerplate in my frontend client.

3. Smart Contract Flexibility (Handle Delegation)
The inclusion of batchDiscloseHandlesToParty on the verified DisperseConfidential contract is an incredibly powerful architectural choice. It allows third-party protocols (like SignetDistributor) to gain permanent compute permissions on existing handles without duplicating ciphertexts. This enabled Signet's primary thesis: building credentials directly on top of the settlement's FHE outputs without re-encrypting.

---

Friction Points (Areas for Improvement)

1. Outdated Peer Dependencies (Wagmi v2 & React 18)
The SDK has strict peer dependencies on @wagmi/core and wagmi in the 2.x range, which are built for React 18.
- Modern dApps built with Next.js 15+ and React 19 (e.g., standard Wagmi v3 boilerplates) throw npm resolution block errors upon installation.
- Developers are forced to use --legacy-peer-deps or forced dependency overrides, which creates build issues on deployment platforms like Vercel.
- Recommendation: Decouple the core SDK logic from React/Wagmi frameworks entirely, or update the peer dependencies to support Wagmi v3 and React 19.

2. Undocumented ACL and Handle Delegation Mechanics
While the batchDiscloseHandlesToParty capability is brilliant, its existence, the distinction between requested and transferred handles, and how handle ACL delegation works are completely undocumented.
- I had to pull and read the verified bytecode/source of DisperseConfidential on Sepolia Etherscan to understand how the contract validates sender/contract permissions during disclosure.
- Without doing Etherscan reconnaissance, developers wouldn't know they need to call batchDiscloseHandlesToParty before a downstream contract can call FHE.ge or FHE.add on the disperse's handles.
- Recommendation: Provide a dedicated section in the documentation detailing the lifecycle of FHE handles returned by a disperse, how to delegate permissions, and how companion contracts should validate handle ownership onchain.

3. Lack of Local Testing Mocks
The SDK operates under the assumption that it is either running on Sepolia/Mainnet or that the singleton contracts are globally deployed.
- There are no local Mock contracts or test harnesses bundled in the SDK. This makes it impossible to write offline Hardhat/Foundry unit tests or run a local node (hardhat node / anvil) out-of-the-box.
- To test SignetDistributor, I had to implement a grant-faithful mock (LocalDisperse.sol) from scratch that replicates the Sepolia singleton's internal event signatures, direct-mode ACL grants, and disclosure checks.
- Recommendation: Provide a simple mock contract (LocalDisperseMock.sol or similar) in the NPM package or in a dedicated dev-tooling package, making local Hardhat tests easy to spin up.

4. Rigid Encryptor Interface and Missing Types
When creating a client on platforms with customized relayer instances (or local mocks), developers must supply a custom encryptor adapter.
- The Encryptor type is not exported as a first-class interface from the SDK package, forcing developers to declare inline structural types:

  encryptor: {
    encrypt: (params: { values: ... }) => Promise<{ handles: ... }>
  }

- Recommendation: Export all supporting TS interfaces (e.g., Encryptor, DisperseOptions, ConfidentialDisperseClient) from the main entry point.

5. Revert Transparency
When a disperse fails (for example, if the operator forgot to call setOperator on the confidential token or has insufficient balance), the errors bubbled up are low-level EVM revert codes.
- Recommendation: Provide client-side simulation or inspect the transaction state to return clean developer-facing errors (e.g., "TokenOps: Disperse contract is not authorized as operator" or "TokenOps: Insufficient operator balance").

---

Summary Checklist for the TokenOps Team

- [ ] Modernize Stack: Support Wagmi v3, React 19, and Next.js 15+ without peer-dependency warnings.
- [ ] Document Compositions: Publish detailed guides showing how downstream developers can build contract extensions using handle disclosure.
- [ ] Provide Test Mocks: Ship a standard DisperseMock.sol contract for local Hardhat/Foundry environments.
- [ ] Refine Exports: Clean up TypeScript type exports to make writing custom encryptors or clients straightforward.
