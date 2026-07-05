import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

// Signer indices and amounts deliberately DISJOINT from SignetDistributor.ts:
// the FHEVM mock keeps one coprocessor/ACL DB per hardhat process, and reusing
// the same (signer, amount) pairs across files can collide handles and leak
// ACL grants between suites.
const INITIAL_MINT = 777_000n;
const HOLDER_MINT = 4_242n;

describe("SignetToken (ERC-7984)", function () {
  let token: any;
  let tokenAddress: string;
  let owner: HardhatEthersSigner;
  let holder: HardhatEthersSigner;

  before(function () {
    if (!fhevm.isMock) {
      console.warn("This test suite runs only against the FHEVM mock environment");
      this.skip();
    }
  });

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[7];
    holder = signers[8];

    const factory = await ethers.getContractFactory("SignetToken");
    token = await factory.connect(owner).deploy(owner.address, INITIAL_MINT, "Signet USD", "cUSDT", "");
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
  });

  it("mints the initial confidential supply to the owner, decryptable by the owner", async function () {
    const handle = await token.confidentialBalanceOf(owner.address);
    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, owner);
    expect(clear).to.equal(INITIAL_MINT);
  });

  it("owner can mint to a recipient; recipient decrypts their own balance", async function () {
    await (await token.connect(owner).mint(holder.address, HOLDER_MINT)).wait();

    const handle = await token.confidentialBalanceOf(holder.address);
    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, holder);
    expect(clear).to.equal(HOLDER_MINT);
  });

  it("a holder can NOT decrypt someone else's balance", async function () {
    await (await token.connect(owner).mint(holder.address, HOLDER_MINT)).wait();

    const ownerHandle = await token.confidentialBalanceOf(owner.address);
    let rejected = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint64, ownerHandle, tokenAddress, holder);
    } catch {
      rejected = true;
    }
    expect(rejected, "holder must not be able to decrypt the owner's balance").to.equal(true);
  });

  it("only the owner can mint", async function () {
    await expect(token.connect(holder).mint(holder.address, 1n)).to.be.revertedWithCustomError(
      token,
      "OwnableUnauthorizedAccount",
    );
  });
});
