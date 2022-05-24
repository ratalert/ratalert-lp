const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { BN } = require('@openzeppelin/test-helpers');
const { advanceTimeAndBlock } = require('./helper');
require('@openzeppelin/test-helpers');

const FoodTokenLP = artifacts.require('FastFoodLP');
const FoodToken = artifacts.require('FastFood');
const StakingRewardPool = artifacts.require('FastFoodPool');
const expect = chai.expect;
chai.use(chaiAsPromised);

contract('StakingRewardPool', (accounts) => {
    const anon1 = accounts[1];
    const anon2 = accounts[2];
    const anon3 = accounts[3];
    const dao = accounts[9];

    async function resetTokenBalance(account, token) {
        const accountBalance = (await token.balanceOf(account)).toNumber();
        if (accountBalance > 0) {
            await token.transfer(dao, accountBalance, { from: account })
        }
    }

    before(async () => {
        this.pool = await StakingRewardPool.deployed();
        this.foodTokenLP = await FoodTokenLP.deployed();
        this.foodToken = await FoodToken.deployed();
        await this.foodTokenLP.transfer(anon1, 10, { from: dao });
        await this.foodTokenLP.transfer(anon2, 20, { from: dao });
        await this.foodTokenLP.transfer(anon3, 30, { from: dao });
    });

    afterEach(async () => {
        await Promise.all([anon1, anon2, anon3].map(account => resetTokenBalance(account, this.foodToken)));
    });

    describe('newRewardPeriod()', () => {
        it('starts a new reward period', async () => {
            await expect(this.pool.rewardBalance()).to.eventually.be.a.bignumber.eq('0');

            const latestBlock = await web3.eth.getBlock('latest');
            const start = latestBlock.timestamp;
            const end = this.period1End = start + 1000;

            await this.foodToken.approve(this.pool.address, 1000, { from: dao });
            const res = await this.pool.newRewardPeriod(1000, start, end, { from: dao });
            this.rewardPeriodId = res.logs[0].args.id.toNumber();
            this.rewardPeriodTo = res.logs[0].args.to.toNumber();
            const count = await this.pool.getRewardPeriodsCount();
            expect(count.toNumber()).to.equal(1);

            const period = await this.pool.rewardPeriods(count - 1);
            expect(period.from.toNumber()).to.equal(start, 'Invalid reward period start');
            expect(period.to.toNumber()).to.equal(end, 'Invalid reward period end');
            expect(period.reward.toNumber()).to.equal(1000, 'Invalid reward period amount');

            await expect(this.pool.rewardBalance()).to.eventually.be.a.bignumber.eq('1000');
        });
    });

    describe('claimReward()', () => {
        it('stakes and claims a few times', async () => {
            // Deposit LP tokens to stake
            await this.foodTokenLP.approve(this.pool.address, 10, {from: anon1});
            await this.pool.depositAndStartStake(10, {from: anon1});
            const t0 = (await web3.eth.getBlock('latest')).timestamp;

            // Wait some time
            await advanceTimeAndBlock(200);

            // Get stake reward so far
            const res1 = await this.pool.claimReward({from: anon1});
            const t1 = (await web3.eth.getBlock('latest')).timestamp;
            expect(res1.receipt.status).to.be.true;
            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq((t1 - t0).toString());
            await expect(this.foodToken.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq((1000 - (t1 - t0)).toString());

            // Wait some more
            await advanceTimeAndBlock(500);

            // Get stake reward so far
            const res2 = await this.pool.claimReward({from: anon1});
            this.t2 = (await web3.eth.getBlock('latest')).timestamp;
            this.stakePeriod2 = this.t2 - t0;
            expect(res2.receipt.status).to.be.true;
            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq((this.stakePeriod2).toString());
            await expect(this.foodToken.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq((1000 - this.stakePeriod2).toString());
        });
    });

    describe('rewardBalance()', () => {
        it('returns the amount', async () => {
            const res = await this.pool.rewardBalance({from: anon1});
            expect(res).to.be.a.bignumber.eq(new BN((1000 - this.stakePeriod2).toString()));
        });
    });

    describe('getRewardsStats()', () => {
        it('returns the stats so far', async () => {
            const res = await this.pool.getRewardsStats({from: anon1});
            const t0 = (await web3.eth.getBlock('latest')).timestamp;
            expect(res.claimableRewards).to.equal((t0 - this.t2).toString());
            expect(res.rewardsPaid).to.equal(this.stakePeriod2.toString());
            expect(res.rewardRate).to.equal('1');
            expect(res.totalRewardsPaid).to.equal(this.stakePeriod2.toString());
        });
        it('returns stats with claimableRewards', async () => {
            // Wait some more
            await advanceTimeAndBlock(200);
            const t0 = (await web3.eth.getBlock('latest')).timestamp;
            const res = await this.pool.getRewardsStats({from: anon1});
            expect(res.claimableRewards).to.equal((t0 - this.t2).toString());
        });
        it('returns the remainder when the stake period has expired', async () => {
            // Wait even more
            await advanceTimeAndBlock(500);
            const res = await this.pool.getRewardsStats({from: anon1});
            const amount = 1000 - this.stakePeriod2;
            expect(Number(res.claimableRewards)).to.be.within(amount - 5, amount + 5);
        });
    });

    describe('claimableReward()', () => {
        it('returns the remainder when the stake period has expired', async () => {
            const res = await this.pool.claimableReward({from: anon1});
            const amount = 1000 - this.stakePeriod2;
            expect(Number(res)).to.be.within(amount - 5, amount + 5);
        });
    });

    describe('endStake()', () => {
        it('claims the remainder after the stake period has expired', async () => {
            // Wait until the stake period has run out
            await advanceTimeAndBlock(500);

            const res = await this.pool.claimReward({from: anon1});
            expect(res.receipt.status).to.be.true;
            this.stakePeriod3 = this.period1End - this.t2;
            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq((this.stakePeriod3).toString());
            await expect(this.foodToken.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq((1000 - this.stakePeriod2 - this.stakePeriod3).toString());
        });
        it('returns the stats so far', async () => {
            const res = await this.pool.getRewardsStats({from: anon1});
            expect(res.claimableRewards).to.equal('0');
            expect(res.rewardsPaid).to.equal((this.stakePeriod2 + this.stakePeriod3).toString());
            expect(res.rewardRate).to.equal('1');
            expect(res.totalRewardsPaid).to.equal((this.stakePeriod2 + this.stakePeriod3).toString());
        });
        it('unstakes (& withdraws) after the stake period has expired', async () => {
            const res = await this.pool.endStakeAndWithdraw(10, {from: anon1});
            expect(res.receipt.status).to.be.true;
            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq(('0').toString());
            await expect(this.foodToken.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq((1000 - this.stakePeriod2 - this.stakePeriod3).toString());
            await expect(this.foodTokenLP.balanceOf(anon1)).to.eventually.be.a.bignumber.eq('10');
            await expect(this.foodTokenLP.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq('0');
        });
        it('claims after a new stake period has been created', async () => {
            // Deposit & stake LP tokens again before we create a new period
            await this.foodTokenLP.approve(this.pool.address, 10, {from: anon1});
            await this.pool.depositAndStartStake(10, {from: anon1});

            await advanceTimeAndBlock(1500);
            const latestBlock = await web3.eth.getBlock('latest');
            const start = latestBlock.timestamp;
            const end = start + 1000;
            await this.foodToken.approve(this.pool.address, 1000, {from: dao});
            await this.pool.newRewardPeriod(1000, start, end, {from: dao});
            const t0 = (await web3.eth.getBlock('latest')).timestamp;
            expect((await this.pool.rewardPeriods(1)).totalStaked).to.be.a.bignumber.eq('10');

            // Wait some time
            await advanceTimeAndBlock(100);

            // Claim rewards for the previous and current period
            const res1 = await this.pool.claimReward({from: anon1});
            const t1 = (await web3.eth.getBlock('latest')).timestamp;
            expect(res1.receipt.status).to.be.true;
            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq((t1 - t0).toString());
            await expect(this.foodToken.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq((1000 - this.stakePeriod2 - this.stakePeriod3 + 1000 - (t1 - t0)).toString());

            // Wait some time
            await advanceTimeAndBlock(200);

            // Claim for the current period
            const res2 = await this.pool.claimReward({from: anon1});
            const t2 = (await web3.eth.getBlock('latest')).timestamp;
            expect(res2.receipt.status).to.be.true;
            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq((t2 - t0).toString());
            await expect(this.foodToken.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq((1000 - this.stakePeriod2 - this.stakePeriod3 + 1000 - (t2 - t0)).toString());

            // Wait some time
            await advanceTimeAndBlock(400);

            // Unstake
            const res3 = await this.pool.endStakeAndWithdraw(10, {from: anon1});
            const t3 = (await web3.eth.getBlock('latest')).timestamp;
            expect(res3.receipt.status).to.be.true;
            await expect(this.foodTokenLP.balanceOf(anon1)).to.eventually.be.a.bignumber.eq('10');
            await expect(this.foodTokenLP.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq('0');
            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq((t3 - t0).toString());
            await expect(this.foodToken.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq((1000 - this.stakePeriod2 - this.stakePeriod3 + 1000 - (t3 - t0)).toString());
        });
        it("rewards overlapping equal stakes correctly", async () => {
            await advanceTimeAndBlock(1500);

            // Reward phase
            let latestBlock = await web3.eth.getBlock('latest');
            let start = latestBlock.timestamp;
            let end = start + 1000;
            await this.foodToken.approve(this.pool.address, 1000, {from: dao});
            await this.pool.newRewardPeriod(1000, start, end, {from: dao});

            // User actions
            await this.foodTokenLP.approve(this.pool.address, 10, {from: anon1});
            await this.foodTokenLP.approve(this.pool.address, 20, {from: anon2});
            await this.foodTokenLP.approve(this.pool.address, 30, {from: anon3});
            await this.pool.depositAndStartStake(10, {from: anon1});
            await this.pool.depositAndStartStake(10, {from: anon2});
            await this.pool.depositAndStartStake(10, {from: anon3});

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(33, 33 * 1.1);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(66, 66 * 1.1);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(66, 66 * 1.1);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(99, 99 * 1.1);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(132, 132 * 1.1);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(132, 132 * 1.1);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(165, 165 * 1.1);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await this.pool.claimReward({from: anon3});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(198, 198 * 1.1);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(198, 198 * 1.1);
            await expect((await this.foodToken.balanceOf(anon3)).toNumber()).to.be.within(198, 198 * 1.1);
        });
        it('claims the remainder after a new stake period has been created', async () => {
            await advanceTimeAndBlock(1500);

            // Reward phase
            let latestBlock = await web3.eth.getBlock('latest');
            let start = latestBlock.timestamp
            let end = start + 1000;
            await this.foodToken.approve(this.pool.address, 1000, {from: dao});
            await this.pool.newRewardPeriod(1000, start, end, {from: dao});

            await advanceTimeAndBlock(2); // For safety

            // User actions
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await this.pool.claimReward({from: anon3});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(132 / 1.1, 132);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(132 / 1.1, 132);
            await expect((await this.foodToken.balanceOf(anon3)).toNumber()).to.be.within(132 / 1.1, 132);
            this.t0 = (await web3.eth.getBlock('latest')).timestamp;
        });
        it("rewards overlapping different stakes correctly", async () => {
            // anon1 already has 10 in total
            await this.pool.depositAndStartStake(10, {from: anon2}); // now has 20 in total
            await this.pool.depositAndStartStake(20, {from: anon3}); // now has 30 in total

            // Wait some time
            await advanceTimeAndBlock(100);
            const t1 = (await web3.eth.getBlock('latest')).timestamp;
            const time = t1 - this.t0;

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await this.pool.claimReward({from: anon3});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(time / 6 / 1.1, time / 6 * 1.2);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(time / 6 * 2 / 1.1, time / 6 * 2 * 1.2);
            await expect((await this.foodToken.balanceOf(anon3)).toNumber()).to.be.within(time / 6 * 3 / 1.1, time / 6 * 3 * 1.2);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await this.pool.claimReward({from: anon3});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(200 / 6 / 1.1, 200 / 6 * 1.1);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(200 / 6 * 2 / 1.1, 200 / 6 * 2 * 1.1);
            await expect((await this.foodToken.balanceOf(anon3)).toNumber()).to.be.within(200 / 6 * 3 / 1.1, 200 / 6 * 3 * 1.1);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await this.pool.claimReward({from: anon3});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(300 / 6 / 1.1, 300 / 6 * 1.1);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(300 / 6 * 2 / 1.1, 300 / 6 * 2 * 1.1);
            await expect((await this.foodToken.balanceOf(anon3)).toNumber()).to.be.within(300 / 6 * 3 / 1.1, 300 / 6 * 3 * 1.1);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await this.pool.claimReward({from: anon3});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(400 / 6 / 1.1, 400 / 6 * 1.1);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(400 / 6 * 2 / 1.1, 400 / 6 * 2 * 1.1);
            await expect((await this.foodToken.balanceOf(anon3)).toNumber()).to.be.within(400 / 6 * 3 / 1.1, 400 / 6 * 3 * 1.1);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await this.pool.claimReward({from: anon3});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(500 / 6 / 1.1, 500 / 6 * 1.1);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(500 / 6 * 2 / 1.1, 500 / 6 * 2 * 1.1);
            await expect((await this.foodToken.balanceOf(anon3)).toNumber()).to.be.within(500 / 6 * 3 / 1.1, 500 / 6 * 3 * 1.1);

            // Wait some time
            await advanceTimeAndBlock(100);

            // Get stake reward so far
            await this.pool.claimReward({from: anon1});
            await this.pool.claimReward({from: anon2});
            await this.pool.claimReward({from: anon3});
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(600 / 6 / 1.1, 600 / 6 * 1.1);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(600 / 6 * 2 / 1.1, 600 / 6 * 2 * 1.1);
            await expect((await this.foodToken.balanceOf(anon3)).toNumber()).to.be.within(600 / 6 * 3 / 1.1, 600 / 6 * 3 * 1.1);
        });
        it('unstakes after a new stake period has been created', async () => {
            await advanceTimeAndBlock(1500);

            // Reward phase
            let latestBlock = await web3.eth.getBlock('latest');
            let start = latestBlock.timestamp
            let end = start + 1000;
            await this.foodToken.approve(this.pool.address, 1000, {from: dao});
            await this.pool.newRewardPeriod(1000, start, end, {from: dao});

            await advanceTimeAndBlock(2); // For safety

            // User actions
            await this.pool.endStakeAndWithdraw(10, {from: anon1});
            await this.pool.endStakeAndWithdraw(20, {from: anon2});
            await this.pool.endStakeAndWithdraw(30, {from: anon3});
            await expect(this.foodTokenLP.balanceOf(anon1)).to.eventually.be.a.bignumber.eq('10');
            await expect(this.foodTokenLP.balanceOf(anon2)).to.eventually.be.a.bignumber.eq('20');
            await expect(this.foodTokenLP.balanceOf(anon3)).to.eventually.be.a.bignumber.eq('30');
            await expect(this.foodTokenLP.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq('0');
            await expect((await this.foodToken.balanceOf(anon1)).toNumber()).to.be.within(400 / 6 / 1.2, 400 / 6 * 1.2);
            await expect((await this.foodToken.balanceOf(anon2)).toNumber()).to.be.within(400 / 6 * 2 / 1.2, 400 / 6 * 2 * 1.2);
            await expect((await this.foodToken.balanceOf(anon3)).toNumber()).to.be.within(400 / 6 * 3 / 1.2, 400 / 6 * 3 * 1.2);
        });
    });

    describe('withdrawReward()', () => {
        before(async () => {
            await advanceTimeAndBlock(10000);
            const latestBlock = await web3.eth.getBlock('latest')
            const start = latestBlock.timestamp
            const end = start + 1000;
            await this.foodToken.approve(this.pool.address, 10, { from: dao });
            await this.pool.newRewardPeriod(10, start, end, { from: dao });
        });
        it('denies anonymous to withdraw', async () => {
            await expect(this.pool.withdrawReward(10)).to.eventually.be.rejectedWith('Only DAO can execute');
        });
        it('allows DAO to withdraw', async () => {
            const poolBalanceBefore = await this.foodToken.balanceOf(this.pool.address);
            const daoBalanceBefore = await this.foodToken.balanceOf(dao);
            const res = await this.pool.withdrawReward(10, { from: dao });
            expect(res.receipt.status).to.be.true;
            const poolBalanceAfter = await this.foodToken.balanceOf(this.pool.address);
            const daoBalanceAfter = await this.foodToken.balanceOf(dao);
            expect(poolBalanceAfter).to.be.a.bignumber.that.equals(poolBalanceBefore.sub(new BN('10')));
            expect(daoBalanceAfter).to.be.a.bignumber.that.equals(daoBalanceBefore.add(new BN('10')));
        });
    });
});
