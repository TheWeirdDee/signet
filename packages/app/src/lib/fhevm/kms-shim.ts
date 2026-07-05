/**
 * Browser shim for `@zama-fhe/relayer-sdk/node` — used ONLY by the local-dev
 * mock path (@fhevm/mock-utils), aliased in next.config.ts.
 *
 * Why: mock-utils imports exactly two symbols from the relayer SDK's Node
 * entry, whose module graph drags in ~5MB of ML-KEM/TFHE WASM loaded via
 * `fs` — unbundleable for the browser and unnecessary in mock mode:
 *
 *  - `KmsEIP712` builds plain EIP-712 typed data (pure JS — mirrored below,
 *    field-for-field, from relayer-sdk lib/internal.js).
 *  - `TKMSPkeKeypair.generate()` creates the user's ML-KEM keypair. The mock
 *    relayer never encrypts responses to that key (its userDecrypt ignores
 *    the private key), so random bytes are a faithful stand-in.
 *
 * The real relayer-sdk (`createInstance(SepoliaConfig)`) replaces the whole
 * mock path in the Sepolia milestone; this shim never ships in that flow.
 */

type Eip712Field = { name: string; type: string };

const EIP712_DOMAIN_TYPE: Eip712Field[] = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

function ensure0x(v: string): string {
  return v.startsWith("0x") ? v : "0x" + v;
}

export class KmsEIP712 {
  readonly domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };

  constructor(params: { chainId: bigint | number; verifyingContractAddressDecryption: string }) {
    this.domain = {
      name: "Decryption",
      version: "1",
      chainId: Number(params.chainId),
      verifyingContract: params.verifyingContractAddressDecryption,
    };
  }

  createUserDecryptEIP712({
    publicKey,
    contractAddresses,
    startTimestamp,
    durationDays,
    extraData,
  }: {
    publicKey: string;
    contractAddresses: string[];
    startTimestamp: number;
    durationDays: number;
    extraData: string;
  }) {
    return {
      types: {
        EIP712Domain: EIP712_DOMAIN_TYPE,
        UserDecryptRequestVerification: [
          { name: "publicKey", type: "bytes" },
          { name: "contractAddresses", type: "address[]" },
          { name: "startTimestamp", type: "uint256" },
          { name: "durationDays", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
      primaryType: "UserDecryptRequestVerification" as const,
      domain: { ...this.domain },
      message: {
        publicKey: ensure0x(publicKey),
        contractAddresses: [...contractAddresses],
        startTimestamp: startTimestamp.toString(),
        durationDays: durationDays.toString(),
        extraData,
      },
    };
  }

  createDelegatedUserDecryptEIP712({
    publicKey,
    contractAddresses,
    delegatorAddress,
    startTimestamp,
    durationDays,
    extraData,
  }: {
    publicKey: string;
    contractAddresses: string[];
    delegatorAddress: string;
    startTimestamp: number;
    durationDays: number;
    extraData: string;
  }) {
    return {
      types: {
        EIP712Domain: EIP712_DOMAIN_TYPE,
        DelegatedUserDecryptRequestVerification: [
          { name: "publicKey", type: "bytes" },
          { name: "contractAddresses", type: "address[]" },
          { name: "delegatorAddress", type: "address" },
          { name: "startTimestamp", type: "uint256" },
          { name: "durationDays", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
      primaryType: "DelegatedUserDecryptRequestVerification" as const,
      domain: { ...this.domain },
      message: {
        publicKey: ensure0x(publicKey),
        contractAddresses: [...contractAddresses],
        delegatorAddress,
        startTimestamp: startTimestamp.toString(),
        durationDays: durationDays.toString(),
        extraData,
      },
    };
  }
}

function randomHexNo0x(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class TKMSPkeKeypair {
  #publicKey: string;
  #privateKey: string;

  private constructor(publicKey: string, privateKey: string) {
    this.#publicKey = publicKey;
    this.#privateKey = privateKey;
  }

  static generate(): TKMSPkeKeypair {
    return new TKMSPkeKeypair(randomHexNo0x(48), randomHexNo0x(48));
  }

  static from(value: { publicKey: string; privateKey: string }): TKMSPkeKeypair {
    return new TKMSPkeKeypair(
      value.publicKey.replace(/^0x/, ""),
      value.privateKey.replace(/^0x/, ""),
    );
  }

  toBytesHexNo0x() {
    return { publicKey: this.#publicKey, privateKey: this.#privateKey };
  }

  toBytesHex() {
    return { publicKey: "0x" + this.#publicKey, privateKey: "0x" + this.#privateKey };
  }

  get publicKey() {
    return this.#publicKey;
  }
  get privateKey() {
    return this.#privateKey;
  }
}
