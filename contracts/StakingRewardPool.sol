// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./StakingPool.sol";

/**
 * Pool contract to distribute reward tokens among LP token stakers proportionally to the amount and duration of the their stakes.
 * The owner can setup multiple reward periods each one with a pre-allocated amount of reward tokens to be distributed.
 * Users are free to add and remove tokens to their stake at any time.
 * Users can also claim their pending reward at any time.

 * The pool implements an efficient O(1) algo to distribute the rewards based on this paper:
 * https://uploads-ssl.webflow.com/5ad71ffeb79acc67c8bcdaba/5ad8d1193a40977462982470_scalable-reward-distribution-paper.pdf
 */
contract StakingRewardPool is StakingPool {
  using SafeMath for uint256;

  event RewardPeriodCreated(uint id, uint256 reward, uint from, uint to);
  event RewardPaid(address indexed user, uint256 reward);

  struct RewardPeriod {
    uint id; // index + 1 in rewardPeriods array
    uint reward; // Amount to distribute over the entire period
    uint from; // Block timestamp
    uint to; // Block timestamp
    uint lastUpdated; // When the totalStakedWeight was last updated (after last stake was ended)
    uint totalStaked; // Sum of all active stake deposits
    uint rewardPerTokenStaked; // Sum of all rewards distributed divided all active stakes: SUM(reward/totalStaked)
    uint totalRewardsPaid; // Sum of all rewards paid in claims
  }

  struct UserInfo {
    uint userRewardPerTokenStaked;
    uint pendingRewards;
    uint rewardsPaid;
  }

  struct RewardsStats {
    // user stats
    uint claimableRewards;
    uint rewardsPaid;
    // general stats
    uint rewardRate;
    uint totalRewardsPaid;
  }

  IERC20 internal rewardToken;
  RewardPeriod[] public rewardPeriods;
  uint rewardPeriodsCount = 0;
  uint constant rewardPrecision = 1e9;
  mapping(address => UserInfo) userInfos;

  constructor(address _rewardToken, address _lpToken) StakingPool(_rewardToken, _lpToken) {
    rewardToken = IERC20(_rewardToken);
  }

  function newRewardPeriod(uint reward, uint from, uint to) public onlyDao {
    require(reward > 0, "Invalid reward period amount");
    require(to > from && to > block.timestamp, "Invalid reward period interval");
    require(rewardPeriods.length == 0 || from > rewardPeriods[rewardPeriods.length - 1].to, "Invalid period start time");

    rewardPeriods.push(RewardPeriod(rewardPeriods.length + 1, reward, from, to, block.timestamp, 0, 0, 0));
    rewardPeriodsCount = rewardPeriods.length;

    depositReward(reward);

    emit RewardPeriodCreated(rewardPeriodsCount, reward, from, to);
  }

  function getRewardPeriodsCount() public view returns (uint) {
    return rewardPeriodsCount;
  }

  function deleteRewardPeriod(uint index) public onlyDao {
    require(rewardPeriods.length > index, "Invalid reward phase index");
    for (uint i = index; i < rewardPeriods.length - 1; i++) {
      rewardPeriods[i] = rewardPeriods[i + 1];
    }
    rewardPeriods.pop();
    rewardPeriodsCount = rewardPeriods.length;
  }

  function rewardBalance() public view returns (uint) {
    return rewardToken.balanceOf(address(this));
  }

  function depositReward(uint amount) internal onlyDao {
    rewardToken.transferFrom(dao, address(this), amount);
  }

  function withdrawReward(uint amount) external onlyDao returns(bool success) {
    return rewardToken.transfer(payable(dao), amount); // Transfer to DAO wallet
  }

  function startStake(uint periodId, uint amount) public override whenNotPaused {
    update(periodId);
    super.startStake(periodId, amount);

    // update total tokens staked
    RewardPeriod storage period = rewardPeriods[periodId - 1];
    period.totalStaked = period.totalStaked.add(amount);
  }

  function endStake(uint periodId, uint amount) public override whenNotPaused {
    update(periodId);
    super.endStake(periodId, amount);

    // update total tokens staked
    RewardPeriod storage period = rewardPeriods[periodId - 1];
    period.totalStaked = period.totalStaked.sub(amount);

    claim(periodId);
  }

  function depositAndStartStake(uint periodId, uint256 amount) public override whenNotPaused {
    deposit(amount);
    startStake(periodId, amount);
  }

  function endStakeAndWithdraw(uint periodId, uint amount) public override whenNotPaused {
    endStake(periodId, amount);
    withdraw(amount);
  }

  /**
   * Calculate total reward to be distributed since period.lastUpdated
   */
  function calculateRewardDistribution(RewardPeriod memory period) view internal returns (uint) {
    uint rate = rewardRate(period);
    uint timestamp = block.timestamp > period.to ? period.to : block.timestamp; // We don't pay out after period.to
    uint deltaTime = timestamp.sub(period.lastUpdated);
    uint reward = deltaTime.mul(rate);

    uint newRewardPerTokenStaked = period.rewardPerTokenStaked;
    if (period.totalStaked != 0) {
      newRewardPerTokenStaked = period.rewardPerTokenStaked.add(
        reward.mul(rewardPrecision).div(period.totalStaked)
      );
    }

    return newRewardPerTokenStaked;
  }

  function calculateReward(uint rewardDistribution) internal view returns (uint) {
    if (rewardDistribution == 0) return 0;

    uint staked = stakes[msg.sender];
    UserInfo memory userInfo = userInfos[msg.sender];
    uint reward = staked.mul(
      rewardDistribution.sub(userInfo.userRewardPerTokenStaked)
    ).div(rewardPrecision);

    return reward;
  }

  function claimableReward(uint periodId) view public returns (uint) {
    RewardPeriod memory period = rewardPeriods[periodId - 1];
    uint newRewardDistribution = calculateRewardDistribution(period);
    uint reward = calculateReward(newRewardDistribution);

    UserInfo memory userInfo = userInfos[msg.sender];
    uint pending = userInfo.pendingRewards;

    return pending.add(reward);
  }

  function claimReward(uint periodId) public whenNotPaused {
    update(periodId);
    claim(periodId);
  }

  function claim(uint periodId) internal {
    UserInfo storage userInfo = userInfos[msg.sender];
    uint rewards = userInfo.pendingRewards;
    if (rewards != 0) {
      userInfo.pendingRewards = 0;

      RewardPeriod storage period = rewardPeriods[periodId - 1];
      period.totalRewardsPaid = period.totalRewardsPaid.add(rewards);

      payReward(msg.sender, rewards);
    }
  }

  function getRewardsStats(uint periodId) public view returns (RewardsStats memory) {
    UserInfo memory userInfo = userInfos[msg.sender];
    RewardsStats memory stats = RewardsStats(0, 0, 0, 0);

    // reward period stats
    if (periodId > 0) {
      RewardPeriod memory period = rewardPeriods[periodId - 1];
      stats.rewardRate = rewardRate(period);
      stats.totalRewardsPaid = period.totalRewardsPaid;
    }

    // user stats
    stats.claimableRewards = claimableReward(periodId);
    stats.rewardsPaid = userInfo.rewardsPaid;

    return stats;
  }

  function rewardRate(RewardPeriod memory period) internal pure returns (uint) {
    uint duration = period.to.sub(period.from);
    return period.reward.div(duration);
  }

  function payReward(address account, uint reward) internal {
    UserInfo storage userInfo = userInfos[msg.sender];
    userInfo.rewardsPaid = userInfo.rewardsPaid.add(reward);
    rewardToken.transfer(account, reward);

    emit RewardPaid(account, reward);
  }

  /**
   * Reward calculation
   */
  function update(uint periodId) internal {
    RewardPeriod storage period = rewardPeriods[periodId - 1];
    uint rewardDistributedPerToken = calculateRewardDistribution(period);

    // update pending rewards since rewardPerTokenStaked was updated
    uint reward = calculateReward(rewardDistributedPerToken);
    UserInfo storage userInfo = userInfos[msg.sender];
    userInfo.pendingRewards = userInfo.pendingRewards.add(reward);
    userInfo.userRewardPerTokenStaked = rewardDistributedPerToken;

    require(rewardDistributedPerToken >= period.rewardPerTokenStaked, "Reward distribution should be monotonically increasing");

    period.rewardPerTokenStaked = rewardDistributedPerToken;
    period.lastUpdated = block.timestamp > period.to ? period.to : block.timestamp;
  }

  function reset() public override onlyDao {
    for (uint i = 0; i < rewardPeriods.length; i++) {
      delete rewardPeriods[i];
    }
    rewardPeriodsCount = 0;
    for (uint i = 0; i < usersArray.length; i++) {
      delete userInfos[usersArray[i]];
    }
    // return leftover rewards to owner
    uint leftover = rewardBalance();
    rewardToken.transfer(msg.sender, leftover);
    super.reset();
  }
}
