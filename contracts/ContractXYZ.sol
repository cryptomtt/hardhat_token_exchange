// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ContractXYZ is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    IERC20 public token1;
    IERC20 public token2;

    mapping(address => uint256) public deposits;
    mapping(address => uint256) public withdrawalRequests;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _token1, address _token2) public initializer {
        __Ownable_init(); // Remove msg.sender parameter
        __UUPSUpgradeable_init();
        token1 = IERC20(_token1);
        token2 = IERC20(_token2);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function deposit(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(token1.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        deposits[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdrawalRequest(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(deposits[msg.sender] >= amount, "Insufficient balance");

        deposits[msg.sender] -= amount;
        withdrawalRequests[msg.sender] += amount;
        emit WithdrawalRequested(msg.sender, amount);
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
        require(amount > 0, "Amount must be greater than 0");
        require(token2.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit Funded(amount);
    }

    event Deposit(address indexed user, uint256 amount);
    event WithdrawalRequested(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event Funded(uint256 amount);
}