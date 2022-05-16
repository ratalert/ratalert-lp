const Config = require('../config');

const TimelockController = artifacts.require('TimelockController');
const FastFood = artifacts.require('FastFood');
const FastFoodLP = artifacts.require('FastFoodLP');
const StakingPool = artifacts.require('StakingPool');
const StakingRewardPool = artifacts.require('StakingRewardPool');

module.exports = async (deployer, network, accounts) => {
  const isDev = network === 'development';
  const config = Config(network, accounts);

  let timelockController = { address: config.timelock.address };
  if (!config.timelock.address) {
    await deployer.deploy(TimelockController, config.timelock.minDelay, config.timelock.proposers.split(' '), config.timelock.executors.split(' '));
    timelockController = await TimelockController.deployed();
  }

  const fastFood = isDev ? await FastFood.deployed() : { address: config.foodTokens.fastFood };
  const fastFoodLP = isDev ? await FastFoodLP.deployed() : { address: config.lpTokens.fastFood };

  await deployer.deploy(StakingPool, fastFood.address, fastFoodLP.address);
  const stakingPool = await StakingPool.deployed();
  await stakingPool.setDao(config.dao.address);
  await stakingPool.transferOwnership(timelockController.address);

  await deployer.deploy(StakingRewardPool, fastFood.address, fastFoodLP.address);
  const stakingRewardPool = await StakingRewardPool.deployed();
  await stakingRewardPool.setDao(config.dao.address);
  await stakingRewardPool.transferOwnership(timelockController.address);
};
