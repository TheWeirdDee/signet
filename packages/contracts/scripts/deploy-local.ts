import * as fs from "fs";
import * as path from "path";
import { artifacts, ethers, network } from "hardhat";

/**
 * Local-only deploy: hardhat node (chainId 31337) with the FHEVM mock.
 * Writes addresses + ABIs into the Next app (src/lib/chain/gen).
 *
 * HARD RULE: this script refuses to run against anything but a local chain.
 * Sepolia deploys are performed manually by the project owner, never by tooling.
 */
async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 31337n) {
    throw new Error(
      `deploy-local is restricted to the local FHEVM mock chain (31337); got chainId=${chainId} on network "${network.name}". ` +
        "Live deploys are done manually by the project owner.",
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log(`deployer (operator/issuer for local dev): ${deployer.address}`);

  const tokenFactory = await ethers.getContractFactory("SignetToken");
  const token = await tokenFactory.deploy(
    deployer.address,
    1_000_000_000_000_000n, // 1e15 units = $1B of local play-money (6 decimals)
    "Signet USD",
    "cUSDT",
    "",
  );
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`SignetToken:       ${tokenAddress}`);

  const distributorFactory = await ethers.getContractFactory("SignetDistributor");
  const distributor = await distributorFactory.deploy(deployer.address);
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();
  console.log(`SignetDistributor: ${distributorAddress}`);

  // Local test double for the TokenOps DisperseConfidential singleton
  // (grant-faithful, direct mode). Sepolia uses the real singleton.
  const disperseFactory = await ethers.getContractFactory("LocalDisperse");
  const disperse = await disperseFactory.deploy();
  await disperse.waitForDeployment();
  const disperseAddress = await disperse.getAddress();
  console.log(`LocalDisperse:     ${disperseAddress}`);

  // Attest the first two local accounts as verified issuers for dev convenience.
  const signers = await ethers.getSigners();
  for (const s of signers.slice(0, 2)) {
    await (await distributor.setVerifiedIssuer(s.address, true)).wait();
  }
  console.log(`verified issuers:  ${signers[0].address}, ${signers[1].address}`);

  // --- export addresses + ABIs into the app ---
  const genDir = path.resolve(__dirname, "../../app/src/lib/chain/gen");
  fs.mkdirSync(genDir, { recursive: true });

  const deployments = {
    chainId: 31337,
    network: "localhost",
    SignetToken: tokenAddress,
    SignetDistributor: distributorAddress,
    Disperse: disperseAddress,
    deployBlock: 0,
  };
  fs.writeFileSync(path.join(genDir, "deployments.local.json"), JSON.stringify(deployments, null, 2));

  for (const name of ["SignetToken", "SignetDistributor", "LocalDisperse"]) {
    const artifact = await artifacts.readArtifact(name);
    fs.writeFileSync(path.join(genDir, `${name}.abi.json`), JSON.stringify(artifact.abi, null, 2));
  }
  console.log(`wrote addresses + ABIs to ${genDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
