import * as path from "path";
import * as dotenv from "dotenv";
import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import { HardhatUserConfig } from "hardhat/config";

// Secrets live ONLY in the repo-root .env (gitignored — copy .env.example).
// They are read here at config load; nothing is ever typed into a terminal.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Deploys are performed manually by the project owner. SEPOLIA_RPC_URL /
// SEPOLIA_PRIVATE_KEY are used when (and only when) a deploy is explicitly
// approved.
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: { enabled: true, runs: 800 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      // FHEVM mock environment (provided by @fhevm/hardhat-plugin)
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 120000,
  },
};

export default config;
