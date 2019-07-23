const Remittance = artifacts.require('Remittance');

module.exports = function(deployer) {
  deployer.deploy(Remittance, 86400 * 7, 10000, false);
};
