import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

/**
 * v2 architecture: proofs run on the DISPERSE'S OWN per-recipient `requested`
 * handles. The fixture mirrors the production flow exactly:
 *
 *   1. LocalDisperse (grant-faithful double of the TokenOps singleton, direct
 *      mode) moves SignetToken and leaves `requested` handles ACL'd to
 *      {LocalDisperse, sender, recipient}.
 *   2. The sender batch-discloses those handles to SignetDistributor.
 *   3. registerDistribution attaches them — verifying, onchain, that each
 *      handle is disclosed to the distributor AND held by its claimed
 *      recipient — then folds the encrypted sum and publishes the public
 *      sum-proof.
 */

const ALICE_AMOUNT = 2350n;
const BOB_AMOUNT = 1800n;
const DECLARED_TOTAL = ALICE_AMOUNT + BOB_AMOUNT;
const OPERATOR_DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 365 * 86400);

async function expectAclRejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e; // rejected as expected
  }
  expect.fail("decryption should have been rejected by the ACL, but succeeded");
}

describe("SignetDistributor (proofs on disperse handles)", function () {
  let token: any;
  let disperse: any;
  let distributor: any;
  let tokenAddress: string;
  let disperseAddress: string;
  let distributorAddress: string;
  let owner: HardhatEthersSigner;
  let issuer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let verifier: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  let distId: bigint;
  let disperseTxHash: string;
  let requestedHandles: string[]; // [alice, bob]
  let transferredHandles: string[];

  before(function () {
    if (!fhevm.isMock) {
      console.warn("This test suite runs only against the FHEVM mock environment");
      this.skip();
    }
  });

  beforeEach(async function () {
    [owner, issuer, alice, bob, verifier, stranger] = await ethers.getSigners();

    token = await (await ethers.getContractFactory("SignetToken"))
      .connect(owner)
      .deploy(issuer.address, 1_000_000n, "Signet USD", "cUSDT", "");
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();

    disperse = await (await ethers.getContractFactory("LocalDisperse")).deploy();
    await disperse.waitForDeployment();
    disperseAddress = await disperse.getAddress();

    distributor = await (await ethers.getContractFactory("SignetDistributor")).deploy(owner.address);
    await distributor.waitForDeployment();
    distributorAddress = await distributor.getAddress();

    await (await distributor.connect(owner).setVerifiedIssuer(issuer.address, true)).wait();

    // The production flow, step for step:
    // (0) direct mode requires the sender to have set the disperse as operator
    await (await token.connect(issuer).setOperator(disperseAddress, OPERATOR_DEADLINE)).wait();

    // (1) disperse — one input proof for both amounts, bound to (LocalDisperse, issuer)
    const input = await fhevm
      .createEncryptedInput(disperseAddress, issuer.address)
      .add64(ALICE_AMOUNT)
      .add64(BOB_AMOUNT)
      .encrypt();
    const tx = await disperse
      .connect(issuer)
      .disperseConfidentialTokenDirect(
        tokenAddress,
        [alice.address, bob.address],
        [input.handles[0], input.handles[1]],
        input.inputProof,
      );
    const rcpt = await tx.wait();
    disperseTxHash = rcpt.hash;
    const ev = rcpt.logs
      .map((l: any) => {
        try {
          return disperse.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p: any) => p?.name === "DirectDistribution");
    requestedHandles = [...ev.args.requested];
    transferredHandles = [...ev.args.transferred];

    // (2) disclose the requested handles to the distributor (compute ACL)
    await (
      await disperse.connect(issuer).batchDiscloseHandlesToParty(requestedHandles, distributorAddress)
    ).wait();

    // (3) register — attach + verify + sum-proof in one call
    distId = await distributor.nextDistId();
    await (
      await distributor
        .connect(issuer)
        .registerDistribution(DECLARED_TOTAL, disperseTxHash, [alice.address, bob.address], requestedHandles)
    ).wait();
  });

  describe("settlement (LocalDisperse fidelity)", function () {
    it("recipients' token balances reflect the disperse", async function () {
      const aliceBal = await token.confidentialBalanceOf(alice.address);
      const clear = await fhevm.userDecryptEuint(FhevmType.euint64, aliceBal, tokenAddress, alice);
      expect(clear).to.equal(ALICE_AMOUNT);
    });

    it("operator can decrypt the transferred handles (the fail-loudly guard mechanic)", async function () {
      const clear = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        transferredHandles[0],
        tokenAddress,
        issuer,
      );
      expect(clear).to.equal(ALICE_AMOUNT);
    });
  });

  describe("registerDistribution — verified attach", function () {
    it("reverts when the handles were not disclosed to the distributor", async function () {
      // fresh disperse, but skip the disclose step
      const input = await fhevm
        .createEncryptedInput(disperseAddress, issuer.address)
        .add64(100n)
        .encrypt();
      const tx = await disperse
        .connect(issuer)
        .disperseConfidentialTokenDirect(tokenAddress, [alice.address], [input.handles[0]], input.inputProof);
      const rcpt = await tx.wait();
      const ev = rcpt.logs
        .map((l: any) => {
          try {
            return disperse.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "DirectDistribution");

      await expect(
        distributor
          .connect(issuer)
          .registerDistribution(100n, rcpt.hash, [alice.address], [...ev.args.requested]),
      ).to.be.revertedWith("handle not disclosed to distributor");
    });

    it("reverts on a recipient-swap (handle not held by the claimed recipient)", async function () {
      // swap: attach alice's handle to bob and vice versa
      await expect(
        distributor
          .connect(issuer)
          .registerDistribution(DECLARED_TOTAL, disperseTxHash, [bob.address, alice.address], requestedHandles),
      ).to.be.revertedWith("handle not held by recipient");
    });

    it("reverts on duplicate recipients / length mismatch / empty batch", async function () {
      await expect(
        distributor
          .connect(issuer)
          .registerDistribution(
            DECLARED_TOTAL,
            disperseTxHash,
            [alice.address, alice.address],
            requestedHandles,
          ),
      ).to.be.revertedWith("duplicate recipient");
      await expect(
        distributor
          .connect(issuer)
          .registerDistribution(DECLARED_TOTAL, disperseTxHash, [alice.address], requestedHandles),
      ).to.be.revertedWith("length mismatch");
      await expect(
        distributor.connect(issuer).registerDistribution(DECLARED_TOTAL, disperseTxHash, [], []),
      ).to.be.revertedWith("empty batch");
    });

    it("records the disperse tx hash for offchain event cross-checking", async function () {
      const dist = await distributor.distributions(distId);
      expect(dist.disperseTxHash).to.equal(disperseTxHash);
      expect(dist.recipientCount).to.equal(2n);
    });
  });

  describe("proveAtLeast — selective disclosure on the disperse's handle", function () {
    it("verifier decrypts the ebool as TRUE when allocation >= threshold", async function () {
      await (await distributor.connect(alice).proveAtLeast(distId, 2000n, verifier.address)).wait();
      const proof = await distributor.proofs(0n);
      expect(proof.recipient).to.equal(alice.address);
      const result = await fhevm.userDecryptEbool(proof.result, distributorAddress, verifier);
      expect(result).to.equal(true);
    });

    it("verifier decrypts the ebool as FALSE when allocation < threshold", async function () {
      await (await distributor.connect(alice).proveAtLeast(distId, 3000n, verifier.address)).wait();
      const proof = await distributor.proofs(0n);
      const result = await fhevm.userDecryptEbool(proof.result, distributorAddress, verifier);
      expect(result).to.equal(false);
    });

    it("verifier can NOT decrypt the raw allocation, even after receiving a proof", async function () {
      await (await distributor.connect(alice).proveAtLeast(distId, 2000n, verifier.address)).wait();
      const handle = await distributor.allocationOf(distId, alice.address);
      await expectAclRejection(
        fhevm.userDecryptEuint(FhevmType.euint64, handle, distributorAddress, verifier),
      );
    });

    it("the proof ebool is scoped: a third party can NOT decrypt it", async function () {
      await (await distributor.connect(alice).proveAtLeast(distId, 2000n, verifier.address)).wait();
      const proof = await distributor.proofs(0n);
      await expectAclRejection(fhevm.userDecryptEbool(proof.result, distributorAddress, stranger));
    });

    it("reverts for an address with no allocation", async function () {
      await expect(
        distributor.connect(stranger).proveAtLeast(distId, 1n, verifier.address),
      ).to.be.revertedWith("no allocation");
    });
  });

  describe("per-recipient ACL isolation", function () {
    it("each recipient decrypts exactly their own allocation", async function () {
      const aliceHandle = await distributor.allocationOf(distId, alice.address);
      const bobHandle = await distributor.allocationOf(distId, bob.address);
      expect(
        await fhevm.userDecryptEuint(FhevmType.euint64, aliceHandle, distributorAddress, alice),
      ).to.equal(ALICE_AMOUNT);
      expect(
        await fhevm.userDecryptEuint(FhevmType.euint64, bobHandle, distributorAddress, bob),
      ).to.equal(BOB_AMOUNT);
    });

    it("recipient A can NOT decrypt recipient B's allocation (and vice versa)", async function () {
      const aliceHandle = await distributor.allocationOf(distId, alice.address);
      const bobHandle = await distributor.allocationOf(distId, bob.address);
      await expectAclRejection(
        fhevm.userDecryptEuint(FhevmType.euint64, bobHandle, distributorAddress, alice),
      );
      await expectAclRejection(
        fhevm.userDecryptEuint(FhevmType.euint64, aliceHandle, distributorAddress, bob),
      );
    });

    it("a stranger can NOT decrypt any allocation", async function () {
      const aliceHandle = await distributor.allocationOf(distId, alice.address);
      await expectAclRejection(
        fhevm.userDecryptEuint(FhevmType.euint64, aliceHandle, distributorAddress, stranger),
      );
    });

    it("the operator CAN decrypt (they chose the amounts — inherent to the disperse ACL)", async function () {
      // Not a leak: the sender knows the plaintext amounts they dispersed.
      const aliceHandle = await distributor.allocationOf(distId, alice.address);
      expect(
        await fhevm.userDecryptEuint(FhevmType.euint64, aliceHandle, distributorAddress, issuer),
      ).to.equal(ALICE_AMOUNT);
    });
  });

  describe("honest-payout sum proof", function () {
    it("publicly decrypts TRUE when declared == sum of dispersed amounts", async function () {
      const dist = await distributor.distributions(distId);
      expect(await fhevm.publicDecryptEbool(dist.sumProof)).to.equal(true);
    });

    it("publicly decrypts FALSE when the issuer declared a different total", async function () {
      // fresh disperse + disclose, then register with a lying declaredTotal
      const input = await fhevm
        .createEncryptedInput(disperseAddress, issuer.address)
        .add64(1234n)
        .encrypt();
      const tx = await disperse
        .connect(issuer)
        .disperseConfidentialTokenDirect(tokenAddress, [alice.address], [input.handles[0]], input.inputProof);
      const rcpt = await tx.wait();
      const ev = rcpt.logs
        .map((l: any) => {
          try {
            return disperse.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "DirectDistribution");
      const handles = [...ev.args.requested];
      await (
        await disperse.connect(issuer).batchDiscloseHandlesToParty(handles, distributorAddress)
      ).wait();

      const badDistId = await distributor.nextDistId();
      await (
        await distributor.connect(issuer).registerDistribution(9999n, rcpt.hash, [alice.address], handles)
      ).wait();

      const dist = await distributor.distributions(badDistId);
      expect(await fhevm.publicDecryptEbool(dist.sumProof)).to.equal(false);
    });
  });

  describe("issuer registry", function () {
    it("tracks verified issuers per distribution", async function () {
      expect(await distributor.isVerifiedIssuer(distId)).to.equal(true);
    });

    it("only the contract owner can attest issuers", async function () {
      await expect(
        distributor.connect(stranger).setVerifiedIssuer(stranger.address, true),
      ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");
    });
  });
});
