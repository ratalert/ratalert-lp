const FastFood = artifacts.require('FastFood');
const FastFoodLP = artifacts.require('FastFoodLP');
const CasualFood = artifacts.require('CasualFood');
const CasualFoodLP = artifacts.require('CasualFoodLP');
const GourmetFood = artifacts.require('GourmetFood');
const GourmetFoodLP = artifacts.require('GourmetFoodLP');

module.exports = async (deployer, network, accounts) => {
  if (network === 'development') {
    const dao = accounts[9];

    await deployer.deploy(FastFood, dao);
    await deployer.deploy(FastFoodLP, dao);
    await deployer.deploy(CasualFood, dao);
    await deployer.deploy(CasualFoodLP, dao);
    await deployer.deploy(GourmetFood, dao);
    await deployer.deploy(GourmetFoodLP, dao);
  }
};
