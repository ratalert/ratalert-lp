exports.toWei = (ether) => web3.utils.toWei(ether.toString(), 'ether');
exports.advanceTime = (time) => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [time],
            id: new Date().getTime()
        }, (err, result) => {
            if (err) { return reject(err); }
            return resolve(result);
        });
    });
};
exports.advanceBlock = () => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_mine',
            id: new Date().getTime()
        }, (err) => {
            if (err) { return reject(err); }
            const newBlockHash = web3.eth.getBlock('latest').hash;

            return resolve(newBlockHash);
        });
    });
};
exports.advanceTimeAndBlock = async (time) => {
    await exports.advanceTime(time);
    await exports.advanceBlock();
    return Promise.resolve(web3.eth.getBlock('latest'));
};
exports.encodeFunctionCall = (contract, func, args = []) => {
    const abi = contract.abi.find(item => item.name === func);
    return web3.eth.abi.encodeFunctionCall(abi, args);
};
exports.decodeFunctionCall = async (contract, func, data) => {
    const instance = await exports.getInstance(contract);
    const params = instance.abi.find(item => item.name === func).inputs.map(item => item.type);
    return web3.eth.abi.decodeParameters(params, data.slice(10));
};
