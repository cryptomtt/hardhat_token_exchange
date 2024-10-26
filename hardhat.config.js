require("@nomicfoundation/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

module.exports = {
  solidity: "0.8.17",
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
      confirmations: 6, // Optional: number of confirmations to wait
      timeoutBlocks: 200 // Optional: number of blocks to wait
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};