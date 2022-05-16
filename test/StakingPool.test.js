const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
require('@openzeppelin/test-helpers');

const FoodTokenLP = artifacts.require('FastFoodLP')
const StakingPool = artifacts.require('StakingPool')
const expect = chai.expect;
chai.use(chaiAsPromised);

contract('StakingPool', () => {
  before(async () => {
    this.foodTokenLP = await FoodTokenLP.deployed();
    this.pool = await StakingPool.deployed();
    await this.foodTokenLP.approve(this.pool.address, 200, { from: dao });
    await this.pool.deposit(100);
  });

  describe('startStake()', () => {
    it('updates the account balance accordingly', async () => {
      await this.pool.startStake(60);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('40');

      await this.pool.startStake(30);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('10');

      await this.pool.startStake(10);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('0');
    });
    it('does not allow staking more than is available', async () => {
      await expect(this.pool.startStake(1)).to.eventually.be.rejectedWith('Insufficient token balance');
    });
  });

  describe('getStakedBalance()', () => {
    it('returns the staked balance', async () => {
      await expect(this.pool.getStakedBalance()).to.eventually.be.a.bignumber.eq('100');
    });
  });

  describe('endStake()', () => {
    it('updates both balances accordingly', async () => {
      await this.pool.endStake(60);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('60');
      await expect(this.pool.getStakedBalance()).to.eventually.be.a.bignumber.eq('40');

      await this.pool.endStake(40);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('100');
      await expect(this.pool.getStakedBalance()).to.eventually.be.a.bignumber.eq('0');
    })
    it('does not allow unstaking more than is available', async () => {
      await expect(this.pool.endStake(1)).to.eventually.be.rejectedWith('Insufficient token balance');
    });
  });

  describe('depositAndStartStake()', () => {
    before(async () => {
      await this.pool.withdraw(100);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('0');
    });

    it('updates both balances accordingly', async () => {
      await this.pool.depositAndStartStake(20);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('0');
      await expect(this.pool.getStakedBalance()).to.eventually.be.a.bignumber.eq('20');
      await this.pool.depositAndStartStake(80);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('0');
      await expect(this.pool.getStakedBalance()).to.eventually.be.a.bignumber.eq('100');
    });
  });

  describe('endStakeAndWithdraw()', () => {
    it('updates both balances accordingly', async () => {
      await this.pool.endStakeAndWithdraw(70);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('0');
      await expect(this.pool.getStakedBalance()).to.eventually.be.a.bignumber.eq('30');
      await this.pool.endStakeAndWithdraw(30);
      await expect(this.pool.getBalance()).to.eventually.be.a.bignumber.eq('0');
      await expect(this.pool.getStakedBalance()).to.eventually.be.a.bignumber.eq('0');
    });
  });
});
