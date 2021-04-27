import { expect, assert } from "chai";
import { advanceBlockTo, advanceBlock, prepare, deploy, getBigNumber, ADDRESS_ZERO } from "./utilities"

// COPIED AND MODIFIED from SushiSwap
// https://github.com/sushiswap/sushiswap/blob/master/test/MasterChefV2.test.ts
// commit hash e409abb8dc7de6b0b1dcd60c81ea2651e54b4dd9
//
// Removed mcv1 chef => means only mcv2 pools so no need to div expected rewards by 2
// SEE: chefv2.sushiPerBlock modification

describe("ChefV2", function() {
  before(async function() {
    await prepare(this, ['ERC20AccessControlMock', 'ERC20Mock', 'ChefV2', 'RewarderMock', 'RewarderBrokenMock'])
    await deploy(this, [
      ["brokenRewarder", this.RewarderBrokenMock]
    ])
  })

  beforeEach(async function() {
    await deploy(this, [
      ["sushi", this.ERC20AccessControlMock],
    ])

    await deploy(this,
      [["lp", this.ERC20Mock, ["LP Token", "LPT", getBigNumber(10)]],
      ["dummy", this.ERC20Mock, ["Dummy", "DummyT", getBigNumber(10)]],
        // ['chef', this.MasterChef, [this.sushi.address, this.bob.address, getBigNumber(100), "0", "0"]]
      ])

    //await this.sushi.transferOwnership(this.chef.address)
    //await this.chef.add(100, this.lp.address, true)
    //await this.chef.add(100, this.dummy.address, true)
    //await this.lp.approve(this.chef.address, getBigNumber(10))
    //await this.chef.deposit(0, getBigNumber(10))

    await deploy(this, [
      ['chef2', this.ChefV2, [this.sushi.address]],
      ["rlp", this.ERC20Mock, ["LP", "rLPT", getBigNumber(10)]],
      ["r", this.ERC20Mock, ["Reward", "RewardT", getBigNumber(100000)]],
    ])
    await deploy(this, [["rewarder", this.RewarderMock, [getBigNumber(1), this.r.address]]])
    //await this.dummy.approve(this.chef2.address, getBigNumber(10))
    // await this.chef2.init(this.dummy.address)
    await this.sushi.mint(this.chef2.address, getBigNumber(1000000))
    await this.rlp.transfer(this.bob.address, getBigNumber(1))
  })

  describe("PoolLength", function() {
    it("PoolLength should execute", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      expect((await this.chef2.poolLength())).to.be.equal(1);
    })
  })

  describe("Set", function() {
    it("Should emit event LogSetPool", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await expect(this.chef2.set(0, 10, this.dummy.address, false))
        .to.emit(this.chef2, "LogSetPool")
        .withArgs(0, 10, this.rewarder.address, false)
      await expect(this.chef2.set(0, 10, this.dummy.address, true))
        .to.emit(this.chef2, "LogSetPool")
        .withArgs(0, 10, this.dummy.address, true)
    })

    it("Should revert if invalid pool", async function() {
      let err;
      try {
        await this.chef2.set(0, 10, this.rewarder.address, false)
      } catch (e) {
        err = e;
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("PendingSushi", function() {
    it("PendingSushi should equal ExpectedSushi", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      let log = await this.chef2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      let log2 = await this.chef2.updatePool(0)
      await advanceBlock()
      let expectedSushi = getBigNumber(100).mul(log2.blockNumber + 1 - log.blockNumber) // XXX: Don't have an original MCV1 anymore with 2 pools on beforeEach ... don't divide by 2: .div(2)
      let pendingSushi = await this.chef2.pendingSushi(0, this.alice.address)
      expect(pendingSushi).to.be.equal(expectedSushi)
    })
    it("When block is lastRewardBlock", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      let log = await this.chef2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlockTo(3)
      let log2 = await this.chef2.updatePool(0)
      let expectedSushi = getBigNumber(100).mul(log2.blockNumber - log.blockNumber) //.div(2)
      let pendingSushi = await this.chef2.pendingSushi(0, this.alice.address)
      expect(pendingSushi).to.be.equal(expectedSushi)
    })
  })

  describe("MassUpdatePools", function() {
    it("Should call updatePool", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await advanceBlockTo(1)
      await this.chef2.massUpdatePools([0])
      //expect('updatePool').to.be.calledOnContract(); //not suported by heardhat
      //expect('updatePool').to.be.calledOnContractWith(0); //not suported by heardhat

    })

    it("Updating invalid pools should fail", async function() {
      let err;
      try {
        await this.chef2.massUpdatePools([0, 10000, 100000])
      } catch (e) {
        err = e;
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("Add", function() {
    it("Should add pool with reward token multiplier", async function() {
      await expect(this.chef2.add(10, this.rlp.address, this.rewarder.address))
        .to.emit(this.chef2, "LogPoolAddition")
        .withArgs(0, 10, this.rlp.address, this.rewarder.address)
    })
  })

  describe("UpdatePool", function() {
    it("Should emit event LogUpdatePool", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await advanceBlockTo(1)
      await expect(this.chef2.updatePool(0))
        .to.emit(this.chef2, "LogUpdatePool")
        .withArgs(0, (await this.chef2.poolInfo(0)).lastRewardBlock,
          (await this.rlp.balanceOf(this.chef2.address)),
          (await this.chef2.poolInfo(0)).accSushiPerShare)
    })

    it("Should take else path", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await advanceBlockTo(1)
      await this.chef2.batch(
        [
          this.chef2.interface.encodeFunctionData("updatePool", [0]),
          this.chef2.interface.encodeFunctionData("updatePool", [0]),
        ],
        true
      )
    })
  })

  describe("Deposit", function() {
    it("Depositing 0 amount", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      await expect(this.chef2.deposit(0, getBigNumber(0), this.alice.address))
        .to.emit(this.chef2, "Deposit")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })

    it("Depositing into non-existent pool should fail", async function() {
      let err;
      try {
        await this.chef2.deposit(1001, getBigNumber(0), this.alice.address)
      } catch (e) {
        err = e;
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("Withdraw", function() {
    it("Withdraw 0 amount", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await expect(this.chef2.withdraw(0, getBigNumber(0), this.alice.address))
        .to.emit(this.chef2, "Withdraw")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })
  })

  describe("Harvest", function() {
    it("Should give back the correct amount of SUSHI and reward", async function() {
      await this.r.transfer(this.rewarder.address, getBigNumber(100000))
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      expect(await this.chef2.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.chef2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlockTo(20)
      //await this.chef2.harvestFromMasterChef()
      let log2 = await this.chef2.withdraw(0, getBigNumber(1), this.alice.address)
      let expectedSushi = getBigNumber(100).mul(log2.blockNumber - log.blockNumber) //.div(2)
      console.log('expectedSushi: ', expectedSushi)
      expect((await this.chef2.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedSushi)
      console.log('alice rewardDebt: ', await this.chef2.userInfo(0, this.alice.address))
      await this.chef2.harvest(0, this.alice.address)
      expect(await this.sushi.balanceOf(this.alice.address)).to.be.equal(await this.r.balanceOf(this.alice.address)).to.be.equal(expectedSushi)
    })
    it("Harvest with empty user balance", async function() {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await this.chef2.harvest(0, this.alice.address)
    })

    it("Harvest for SUSHI-only pool", async function() {
      await this.chef2.add(10, this.rlp.address, ADDRESS_ZERO)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      expect(await this.chef2.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.chef2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      // await this.chef2.harvestFromMasterChef()
      let log2 = await this.chef2.withdraw(0, getBigNumber(1), this.alice.address)
      let expectedSushi = getBigNumber(100).mul(log2.blockNumber - log.blockNumber)//.div(2)
      expect((await this.chef2.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedSushi)
      await this.chef2.harvest(0, this.alice.address)
      expect(await this.sushi.balanceOf(this.alice.address)).to.be.equal(expectedSushi)
    })
  })

  describe("EmergencyWithdraw", function() {
    it("Should emit event EmergencyWithdraw", async function() {
      await this.r.transfer(this.rewarder.address, getBigNumber(100000))
      await this.chef2.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      await this.chef2.deposit(0, getBigNumber(1), this.bob.address)
      //await this.chef2.emergencyWithdraw(0, this.alice.address)
      await expect(this.chef2.connect(this.bob).emergencyWithdraw(0, this.bob.address))
        .to.emit(this.chef2, "EmergencyWithdraw")
        .withArgs(this.bob.address, 0, getBigNumber(1), this.bob.address)
    })
  })
})
