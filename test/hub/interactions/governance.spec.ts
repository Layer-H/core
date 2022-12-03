import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { ERRORS } from '../../helpers/errors';
import { governance, healthHub, makeSuiteCleanRoom, userAddress } from '../../__setup.spec';

makeSuiteCleanRoom('Governance Functions', function () {
  context('Negatives', function () {
    it('User should not be able to call governance functions', async function () {
      await expect(healthHub.setGovernance(userAddress)).to.be.revertedWith(ERRORS.NOT_GOVERNANCE);
      await expect(healthHub.whitelistFollowModule(userAddress, true)).to.be.revertedWith(
        ERRORS.NOT_GOVERNANCE
      );
      await expect(healthHub.whitelistReferenceModule(userAddress, true)).to.be.revertedWith(
        ERRORS.NOT_GOVERNANCE
      );
      await expect(healthHub.whitelistCollectModule(userAddress, true)).to.be.revertedWith(
        ERRORS.NOT_GOVERNANCE
      );
    });
  });

  context('Scenarios', function () {
    it('Governance should successfully whitelist and unwhitelist modules', async function () {
      await expect(
        healthHub.connect(governance).whitelistFollowModule(userAddress, true)
      ).to.not.be.reverted;
      await expect(
        healthHub.connect(governance).whitelistReferenceModule(userAddress, true)
      ).to.not.be.reverted;
      await expect(
        healthHub.connect(governance).whitelistCollectModule(userAddress, true)
      ).to.not.be.reverted;
      expect(await healthHub.isFollowModuleWhitelisted(userAddress)).to.eq(true);
      expect(await healthHub.isReferenceModuleWhitelisted(userAddress)).to.eq(true);
      expect(await healthHub.isCollectModuleWhitelisted(userAddress)).to.eq(true);

      await expect(
        healthHub.connect(governance).whitelistFollowModule(userAddress, false)
      ).to.not.be.reverted;
      await expect(
        healthHub.connect(governance).whitelistReferenceModule(userAddress, false)
      ).to.not.be.reverted;
      await expect(
        healthHub.connect(governance).whitelistCollectModule(userAddress, false)
      ).to.not.be.reverted;
      expect(await healthHub.isFollowModuleWhitelisted(userAddress)).to.eq(false);
      expect(await healthHub.isReferenceModuleWhitelisted(userAddress)).to.eq(false);
      expect(await healthHub.isCollectModuleWhitelisted(userAddress)).to.eq(false);
    });

    it('Governance should successfully change the governance address', async function () {
      await expect(healthHub.connect(governance).setGovernance(userAddress)).to.not.be.reverted;
    });
  });
});
