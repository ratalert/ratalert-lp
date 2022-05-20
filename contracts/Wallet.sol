// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract Wallet is Ownable {
  using SafeMath for uint256;

  event Deposited(address indexed user, uint256 amount);
  event Withdrawn(address indexed user, uint256 amount);

  IERC20 internal foodTokenLP;

  mapping(address => uint256) public balances; // lp token balances
  address[] internal usersArray; // lp user array
  mapping(address => bool) internal users; // lp user map

  constructor(address _foodTokenLPTokenAddress) {
    foodTokenLP = IERC20(_foodTokenLPTokenAddress);
  }

  function getBalance() external view returns (uint256) {
    return balances[msg.sender];
  }

  function deposit(uint256 amount) public {
    require(amount > 0, "Invalid amount");
    require(foodTokenLP.allowance(msg.sender, address(this)) >= amount, "Insufficient allowance");

    balances[msg.sender] = balances[msg.sender].add(amount);
    if (!users[msg.sender]) {
      users[msg.sender] = true;
      usersArray.push(msg.sender);
    }
    foodTokenLP.transferFrom(msg.sender, address(this), amount);

    emit Deposited(msg.sender, amount);
  }

  function withdraw(uint256 amount) public {
    require(balances[msg.sender] >= amount, "Insufficient token balance");

    balances[msg.sender] = balances[msg.sender].sub(amount);
    foodTokenLP.transfer(msg.sender, amount);

    emit Withdrawn(msg.sender, amount);
  }
}
