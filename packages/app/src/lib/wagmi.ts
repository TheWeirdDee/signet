import { createConfig, http } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Chains: local FHEVM hardhat node (dev) + Sepolia (the deployed demo).
 * Contract addresses resolve per chain in src/lib/chain/contracts.ts; the
 * Sepolia entries stay zero until the project owner runs the manual deploy.
 *
 * Wallet policy: every EIP-6963 injected provider (MetaMask, Zerion, …) is
 * enumerated via wagmi's multi-provider discovery and the user picks one in
 * the ConnectButton modal — never auto-selected. The generic `injected()`
 * connector is only a fallback for legacy wallets that don't announce via
 * EIP-6963; the picker hides it whenever discovered wallets exist.
 */
export const LOCAL_RPC_URL = "http://127.0.0.1:8545";

export const SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

export const wagmiConfig = createConfig({
  chains: [hardhat, sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [injected()],
  transports: {
    [hardhat.id]: http(LOCAL_RPC_URL),
    [sepolia.id]: http(SEPOLIA_RPC_URL),
  },
  ssr: true,
});
