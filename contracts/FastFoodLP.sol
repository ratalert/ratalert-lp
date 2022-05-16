// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FastFoodLP is ERC20 {
  constructor(address _dao) ERC20("FastFood LP", "FFOODLP") {
    _mint(_dao, 100 * (10 ** decimals()));
  }
}
