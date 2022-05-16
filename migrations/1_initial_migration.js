const {rm} = require("fs/promises");
const Migrations = artifacts.require('Migrations');

module.exports = function (deployer) {
  deployer.deploy(Migrations);
};

module.exports = async (deployer) => {
  deployer.deploy(Migrations);
};
