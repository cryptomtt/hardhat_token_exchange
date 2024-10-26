const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

async function main() {
    // Load deployment info
    let deploymentInfo;
    try {
        deploymentInfo = JSON.parse(fs.readFileSync('deployment-info.json'));
    } catch (e) {
        console.error("Deployment info not found. Please run deploy.js first");
        process.exit(1);
    }

    const proxyAddress = deploymentInfo.contractXYZProxy;
    console.log("Current proxy address:", proxyAddress);

    const [deployer] = await ethers.getSigners();
    console.log("Upgrading contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // Deploy new implementation
    console.log("\nDeploying new implementation...");
    const ContractXYZV2 = await ethers.getContractFactory("ContractXYZV2");

    console.log("Preparing upgrade...");
    const upgraded = await upgrades.upgradeProxy(proxyAddress, ContractXYZV2);
    await upgraded.waitForDeployment();

    console.log("Proxy upgraded");

    const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(
        proxyAddress
    );
    console.log("New implementation deployed to:", newImplementationAddress);

    // Initialize V2 specific settings
    console.log("\nInitializing V2...");
    const tx = await upgraded.initialize(
        deploymentInfo.token1,
        deploymentInfo.token2
    );
    await tx.wait();
    console.log("V2 initialized");

    // Verify new implementation on Etherscan
    if (network.name !== "hardhat" && network.name !== "localhost") {
        console.log("\nWaiting for block confirmations...");
        await tx.wait(6);

        console.log("Verifying new implementation on Etherscan...");
        try {
            await hre.run("verify:verify", {
                address: newImplementationAddress,
                constructorArguments: [],
            });
            console.log("New implementation verified on Etherscan");
        } catch (e) {
            console.log("Verification failed:", e.message);
        }
    }

    // Update deployment info
    deploymentInfo.contractXYZImplementationV2 = newImplementationAddress;
    deploymentInfo.upgradeTime = new Date().toISOString();

    fs.writeFileSync(
        'deployment-info.json',
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("\nDeployment info updated in deployment-info.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });