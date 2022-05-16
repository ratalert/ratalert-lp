// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Wallet.sol";
import "./DOWable.sol";

contract StakingPool is Wallet, DOWable {
  using SafeMath for uint256;

  event Staked(address indexed user, uint amount);
  event UnStaked(address indexed user, uint256 amount);

  address[] public stakers; // addresses that have active stakes
  mapping(address => uint) public stakes;
  uint public totalStakes;

  constructor(address _rewardToken, address _lpToken) Wallet(_lpToken) {}

  function startStake(uint amount) virtual public {
    require(amount > 0, "Invalid amount");
    require(balances[msg.sender] >= amount, "Insufficient token balance");

    balances[msg.sender] -= amount;
    stakes[msg.sender] += amount;
    totalStakes += amount;

    emit Staked(msg.sender, amount);
  }


  function endStake(uint amount) virtual public {
    require(stakes[msg.sender] >= amount, "Insufficient token balance");

    balances[msg.sender] += amount;
    stakes[msg.sender] -= amount;
    totalStakes -= amount;

    emit UnStaked(msg.sender, amount);
  }

  function getStakedBalance() public view returns (uint) {
    return stakes[msg.sender];
  }

  function depositAndStartStake(uint256 amount) public {
    deposit(amount);
    startStake(amount);
  }

  function endStakeAndWithdraw(uint amount) public {
    endStake(amount);
    withdraw(amount);
  }

  /**
   * Reset user balances and stakes
   */
  function reset() public virtual onlyOwner {
    for (uint i = 0; i < usersArray.length; i++) {
      balances[usersArray[i]] = 0;
      stakes[usersArray[i]] = 0;
    }
    totalStakes = 0;
  }
}
