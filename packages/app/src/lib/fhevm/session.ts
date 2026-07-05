"use client";

import { deploymentFor } from "@/lib/chain/contracts";
import type { Eip712Type, FhevmClient } from "./client";

/**
 * EIP-712 user-decryption session.
 *
 * The user signs the KMS "UserDecryptRequestVerification" message ONCE per
 * session; the keypair + signature are cached (memory + sessionStorage) and
 * every subsequent decrypt reuses them with no wallet popup. This is the
 * scored decrypt-UX requirement — never re-prompt per claim.
 *
 * The signed contract list covers the distributor (allocation + proof
 * handles) and the token (transferred handles for the operator's
 * settlement-integrity guard), so one signature serves every decrypt the app
 * performs on that chain.
 */

export type DecryptSession = {
  publicKey: string;
  privateKey: string;
  signature: string;
  startTimestamp: number;
  durationDays: number;
  contractAddresses: string[];
  userAddress: string;
  chainId: number;
};

export type HandlePair = { handle: string; contractAddress: string };

export type SignTypedDataFn = (args: {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}) => Promise<string>;

const SESSION_DURATION_DAYS = 7;
const memory = new Map<string, DecryptSession>();

function sessionContracts(chainId: number): string[] {
  const d = deploymentFor(chainId);
  if (!d) throw new Error(`No deployment for chain ${chainId}`);
  return [d.SignetDistributor, d.SignetToken];
}

function storageKey(chainId: number, userAddress: string): string {
  return `signet.decrypt-session.${chainId}.${userAddress.toLowerCase()}`;
}

function isValid(s: DecryptSession, contracts: string[]): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now >= s.startTimestamp + s.durationDays * 86400 - 60) return false;
  // must cover every contract the app decrypts against (stale sessions from
  // before a redeploy are discarded)
  return contracts.every((c) => s.contractAddresses.map((a) => a.toLowerCase()).includes(c.toLowerCase()));
}

export function loadSession(chainId: number, userAddress: string): DecryptSession | null {
  const contracts = sessionContracts(chainId);
  const key = storageKey(chainId, userAddress);
  const cached = memory.get(key);
  if (cached && isValid(cached, contracts)) return cached;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as DecryptSession;
    if (!isValid(s, contracts)) return null;
    memory.set(key, s);
    return s;
  } catch {
    return null;
  }
}

/** Returns the cached session, or signs once (single wallet prompt) and caches it. */
export async function getOrCreateSession(
  client: FhevmClient,
  chainId: number,
  userAddress: string,
  signTypedData: SignTypedDataFn,
): Promise<{ session: DecryptSession; signed: boolean }> {
  const existing = loadSession(chainId, userAddress);
  if (existing) return { session: existing, signed: false };

  const contractAddresses = sessionContracts(chainId);
  const { publicKey, privateKey } = client.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000);
  const eip712: Eip712Type = client.createEIP712(
    publicKey,
    contractAddresses,
    startTimestamp,
    SESSION_DURATION_DAYS,
  );

  // viem rejects an explicit EIP712Domain entry in `types`
  const types = Object.fromEntries(
    Object.entries(eip712.types).filter(([k]) => k !== "EIP712Domain"),
  );

  const signature = await signTypedData({
    domain: eip712.domain,
    types,
    primaryType: eip712.primaryType,
    message: eip712.message,
  });

  const session: DecryptSession = {
    publicKey,
    privateKey,
    signature,
    startTimestamp,
    durationDays: SESSION_DURATION_DAYS,
    contractAddresses,
    userAddress,
    chainId,
  };
  const key = storageKey(chainId, userAddress);
  memory.set(key, session);
  try {
    sessionStorage.setItem(key, JSON.stringify(session));
  } catch {
    // sessionStorage unavailable — memory cache still covers the session
  }
  return { session, signed: true };
}

/** Decrypt handle/contract pairs under a session — no wallet interaction. */
export async function sessionDecrypt(
  client: FhevmClient,
  session: DecryptSession,
  pairs: HandlePair[],
): Promise<Record<string, bigint | boolean | string>> {
  return client.userDecrypt(
    pairs,
    session.privateKey,
    session.publicKey,
    session.signature,
    session.contractAddresses,
    session.userAddress,
    session.startTimestamp,
    session.durationDays,
  );
}
