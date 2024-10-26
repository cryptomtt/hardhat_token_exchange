// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ContractXYZV2 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    IERC20 public token1;
    IERC20 public token2;

    mapping(address => uint256) public deposits;
    mapping(address => uint256) public withdrawalRequests;
    mapping(address => bool) public whitelisted;
    uint256 public withdrawalFee;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _token1, address _token2) public reinitializer(2) {
        __Ownable_init();
        __UUPSUpgradeable_init();

        token1 = IERC20(_token1);
        token2 = IERC20(_token2);
        withdrawalFee = 50; // 0.5% default fee
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setWhitelisted(address user, bool status) external onlyOwner {
        whitelisted[user] = status;
        emit WhitelistUpdated(user, status);
    }

    function setWithdrawalFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1000, "Fee too high"); // Max 10%
        withdrawalFee = newFee;
        emit WithdrawalFeeUpdated(newFee);
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(token1.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        deposits[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdrawalRequest(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(deposits[msg.sender] >= amount, "Insufficient balance");

        uint256 feeAmount = 0;
        if (!whitelisted[msg.sender]) {
            feeAmount = (amount * withdrawalFee) / 10000;
        }

        uint256 netAmount = amount - feeAmount;
        deposits[msg.sender] -= amount;
        withdrawalRequests[msg.sender] += netAmount;

        emit WithdrawalRequested(msg.sender, netAmount, feeAmount);
    }

    function claim() external {
        uint256 amount = withdrawalRequests[msg.sender];
        require(amount > 0, "No withdrawal requests");
        require(token2.balanceOf(address(this)) >= amount, "Insufficient TKN2 balance");

        withdrawalRequests[msg.sender] = 0;
        require(token2.transfer(msg.sender, amount), "Transfer failed");
        emit Claimed(msg.sender, amount);
    }

    function fundContract(uint256 amount) external onlyOwner {
        require(token2.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit Funded(amount);
    }

    // Add getter for accumulated fees
    function getAccumulatedFees() external view returns (uint256) {
        return token2.balanceOf(address(this));
    }

    // Add function to withdraw accumulated fees
    function withdrawFees(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(token2.balanceOf(address(this)) >= amount, "Insufficient balance");
        require(token2.transfer(msg.sender, amount), "Transfer failed");
        emit FeesWithdrawn(amount);
    }

    event Deposit(address indexed user, uint256 amount);
    event WithdrawalRequested(address indexed user, uint256 netAmount, uint256 feeAmount);
    event Claimed(address indexed user, uint256 amount);
    event Funded(uint256 amount);
    event WhitelistUpdated(address indexed user, bool status);
    event WithdrawalFeeUpdated(uint256 newFee);
    event FeesWithdrawn(uint256 amount);
}