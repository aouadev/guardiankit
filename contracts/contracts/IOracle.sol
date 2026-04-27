// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Interface for the oracle that verifies re-encryption proofs during iNFT transfers.
/// @dev In production, this would be implemented by a TEE-based service (e.g., Intel SGX).
interface IOracle {
    function verifyProof(bytes calldata proof) external view returns (bool);
}