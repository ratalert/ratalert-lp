const Config = require('../config');

const TimelockController = artifacts.require('TimelockController');
const GourmetFood = artifacts.require('GourmetFood');
const GourmetFoodLP = artifacts.require('GourmetFoodLP');
const StakingPool = artifacts.require('StakingPool');
const StakingRewardPool = artifacts.require('GourmetFoodPool');

module.exports = async (deployer, network, accounts) => {
  const isDev = network === 'development';
  const config = Config(network, accounts);

  let timelockController = { address: config.timelock.address };
  if (!config.timelock.address) {
    await deployer.deploy(TimelockController, config.timelock.minDelay, config.timelock.proposers.split(' '), config.timelock.executors.split(' '));
    timelockController = await TimelockController.deployed();
  }

  const gourmetFood = isDev ? await GourmetFood.deployed() : { address: config.foodTokens.gourmetFood };
  const gourmetFoodLP = isDev ? await GourmetFoodLP.deployed() : { address: config.lpTokens.gourmetFood };

  if (network === 'development') {
    await deployer.deploy(StakingPool, gourmetFood.address, gourmetFoodLP.address);
    const stakingPool = await StakingPool.deployed();
    await stakingPool.setDao(config.dao.address);
    await stakingPool.transferOwnership(timelockController.address);
  }

  await deployer.deploy(StakingRewardPool, gourmetFood.address, gourmetFoodLP.address);
  const stakingRewardPool = await StakingRewardPool.deployed();
  await stakingRewardPool.setDao(config.dao.address);
  await stakingRewardPool.transferOwnership(timelockController.address);
};
