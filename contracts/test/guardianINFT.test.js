const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GuardianINFT", function () {
  // Variables partagées entre les tests
  let inft;
  let oracle;
  let owner; // Le déployeur du contrat
  let alice; // Premier utilisateur (mint)
  let bob; // Deuxième utilisateur (transfert)
  let charlie; // Troisième utilisateur (autorisation)

  // Cette fonction tourne AVANT chaque test pour avoir un état propre
  beforeEach(async function () {
    // Récupère 4 wallets de test (Hardhat en fournit 20 par défaut en local)
    [owner, alice, bob, charlie] = await ethers.getSigners();

    // Déploie le MockOracle d'abord
    const Oracle = await ethers.getContractFactory("MockOracle");
    oracle = await Oracle.deploy();
    await oracle.waitForDeployment();

    // Puis déploie GuardianINFT en lui passant l'adresse de l'oracle
    const INFT = await ethers.getContractFactory("GuardianINFT");
    inft = await INFT.deploy(
      "Guardian Sentinel",
      "GUARD",
      await oracle.getAddress(),
    );
    await inft.waitForDeployment();
  });

  // === Tests de déploiement ===
  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await inft.name()).to.equal("Guardian Sentinel");
      expect(await inft.symbol()).to.equal("GUARD");
    });

    it("Should set the correct oracle address", async function () {
      expect(await inft.oracle()).to.equal(await oracle.getAddress());
    });

    it("Should set the deployer as the contract owner", async function () {
      expect(await inft.owner()).to.equal(owner.address);
    });

    it("Should start with 0 minted tokens", async function () {
      expect(await inft.totalMinted()).to.equal(0);
    });
  });

  // === Tests de mint ===
  describe("Minting", function () {
    it("Should mint a Guardian iNFT to alice", async function () {
      const encryptedURI = "0g://storage/guardian-001";
      const metadataHash = ethers.keccak256(
        ethers.toUtf8Bytes("Guardian metadata v1"),
      );
      const sealedKey = ethers.toUtf8Bytes("alice-sealed-key-placeholder");

      // Mint
      const tx = await inft.mint(
        alice.address,
        encryptedURI,
        metadataHash,
        sealedKey,
      );

      // Vérifications
      expect(await inft.ownerOf(1)).to.equal(alice.address);
      expect(await inft.getEncryptedURI(1)).to.equal(encryptedURI);
      expect(await inft.getMetadataHash(1)).to.equal(metadataHash);
      expect(await inft.totalMinted()).to.equal(1);

      // L'event GuardianMinted a-t-il été émis ?
      await expect(tx)
        .to.emit(inft, "GuardianMinted")
        .withArgs(1, alice.address, encryptedURI);
    });

    it("Should reject mint to zero address", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await expect(
        inft.mint(ethers.ZeroAddress, "0g://storage/x", hash, "0x"),
      ).to.be.revertedWith("Cannot mint to zero address");
    });

    it("Should reject mint with empty URI", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await expect(inft.mint(alice.address, "", hash, "0x")).to.be.revertedWith(
        "Empty URI",
      );
    });

    it("Should auto-increment token IDs", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await inft.mint(alice.address, "0g://uri-1", hash, "0x");
      await inft.mint(bob.address, "0g://uri-2", hash, "0x");

      expect(await inft.ownerOf(1)).to.equal(alice.address);
      expect(await inft.ownerOf(2)).to.equal(bob.address);
      expect(await inft.totalMinted()).to.equal(2);
    });
  });

  // === Tests de transfert sécurisé (LE CŒUR D'ERC-7857) ===
  describe("Secure Transfer (ERC-7857)", function () {
    let tokenId;
    const oldURI = "0g://storage/old-encrypted-data";
    const newURI = "0g://storage/new-reencrypted-data";
    const oldHash =
      "0x1111111111111111111111111111111111111111111111111111111111111111";
    const newHash =
      "0x2222222222222222222222222222222222222222222222222222222222222222";
    const fakeProof = "0xabcd1234"; // MockOracle accepts anything non-empty
    const newSealedKey = "0xbeef";

    beforeEach(async function () {
      // Mint un iNFT à alice avant chaque test de transfert
      await inft.mint(alice.address, oldURI, oldHash, "0xaa");
      tokenId = 1;
    });

    it("Should transfer ownership and update encrypted metadata", async function () {
      // Alice transfère son iNFT à bob
      const tx = await inft
        .connect(alice)
        .secureTransfer(
          alice.address,
          bob.address,
          tokenId,
          newURI,
          newHash,
          newSealedKey,
          fakeProof,
        );

      // Vérifications
      expect(await inft.ownerOf(tokenId)).to.equal(bob.address);
      expect(await inft.getEncryptedURI(tokenId)).to.equal(newURI);
      expect(await inft.getMetadataHash(tokenId)).to.equal(newHash);

      // L'event a-t-il été émis ?
      await expect(tx)
        .to.emit(inft, "GuardianTransferred")
        .withArgs(tokenId, alice.address, bob.address, newHash);
    });

    it("Should clear the previous owner's sealed key", async function () {
      await inft
        .connect(alice)
        .secureTransfer(
          alice.address,
          bob.address,
          tokenId,
          newURI,
          newHash,
          newSealedKey,
          fakeProof,
        );

      // La clé d'alice doit être vide maintenant
      expect(await inft.getSealedKey(tokenId, alice.address)).to.equal("0x");
      // La clé de bob doit contenir la nouvelle valeur
      expect(await inft.getSealedKey(tokenId, bob.address)).to.equal(
        newSealedKey,
      );
    });

    it("Should reject transfer with invalid proof (empty)", async function () {
      await expect(
        inft.connect(alice).secureTransfer(
          alice.address,
          bob.address,
          tokenId,
          newURI,
          newHash,
          newSealedKey,
          "0x", // empty proof
        ),
      ).to.be.revertedWith("Invalid oracle proof");
    });

    it("Should reject transfer if msg.sender is not authorized", async function () {
      // Charlie tente de transférer le iNFT d'alice → doit échouer
      await expect(
        inft
          .connect(charlie)
          .secureTransfer(
            alice.address,
            bob.address,
            tokenId,
            newURI,
            newHash,
            newSealedKey,
            fakeProof,
          ),
      ).to.be.revertedWith("Not authorized");
    });

    it("Should reject transfer to zero address", async function () {
      await expect(
        inft
          .connect(alice)
          .secureTransfer(
            alice.address,
            ethers.ZeroAddress,
            tokenId,
            newURI,
            newHash,
            newSealedKey,
            fakeProof,
          ),
      ).to.be.revertedWith("Cannot transfer to zero address");
    });
  });

  // === Tests d'autorisation d'usage ===
  describe("Usage Authorization", function () {
    let tokenId;

    beforeEach(async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await inft.mint(alice.address, "0g://uri", hash, "0xaa");
      tokenId = 1;
    });

    it("Should allow owner to authorize a third party", async function () {
      const permissions = ethers.toUtf8Bytes('{"maxRequests": 100}');

      const tx = await inft
        .connect(alice)
        .authorizeUsage(tokenId, charlie.address, permissions);

      expect(await inft.getSealedKey(tokenId, charlie.address)).to.equal(
        ethers.hexlify(permissions),
      );

      await expect(tx)
        .to.emit(inft, "UsageAuthorized")
        .withArgs(tokenId, charlie.address);
    });

    it("Should reject authorization from non-owner", async function () {
      await expect(
        inft.connect(bob).authorizeUsage(tokenId, charlie.address, "0xff"),
      ).to.be.revertedWith("Not owner");
    });
  });
});
