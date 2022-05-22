// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

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
  event Claimed(address indexed user, uint periodId, uint reward);

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
  mapping(address => mapping(uint => UserInfo)) userInfos;

  constructor(address _rewardToken, address _lpToken) StakingPool(_rewardToken, _lpToken) {
    rewardToken = IERC20(_rewardToken);
  }

  function newRewardPeriod(uint reward, uint from, uint to) public onlyDao {
    require(reward > 0, "Invalid reward period amount");
    require(to > from && to > block.timestamp, "Invalid reward period interval");
    uint previousTotalStaked = rewardPeriods.length == 0 ? 0 : rewardPeriods[rewardPeriods.length - 1].totalStaked;
    require(rewardPeriods.length == 0 || from > rewardPeriods[rewardPeriods.length - 1].to, "Invalid period start time");

    rewardPeriods.push(RewardPeriod(rewardPeriods.length + 1, reward, from, to, block.timestamp, previousTotalStaked, 0, 0));
    rewardPeriodsCount = rewardPeriods.length;

    rewardToken.transferFrom(dao, address(this), reward);

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

  function getCurrentRewardPeriodId() public view returns (uint) {
    if (rewardPeriodsCount == 0) return 0;
    return rewardPeriods[rewardPeriodsCount - 1].id;
  }

  function rewardBalance() public view returns (uint) {
    return rewardToken.balanceOf(address(this));
  }

  function depositReward(uint amount) external onlyDao returns(bool success) {
    return rewardToken.transferFrom(dao, address(this), amount);
  }

  function withdrawReward(uint amount) external onlyDao returns(bool success) {
    return rewardToken.transfer(payable(dao), amount);
  }

  function startStake(uint amount) public override whenNotPaused {
    uint periodId = getCurrentRewardPeriodId();
    require(periodId > 0, "No active reward period found");

    update();
    super.startStake(amount);

    // update total tokens staked
    RewardPeriod storage period = rewardPeriods[periodId - 1];
    period.totalStaked = period.totalStaked.add(amount);
  }

  function endStake(uint amount) public override whenNotPaused {
    uint periodId = getCurrentRewardPeriodId();
    require(periodId > 0, "No active reward period found");
    update();
    super.endStake(amount);

    // update total tokens staked
    RewardPeriod storage period = rewardPeriods[periodId - 1];
    period.totalStaked = period.totalStaked.sub(amount);

    claim();
  }

  /**
   * Calculate total period reward to be distributed since period.lastUpdated
   */
  function calculatePeriodRewardPerToken(RewardPeriod memory period) view internal returns (uint) {
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


  /**
   * Calculate user reward 
   */
  function calculateUserReward(uint periodId, uint periodRewardPerToken) internal view returns (uint) {
    if (periodRewardPerToken == 0) return 0;

    uint staked = stakes[msg.sender];
    UserInfo memory userInfo = userInfos[msg.sender][periodId];
    uint reward = staked.mul(
      periodRewardPerToken.sub(userInfo.userRewardPerTokenStaked)
    ).div(rewardPrecision);

    return reward;
  }

  function claimableReward() view public returns (uint pending) {
    (pending,) = getClaimStats();
  }

  function getClaimStats() view public returns (uint, uint) {
    uint pending = 0;
    uint paid = 0;

    for (uint i = 0; i < rewardPeriods.length; i++) {
      RewardPeriod memory period = rewardPeriods[i];
      uint periodRewardPerToken = calculatePeriodRewardPerToken(period);
      uint reward = calculateUserReward(period.id, periodRewardPerToken);

      UserInfo memory userInfo = userInfos[msg.sender][period.id];
      pending = pending.add(userInfo.pendingRewards.add(reward));
      paid = paid.add(userInfo.rewardsPaid);
    }

    return (pending, paid);
  }

  function claimReward() public whenNotPaused {
    update();
    claim();
  }

  function claim() internal {
    uint total = 0;

    for (uint i = 0; i < rewardPeriods.length; i++) {
      RewardPeriod storage period = rewardPeriods[i];
      UserInfo storage userInfo = userInfos[msg.sender][period.id];
      uint rewards = userInfo.pendingRewards;
      if (rewards != 0) {
        userInfo.pendingRewards = 0;
        userInfo.rewardsPaid = userInfo.rewardsPaid.add(rewards);
        period.totalRewardsPaid = period.totalRewardsPaid.add(rewards);
        total = total.add(rewards);
        emit Claimed(msg.sender, period.id, rewards);
      }
    }

    if (total != 0) {
      payReward(msg.sender, total);
    }
  }

  function getRewardsStats() public view returns (RewardsStats memory) {
    uint periodId = getCurrentRewardPeriodId();
    RewardsStats memory stats = RewardsStats(0, 0, 0, 0);

    // reward period stats
    if (periodId > 0) {
      RewardPeriod memory period = rewardPeriods[periodId - 1];
      stats.rewardRate = rewardRate(period);
      stats.totalRewardsPaid = period.totalRewardsPaid;
    }

    // user stats
    (stats.claimableRewards, stats.rewardsPaid) = getClaimStats();

    return stats;
  }

  function rewardRate(RewardPeriod memory period) internal pure returns (uint) {
    uint duration = period.to.sub(period.from);
    return period.reward.div(duration);
  }

  function payReward(address account, uint reward) internal {
    rewardToken.transfer(account, reward);
    emit RewardPaid(account, reward);
  }

  /**
   * Calculate rewards for all periods
   */
  function update() internal {
    for (uint i = 0; i < rewardPeriods.length; i++) {
      RewardPeriod storage period = rewardPeriods[i];
      uint periodRewardPerToken = calculatePeriodRewardPerToken(period);

      // update pending rewards since rewardPerTokenStaked was updated
      uint reward = calculateUserReward(period.id, periodRewardPerToken);
      UserInfo storage userInfo = userInfos[msg.sender][period.id];
      userInfo.pendingRewards = userInfo.pendingRewards.add(reward);
      userInfo.userRewardPerTokenStaked = periodRewardPerToken;

      require(periodRewardPerToken >= period.rewardPerTokenStaked, "Reward distribution should be monotonically increasing");

      period.rewardPerTokenStaked = periodRewardPerToken;
      period.lastUpdated = block.timestamp > period.to ? period.to : block.timestamp;
    }
  }

  function reset() public override onlyDao {
    for (uint i = 0; i < rewardPeriods.length; i++) {
      delete rewardPeriods[i];
    }
    rewardPeriodsCount = 0;
    for (uint i = 0; i < usersArray.length; i++) {
      for (uint j = 0; j < rewardPeriods.length; j++) {
        delete userInfos[usersArray[i]][rewardPeriods[j].id];
      }
    }
    // return leftover rewards to owner
    uint leftover = rewardBalance();
    rewardToken.transfer(msg.sender, leftover);
    super.reset();
  }
}
