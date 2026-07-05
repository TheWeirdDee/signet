// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title SignetDistributor
/// @notice Signet's product layer on top of a confidential disperse. Records each
///         recipient's encrypted allocation as a proof-of-receipt, and lets the
///         recipient prove FACTS about that allocation (e.g. "at least X", "issued
///         by a verified fund") to a chosen verifier WITHOUT revealing the amount.
/// @dev    Settlement (moving the ERC-7984 tokens) is handled by the TokenOps SDK
///         disperse. This contract stores the receipt + runs FHE comparisons for
///         selective disclosure. Reference implementation — test before deploy.
contract SignetDistributor is ZamaEthereumConfig, Ownable2Step {
    struct Distribution {
        address issuer;         // the fund/operator that ran the payout
        uint256 declaredTotal;  // public committed total (plaintext, for the honest-payout proof)
        uint64  recipientCount;
        bool    exists;
    }

    // distId => recipient => encrypted allocation
    mapping(uint256 => mapping(address => euint64)) private _allocation;
    // distId => recipient => has an allocation recorded
    mapping(uint256 => mapping(address => bool)) public hasAllocation;
    // distId => metadata
    mapping(uint256 => Distribution) public distributions;
    // issuer registry — proofs carry "verified fund" only for attested issuers
    mapping(address => bool) public verifiedIssuer;

    uint256 public nextDistId;

    event DistributionOpened(uint256 indexed distId, address indexed issuer, uint256 declaredTotal);
    event AllocationRecorded(uint256 indexed distId, address indexed recipient);
    event ProofIssued(uint256 indexed distId, address indexed recipient, address indexed verifier);

    constructor(address owner) Ownable(owner) {}

    // --- issuer verification (admin) ---

    function setVerifiedIssuer(address issuer, bool ok) external onlyOwner {
        verifiedIssuer[issuer] = ok;
    }

    // --- open a distribution ---

    /// @notice Open a distribution record. `declaredTotal` is public and used by the
    ///         Verify view to prove declared == distributed.
    function openDistribution(uint256 declaredTotal) external returns (uint256 distId) {
        distId = nextDistId++;
        distributions[distId] = Distribution({
            issuer: msg.sender,
            declaredTotal: declaredTotal,
            recipientCount: 0,
            exists: true
        });
        emit DistributionOpened(distId, msg.sender, declaredTotal);
    }

    // --- record encrypted allocations (called alongside the disperse) ---

    /// @notice Record a recipient's encrypted allocation and grant ONLY that recipient
    ///         the right to decrypt the raw value. The contract retains compute rights.
    function recordAllocation(
        uint256 distId,
        address recipient,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external {
        Distribution storage d = distributions[distId];
        require(d.exists, "no distribution");
        require(msg.sender == d.issuer, "only issuer");
        require(!hasAllocation[distId][recipient], "already recorded");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        _allocation[distId][recipient] = amount;
        hasAllocation[distId][recipient] = true;
        d.recipientCount += 1;

        // ACL: contract can compute on it later; recipient can decrypt their own value.
        FHE.allowThis(amount);
        FHE.allow(amount, recipient);

        emit AllocationRecorded(distId, recipient);
    }

    // --- selective disclosure: prove a FACT without revealing the amount ---

    /// @notice Recipient proves "my allocation >= threshold" to `verifier`.
    ///         Computes the comparison on the ciphertext and grants the verifier
    ///         decryption of ONLY the resulting boolean. The amount is never exposed.
    /// @return result the encrypted boolean handle (verifier + recipient may decrypt)
    function proveAtLeast(
        uint256 distId,
        uint64 threshold,
        address verifier
    ) external returns (ebool result) {
        require(hasAllocation[distId][msg.sender], "no allocation");

        euint64 alloc = _allocation[distId][msg.sender];
        result = FHE.ge(alloc, FHE.asEuint64(threshold));

        // Scope decryption of the boolean to the verifier and the recipient only.
        FHE.allowThis(result);
        FHE.allow(result, verifier);
        FHE.allow(result, msg.sender);

        emit ProofIssued(distId, msg.sender, verifier);
    }

    /// @notice Whether this distribution's issuer is a verified fund. Combined with
    ///         a proveAtLeast boolean, this backs "at least X, from a verified fund".
    function isVerifiedIssuer(uint256 distId) external view returns (bool) {
        return verifiedIssuer[distributions[distId].issuer];
    }

    // --- reads for the recipient's own receipt ---

    /// @notice Returns the caller's own encrypted allocation handle (only the caller
    ///         holds the ACL right to decrypt it client-side via EIP-712).
    function myAllocation(uint256 distId) external view returns (euint64) {
        require(hasAllocation[distId][msg.sender], "no allocation");
        return _allocation[distId][msg.sender];
    }
}
