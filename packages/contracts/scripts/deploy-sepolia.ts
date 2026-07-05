import * as fs from "fs";
import * as path from "path";
import { artifacts, ethers, network } from "hardhat";

/**
 * SEPOLIA deploy — executed MANUALLY by the project owner, never by tooling.
 *
 * Hard gates:
 *  - refuses any chain except Sepolia (11155111);
 *  - refuses to run without SEPOLIA_PRIVATE_KEY (set only in your shell/.env);
 *  - prints every address and waits on nothing else — no follow-up txs beyond
 *    deploy + one issuer attestation for the deployer (the operator wallet).
 *
 * Writes addresses + ABIs into packages/app/src/lib/chain/gen/ so the app
 * picks them up on the next build.
 */
async function main() {
  // key check FIRST — fails fast with zero network calls
  if (!process.env.SEPOLIA_PRIVATE_KEY) {
    throw new Error(
      "SEPOLIA_PRIVATE_KEY is not set. Put it in the repo-root .env file (copy .env.example) — see RUNBOOK-SEPOLIA.md.",
    );
  }
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 11155111n) {
    throw new Error(
      `deploy-sepolia is restricted to Sepolia (11155111); got chainId=${chainId} on network "${network.name}". ` +
        "Check SEPOLIA_RPC_URL — it must be an eth-sepolia endpoint (not mainnet).",
    );
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`deployer (operator/issuer): ${deployer.address}`);
  console.log(`balance: ${ethers.formatEther(balance)} ETH`);
  if (balance < ethers.parseEther("0.02")) {
    throw new Error("Deployer balance below 0.02 ETH — top up before deploying.");
  }

  // $1B of demo supply at 6 decimals — uint64-safe (max ~1.8e19)
  const INITIAL_MINT = 1_000_000_000_000_000n;

  const token = await (await ethers.getContractFactory("SignetToken")).deploy(
    deployer.address,
    INITIAL_MINT,
    "Signet USD",
    "cUSDT",
    "",
  );
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`SignetToken:       ${tokenAddress}`);

  const distributor = await (await ethers.getContractFactory("SignetDistributor")).deploy(
    deployer.address,
  );
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();
  console.log(`SignetDistributor: ${distributorAddress}`);

  await (await distributor.setVerifiedIssuer(deployer.address, true)).wait();
  console.log(`verified issuer:   ${deployer.address}`);

  const genDir = path.resolve(__dirname, "../../app/src/lib/chain/gen");
  fs.mkdirSync(genDir, { recursive: true });
  const deployBlock = Math.max(0, Number(await ethers.provider.getBlockNumber()) - 10);
  const deployments = {
    chainId: 11155111,
    network: "sepolia",
    SignetToken: tokenAddress,
    SignetDistributor: distributorAddress,
    // the REAL TokenOps DisperseConfidential singleton on Sepolia
    Disperse: "0x710dD9885Cc9986EfD234E7719483147a6d8DBb4",
    deployBlock,
  };
  fs.writeFileSync(
    path.join(genDir, "deployments.sepolia.json"),
    JSON.stringify(deployments, null, 2),
  );
  for (const name of ["SignetToken", "SignetDistributor", "LocalDisperse"]) {
    const artifact = await artifacts.readArtifact(name);
    fs.writeFileSync(path.join(genDir, `${name}.abi.json`), JSON.stringify(artifact.abi, null, 2));
  }
  console.log(`wrote addresses + ABIs to ${genDir}`);
  console.log("\nNEXT: verify both contracts on Etherscan, then run the round-trip:");
  console.log("  node packages/contracts/scripts/sepolia-roundtrip.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
