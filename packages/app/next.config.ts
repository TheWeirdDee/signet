import path from "path";
import * as dotenv from "dotenv";
import type { NextConfig } from "next";

// Next only auto-loads .env files from the app dir; Signet keeps secrets in
// ONE repo-root .env. Load it here so NEXT_PUBLIC_* values reach the build.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// @fhevm/mock-utils (local-dev decrypt path) imports two pure-logic symbols
// from the relayer SDK's Node entry, whose module graph drags in ~5MB of WASM
// loaded via `fs` and stalls the bundler. A small faithful shim provides those
// two symbols instead — see src/lib/fhevm/kms-shim.ts.
const KMS_SHIM = path.resolve(__dirname, "src/lib/fhevm/kms-shim.ts");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SEPOLIA_RPC_URL: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
  },
  turbopack: {
    resolveAlias: {
      // relative to the app root (turbopack rejects absolute Windows paths)
      "@zama-fhe/relayer-sdk/node": "./src/lib/fhevm/kms-shim.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@zama-fhe/relayer-sdk/node": KMS_SHIM,
    };
    return config;
  },
};

export default nextConfig;
