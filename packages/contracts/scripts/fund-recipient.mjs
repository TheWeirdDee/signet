/**
 * Send a little Sepolia gas ETH from the operator to a recipient wallet so it
 * can pay for its proveAtLeast transaction. RUN BY THE PROJECT OWNER.
 *
 * Usage (from repo root):
 *   node packages/contracts/scripts/fund-recipient.mjs 0x<recipient> [amountEth]
 *
 * Defaults: amountEth = 0.005. Gated to Sepolia (11155111).
 */
import * as dotenv from "dotenv";
import { JsonRpcProvider, Wallet, parseEther, formatEther, isAddress } from "ethers";

dotenv.config({ path: process.cwd() + "/.env" });

const RPC = process.env.SEPOLIA_RPC_URL;
const KEY = process.env.SEPOLIA_PRIVATE_KEY;
const to = process.argv[2];
const amountEth = process.argv[3] ?? "0.005";

if (!RPC || !KEY) {
  console.error("SEPOLIA_RPC_URL / SEPOLIA_PRIVATE_KEY missing from .env");
  process.exit(1);
}
if (!to || !isAddress(to)) {
  console.error("Usage: node packages/contracts/scripts/fund-recipient.mjs 0x<recipient> [amountEth]");
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC);
const { chainId } = await provider.getNetwork();
if (chainId !== 11155111n) {
  console.error(`Refusing: chainId ${chainId} is not Sepolia (11155111). Check SEPOLIA_RPC_URL.`);
  process.exit(1);
}

const wallet = new Wallet(KEY, provider);
console.log(`sending ${amountEth} ETH  ${wallet.address} → ${to}  (Sepolia)`);
const tx = await wallet.sendTransaction({ to, value: parseEther(amountEth) });
console.log("tx:", tx.hash);
await tx.wait();
console.log("confirmed: https://sepolia.etherscan.io/tx/" + tx.hash);
console.log("recipient balance:", formatEther(await provider.getBalance(to)), "ETH");
