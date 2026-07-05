// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @title LocalDisperse
/// @notice LOCAL-DEV/TEST double for the TokenOps `DisperseConfidential` singleton
///         (which exists only on Sepolia + mainnet). Replicates, line for line, the
///         direct-mode ACL grant pattern and the disclosure checks of the verified
///         source (Sepolia 0x710dD9885Cc9986EfD234E7719483147a6d8DBb4), so contracts
///         and frontend flows tested against this behave identically on the real
///         singleton. Never deployed to a public network.
contract LocalDisperse is ZamaEthereumConfig {
    event DirectDistribution(
        address indexed sender,
        address[] recipients,
        euint64[] requested,
        euint64[] transferred
    );
    event HandlesDisclosedToParty(address indexed discloser, address indexed party, euint64[] handles);

    error LengthMismatch();
    error EmptyBatch();
    error InvalidAddress();
    error HandleNotAllowed();
    error ContractNotAllowed();

    /// @notice Direct-mode disperse: per-recipient `confidentialTransferFrom`.
    ///         Sender must have `setOperator(address(this), …)` on `token`.
    /// @dev ACL grants mirror the verified singleton exactly: allowThis + transient
    ///      to token, then persistent allow to sender and recipient on `requested`.
    ///      The `transferred` handle's ACL comes from the token's own `_update`.
    function disperseConfidentialTokenDirect(
        address token,
        address[] calldata recipients,
        externalEuint64[] calldata encryptedAmounts,
        bytes calldata inputProof
    ) external payable {
        uint256 count = recipients.length;
        if (count == 0) revert EmptyBatch();
        if (encryptedAmounts.length != count) revert LengthMismatch();

        euint64[] memory amounts = new euint64[](count);
        euint64[] memory results = new euint64[](count);

        for (uint256 i = 0; i < count; ++i) {
            if (recipients[i] == address(0)) revert InvalidAddress();
            euint64 amount = FHE.fromExternal(encryptedAmounts[i], inputProof);
            // Grant persistent ACL so FHE.allow to sender and recipient below are valid.
            FHE.allowThis(amount);
            FHE.allowTransient(amount, token);
            euint64 result = IERC7984(token).confidentialTransferFrom(msg.sender, recipients[i], amount);
            FHE.allow(amount, msg.sender);
            FHE.allow(amount, recipients[i]);
            amounts[i] = amount;
            results[i] = result;
        }
        emit DirectDistribution(msg.sender, recipients, amounts, results);
    }

    /// @notice Grant `party` persistent FHE ACL on `handle`. Same checks as the
    ///         verified singleton: caller must hold ACL, and this contract must
    ///         hold ACL (true for `requested` handles, NOT for `transferred`).
    function discloseHandleToParty(euint64 handle, address party) external {
        euint64[] memory handles = new euint64[](1);
        handles[0] = handle;
        _disclose(handles, party);
    }

    /// @notice Batch variant — atomically grant `party` persistent ACL on all handles.
    function batchDiscloseHandlesToParty(euint64[] calldata handles, address party) external {
        uint256 count = handles.length;
        if (count == 0) revert EmptyBatch();
        euint64[] memory copy = new euint64[](count);
        for (uint256 i = 0; i < count; ++i) {
            copy[i] = handles[i];
        }
        _disclose(copy, party);
    }

    function _disclose(euint64[] memory handles, address party) private {
        if (party == address(0)) revert InvalidAddress();
        for (uint256 i = 0; i < handles.length; ++i) {
            if (!FHE.isSenderAllowed(handles[i])) revert HandleNotAllowed();
            if (!FHE.isAllowed(handles[i], address(this))) revert ContractNotAllowed();
            FHE.allow(handles[i], party);
        }
        emit HandlesDisclosedToParty(msg.sender, party, handles);
    }
}
