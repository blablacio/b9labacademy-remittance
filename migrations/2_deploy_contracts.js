const Remittance = artifacts.require('Remittance');

module.exports = function(deployer) {
  deployer.deploy(Remittance, 10000, false);
};
