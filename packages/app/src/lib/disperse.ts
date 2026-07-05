"use client";

import type { PublicClient, WalletClient } from "viem";
import { parseEventLogs, toHex } from "viem";
import {
  deploymentFor,
  disperseAbi,
  distributorAbi,
  LOCAL_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  tokenAbi,
} from "@/lib/chain/contracts";
import { getFhevmClient, type FhevmClient } from "@/lib/fhevm/client";
import { getOrCreateSession, sessionDecrypt, type SignTypedDataFn } from "@/lib/fhevm/session";

/**
 * The full Signet distribution flow — settlement + receipt layer:
 *
 *   1. (once) `setOperator` so the disperse contract may move the sender's
 *      ERC-7984 balance (direct mode).
 *   2. Confidential disperse. On Sepolia this is the TokenOps SDK
 *      (`createConfidentialDisperseClient` → `disperse`, the bounty's
 *      settlement rail); locally it is the grant-faithful LocalDisperse
 *      double called through viem.
 *   3. SETTLEMENT-INTEGRITY GUARD (fail loudly): decrypt every `transferred`
 *      handle (the operator holds ACL on them) and require it to equal the
 *      requested amount. A partial settlement aborts BEFORE any receipt is
 *      registered, so Signet's proofs — which attest to the requested
 *      (allocated) amount — can never diverge from what actually moved.
 *   4. Disclose the disperse's own `requested` handles to SignetDistributor
 *      (compute ACL for FHE.ge / FHE.add).
 *   5. `registerDistribution` — verified attach + encrypted sum-proof.
 */

export type DisperseStage =
  | "approving"
  | "encrypting"
  | "dispersing"
  | "verifying"
  | "disclosing"
  | "registering";

export type DisperseOutcome = {
  distId: bigint;
  disperseTxHash: `0x${string}`;
  registerTxHash: `0x${string}`;
  recipientCount: number;
};

const UINT48_MAX = 281474976710655n;

export async function runDisperse(args: {
  chainId: number;
  account: `0x${string}`;
  recipients: `0x${string}`[];
  amountsUnits: bigint[];
  publicClient: PublicClient;
  walletClient: WalletClient;
  signTypedData: SignTypedDataFn;
  onStage: (stage: DisperseStage) => void;
}): Promise<DisperseOutcome> {
  const { chainId, account, recipients, amountsUnits, publicClient, walletClient, onStage } = args;
  const dep = deploymentFor(chainId);
  if (!dep) throw new Error(`No deployment for chain ${chainId}`);
  const client = await getFhevmClient(chainId);
  const declaredTotal = amountsUnits.reduce((a, b) => a + b, 0n);

  // -- 1. operator approval (one-time per account) --
  const isOperator = (await publicClient.readContract({
    address: dep.SignetToken,
    abi: tokenAbi,
    functionName: "isOperator",
    args: [account, dep.Disperse],
  })) as boolean;
  if (!isOperator) {
    onStage("approving");
    const hash = await walletClient.writeContract({
      address: dep.SignetToken,
      abi: tokenAbi,
      functionName: "setOperator",
      args: [dep.Disperse, UINT48_MAX],
      account,
      chain: walletClient.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  // -- 2. confidential disperse --
  let disperseTxHash: `0x${string}`;
  let requested: `0x${string}`[];
  let transferred: `0x${string}`[];

  if (chainId === SEPOLIA_CHAIN_ID) {
    // Settlement rail: TokenOps SDK confidential disperse (direct mode).
    onStage("encrypting");
    const { createConfidentialDisperseClient } = await import("@tokenops/sdk/fhe-disperse");
    const tokenops = createConfidentialDisperseClient({
      publicClient,
      walletClient,
      encryptor: toTokenOpsEncryptor(client),
    });
    onStage("dispersing");
    const result = await tokenops.disperse({
      token: dep.SignetToken,
      mode: "direct",
      recipients,
      amounts: amountsUnits,
    });
    disperseTxHash = result.hash as `0x${string}`;
    const dist = result.distributions[0];
    if (!dist) throw new Error("disperse succeeded but no distribution event was found");
    requested = dist.requested as `0x${string}`[];
    transferred = dist.transferred as `0x${string}`[];
  } else if (chainId === LOCAL_CHAIN_ID) {
    onStage("encrypting");
    let builder = client.createEncryptedInput(dep.Disperse, account);
    for (const amount of amountsUnits) builder = builder.add64(amount);
    const enc = await builder.encrypt();

    onStage("dispersing");
    const hash = await walletClient.writeContract({
      address: dep.Disperse,
      abi: disperseAbi,
      functionName: "disperseConfidentialTokenDirect",
      args: [dep.SignetToken, recipients, enc.handles.map((h) => toHex(h)), toHex(enc.inputProof)],
      account,
      chain: walletClient.chain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    disperseTxHash = receipt.transactionHash;
    const events = parseEventLogs({
      abi: disperseAbi,
      logs: receipt.logs,
      eventName: "DirectDistribution",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = (events[0] as any)?.args;
    if (!ev) throw new Error("disperse succeeded but no DirectDistribution event was found");
    requested = [...ev.requested];
    transferred = [...ev.transferred];
  } else {
    throw new Error(`Unsupported chain ${chainId}`);
  }

  // -- 3. settlement-integrity guard: transferred must equal requested --
  onStage("verifying");
  const { session } = await getOrCreateSession(client, chainId, account, args.signTypedData);
  const clear = await sessionDecrypt(
    client,
    session,
    transferred.map((handle) => ({ handle, contractAddress: dep.SignetToken })),
  );
  for (let i = 0; i < recipients.length; i++) {
    const got = BigInt(clear[transferred[i]] as bigint);
    if (got !== amountsUnits[i]) {
      throw new Error(
        `Settlement incomplete: recipient ${recipients[i]} received ${got} of ${amountsUnits[i]} units. ` +
          "Aborting before registration — no receipt was created. Top up the operator balance and retry.",
      );
    }
  }

  // -- 4. disclose the requested handles to the distributor --
  onStage("disclosing");
  const discloseHash = await walletClient.writeContract({
    address: dep.Disperse,
    abi: disperseAbi,
    functionName: "batchDiscloseHandlesToParty",
    args: [requested, dep.SignetDistributor],
    account,
    chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: discloseHash });

  // -- 5. register: verified attach + encrypted sum-proof --
  onStage("registering");
  const registerHash = await walletClient.writeContract({
    address: dep.SignetDistributor,
    abi: distributorAbi,
    functionName: "registerDistribution",
    args: [declaredTotal, disperseTxHash, recipients, requested],
    account,
    chain: walletClient.chain,
  });
  const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
  const registered = parseEventLogs({
    abi: distributorAbi,
    logs: registerReceipt.logs,
    eventName: "DistributionRegistered",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const distId = (registered[0] as any).args.distId as bigint;

  return { distId, disperseTxHash, registerTxHash: registerHash, recipientCount: recipients.length };
}

/**
 * Adapt our FhevmClient to the TokenOps SDK's structural `Encryptor`
 * interface (`encrypt({values, contractAddress, userAddress})`).
 */
function toTokenOpsEncryptor(client: FhevmClient) {
  return {
    async encrypt(params: {
      values: { value: unknown; type: string }[];
      contractAddress: string;
      userAddress: string;
    }): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
      let builder = client.createEncryptedInput(params.contractAddress, params.userAddress);
      for (const v of params.values) {
        if (v.type !== "euint64") {
          throw new Error(`Signet only disperses euint64 amounts (got ${v.type})`);
        }
        builder = builder.add64(BigInt(v.value as bigint));
      }
      return builder.encrypt();
    },
  };
}
