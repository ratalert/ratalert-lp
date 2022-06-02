const Config = require('../config');

const TimelockController = artifacts.require('TimelockController');
const CasualFood = artifacts.require('CasualFood');
const CasualFoodLP = artifacts.require('CasualFoodLP');
const StakingPool = artifacts.require('StakingPool');
const StakingRewardPool = artifacts.require('CasualFoodPool');

module.exports = async (deployer, network, accounts) => {
  const isDev = network === 'development';
  const config = Config(network, accounts);

  let timelockController = { address: config.timelock.address };
  if (!config.timelock.address) {
    await deployer.deploy(TimelockController, config.timelock.minDelay, config.timelock.proposers.split(' '), config.timelock.executors.split(' '));
    timelockController = await TimelockController.deployed();
  }

  const casualFood = isDev ? await CasualFood.deployed() : { address: config.foodTokens.casualFood };
  const casualFoodLP = isDev ? await CasualFoodLP.deployed() : { address: config.lpTokens.casualFood };

  if (network === 'development') {
    await deployer.deploy(StakingPool, casualFood.address, casualFoodLP.address);
    const stakingPool = await StakingPool.deployed();
    await stakingPool.setDao(config.dao.address);
    await stakingPool.transferOwnership(timelockController.address);
  }

  await deployer.deploy(StakingRewardPool, casualFood.address, casualFoodLP.address);
  const stakingRewardPool = await StakingRewardPool.deployed();
  await stakingRewardPool.setDao(config.dao.address);
  await stakingRewardPool.transferOwnership(timelockController.address);
};
