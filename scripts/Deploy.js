const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  
  const DocRegistry = await ethers.getContractFactory("DocRegistry");
  const docRegistry = await DocRegistry.deploy(deployer.address); // pass admin address here
  
  await docRegistry.waitForDeployment();

  const contractAddress = await docRegistry.getAddress();
  console.log("DocRegistry deployed to:", contractAddress);

  // Grant ISSUER_ROLE to your MetaMask account (the one you use in the React app)
  const metaMaskAccount = "0x14A7ba4122327038947a7FF4B2a1878D51d53920";
  
  console.log("Granting ISSUER_ROLE to MetaMask account:", metaMaskAccount);
  
  // Grant ISSUER_ROLE to your MetaMask account
  const tx = await docRegistry.grantIssuerRole(metaMaskAccount);
  await tx.wait();
  
  console.log("ISSUER_ROLE granted successfully!");
  
  // Verify the role was granted using the contract's helper functions
  const hasIssuerRole = await docRegistry.isIssuer(metaMaskAccount);
  console.log("MetaMask account has ISSUER_ROLE:", hasIssuerRole);
  
  // Also verify deployer has admin role
  const deployerHasAdmin = await docRegistry.isAdmin(deployer.address);
  console.log("Deployer has ADMIN_ROLE:", deployerHasAdmin);

  // Test deployer is also an issuer (since constructor grants both roles)
  const deployerHasIssuer = await docRegistry.isIssuer(deployer.address);
  console.log("Deployer has ISSUER_ROLE:", deployerHasIssuer);

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("Contract Address:", contractAddress);
  console.log("Admin Account:", deployer.address);
  console.log("Issuer Account:", metaMaskAccount);
  console.log("\n🔧 UPDATE YOUR REACT APP:");
  console.log(`const contractAddress = "${contractAddress}";`);
  console.log("\nAll roles configured successfully! ✅");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
