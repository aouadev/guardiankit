const hre = require("hardhat");

async function main() {
  console.log(
    "\n🚀 Deploying GuardianKit contracts to 0G Galileo Testnet...\n",
  );

  // Récupère le wallet déployeur (depuis .env)
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deployer address:", deployer.address);

  // Vérifie le solde du wallet
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceFormatted = hre.ethers.formatEther(balance);
  console.log("💰 Deployer balance:", balanceFormatted, "0G\n");

  if (balance === 0n) {
    throw new Error(
      "❌ Deployer has 0 0G. Get testnet tokens from https://faucet.0g.ai",
    );
  }

  // ===== 1. Deploy MockOracle =====
  console.log("⏳ [1/2] Deploying MockOracle...");
  const Oracle = await hre.ethers.getContractFactory("MockOracle");
  const oracle = await Oracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("✅ MockOracle deployed at:", oracleAddress);

  // ===== 2. Deploy GuardianINFT =====
  console.log("\n⏳ [2/2] Deploying GuardianINFT...");
  const INFT = await hre.ethers.getContractFactory("GuardianINFT");
  const inft = await INFT.deploy("Guardian Sentinel", "GUARD", oracleAddress);
  await inft.waitForDeployment();
  const inftAddress = await inft.getAddress();
  console.log("✅ GuardianINFT deployed at:", inftAddress);

  // ===== Récap =====
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT SUCCESSFUL");
  console.log("=".repeat(60));
  console.log("Network:        0G Galileo Testnet (Chain ID: 16602)");
  console.log("Deployer:      ", deployer.address);
  console.log("MockOracle:    ", oracleAddress);
  console.log("GuardianINFT:  ", inftAddress);
  console.log("=".repeat(60));
  console.log("\n📌 Save these addresses!");
  console.log(
    "📌 Verify on explorer: https://chainscan-galileo.0g.ai/address/" +
      inftAddress,
  );
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
