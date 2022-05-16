const env = (key, def) => { return process.env[key] || def; };
const num = (key, def) => { return Number(env(key, def)); };

module.exports = (network, accounts = []) => ({
  dao: {
    address: env('DAO_ADDRESS', accounts ? accounts[9] : ''),
  },
  timelock: {
    address: env('TIMELOCK_ADDRESS'),
    minDelay: num('TIMELOCK_MIN_DELAY', (60 * 60 * 24 * 2).toString()),
    proposers: env('TIMELOCK_PROPOSERS', accounts ? accounts[9] : ''),
    executors: env('TIMELOCK_EXECUTORS', accounts ? accounts[9] : ''),
  },
  foodTokens: {
    fastFood: env('FOODTOKENS_FASTFOOD'),
    casualFood: env('FOODTOKENS_CASUALFOOD'),
    gourmetFood: env('FOODTOKENS_GOURMETFOOD'),
  },
  lpTokens: {
    fastFood: env('LPTOKENS_FASTFOOD'),
    casualFood: env('LPTOKENS_CASUALFOOD'),
    gourmetFood: env('LPTOKENS_GOURMETFOOD'),
  },
});
