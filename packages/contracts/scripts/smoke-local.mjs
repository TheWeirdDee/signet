/**
 * Smoke test for the v2 flow: drives the EXACT client plumbing the Next app
 * uses (@fhevm/mock-utils MockFhevmInstance + EIP-712 user decrypt) against a
 * running local hardhat FHEVM node with deployed Signet contracts:
 *
 *   setOperator → disperse (LocalDisperse direct mode) → settlement guard
 *   (decrypt transferred == requested) → batch disclose → registerDistribution
 *   → recipient decrypt → proveAtLeast → verifier decrypt → public sum proof
 *   → cross-check registration vs disperse event.
 *
 * Run from repo root: node packages/contracts/scripts/smoke-local.mjs
 * (after `npm run node:local` + `npm run deploy:local`)
 */
import { readFileSync } from "fs";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { contracts as fhevmContracts, MockFhevmInstance, relayer } from "@fhevm/mock-utils";

const RPC = "http://127.0.0.1:8545";
const root = process.cwd();
const dep = JSON.parse(
  readFileSync(root + "/packages/app/src/lib/chain/gen/deployments.local.json", "utf8"),
);
const distributorAbi = JSON.parse(
  readFileSync(root + "/packages/app/src/lib/chain/gen/SignetDistributor.abi.json", "utf8"),
);
const disperseAbi = JSON.parse(
  readFileSync(root + "/packages/app/src/lib/chain/gen/LocalDisperse.abi.json", "utf8"),
);
const tokenAbi = JSON.parse(
  readFileSync(root + "/packages/app/src/lib/chain/gen/SignetToken.abi.json", "utf8"),
);

// well-known hardhat keys
const KEYS = {
  issuer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // #0 (holds tokens, verified issuer)
  verifier: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // #1
  alice: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // #2
  bob: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // #3
};

const UNITS = 1_000_000n; // 6 decimals
const ALICE = 2350n * UNITS;
const BOB = 1800n * UNITS;
const DECLARED = ALICE + BOB;

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

async function main() {
  // cacheTimeout -1: no result caching — avoids stale nonces under automine
  const provider = new JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
  const issuer = new Wallet(KEYS.issuer, provider);
  const verifier = new Wallet(KEYS.verifier, provider);
  const alice = new Wallet(KEYS.alice, provider);
  const bobAddr = new Wallet(KEYS.bob).address;

  // --- build the instance exactly like src/lib/fhevm/client.ts ---
  const metadata = await relayer.requestRelayerMetadata(provider);
  const repo = await fhevmContracts.FhevmContractsRepository.create(provider, {
    aclContractAddress: metadata.ACLAddress,
    kmsContractAddress: metadata.KMSVerifierAddress,
  });
  const cfg = repo.getFhevmInstanceConfig({ chainId: 31337, relayerUrl: RPC });
  const instance = await MockFhevmInstance.create(provider, provider, {
    aclContractAddress: cfg.aclContractAddress,
    chainId: cfg.chainId,
    gatewayChainId: cfg.gatewayChainId,
    inputVerifierContractAddress: cfg.inputVerifierContractAddress,
    kmsContractAddress: cfg.kmsContractAddress,
    verifyingContractAddressDecryption: cfg.verifyingContractAddressDecryption,
    verifyingContractAddressInputVerification: cfg.verifyingContractAddressInputVerification,
  }, {
    inputVerifierProperties: repo.inputVerifier.inputVerifierProperties,
    kmsVerifierProperties: repo.kmsVerifier.kmsVerifierProperties,
  });

  const token = new Contract(dep.SignetToken, tokenAbi, issuer);
  const disperse = new Contract(dep.Disperse, disperseAbi, issuer);
  const distributor = new Contract(dep.SignetDistributor, distributorAbi, issuer);

  // --- EIP-712 sessions (sign once; contracts list = distributor + token, like session.ts) ---
  const SESSION_CONTRACTS = [dep.SignetDistributor, dep.SignetToken];
  async function makeSession(wallet) {
    const { publicKey, privateKey } = instance.generateKeypair();
    const start = Math.floor(Date.now() / 1000);
    const days = 7;
    const eip712 = instance.createEIP712(publicKey, SESSION_CONTRACTS, start, days);
    const types = Object.fromEntries(
      Object.entries(eip712.types).filter(([k]) => k !== "EIP712Domain"),
    );
    const signature = await wallet.signTypedData(eip712.domain, types, eip712.message);
    return { publicKey, privateKey, signature, start, days };
  }
  async function decryptAs(wallet, session, pairs) {
    return instance.userDecrypt(
      pairs,
      session.privateKey,
      session.publicKey,
      session.signature,
      SESSION_CONTRACTS,
      wallet.address,
      session.start,
      session.days,
    );
  }

  // --- Send flow (what runDisperse does) ---
  if (!(await token.isOperator(issuer.address, dep.Disperse))) {
    await (await token.setOperator(dep.Disperse, 281474976710655n)).wait();
  }
  const enc = await instance
    .createEncryptedInput(dep.Disperse, issuer.address)
    .add64(ALICE)
    .add64(BOB)
    .encrypt();
  const dtx = await disperse.disperseConfidentialTokenDirect(
    dep.SignetToken,
    [alice.address, bobAddr],
    [enc.handles[0], enc.handles[1]],
    enc.inputProof,
  );
  const drc = await dtx.wait();
  const dev = drc.logs
    .map((l) => { try { return disperse.interface.parseLog(l); } catch { return null; } })
    .find((p) => p?.name === "DirectDistribution");
  const requested = [...dev.args.requested];
  const transferred = [...dev.args.transferred];
  console.log("dispersed, tx " + drc.hash.slice(0, 14) + "…");

  // settlement guard: transferred == requested (operator decrypts via token pair)
  const issuerSession = await makeSession(issuer);
  const guard = await decryptAs(
    issuer,
    issuerSession,
    transferred.map((handle) => ({ handle, contractAddress: dep.SignetToken })),
  );
  check(
    "settlement guard: transferred equals requested",
    guard[transferred[0]] === ALICE && guard[transferred[1]] === BOB,
  );

  // disclose + register
  await (await disperse.batchDiscloseHandlesToParty(requested, dep.SignetDistributor)).wait();
  const distId = await distributor.nextDistId();
  const rtx = await distributor.registerDistribution(
    DECLARED,
    drc.hash,
    [alice.address, bobAddr],
    requested,
  );
  await rtx.wait();
  console.log("registered distribution #" + distId);

  // --- Claim flow ---
  const aliceSession = await makeSession(alice);
  const aliceHandle = await distributor.allocationOf(distId, alice.address);
  const aliceClear = await decryptAs(alice, aliceSession, [
    { handle: aliceHandle, contractAddress: dep.SignetDistributor },
  ]);
  check(
    "recipient decrypts own allocation (one EIP-712 sign)",
    aliceClear[aliceHandle] === ALICE,
    String(aliceClear[aliceHandle]),
  );

  // --- Prove flow ---
  const dAlice = distributor.connect(alice);
  const ptx = await dAlice.proveAtLeast(distId, 2000n * UNITS, verifier.address);
  const prc = await ptx.wait();
  const pev = prc.logs
    .map((l) => { try { return distributor.interface.parseLog(l); } catch { return null; } })
    .find((p) => p?.name === "ProofIssued");
  const resultHandle = pev.args.result;

  const verifierSession = await makeSession(verifier);
  const verdict = await decryptAs(verifier, verifierSession, [
    { handle: resultHandle, contractAddress: dep.SignetDistributor },
  ]);
  check("verifier decrypts the proof ebool", verdict[resultHandle] === true);

  let aclBlocked = false;
  try {
    await decryptAs(verifier, verifierSession, [
      { handle: aliceHandle, contractAddress: dep.SignetDistributor },
    ]);
  } catch {
    aclBlocked = true;
  }
  check("verifier CANNOT decrypt the raw allocation (ACL)", aclBlocked);

  // --- Verify flow: public sum proof + cross-check ---
  const dist = await distributor.distributions(distId);
  const sumRes = await instance.publicDecrypt([dist.sumProof]);
  check("public sum proof decrypts TRUE", sumRes.clearValues[dist.sumProof] === true);

  check(
    "registration cross-checks against the disperse tx event",
    dist.disperseTxHash === drc.hash &&
      dev.args.recipients.every((r, i) => r === [alice.address, bobAddr][i]) &&
      requested.every((h, i) => h === requested[i]),
  );

  console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
