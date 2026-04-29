const hre = require("hardhat");

const GUARDIAN_INFT_ADDRESS = "0xD94819E5540f8fa8229D5e7dC9726146FAAe06ba";

async function main() {
  console.log("\n🎨 Minting your first Guardian iNFT...\n");

  const [signer] = await hre.ethers.getSigners();
  console.log("📝 Minter:", signer.address);

  const inft = await hre.ethers.getContractAt(
    "GuardianINFT",
    GUARDIAN_INFT_ADDRESS,
  );

  const recipient = signer.address;
  const encryptedURI = "0g://storage/placeholder-v1";

  const initialMetadata = JSON.stringify({
    agentName: "Sentinel #1",
    createdAt: new Date().toISOString(),
    systemPrompt: "You are a wallet guardian.",
    knowledgeBase: { knownSafeContracts: [], knownScams: [] },
    history: [],
    stats: { totalAnalyses: 0, scamsBlocked: 0 },
  });
  const metadataHash = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(initialMetadata),
  );
  const sealedKey = hre.ethers.toUtf8Bytes("placeholder-sealed-key");

  console.log("⏳ Minting...");
  const tx = await inft.mint(recipient, encryptedURI, metadataHash, sealedKey);
  console.log("📤 Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("✅ Confirmed in block:", receipt.blockNumber);

  const event = receipt.logs.find((log) => {
    try {
      return inft.interface.parseLog(log).name === "GuardianMinted";
    } catch {
      return false;
    }
  });
  const tokenId = inft.interface.parseLog(event).args.tokenId;
  const owner = await inft.ownerOf(tokenId);

  console.log("\n🎉 SUCCESS");
  console.log("Token ID:", tokenId.toString());
  console.log("Owner:   ", owner);
  console.log("View tx: https://chainscan-galileo.0g.ai/tx/" + tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Failed:", error.message);
    process.exit(1);
  });
