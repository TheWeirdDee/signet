// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title SignetDistributor
/// @notice Signet's product layer on top of a TokenOps confidential disperse.
///         Proofs run DIRECTLY on the disperse's own per-recipient `requested`
///         euint64 handles — no duplicate encrypted copy is ever created. The
///         recipient can prove FACTS about their allocation (e.g. "at least X",
///         "issued by a verified fund") to a chosen verifier WITHOUT revealing
///         the amount.
///
/// @dev    Flow (3 txs): (1) TokenOps `disperse` moves the ERC-7984 tokens and
///         leaves per-recipient `requested` handles ACL'd to {singleton, sender,
///         recipient}; (2) sender calls `batchDiscloseHandlesToParty(handles,
///         address(this))` on the singleton, granting this contract compute ACL;
///         (3) sender calls `registerDistribution` here.
///
///         Trust model of the attach step: the handle↔recipient mapping is NOT
///         taken on the operator's word —
///           • onchain: each handle must be ACL'd to this contract (the disclosure
///             happened) AND to its claimed recipient (kills recipient-swap);
///           • offchain: `disperseTxHash` binds the registration to the disperse
///             transaction, whose `DirectDistribution` event carries the same
///             (recipients[], handles[]) arrays — verifiers cross-check the two.
///
///         Proofs attest to the REQUESTED (allocated) amount. The operator flow
///         must verify transferred == requested before registering (fail loudly),
///         so allocated == settled is an enforced invariant within Signet.
contract SignetDistributor is ZamaEthereumConfig, Ownable2Step {
    struct Distribution {
        address issuer;          // the fund/operator that ran the payout
        uint64  declaredTotal;   // public committed total (raw token units)
        uint64  recipientCount;
        bool    exists;
        bytes32 disperseTxHash;  // the TokenOps disperse tx this registration attaches to
        euint64 distributedSum;  // encrypted sum of the attached handles
        ebool   sumProof;        // FHE.eq(distributedSum, declaredTotal), publicly decryptable
    }

    struct Proof {
        uint256 distId;
        address recipient;
        address verifier;
        uint64  threshold;  // public predicate parameter: "allocation >= threshold"
        uint64  issuedAt;
        ebool   result;     // decryptable ONLY by verifier + recipient
    }

    // distId => recipient => the disperse's own requested-amount handle
    mapping(uint256 => mapping(address => euint64)) private _allocation;
    // distId => recipient => has an allocation attached
    mapping(uint256 => mapping(address => bool)) public hasAllocation;
    // distId => metadata
    mapping(uint256 => Distribution) public distributions;
    // proofId => selective-disclosure proof record
    mapping(uint256 => Proof) public proofs;
    // issuer registry — proofs carry "verified fund" only for attested issuers
    mapping(address => bool) public verifiedIssuer;

    uint256 public nextDistId;
    uint256 public nextProofId;

    event DistributionRegistered(
        uint256 indexed distId,
        address indexed issuer,
        uint64 declaredTotal,
        bytes32 disperseTxHash,
        address[] recipients,
        euint64[] handles
    );
    // per-recipient event kept for indexed frontend lookups (getLogs by recipient)
    event AllocationRecorded(uint256 indexed distId, address indexed recipient);
    event ProofIssued(
        uint256 indexed proofId,
        uint256 indexed distId,
        address recipient,
        address indexed verifier,
        uint64 threshold,
        ebool result
    );

    constructor(address owner) Ownable(owner) {}

    // --- issuer verification (admin) ---

    function setVerifiedIssuer(address issuer, bool ok) external onlyOwner {
        verifiedIssuer[issuer] = ok;
    }

    // --- register a distribution over the disperse's own handles ---

    /// @notice Attach a disperse's per-recipient `requested` handles as Signet
    ///         receipts, verify the mapping onchain, fold the encrypted sum, and
    ///         publish the publicly-decryptable honest-payout proof — one call.
    /// @dev    Requires the handles to already be disclosed to this contract via
    ///         the singleton's `batchDiscloseHandlesToParty`.
    function registerDistribution(
        uint64 declaredTotal,
        bytes32 disperseTxHash,
        address[] calldata recipients,
        euint64[] calldata handles
    ) external returns (uint256 distId) {
        uint256 count = recipients.length;
        require(count > 0, "empty batch");
        require(handles.length == count, "length mismatch");

        distId = nextDistId++;
        Distribution storage d = distributions[distId];
        d.issuer = msg.sender;
        d.declaredTotal = declaredTotal;
        d.recipientCount = uint64(count);
        d.exists = true;
        d.disperseTxHash = disperseTxHash;

        euint64 sum;
        for (uint256 i = 0; i < count; ++i) {
            address recipient = recipients[i];
            euint64 handle = handles[i];
            require(recipient != address(0), "zero recipient");
            require(!hasAllocation[distId][recipient], "duplicate recipient");
            // The disclosure to this contract must have happened (also the
            // precondition for FHE.add/FHE.ge below to be legal at all).
            require(FHE.isAllowed(handle, address(this)), "handle not disclosed to distributor");
            // The claimed recipient must genuinely hold ACL on this handle —
            // the disperse granted handle i to recipient i only, so attaching
            // someone else's handle reverts here (recipient-swap attack).
            require(FHE.isAllowed(handle, recipient), "handle not held by recipient");

            _allocation[distId][recipient] = handle;
            hasAllocation[distId][recipient] = true;

            sum = (i == 0) ? handle : FHE.add(sum, handle);
            emit AllocationRecorded(distId, recipient);
        }

        FHE.allowThis(sum);
        d.distributedSum = sum;

        ebool ok = FHE.eq(sum, declaredTotal);
        FHE.allowThis(ok);
        FHE.makePubliclyDecryptable(ok);
        d.sumProof = ok;

        emit DistributionRegistered(distId, msg.sender, declaredTotal, disperseTxHash, recipients, handles);
    }

    // --- selective disclosure: prove a FACT without revealing the amount ---

    /// @notice Recipient proves "my allocation >= threshold" to `verifier`.
    ///         Computes the comparison on the disperse's own ciphertext and grants
    ///         the verifier decryption of ONLY the resulting boolean.
    /// @return proofId id of the stored proof record (handle readable via `proofs`)
    function proveAtLeast(
        uint256 distId,
        uint64 threshold,
        address verifier
    ) external returns (uint256 proofId) {
        require(hasAllocation[distId][msg.sender], "no allocation");
        require(verifier != address(0), "zero verifier");

        ebool result = FHE.ge(_allocation[distId][msg.sender], threshold);

        // Scope decryption of the boolean to the verifier and the recipient only.
        FHE.allowThis(result);
        FHE.allow(result, verifier);
        FHE.allow(result, msg.sender);

        proofId = nextProofId++;
        proofs[proofId] = Proof({
            distId: distId,
            recipient: msg.sender,
            verifier: verifier,
            threshold: threshold,
            issuedAt: uint64(block.timestamp),
            result: result
        });

        emit ProofIssued(proofId, distId, msg.sender, verifier, threshold, result);
    }

    /// @notice Whether this distribution's issuer is a verified fund. Combined with
    ///         a proveAtLeast boolean, this backs "at least X, from a verified fund".
    function isVerifiedIssuer(uint256 distId) external view returns (bool) {
        return verifiedIssuer[distributions[distId].issuer];
    }

    // --- reads ---

    /// @notice A recipient's allocation handle (the disperse's own `requested`
    ///         handle). The handle itself is public data — decryption is gated by
    ///         the Zama ACL, under which only the recipient (and the operator, who
    ///         chose the amount) can read the raw value.
    function allocationOf(uint256 distId, address recipient) external view returns (euint64) {
        require(hasAllocation[distId][recipient], "no allocation");
        return _allocation[distId][recipient];
    }

    /// @notice Convenience: the caller's own allocation handle.
    function myAllocation(uint256 distId) external view returns (euint64) {
        require(hasAllocation[distId][msg.sender], "no allocation");
        return _allocation[distId][msg.sender];
    }
}
