const mri = require('mri');
const { scheduleAndExecute, encodeFunctionCall, toWei, decodeFunctionCall } = require('../test/helper');

const commands = {
    pause: async(contract) => {
        console.log(`Pausing ${contract}...`);
        const res = await this.executeOrEncode(await getInst(contract), 'pause');
        if (res) console.log(res);
    },
    unpause: async(contract) => {
        console.log(`Unpausing ${contract}...`);
        const res = await this.executeOrEncode(await getInst(contract), 'unpause');
        if (res) console.log(res);
    },
    paused: async(contract) => {
        const status = await (await this.getInst(contract)).paused();
        console.log(`${contract} is ${status ? 'paused' : 'not paused'}`);
    },
    newRewardPeriod: async(contract,  amount, start, end) => {
        const pool = await artifacts.require(contract).deployed();
        const ticker = contract.substring(0, contract.length - 4);
        const foodToken = await artifacts.require(ticker).deployed();
        const startDate = new Date(Date.parse(start));
        const endDate = new Date(Date.parse(end));
        const startEpoch = Math.floor(startDate.getTime() / 1000);
        const endEpoch = Math.floor(endDate.getTime() / 1000);
        const currentBlock = (await web3.eth.getBlock('latest')).timestamp;
        console.log(`Creating new reward period from ${startEpoch} (${startDate.toISOString()}) to ${endEpoch} (${endDate.toISOString()}) with a reward of ${toWei(amount)} (${amount}) ${ticker}. Current block: ${currentBlock}.`);
        await this.executeOrEncode(foodToken, 'approve', [pool.address, toWei(amount)]);
        const res = await this.executeOrEncode(pool, 'newRewardPeriod', [toWei(amount), startEpoch, endEpoch]);
        if (res) console.log(res);
    },
    withdrawReward: async(contract, amount) => {
        const instance = await artifacts.require(contract).deployed();
        const res = this.executeOrEncode(instance, 'withdrawReward', [toWei(amount)]);
        if (res) console.log(res);
    },
    transferOwnership: async(contract, to) => {
        if (to === 'dao') to = this.config.dao.address;
        console.log(`Configuring ${contract} ownership to ${to}`);
        const res = await scheduleAndExecute(await this.getInst(contract), 'transferOwnership', [this.config.dao.address], { from: this.config.dao.address, network: this.network, raw: this.network === 'main' }, Date.now());
        if (res) console.log(res);
    },
    decodeFunctionCall: async (contract, func, data) => {
        console.log(await decodeFunctionCall(contract, func, data));
    }
};

module.exports = async (callback) => {
    const argv = mri(process.argv.slice(4));
    const [cmd, ...args] = argv._
    const exec = commands[cmd];

    this.network = argv.network || 'develop';
    this.accounts = await web3.eth.getAccounts();
    this.config = require('../config')(this.network, this.accounts);
    this.getInst = contract => artifacts.require(contract).deployed();
    this.executeOrEncode = (instance, method, args, options = {}) => {
        if (this.network === 'main') {
            const data = encodeFunctionCall(instance, method, args);
            console.log(`Address: ${instance.address}\n\nABI:\n${JSON.stringify(instance.abi)}\n\nData: ${data}`);
            return;
        }
        return instance[method](...args, { from: this.config.dao.address, ...options });
    };

    global.artifacts = artifacts;
    global.web3 = web3;

    if (!exec) {
        console.log('Usage: truffle exec bin/cli.js <cmd>');
        console.log('Commands:');
        Object.keys(commands).map(c => console.log(' ', c, commands[c].toString().split('\n')[0].match(/\((.*)\)/)[1].split(', ').map(a => a ? `<${a}>` : '').join(' ')));
        return callback();
    }
    if (args.length !== exec.length) {
        console.log(`${cmd} requires ${exec.length} argument(s):`, exec.toString().split('\n')[0].match(/\((.*)\)/)[1].split(', ').map(a => a ? `<${a}>` : '').join(' '));
        return callback();
    }
    await exec(...args, callback);
    callback();
};
