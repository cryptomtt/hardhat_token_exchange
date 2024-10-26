const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Token Exchange System", function () {
    let Token1, Token2, ContractXYZ;
    let token1, token2, contractXYZ;
    let owner, user1, user2;
    let INITIAL_SUPPLY;
    let TEST_AMOUNT;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Convert to BigInt
        INITIAL_SUPPLY = ethers.parseEther("1000000");
        TEST_AMOUNT = ethers.parseEther("100");

        // Deploy Tokens
        Token1 = await ethers.getContractFactory("Token1");
        token1 = await Token1.deploy();

        Token2 = await ethers.getContractFactory("Token2");
        token2 = await Token2.deploy();

        // Deploy ContractXYZ with UUPS proxy
        ContractXYZ = await ethers.getContractFactory("ContractXYZ");
        contractXYZ = await upgrades.deployProxy(
            ContractXYZ,
            [await token1.getAddress(), await token2.getAddress()],
            { initializer: 'initialize' }
        );

        // Setup initial tokens
        await token1.transfer(user1.address, TEST_AMOUNT);
        await token2.mint(owner.address, INITIAL_SUPPLY);
    });

    describe("Deployment", function () {
        it("Should set the right token addresses", async function () {
            expect(await contractXYZ.token1()).to.equal(await token1.getAddress());
            expect(await contractXYZ.token2()).to.equal(await token2.getAddress());
        });

        it("Should assign total supply of Token1 to owner", async function () {
            const ownerBalance = await token1.balanceOf(owner.address);
            expect(await token1.totalSupply()).to.equal(INITIAL_SUPPLY);
            expect(ownerBalance).to.equal(INITIAL_SUPPLY - TEST_AMOUNT);
        });

        it("Should set the correct owner", async function () {
            expect(await contractXYZ.owner()).to.equal(owner.address);
        });
    });

    describe("Deposits", function () {
        beforeEach(async function () {
            await token1.connect(user1).approve(await contractXYZ.getAddress(), TEST_AMOUNT);
        });

        it("Should accept deposits", async function () {
            await expect(contractXYZ.connect(user1).deposit(TEST_AMOUNT))
                .to.emit(contractXYZ, "Deposit")
                .withArgs(user1.address, TEST_AMOUNT);

            expect(await contractXYZ.deposits(user1.address)).to.equal(TEST_AMOUNT);
        });

        it("Should fail if amount is 0", async function () {
            await expect(
                contractXYZ.connect(user1).deposit(0)
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should fail if allowance is insufficient", async function () {
            // First reset allowance to 0
            await token1.connect(user1).approve(await contractXYZ.getAddress(), 0);

            await expect(
                contractXYZ.connect(user1).deposit(TEST_AMOUNT)
            ).to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("Should fail if balance is insufficient", async function () {
            const largeAmount = ethers.parseEther("1000000000"); // Amount larger than total supply
            await token1.connect(user2).approve(await contractXYZ.getAddress(), largeAmount);

            await expect(
                contractXYZ.connect(user2).deposit(largeAmount)
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("Should update contract balance correctly", async function () {
            await contractXYZ.connect(user1).deposit(TEST_AMOUNT);
            expect(await token1.balanceOf(await contractXYZ.getAddress())).to.equal(TEST_AMOUNT);
        });
    });

    describe("Withdrawal Requests", function () {
        beforeEach(async function () {
            await token1.connect(user1).approve(await contractXYZ.getAddress(), TEST_AMOUNT);
            await contractXYZ.connect(user1).deposit(TEST_AMOUNT);
        });

        it("Should create withdrawal request", async function () {
            await expect(contractXYZ.connect(user1).withdrawalRequest(TEST_AMOUNT))
                .to.emit(contractXYZ, "WithdrawalRequested")
                .withArgs(user1.address, TEST_AMOUNT);

            expect(await contractXYZ.withdrawalRequests(user1.address)).to.equal(TEST_AMOUNT);
            expect(await contractXYZ.deposits(user1.address)).to.equal(0);
        });

        it("Should fail if amount exceeds deposit", async function () {
            const exceededAmount = TEST_AMOUNT + 1n;
            await expect(
                contractXYZ.connect(user1).withdrawalRequest(exceededAmount)
            ).to.be.revertedWith("Insufficient balance");
        });

        it("Should fail if amount is 0", async function () {
            await expect(
                contractXYZ.connect(user1).withdrawalRequest(0)
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should handle partial withdrawals", async function () {
            const halfAmount = TEST_AMOUNT / 2n;
            await contractXYZ.connect(user1).withdrawalRequest(halfAmount);
            expect(await contractXYZ.deposits(user1.address)).to.equal(halfAmount);
            expect(await contractXYZ.withdrawalRequests(user1.address)).to.equal(halfAmount);
        });
    });

    describe("Claims", function () {
        beforeEach(async function () {
            await token1.connect(user1).approve(await contractXYZ.getAddress(), TEST_AMOUNT);
            await contractXYZ.connect(user1).deposit(TEST_AMOUNT);
            await contractXYZ.connect(user1).withdrawalRequest(TEST_AMOUNT);

            // Fund contract with TKN2
            await token2.approve(await contractXYZ.getAddress(), TEST_AMOUNT);
            await contractXYZ.fundContract(TEST_AMOUNT);
        });

        it("Should process claims successfully", async function () {
            await expect(contractXYZ.connect(user1).claim())
                .to.emit(contractXYZ, "Claimed")
                .withArgs(user1.address, TEST_AMOUNT);

            expect(await token2.balanceOf(user1.address)).to.equal(TEST_AMOUNT);
            expect(await contractXYZ.withdrawalRequests(user1.address)).to.equal(0);
        });

        it("Should fail if no withdrawal request exists", async function () {
            await contractXYZ.connect(user1).claim();
            await expect(
                contractXYZ.connect(user1).claim()
            ).to.be.revertedWith("No withdrawal requests");
        });

        it("Should fail if contract has insufficient TKN2", async function () {
            // Process first claim
            await contractXYZ.connect(user1).claim();

            // Setup second claim without funding
            await token1.transfer(user2.address, TEST_AMOUNT);
            await token1.connect(user2).approve(await contractXYZ.getAddress(), TEST_AMOUNT);
            await contractXYZ.connect(user2).deposit(TEST_AMOUNT);
            await contractXYZ.connect(user2).withdrawalRequest(TEST_AMOUNT);

            await expect(
                contractXYZ.connect(user2).claim()
            ).to.be.revertedWith("Insufficient TKN2 balance");
        });

        it("Should update balances correctly after claim", async function () {
            const initialContractBalance = await token2.balanceOf(await contractXYZ.getAddress());
            await contractXYZ.connect(user1).claim();

            expect(await token2.balanceOf(await contractXYZ.getAddress()))
                .to.equal(initialContractBalance - TEST_AMOUNT);
            expect(await token2.balanceOf(user1.address)).to.equal(TEST_AMOUNT);
        });
    });

    describe("Contract Funding", function () {
        it("Should allow owner to fund contract", async function () {
            await token2.approve(await contractXYZ.getAddress(), TEST_AMOUNT);
            await expect(contractXYZ.fundContract(TEST_AMOUNT))
                .to.emit(contractXYZ, "Funded")
                .withArgs(TEST_AMOUNT);
        });

        it("Should not allow non-owner to fund contract", async function () {
            await token2.transfer(user1.address, TEST_AMOUNT);
            await token2.connect(user1).approve(await contractXYZ.getAddress(), TEST_AMOUNT);

            await expect(
                contractXYZ.connect(user1).fundContract(TEST_AMOUNT)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should fail funding if allowance is insufficient", async function () {
            // Reset allowance to 0
            await token2.approve(await contractXYZ.getAddress(), 0);

            // Verify starting conditions
            const allowance = await token2.allowance(owner.address, await contractXYZ.getAddress());
            expect(allowance).to.equal(0);

            // Attempt funding with different possible error handling approaches
            await expect(
                contractXYZ.fundContract(TEST_AMOUNT)
            ).to.be.reverted; // Most general check that just ensures transaction failed

            // Also verify contract state didn't change
            const contractBalance = await token2.balanceOf(await contractXYZ.getAddress());
            expect(contractBalance).to.equal(0);
        });

        it("Should fail funding if balance is insufficient", async function() {
            // First ensure we have a known balance
            const balanceBefore = await token2.balanceOf(owner.address);

            // Approve more than our balance
            await token2.approve(await contractXYZ.getAddress(), balanceBefore + TEST_AMOUNT);

            try {
                await contractXYZ.fundContract(balanceBefore + TEST_AMOUNT);
                expect.fail("Transaction should have reverted");
            } catch (error) {
                expect(error.message).to.include("transfer amount exceeds balance");
            }
        });

        it("Should fail funding if amount is zero", async function () {
            await expect(
                contractXYZ.fundContract(0)
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should handle multiple funding operations", async function () {
            // First funding
            await token2.approve(await contractXYZ.getAddress(), TEST_AMOUNT * 2n);
            await contractXYZ.fundContract(TEST_AMOUNT);

            // Second funding
            await contractXYZ.fundContract(TEST_AMOUNT);

            expect(await token2.balanceOf(await contractXYZ.getAddress()))
                .to.equal(TEST_AMOUNT * 2n);
        });

        it("Should track accumulated funds correctly", async function () {
            await token2.approve(await contractXYZ.getAddress(), TEST_AMOUNT * 3n);

            // Initial funding
            await contractXYZ.fundContract(TEST_AMOUNT);
            expect(await token2.balanceOf(await contractXYZ.getAddress()))
                .to.equal(TEST_AMOUNT);

            // Additional funding
            await contractXYZ.fundContract(TEST_AMOUNT * 2n);
            expect(await token2.balanceOf(await contractXYZ.getAddress()))
                .to.equal(TEST_AMOUNT * 3n);
        });
    });

    describe("Integration Tests", function () {
        it("Should handle multiple users deposit and withdrawal cycle", async function () {
            // Setup second user
            await token1.transfer(user2.address, TEST_AMOUNT);

            // Both users deposit
            await token1.connect(user1).approve(await contractXYZ.getAddress(), TEST_AMOUNT);
            await token1.connect(user2).approve(await contractXYZ.getAddress(), TEST_AMOUNT);
            await contractXYZ.connect(user1).deposit(TEST_AMOUNT);
            await contractXYZ.connect(user2).deposit(TEST_AMOUNT);

            // Both request withdrawal
            await contractXYZ.connect(user1).withdrawalRequest(TEST_AMOUNT);
            await contractXYZ.connect(user2).withdrawalRequest(TEST_AMOUNT);

            // Fund contract
            await token2.approve(await contractXYZ.getAddress(), TEST_AMOUNT * 2n);
            await contractXYZ.fundContract(TEST_AMOUNT * 2n);

            // Both claim
            await contractXYZ.connect(user1).claim();
            await contractXYZ.connect(user2).claim();

            expect(await token2.balanceOf(user1.address)).to.equal(TEST_AMOUNT);
            expect(await token2.balanceOf(user2.address)).to.equal(TEST_AMOUNT);
        });
    });
});