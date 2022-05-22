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
            await this.foodToken.approve(this.pool.address, 1000, { from: dao });
            await this.pool.newRewardPeriod(1000, start, end, { from: dao });
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
            const res3 = await this.pool.endStakeAndWithdraw(10, { from: anon1 });
            const t3 = (await web3.eth.getBlock('latest')).timestamp;
            expect(res3.receipt.status).to.be.true;
            await expect(this.foodTokenLP.balanceOf(anon1)).to.eventually.be.a.bignumber.eq('10');
            await expect(this.foodTokenLP.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq('0');
            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq((t3 - t0).toString());
            await expect(this.foodToken.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq((1000 - this.stakePeriod2 - this.stakePeriod3 + 1000 - (t3 - t0)).toString());
        });
        it.skip('stakes, claims & unstakes a few times with multiple users', async () => {
            // Deposit LP tokens to stake
            await this.foodTokenLP.approve(this.pool.address, 10, { from: anon1 });
            await this.foodTokenLP.approve(this.pool.address, 20, { from: anon2 });
            await this.foodTokenLP.approve(this.pool.address, 30, { from: anon3 });
            await this.pool.depositAndStartStake(10, { from: anon1 });
            await this.pool.depositAndStartStake(20, { from: anon2 });
            await this.pool.depositAndStartStake(30, { from: anon3 });

            await advanceTimeAndBlock(200);
            const res1 = await this.pool.claimReward({ from: anon1 });
            const res2 = await this.pool.claimReward({ from: anon2 });
            const res3 = await this.pool.claimReward({ from: anon3 });

            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq(('0').toString());
            await expect(this.foodToken.balanceOf(anon2)).to.eventually.be.a.bignumber.eq(('0').toString());
            await expect(this.foodToken.balanceOf(anon3)).to.eventually.be.a.bignumber.eq(('0').toString());
        });
        it.skip('it returns the reward yet to be claimed', async () => {
            // Deposit LP tokens to stake
            await this.foodTokenLP.approve(this.pool.address, 10, { from: anon1 });
            await this.pool.depositAndStartStake(10, { from: anon1 });

            // Wait
            const t0 = (await web3.eth.getBlock('latest')).timestamp;
            await advanceTimeAndBlock(200);
            const t1 = (await web3.eth.getBlock('latest')).timestamp;

            // Get stake reward so far
            const stakePeriod1 = t1 - t0;
            const stakeReward1 = (await this.pool.claimableReward({ from: anon1 })).toNumber();
            expect(stakeReward1).to.equal(stakePeriod1, 'Invalid stake reward amount');

            // Wait some more but subtract 5 secs to avoid race condition
            await advanceTimeAndBlock(800 - 5);
            const t2 = (await web3.eth.getBlock('latest')).timestamp;

            // Get stake reward so far
            const stakePeriod2 = t2 - t0;
            const stakeReward2 = (await this.pool.claimableReward({ from: anon1 })).toNumber();
            expect(stakeReward2).to.equal(stakePeriod2, 'Invalid stake reward amount');

            await this.pool.endStakeAndWithdraw(10, { from: anon1 });
            // currentPoolBalance = (await this.foodToken.balanceOf(this.pool.address)).toNumber();
            await expect(this.foodToken.balanceOf(anon1)).to.eventually.be.a.bignumber.eq(stakeReward2.toString());
            await expect(this.foodToken.balanceOf(this.pool.address)).to.eventually.be.a.bignumber.eq((1000 - stakeReward2).toString());
        });
        it.skip('distributes the full reward over the entire reward period', async () => {
            // Start a new reward period of 1 week with a reward of 5 tokens per per second for 7 days => 3,024,000 tokens
            await advanceTimeAndBlock(1000);
            const secs = 7 * 24 * 60 * 60;
            const reward = 5 * secs;

            const latestBlock = await web3.eth.getBlock('latest');
            const start = latestBlock.timestamp;
            const end = start + secs;

            await this.foodToken.approve(this.pool.address, reward, { from: dao });
            await this.pool.newRewardPeriod(reward, start, end, { from: dao });

            // const contractRewards = (await this.foodToken.balanceOf(this.pool.address)).toNumber();
            const rewardBalanceBefore = (await this.foodToken.balanceOf(anon1)).toString();
            // console.log('---rewardBalanceBefore', rewardBalanceBefore, contractRewards);

            // Stake LP tokens
            await this.foodTokenLP.approve(this.pool.address, 10, { from: anon1 });
            await this.pool.depositAndStartStake(10, { from: anon1 });

            // Wait some more but subtract 5 secs to avoid race condition
            await advanceTimeAndBlock(secs - 5);

            // End stake
            // console.log('---balanceOf', (await this.foodToken.balanceOf(anon1)).toNumber());
            // console.log(currentPoolBalance, (await this.foodToken.balanceOf(this.pool.address)).toNumber());
            await this.pool.endStake(10, { from: anon1 });

            const rewardBalanceAfter = (await this.foodToken.balanceOf(anon1)).toString();
            const rewardEarned = rewardBalanceAfter - rewardBalanceBefore;
            // console.log(currentPoolBalance, (await this.foodToken.balanceOf(this.pool.address)).toNumber(), rewardEarned, reward);
            // console.log('---balanceOf', (await this.foodToken.balanceOf(anon1)).toNumber());

            expect(rewardEarned / reward).to.be.within(0.9999, 1, 'Reward earned should equal the contract reward for this period');
        });
        it.skip('distributes the full reward to a single stake in a given period', async () => {
            await advanceTimeAndBlock(1000);
            // Deposit LP tokens to stake
            // const stakeAmount = 10
            // await this.foodTokenLP.approve(this.pool.address, stakeAmount, { from: anon1 })
            // await this.pool.deposit(stakeAmount, { from: anon1 })

            // Start a new reward period of 1000 seconds with a reward of 2 tokens per per second for 1000 days => 2,000 tokens
            const period = 1000;
            const rewardRate = 2;
            const reward = rewardRate * period;

            const latestBlock = await web3.eth.getBlock('latest');
            const start = latestBlock.timestamp;
            const end = start + period;

            await this.foodToken.approve(this.pool.address, reward, { from: dao });
            await this.pool.newRewardPeriod(reward, start, end, { from: dao });

            const rewardBalanceBefore = (await this.foodToken.balanceOf(anon1)).toString();

            // Wait
            await advanceTimeAndBlock(500);

            // Stake LP tokens
            await this.pool.startStake(10, { from: anon1 });
            const t0 = (await web3.eth.getBlock('latest')).timestamp;

            // Wait some more
            await advanceTimeAndBlock(200);

            // End stake
            await this.pool.endStake(10, { from: anon1 });
            const t1 = (await web3.eth.getBlock('latest')).timestamp;

            // Verify reward earned
            const rewardBalanceAfter = (await this.foodToken.balanceOf(anon1)).toString();
            const rewardEarned = rewardBalanceAfter - rewardBalanceBefore;
            const stakeInterval = t1 - t0;
            const expectedReward = rewardRate * stakeInterval;

            expect(rewardEarned).to.equal(expectedReward, 'Incorrect reward earned');
        });
        it.skip('distributes 2 overlapping stakes proportionally to the amount of tokens staked', async () => {
            await advanceTimeAndBlock(1000);
            // Deposit LP tokens
            const stake1Amount = 10;
            // await this.foodTokenLP.approve(this.pool.address, stake1Amount, { from: anon1 });
            // await this.pool.deposit(stake1Amount, { from: anon1 });

            const stake2Amount = 20;
            await this.foodTokenLP.approve(this.pool.address, stake2Amount, { from: anon2 });
            await this.pool.deposit(stake2Amount, { from: anon2 });

            // start a new reward period of 1000s .
            // reward: 1 token per second => 1000 tokens
            const period = 1000;
            const reward = period;

            const latestBlock = await web3.eth.getBlock('latest');
            const start = latestBlock.timestamp;
            const end = start + period;

            await this.foodToken.approve(this.pool.address, reward, { from: dao });
            await this.pool.newRewardPeriod(reward, start, end, { from: dao });

            // wait some time
            await advanceTimeAndBlock(100);

            // stake LP tokens
            await this.pool.startStake(stake1Amount, { from: anon1 });
            await this.pool.startStake(stake2Amount, { from: anon2 });

            // wait some time
            await advanceTimeAndBlock(100);

            const rewardBalance1Before = (await this.foodToken.balanceOf(anon1)).toString();
            const rewardBalance2Before = (await this.foodToken.balanceOf(anon2)).toString();

            // end stakes
            await this.pool.endStake(1, { from: anon1 });
            await this.pool.endStake(1, { from: anon2 });

            const rewardBalance1After = (await this.foodToken.balanceOf(anon1)).toString()
            const rewardBalance2After = (await this.foodToken.balanceOf(anon2)).toString()

            const rewardEarned1 = rewardBalance1After - rewardBalance1Before
            const rewardEarned2 = rewardBalance2After - rewardBalance2Before

            expect(rewardEarned2 / rewardEarned1).to.equal(2, 'Reward earned by account2 should be double that of account1');
        });
        it.skip('The reward of 2 non overlapping stakes of the same duration and different amounts should be the same', async () => {
            // deplosit LP tokens
            const stake1Amount = 10
            await this.foodTokenLP.approve(this.pool.address, stake1Amount, { from: anon1 })
            await this.pool.deposit(stake1Amount, { from: anon1 })

            const stake2Amount = 20
            await this.foodTokenLP.approve(this.pool.address, stake2Amount, { from: anon2 })
            await this.pool.deposit(stake2Amount, { from: anon2 })

            // start a new reward period of 1000 seconds
            // reward: 1 token per second => 1000 tokens
            const period = 1000
            const reward = 1 * period

            await this.foodToken.approve(this.pool.address, reward, { from: dao });

            const latestBlock = await web3.eth.getBlock('latest')
            const start = latestBlock.timestamp
            const end = start + period

            await this.pool.newRewardPeriod(reward, start, end, { from: dao });

            // get reward token balance before staking starts
            const rewardBalance1Before = (await this.foodToken.balanceOf(anon1)).toString()
            const rewardBalance2Before = (await this.foodToken.balanceOf(anon2)).toString()

            // start account 1 stake
            await this.pool.startStake(stake1Amount, { from: anon1 })

            // wait 50s
            await advanceTimeAndBlock(50);

            // start account 2 stake
            await this.pool.startStake(stake2Amount, { from: anon2 })

            // end account 2 stake
            await this.pool.endStake(stake1Amount, { from: anon1 })

            // wait 50s
            await advanceTimeAndBlock(50);

            // end second stake
            await this.pool.endStake(stake2Amount, { from: anon2 })

            const rewardBalance1After = (await this.foodToken.balanceOf(anon1)).toString()
            const rewardBalance2After = (await this.foodToken.balanceOf(anon2)).toString()

            const rewardEarned1 = rewardBalance1After - rewardBalance1Before
            const rewardEarned2 = rewardBalance2After - rewardBalance2Before

            expect(rewardEarned2 / rewardEarned1).to.equal(1, 'Reward earned by account1 should be the same as that of account2');
        });
        it.skip('The rewards for 2 non overlapping stakes of the same amount, should be proportional to the time the tokens were staked', async () => {
            // deplosit lp tokens
            const stake1Amount = 10
            await this.foodTokenLP.approve(this.pool.address, stake1Amount, {from: anon1})
            await this.pool.deposit(stake1Amount, {from: anon1})

            const stake2Amount = 10
            await this.foodTokenLP.approve(this.pool.address, stake2Amount, {from: anon2})
            await this.pool.deposit(stake2Amount, {from: anon2})

            // start a new reward period of 7 days
            // reward: 5 tokens per per second for 7 days => 3,024,000 tokens
            const period = 1000
            const reward = 1 * period

            await this.foodToken.approve(this.pool.address, reward, { from: dao });

            const latestBlock = await web3.eth.getBlock('latest')
            const start = latestBlock.timestamp
            const end = start + period

            await this.pool.newRewardPeriod(reward, start, end, { from: dao });

            // reward balances before staking
            const rewardBalance1Before = (await this.foodToken.balanceOf(anon1)).toString()
            const rewardBalance2Before = (await this.foodToken.balanceOf(anon2)).toString()


            // start 1st stake
            await advanceTimeAndBlock(30);
            await this.pool.startStake(stake1Amount, {from: anon1})

            // end 1st stake after 100
            const stake1Interval = 100
            await advanceTimeAndBlock(stake1Interval);
            await this.pool.endStake(stake1Amount, {from: anon1})

            // wait 50
            await advanceTimeAndBlock(50);

            // start 2nd stake
            await this.pool.startStake(stake2Amount, {from: anon2})

            // end 2nd stake after 200
            const stake2Interval = 200
            await advanceTimeAndBlock(stake2Interval);
            await this.pool.endStake(stake2Amount, {from: anon2})

            // get reward balance after
            const rewardBalance1After = (await this.foodToken.balanceOf(anon1)).toString()
            const rewardBalance2After = (await this.foodToken.balanceOf(anon2)).toString()

            const rewardEarned1 = rewardBalance1After - rewardBalance1Before
            const rewardEarned2 = rewardBalance2After - rewardBalance2Before

            expect(rewardEarned2 / rewardEarned1).to.equal(stake2Interval / stake1Interval, 'Reward earned by account1 should be double that of account2');
        });
        it.skip('The reward of several stakes from 2 accounts should be proportional to the amount and time of the tokens staked', async () => {
            // deplosit lp tokens
            const stake = 100
            const stake1Amount = 1 * stake
            await this.foodTokenLP.approve(this.pool.address, stake1Amount, { from: anon1 })
            await this.pool.deposit(stake1Amount, { from: anon1 })

            const stake2Amount = 3 * stake
            await this.foodTokenLP.approve(this.pool.address, stake2Amount, { from: anon2 })
            await this.pool.deposit(stake2Amount, { from: anon2 })

            const rewardBalance1Before = (await this.foodToken.balanceOf(anon1)).toString()
            const rewardBalance2Before = (await this.foodToken.balanceOf(anon2)).toString()

            // start a new reward period of 10 days of 100 seconds
            const day = 100
            const rewardPerdiod = 20 * day
            const reward = 1 * rewardPerdiod

            await this.foodToken.approve(this.pool.address, reward, { from: dao });

            const latestBlock = await web3.eth.getBlock('latest')
            const start = latestBlock.timestamp
            const end = start + rewardPerdiod

            // day 0
            await this.pool.newRewardPeriod(reward, start, end, { from: dao });

            // day 1
            await this.pool.startStake(stake1Amount, { from: anon1 })   // STAKE 1

            const ts1s = (await web3.eth.getBlock('latest')).timestamp
            await advanceTimeAndBlock(day);
            const ts1e = (await web3.eth.getBlock('latest')).timestamp

            const reward1Day1 = (await this.pool.claimableReward({ from: anon1 })).toNumber()
            const expected1Day1 = (ts1e - ts1s)
            expect(reward1Day1).to.equal(expected1Day1, 'Incorrect day 1 reward for account 1');

            // day 2
            await this.pool.startStake(stake2Amount, { from: anon2 })    // STAKE 2

            const ts2s = (await web3.eth.getBlock('latest')).timestamp
            await advanceTimeAndBlock(day);
            const ts2e = (await web3.eth.getBlock('latest')).timestamp

            const reward1Day2 = (await this.pool.claimableReward({ from: anon1 })).toNumber()
            const expected1Day2 = Math.floor((ts2s - ts1s) / 1) + Math.floor((ts2e - ts2s) * 1 / 4)
            expect(reward1Day2).to.equal(expected1Day2, 'Incorrect day 2 reward for account 1');

            const reward2Day2 = (await this.pool.claimableReward({ from: anon2 })).toNumber()
            const expected2Day2 = Math.floor((ts2e - ts2s) * 3 / 4)
            expect(reward2Day2).to.equal(expected2Day2, 'Incorrect day 2 reward for account 2');

            // day 3
            await advanceTimeAndBlock(day);

            await this.pool.endStake(stake, { from: anon1 })      // END STAKE 1
            const ts3e1 = (await web3.eth.getBlock('latest')).timestamp
            await this.pool.endStake(stake, { from: anon2 })      // END STAKE 2
            const ts3e2 = (await web3.eth.getBlock('latest')).timestamp

            const claimable1Day3 = (await this.pool.claimableReward({ from: anon1 })).toNumber()
            const claimable2Day3 = (await this.pool.claimableReward({ from: anon2 })).toNumber()

            expect(claimable1Day3).to.equal(0, 'Account 1 should not have any reward to claim after ending stake');
            expect(claimable2Day3).to.equal(0, 'Account 2 should not have any reward to claim after ending stake');

            const rewardBalance1After = (await this.foodToken.balanceOf(anon1)).toString()
            const rewardBalance2After = (await this.foodToken.balanceOf(anon2)).toString()
            const rewardEarned1 = rewardBalance1After - rewardBalance1Before
            const rewardEarned2 = rewardBalance2After - rewardBalance2Before
            const totalRewardDistributed = rewardEarned1 + rewardEarned2

            // caclulate expected total reward received by account1 and account2
            const expected1Day3 = Math.floor((ts2s - ts1s)) + Math.floor((ts3e1 - ts2s) * 1 / 4 )
            const expected2Day3 = Math.floor((ts3e2 - ts2s) * 3 / 4)

            expect(rewardEarned1).to.equal(expected1Day3, 'Incorrect reward receved by account 1');
            expect(rewardEarned2).to.equal(expected2Day3, 'Incorrect reward receved by account 2');

            const expectedRewardDistributed = (ts3e2 - ts1s)
            expect(Math.abs(totalRewardDistributed - expectedRewardDistributed) <= 1).to.be.true('Incorrect total reward distributed');
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
