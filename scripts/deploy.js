const { ethers, upgrades, network } = require("hardhat");

async function waitForConfirmations(txHash, confirmations = 6) {
    try {
        await ethers.provider.waitForTransaction(txHash, confirmations);
        console.log(`Waited for ${confirmations} confirmations`);
    } catch (e) {
        console.log(`Error waiting for confirmations: ${e.message}`);
    }
}

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // Deploy Token1 (TKN1)
    console.log("\nDeploying Token1...");
    const Token1 = await ethers.getContractFactory("Token1");
    const token1 = await Token1.deploy();
    const token1Tx = await token1.deploymentTransaction();
    await token1.waitForDeployment();
    console.log("Token1 deployed to:", await token1.getAddress());

    // Deploy Token2 (TKN2)
    console.log("\nDeploying Token2...");
    const Token2 = await ethers.getContractFactory("Token2");
    const token2 = await Token2.deploy();
    const token2Tx = await token2.deploymentTransaction();
    await token2.waitForDeployment();
    console.log("Token2 deployed to:", await token2.getAddress());

    // Deploy ContractXYZ with UUPS proxy
    console.log("\nDeploying ContractXYZ...");
    const ContractXYZ = await ethers.getContractFactory("ContractXYZ");
    const contractXYZ = await upgrades.deployProxy(
        ContractXYZ,
        [await token1.getAddress(), await token2.getAddress()],
        { kind: 'uups', initializer: 'initialize' }
    );
    await contractXYZ.waitForDeployment();
    console.log("ContractXYZ proxy deployed to:", contractXYZ.target);

    const implementationAddress = await upgrades.erc1967.getImplementationAddress(
        contractXYZ.target
    );
    console.log("ContractXYZ implementation deployed to:", implementationAddress);

    // Verify contracts on Etherscan
    if (network.name !== "hardhat" && network.name !== "localhost") {
        console.log("\nWaiting for block confirmations...");

        // Wait for confirmations
        if (token1Tx) await waitForConfirmations(token1Tx.hash);
        if (token2Tx) await waitForConfirmations(token2Tx.hash);

        console.log("\nVerifying contracts on Etherscan...");

        try {
            await hre.run("verify:verify", {
                address: await token1.getAddress(),
                constructorArguments: [],
            });
            console.log("Token1 verified on Etherscan");
        } catch (e) {
            console.log("Token1 verification failed:", e.message);
        }

        try {
            await hre.run("verify:verify", {
                address: await token2.getAddress(),
                constructorArguments: [],
            });
            console.log("Token2 verified on Etherscan");
        } catch (e) {
            console.log("Token2 verification failed:", e.message);
        }

        try {
            await hre.run("verify:verify", {
                address: implementationAddress,
                constructorArguments: [],
            });
            console.log("ContractXYZ implementation verified on Etherscan");
        } catch (e) {
            console.log("ContractXYZ verification failed:", e.message);
        }
    }

    // Save deployment addresses
    const deploymentInfo = {
        token1: await token1.getAddress(),
        token2: await token2.getAddress(),
        contractXYZProxy: contractXYZ.target,
        contractXYZImplementation: implementationAddress,
        network: network.name,
        deploymentTime: new Date().toISOString()
    };

    const fs = require('fs');
    fs.writeFileSync(
        'deployment-info.json',
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("\nDeployment info saved to deployment-info.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });