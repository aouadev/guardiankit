// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IOracle.sol";

/// @notice Mock oracle for testnet/development. Always returns true.
/// @dev WARNING: NOT FOR PRODUCTION. Replace with TEE-based oracle for mainnet deployment.
contract MockOracle is IOracle {
    event ProofVerified(bytes proof, bool result);

    function verifyProof(bytes calldata proof) external pure override returns (bool) {
        // In a real oracle, this would verify a cryptographic proof from a TEE.
        // For demo purposes, we accept any non-empty proof.
        return proof.length > 0;
    }
}