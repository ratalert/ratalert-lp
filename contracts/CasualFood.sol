// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Food.sol";

contract CasualFood is Food {
  constructor(address _dao) Food("CasualFood", "CFOOD", 10000000 * 10 ** 18, _dao) {
    _mint(_dao, 1000000 * (10 ** decimals())); // 10% of supply are LP incentives
  }
}
