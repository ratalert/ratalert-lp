// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Food.sol";

contract FastFood is Food {
  constructor(address _dao) Food("FastFood", "FFOOD", 100000000 * 10 ** 18, _dao) {
    _mint(_dao, 10000000 * (10 ** decimals())); // 10% of supply are LP incentives
  }
}
