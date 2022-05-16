// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract DOWable is Ownable {
  address dao;

  /**
   * @dev Throws if called by any account other than the DAO wallet.
   */
  function isDao() internal view {
    require(msg.sender == dao, "Only DAO can execute");
  }

  /**
   * @dev Throws if called by any account other than the DAO wallet.
   */
  modifier onlyDao() {
    isDao();
    _;
  }

  function setDao(address _dao) external onlyOwner {
    dao = _dao;
  }
}
