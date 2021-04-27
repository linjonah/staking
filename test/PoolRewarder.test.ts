import { expect } from 'chai'
import { prepare, deploy, getBigNumber, advanceBlock, advanceBlockTo } from "./utilities"


describe("PoolRewarder", function() {
  before(async function() {
    await prepare(this, ['ERC20AccessControlMock', 'ERC20Mock', 'ChefV2', 'PoolRewarder'])
  })

  beforeEach(async function() {
    // Deploy the reward token
    await deploy(this, [
      ['rewardToken', this.ERC20AccessControlMock],
    ])

    // Deploy base liquidity mining contract (chef) and mock LP tokens to
    // deposit into farms
    await deploy(this, [
      ['chef', this.ChefV2, [this.rewardToken.address]],
      ["rlp0", this.ERC20Mock, ["LP0", "rLP0T", getBigNumber(10)]],
      ["rlp1", this.ERC20Mock, ["LP1", "rLP1T", getBigNumber(10)]],
      ["rlp2", this.ERC20Mock, ["LP2", "rLP2T", getBigNumber(10)]],
      
      //create OVL token for trading fees
      ["rOVL", this.ERC20Mock, ["rOVL", "rOVLT", getBigNumber(100000)]]
    ])

    // Deploy pool rewarder to be called on each deposit/withdraw/harvest
    // on chef
    await deploy(this, [
      ['rewarder', this.PoolRewarder, [this.rewardToken.address, this.chef.address]]
    ])

    // Mint to chef for liquidity mining distribution
    await this.rewardToken.mint(this.chef.address, getBigNumber(1000000))

    // Add LP pools to be rewarded by chef
    await this.chef.add(10, this.rlp0.address, this.rewarder.address)
    await this.chef.add(10, this.rlp1.address, this.rewarder.address)
    await this.chef.add(20, this.rlp2.address, this.rewarder.address) // pool2
  })

  describe("Set", function() {
    it("Should set alloc points in pool rewarder", async function() {
      await this.rewarder.set(2, 10)
      expect(await this.rewarder.poolAllocPoint(2)).to.be.equal(10)
      expect(await this.rewarder.totalAllocPoint()).to.be.equal(10)
    })

    it("Should allow alloc points for multiple pools", async function() {
      await this.rewarder.set(2, 20)
      await this.rewarder.set(1, 10)
      expect(await this.rewarder.totalAllocPoint()).to.be.equal(30)
      expect(await this.rewarder.poolAllocPoint(2)).to.be.equal(20)
      expect(await this.rewarder.poolAllocPoint(1)).to.be.equal(10)
    })

    it("Update allocation points in pool rewarder", async function() {
      await this.rewarder.set(2, 20)
      await this.rewarder.set(1, 10)
      expect(await this.rewarder.totalAllocPoint()).to.be.equal(30)
      await this.rewarder.set(1, 15)
      expect(await this.rewarder.poolAllocPoint(1)).to.be.equal(15)
      expect(await this.rewarder.poolAllocPoint(2)).to.be.equal(20)
      expect(await this.rewarder.totalAllocPoint()).to.be.equal(35)
    })
  })

  describe("onSushiReward", function() {
    it("Should give back correct amount of additional trading fee rewards", async function() {
      await this.rewarder.set(0, 10)
      await this.rlp0.approve(this.chef.address, getBigNumber(10))
      expect(await this.chef.lpToken(0)).to.be.equal(this.rlp0.address)

      // simulate when user deposits LP token into pool
      let log = await this.chef.deposit(0, getBigNumber(2), this.alice.address)
      // console.log('this is alices token wallet before withdrawal', await this.rewardToken.balanceOf(this.alice.address))
      // simulate time passing, use advanceBlockTo() 
      await advanceBlockTo(20)

      // transfer OVL token to Rewards Contract
      // as trading fees from markets
      await this.rewardToken.mint(this.rewarder.address, getBigNumber(100))

      // simulate user withdrawing LP token from pool
      // user withdraws and harvests to trigger onSushiReward()
      await this.chef.withdrawAndHarvest(0, getBigNumber(1), this.alice.address)

      console.log('this is alices balance: ', (await this.chef.userInfo(0, this.alice.address)))
      // console.log('this is alices token wallet after withdrawal', await this.rewardToken.balanceOf(this.alice.address))

      // simulate trading fees given with onSushiReward() call 
      // from withdrawAndHarvest() function call above
      let expectedTradingFeesRewarded = this.rewardToken.balanceOf(this.rewarder.address).mul(getBigNumber(1)) / this.chef(this.rewarder.CHEF_V2).lpToken(0).balanceOf(this.rewader.CHEF_V2)
      // console.log('this is expected: ', expectedTradingFeesRewarded)


      console.log('this is PoolRewarder address: ', this.rewarder.address)

    })
  })

  describe("pendingTokens", function() {

  })
})
