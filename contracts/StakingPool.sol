// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/security/Pausable.sol";
import "./Wallet.sol";
import "./DOWable.sol";

contract StakingPool is Wallet, Pausable, DOWable {
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

    balances[msg.sender] = balances[msg.sender].sub(amount);
    stakes[msg.sender] = stakes[msg.sender].add(amount);
    totalStakes = totalStakes.add(amount);

    emit Staked(msg.sender, amount);
  }


  function endStake(uint amount) virtual public whenNotPaused {
    require(stakes[msg.sender] >= amount, "Insufficient token balance");

    balances[msg.sender] = balances[msg.sender].add(amount);
    stakes[msg.sender] = stakes[msg.sender].sub(amount);
    totalStakes = totalStakes.sub(amount);

    emit UnStaked(msg.sender, amount);
  }

  function getStakedBalance() public view returns (uint) {
    return stakes[msg.sender];
  }

  function depositAndStartStake(uint256 amount) public whenNotPaused {
    deposit(amount);
    startStake(amount);
  }

  function endStakeAndWithdraw(uint amount) public whenNotPaused {
    endStake(amount);
    withdraw(amount);
  }

  function pause() external onlyDao {
    _pause();
  }

  function unpause() external onlyDao {
    _unpause();
  }

  /**
   * Reset user balances and stakes
   */
  function reset() public virtual onlyDao {
    for (uint i = 0; i < usersArray.length; i++) {
      balances[usersArray[i]] = 0;
      stakes[usersArray[i]] = 0;
    }
    totalStakes = 0;
  }
}
