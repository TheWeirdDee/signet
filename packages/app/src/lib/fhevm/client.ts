"use client";

import { JsonRpcProvider } from "ethers";
import { LOCAL_CHAIN_ID, SEPOLIA_CHAIN_ID } from "@/lib/chain/contracts";
import { LOCAL_RPC_URL } from "@/lib/wagmi";

/**
 * FHEVM client, branched by chain:
 *
 *  - 31337 — hardhat mock node. @fhevm/mock-utils builds a MockFhevmInstance
 *    from the node's `fhevm_relayer_metadata` RPC. (The relayer SDK's Node
 *    entry it imports is aliased to a tiny pure-JS shim in next.config.ts.)
 *
 *  - 11155111 — the REAL Zama relayer. The relayer SDK web build is
 *    pre-bundled by scripts/build-zama-web.mjs into /public/zama/ and
 *    dynamic-imported at runtime, so the Next bundler never sees its
 *    WASM/worker graph. `createInstance(SepoliaConfig)` talks to Zama's
 *    hosted relayer + KMS.
 *
 * Both paths expose the same instance surface, typed here as FhevmClient.
 */

export type EncryptedInputResult = {
  handles: Uint8Array[];
  inputProof: Uint8Array;
};

export type EncryptedInputBuilder = {
  add64(value: bigint | number): EncryptedInputBuilder;
  encrypt(): Promise<EncryptedInputResult>;
};

export type Eip712Type = {
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
  primaryType: string;
  types: Record<string, { name: string; type: string }[]>;
};

export type FhevmClient = {
  createEncryptedInput(contractAddress: string, userAddress: string): EncryptedInputBuilder;
  generateKeypair(): { publicKey: string; privateKey: string };
  createEIP712(
    publicKey: string,
    contractAddresses: string[],
    startTimestamp: number,
    durationDays: number,
  ): Eip712Type;
  userDecrypt(
    handles: { handle: string; contractAddress: string }[],
    privateKey: string,
    publicKey: string,
    signature: string,
    contractAddresses: string[],
    userAddress: string,
    startTimestamp: number,
    durationDays: number,
  ): Promise<Record<string, bigint | boolean | string>>;
  publicDecrypt(handles: string[]): Promise<{
    clearValues?: Record<string, bigint | boolean | string>;
    [k: string]: unknown;
  }>;
};

const clientPromises = new Map<number, Promise<FhevmClient>>();

export function getFhevmClient(chainId: number): Promise<FhevmClient> {
  let p = clientPromises.get(chainId);
  if (!p) {
    p =
      chainId === LOCAL_CHAIN_ID
        ? createLocalClient()
        : chainId === SEPOLIA_CHAIN_ID
          ? createSepoliaClient()
          : Promise.reject(new Error(`No FHEVM client for chain ${chainId}`));
    p = p.catch((e) => {
      clientPromises.delete(chainId); // allow retry (e.g. node started after page load)
      throw e;
    });
    clientPromises.set(chainId, p);
  }
  return p;
}

/** Normalize publicDecrypt result shape across SDK generations. */
export function clearValuesOf(
  res: Awaited<ReturnType<FhevmClient["publicDecrypt"]>>,
): Record<string, bigint | boolean | string> {
  if (res && typeof res === "object" && "clearValues" in res && res.clearValues) {
    return res.clearValues as Record<string, bigint | boolean | string>;
  }
  return res as unknown as Record<string, bigint | boolean | string>;
}

async function createLocalClient(): Promise<FhevmClient> {
  const { contracts, MockFhevmInstance, relayer } = await import("@fhevm/mock-utils");

  const rpc = new JsonRpcProvider(LOCAL_RPC_URL);
  const metadata = await relayer.requestRelayerMetadata(rpc);
  const repo = await contracts.FhevmContractsRepository.create(rpc, {
    aclContractAddress: metadata.ACLAddress as `0x${string}`,
    kmsContractAddress: metadata.KMSVerifierAddress as `0x${string}`,
  });
  const cfg = repo.getFhevmInstanceConfig({ chainId: 31337, relayerUrl: LOCAL_RPC_URL });

  const instance = await MockFhevmInstance.create(
    rpc,
    rpc,
    {
      aclContractAddress: cfg.aclContractAddress as `0x${string}`,
      chainId: cfg.chainId,
      gatewayChainId: cfg.gatewayChainId,
      inputVerifierContractAddress: cfg.inputVerifierContractAddress as `0x${string}`,
      kmsContractAddress: cfg.kmsContractAddress as `0x${string}`,
      verifyingContractAddressDecryption: cfg.verifyingContractAddressDecryption as `0x${string}`,
      verifyingContractAddressInputVerification:
        cfg.verifyingContractAddressInputVerification as `0x${string}`,
    },
    {
      inputVerifierProperties: repo.inputVerifier.inputVerifierProperties,
      kmsVerifierProperties: repo.kmsVerifier.kmsVerifierProperties,
    },
  );

  return instance as unknown as FhevmClient;
}

async function createSepoliaClient(): Promise<FhevmClient> {
  // Runtime import of the self-hosted bundle — deliberately opaque to the
  // Next bundler (see scripts/build-zama-web.mjs).
  const url = new URL("/zama/relayer-sdk-web.js", window.location.origin).href;
  const sdk = await import(/* webpackIgnore: true */ url);

  await sdk.initSDK();
  const rpcUrl =
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const instance = await sdk.createInstance({ ...sdk.SepoliaConfig, network: rpcUrl });
  return instance as FhevmClient;
}
