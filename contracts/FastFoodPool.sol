// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakingRewardPool.sol";

contract FastFoodPool is StakingRewardPool {
  constructor(address _rewardToken, address _lpToken) StakingRewardPool(_rewardToken, _lpToken) {
    rewardToken = IERC20(_rewardToken);
  }
}
