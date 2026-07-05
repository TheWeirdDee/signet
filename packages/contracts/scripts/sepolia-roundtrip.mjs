/**
 * M3 STEP 4 — the isolated REAL-relayer round-trip on Sepolia.
 *
 * Proves, without the UI in the loop, that the production stack works end to
 * end: real Zama relayer encryption → TokenOps SDK confidential disperse →
 * settlement-integrity guard → handle disclosure → registerDistribution →
 * recipient EIP-712 user-decrypt → proveAtLeast → verifier ebool decrypt →
 * public sum-proof decrypt.
 *
 * RUN BY THE PROJECT OWNER ONLY (sends funded transactions):
 *   $env:SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/<key>"
 *   $env:SEPOLIA_PRIVATE_KEY="0x<operator key>"
 *   $env:RECIPIENT_PRIVATE_KEY="0x<key of one recipient wallet>"
 *   $env:VERIFIER_PRIVATE_KEY="0x<any second wallet key>"   # optional
 *   node packages/contracts/scripts/sepolia-roundtrip.mjs
 *
 * On success it prints every tx hash + a /p/<proofId> link — capture these
 * for the submission (the "real-chain-for-proof" artifact).
 *
 * NOTE: real KMS decrypts take ~10–15s each; the full run is a few minutes.
 */
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

// secrets come from the repo-root .env (run this script from the repo root)
dotenv.config({ path: process.cwd() + "/.env" });
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { sepolia } from "viem/chains";

const RPC = process.env.SEPOLIA_RPC_URL;
const OPERATOR_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const RECIPIENT_KEY = process.env.RECIPIENT_PRIVATE_KEY;
// `||` not `??`: an empty line in .env yields "", which must also fall back
const VERIFIER_KEY = process.env.VERIFIER_PRIVATE_KEY || OPERATOR_KEY;
const missing = [
  !RPC && "SEPOLIA_RPC_URL",
  !OPERATOR_KEY && "SEPOLIA_PRIVATE_KEY",
  !RECIPIENT_KEY && "RECIPIENT_PRIVATE_KEY",
].filter(Boolean);
if (missing.length > 0) {
  console.error(`Missing in .env: ${missing.join(", ")} — fill them in the repo-root .env file.`);
  process.exit(1);
}

/**
 * Wallets export keys in slightly different shapes (no 0x prefix, stray
 * quotes/whitespace). Normalize, and if still not a 32-byte hex key, say
 * WHICH variable is malformed — never the key itself.
 */
function normalizeKey(name, value) {
  let k = String(value).trim().replace(/^["']|["']$/g, "");
  if (!k.startsWith("0x")) k = "0x" + k;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) {
    console.error(
      `${name} in .env is not a valid private key (expected 64 hex characters, with or without 0x). ` +
        `Got ${k.length - 2} hex chars. Re-copy it from the wallet's "show private key" screen.`,
    );
    process.exit(1);
  }
  return k;
}
if (RPC.includes("mainnet")) {
  console.error("SEPOLIA_RPC_URL points at a MAINNET endpoint — refusing to run.");
  process.exit(1);
}

const root = process.cwd();
const dep = JSON.parse(
  readFileSync(root + "/packages/app/src/lib/chain/gen/deployments.sepolia.json", "utf8"),
);
const distributorAbi = JSON.parse(
  readFileSync(root + "/packages/app/src/lib/chain/gen/SignetDistributor.abi.json", "utf8"),
);
const tokenAbi = JSON.parse(
  readFileSync(root + "/packages/app/src/lib/chain/gen/SignetToken.abi.json", "utf8"),
);
if (dep.SignetDistributor === "0x0000000000000000000000000000000000000000") {
  console.error("deployments.sepolia.json still has zero addresses — run deploy:sepolia first.");
  process.exit(1);
}

const UNITS = 1_000_000n;
const AMOUNTS = [2350n * UNITS, 1800n * UNITS];

const operator = privateKeyToAccount(normalizeKey("SEPOLIA_PRIVATE_KEY", OPERATOR_KEY));
const recipient = privateKeyToAccount(normalizeKey("RECIPIENT_PRIVATE_KEY", RECIPIENT_KEY));
const verifier = privateKeyToAccount(normalizeKey("VERIFIER_PRIVATE_KEY (or operator fallback)", VERIFIER_KEY));
const secondRecipient = "0x7feFBF42438D7b0B093e1f215fbBC3d03ABB7665"; // divine's recipient #2

const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });
const walletClient = createWalletClient({ account: operator, chain: sepolia, transport: http(RPC) });

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};
const write = async (req) => {
  const hash = await walletClient.writeContract({ ...req, account: operator });
  const rcpt = await publicClient.waitForTransactionReceipt({ hash });
  return rcpt;
};

async function main() {
  console.log("operator:", operator.address, "recipient:", recipient.address);
  const recipientGas = await publicClient.getBalance({ address: recipient.address });
  if (recipientGas === 0n) {
    console.error(
      `Recipient ${recipient.address} has 0 ETH — it can't send its proveAtLeast tx. ` +
        `Fund it first:\n  node packages/contracts/scripts/fund-recipient.mjs ${recipient.address}`,
    );
    process.exit(1);
  }
  console.log("creating real relayer instance (Zama KMS)…");
  const instance = await createInstance({ ...SepoliaConfig, network: RPC });

  // session helper: sign once per identity, decrypt many
  const SESSION_CONTRACTS = [dep.SignetDistributor, dep.SignetToken];
  async function makeSession(account) {
    const { publicKey, privateKey } = instance.generateKeypair();
    const start = Math.floor(Date.now() / 1000);
    const days = 7;
    const eip712 = instance.createEIP712(publicKey, SESSION_CONTRACTS, start, days);
    const types = Object.fromEntries(Object.entries(eip712.types).filter(([k]) => k !== "EIP712Domain"));
    const signature = await account.signTypedData({
      domain: eip712.domain,
      types,
      primaryType: eip712.primaryType,
      message: eip712.message,
    });
    return { publicKey, privateKey, signature, start, days, address: account.address };
  }
  const decryptAs = (session, pairs) =>
    instance.userDecrypt(
      pairs,
      session.privateKey,
      session.publicKey,
      session.signature,
      SESSION_CONTRACTS,
      session.address,
      session.start,
      session.days,
    );

  // -- operator approval for direct mode --
  const isOp = await publicClient.readContract({
    address: dep.SignetToken,
    abi: tokenAbi,
    functionName: "isOperator",
    args: [operator.address, dep.Disperse],
  });
  if (!isOp) {
    console.log("setting disperse singleton as ERC-7984 operator…");
    await write({
      address: dep.SignetToken,
      abi: tokenAbi,
      functionName: "setOperator",
      args: [dep.Disperse, 281474976710655n],
    });
  }

  // -- TokenOps SDK confidential disperse (THE settlement rail) --
  console.log("dispersing via @tokenops/sdk (direct mode)…");
  const { createConfidentialDisperseClient } = await import("@tokenops/sdk/fhe-disperse");
  const tokenops = createConfidentialDisperseClient({
    publicClient,
    walletClient,
    encryptor: {
      encrypt: async ({ values, contractAddress, userAddress }) => {
        let b = instance.createEncryptedInput(contractAddress, userAddress);
        for (const v of values) b = b.add64(BigInt(v.value));
        return b.encrypt();
      },
    },
  });
  const recipients = [recipient.address, secondRecipient];
  const result = await tokenops.disperse({
    token: dep.SignetToken,
    mode: "direct",
    recipients,
    amounts: AMOUNTS,
  });
  console.log("DISPERSE TX:", result.hash);
  console.log("  https://sepolia.etherscan.io/tx/" + result.hash);
  const { requested, transferred } = result.distributions[0];

  // -- settlement-integrity guard --
  console.log("guard: decrypting transferred handles (KMS, ~15s each)…");
  const opSession = await makeSession(operator);
  const clear = await decryptAs(
    opSession,
    transferred.map((handle) => ({ handle, contractAddress: dep.SignetToken })),
  );
  const settled = AMOUNTS.every((a, i) => BigInt(clear[transferred[i]]) === a);
  check("settlement guard: transferred == requested", settled);
  if (!settled) {
    console.error("ABORTING — partial settlement; no receipts registered.");
    process.exit(1);
  }

  // -- disclose to the distributor (on the real singleton) --
  console.log("disclosing handles to SignetDistributor…");
  const discloseRcpt = await write({
    address: dep.Disperse,
    abi: [
      {
        type: "function",
        name: "batchDiscloseHandlesToParty",
        stateMutability: "nonpayable",
        inputs: [
          { name: "handles", type: "bytes32[]" },
          { name: "party", type: "address" },
        ],
        outputs: [],
      },
    ],
    functionName: "batchDiscloseHandlesToParty",
    args: [requested, dep.SignetDistributor],
  });
  console.log("DISCLOSE TX:", discloseRcpt.transactionHash);

  // -- register --
  console.log("registering distribution…");
  const declared = AMOUNTS[0] + AMOUNTS[1];
  const regRcpt = await write({
    address: dep.SignetDistributor,
    abi: distributorAbi,
    functionName: "registerDistribution",
    args: [declared, result.hash, recipients, requested],
  });
  const regEv = parseEventLogs({
    abi: distributorAbi,
    logs: regRcpt.logs,
    eventName: "DistributionRegistered",
  });
  const distId = regEv[0].args.distId;
  console.log("REGISTER TX:", regRcpt.transactionHash, "→ distribution #" + distId);

  // -- recipient decrypts own allocation --
  console.log("recipient decrypting own allocation (KMS)…");
  const recipientSession = await makeSession(recipient);
  const allocHandle = await publicClient.readContract({
    address: dep.SignetDistributor,
    abi: distributorAbi,
    functionName: "allocationOf",
    args: [distId, recipient.address],
  });
  const alloc = await decryptAs(recipientSession, [
    { handle: allocHandle, contractAddress: dep.SignetDistributor },
  ]);
  check("recipient decrypts own allocation", BigInt(alloc[allocHandle]) === AMOUNTS[0]);

  // -- proveAtLeast from the recipient --
  console.log("issuing proveAtLeast(≥ $2,000) to verifier " + verifier.address + "…");
  const recipientWallet = createWalletClient({ account: recipient, chain: sepolia, transport: http(RPC) });
  const proveHash = await recipientWallet.writeContract({
    address: dep.SignetDistributor,
    abi: distributorAbi,
    functionName: "proveAtLeast",
    args: [distId, 2000n * UNITS, verifier.address],
    account: recipient,
  });
  const proveRcpt = await publicClient.waitForTransactionReceipt({ hash: proveHash });
  const proofEv = parseEventLogs({ abi: distributorAbi, logs: proveRcpt.logs, eventName: "ProofIssued" });
  const { proofId, result: resultHandle } = proofEv[0].args;
  console.log("PROVE TX:", proveRcpt.transactionHash, "→ proof #" + proofId);

  // -- verifier decrypts ONLY the boolean --
  console.log("verifier decrypting the ebool (KMS)…");
  const verifierSession = await makeSession(verifier);
  const verdict = await decryptAs(verifierSession, [
    { handle: resultHandle, contractAddress: dep.SignetDistributor },
  ]);
  check("verifier decrypts proof ebool TRUE", verdict[resultHandle] === true);

  let blocked = false;
  try {
    await decryptAs(verifierSession, [{ handle: allocHandle, contractAddress: dep.SignetDistributor }]);
  } catch {
    blocked = true;
  }
  check("verifier CANNOT decrypt the raw amount (real ACL)", blocked);

  // -- public sum proof --
  const dist = await publicClient.readContract({
    address: dep.SignetDistributor,
    abi: distributorAbi,
    functionName: "distributions",
    args: [distId],
  });
  const sumProofHandle = dist[6];
  const pub = await instance.publicDecrypt([sumProofHandle]);
  const clearValues = pub && typeof pub === "object" && "clearValues" in pub ? pub.clearValues : pub;
  check("public sum proof decrypts TRUE", Boolean(clearValues[sumProofHandle]) === true);

  console.log("\n=== ARTIFACTS FOR THE SUBMISSION ===");
  console.log("disperse:  https://sepolia.etherscan.io/tx/" + result.hash);
  console.log("register:  https://sepolia.etherscan.io/tx/" + regRcpt.transactionHash);
  console.log("prove:     https://sepolia.etherscan.io/tx/" + proveRcpt.transactionHash);
  console.log("proof link: https://<your-domain>/p/" + proofId + "  (or http://localhost:3000/p/" + proofId + ")");
  console.log(failures === 0 ? "\nALL ROUND-TRIP CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ROUND-TRIP FAILED:", e);
  process.exit(1);
});
