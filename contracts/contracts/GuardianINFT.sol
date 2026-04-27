// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IOracle.sol";

/// @title GuardianINFT - Intelligent NFT for AI Wallet Guardian agents
/// @notice ERC-7857 implementation: AI agents as NFTs with encrypted, transferable memory
/// @dev Compatible with OpenZeppelin v5.x
contract GuardianINFT is ERC721, Ownable, ReentrancyGuard {

    // === State variables ===

    /// @dev Pointer to encrypted agent data on 0G Storage (e.g., "0g://storage/abc123")
    mapping(uint256 => string) private _encryptedURIs;

    /// @dev keccak256 hash of the encrypted metadata, used as integrity proof
    mapping(uint256 => bytes32) private _metadataHashes;

    /// @dev Sealed encryption keys per (tokenId, user). Allows the user to decrypt the agent.
    mapping(uint256 => mapping(address => bytes)) private _sealedKeys;

    /// @dev Address of the oracle contract that verifies re-encryption proofs
    address public oracle;

    /// @dev Auto-incremented token ID counter
    uint256 private _nextTokenId = 1;

    // === Events ===

    event GuardianMinted(uint256 indexed tokenId, address indexed to, string encryptedURI);
    event GuardianTransferred(uint256 indexed tokenId, address indexed from, address indexed to, bytes32 newHash);
    event UsageAuthorized(uint256 indexed tokenId, address indexed executor);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    // === Constructor ===

    constructor(string memory name_, string memory symbol_, address _oracle)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {
        require(_oracle != address(0), "Oracle address cannot be zero");
        oracle = _oracle;
    }

    // === External functions ===

    /// @notice Mints a new Guardian iNFT with encrypted metadata pointer
    /// @param to Recipient of the iNFT
    /// @param encryptedURI Pointer to encrypted agent data on 0G Storage
    /// @param metadataHash keccak256 hash of the encrypted data (integrity proof)
    /// @param sealedKey Encryption key sealed for the recipient's public key
    function mint(
        address to,
        string calldata encryptedURI,
        bytes32 metadataHash,
        bytes calldata sealedKey
    ) external returns (uint256) {
        require(to != address(0), "Cannot mint to zero address");
        require(bytes(encryptedURI).length > 0, "Empty URI");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        _encryptedURIs[tokenId] = encryptedURI;
        _metadataHashes[tokenId] = metadataHash;
        _sealedKeys[tokenId][to] = sealedKey;

        emit GuardianMinted(tokenId, to, encryptedURI);
        return tokenId;
    }

    /// @notice ERC-7857 secure transfer with metadata re-encryption.
    /// @dev The oracle must have re-encrypted the metadata for the new owner off-chain.
    function secureTransfer(
        address from,
        address to,
        uint256 tokenId,
        string calldata newEncryptedURI,
        bytes32 newMetadataHash,
        bytes calldata newSealedKey,
        bytes calldata proof
    ) external nonReentrant {
        require(ownerOf(tokenId) == from, "From is not the owner");
        require(_isOwnerOrApproved(msg.sender, tokenId), "Not authorized");
        require(to != address(0), "Cannot transfer to zero address");
        require(IOracle(oracle).verifyProof(proof), "Invalid oracle proof");

        // Update encrypted metadata with re-encrypted version
        _encryptedURIs[tokenId] = newEncryptedURI;
        _metadataHashes[tokenId] = newMetadataHash;
        _sealedKeys[tokenId][to] = newSealedKey;

        // Optional: clear old owner's sealed key
        delete _sealedKeys[tokenId][from];

        // Transfer ownership using ERC-721 internal _transfer
        _transfer(from, to, tokenId);

        emit GuardianTransferred(tokenId, from, to, newMetadataHash);
    }

    /// @notice Authorizes a third party to use the agent without transferring ownership
    function authorizeUsage(uint256 tokenId, address executor, bytes calldata permissions) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        _sealedKeys[tokenId][executor] = permissions;
        emit UsageAuthorized(tokenId, executor);
    }

    /// @notice Update the oracle address (only contract owner)
    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Oracle cannot be zero");
        address old = oracle;
        oracle = newOracle;
        emit OracleUpdated(old, newOracle);
    }

    // === View functions ===

    function getEncryptedURI(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _encryptedURIs[tokenId];
    }

    function getMetadataHash(uint256 tokenId) external view returns (bytes32) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _metadataHashes[tokenId];
    }

    function getSealedKey(uint256 tokenId, address user) external view returns (bytes memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _sealedKeys[tokenId][user];
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // === Internal helpers ===

    /// @dev Replaces the old _isApprovedOrOwner from OZ v4 (removed in v5)
    function _isOwnerOrApproved(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = _ownerOf(tokenId);
        return (
            spender == owner ||
            isApprovedForAll(owner, spender) ||
            getApproved(tokenId) == spender
        );
    }
}