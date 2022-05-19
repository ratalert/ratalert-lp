const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
require('@openzeppelin/test-helpers');

const FoodTokenLP = artifacts.require('FastFoodLP')
const StakingPool = artifacts.require('StakingPool')
const expect = chai.expect;
chai.use(chaiAsPromised);

contract('Wallet', (accounts) => {
    const owner = accounts[0];
    const dao = accounts[9];

    before(async () => {
        this.foodTokenLP = await FoodTokenLP.deployed();
        this.pool = await StakingPool.deployed();
        await this.foodTokenLP.transfer(owner, 200, { from: dao });
        await this.foodTokenLP.approve(this.pool.address, 100);
    });

    describe('deposit()', () => {
        it('increases the account balance', async () => {
            await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('0');
            await this.pool.deposit(100);
            await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('100');
        });
    });

    describe('getBalance()', () => {
        it('returns a positive balance', async () => {
            await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('100');
        });
        it('returns a zero balance', async () => {
            await expect(this.pool.getBalance({ from: accounts[1] })).to.eventually.be.a.bignumber.eq('0');
        });
    });

    describe('withdraw()', () => {
        it('reduces the account balance', async () => {
            await this.pool.withdraw(50);
            await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('50');
        });
        it('does not allow withdrawing more than is available', async () => {
            await expect(this.pool.withdraw(51)).to.eventually.be.rejectedWith('Insufficient token balance');
        });
        it('reduces the account balance', async () => {
            await this.pool.withdraw(50);
            await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('0');
        });
        it('does not allow withdrawing without a prior deposit', async () => {
            await expect(this.pool.withdraw(1, { from: accounts[1] })).to.eventually.be.rejectedWith('Insufficient token balance');
        });
    });
});
