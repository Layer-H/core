import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { ZERO_ADDRESS } from '../../helpers/constants';
import { ERRORS } from '../../helpers/errors';
import {
  FIRST_PROFILE_ID,
  governance,
  healthHub,
  makeSuiteCleanRoom,
  MOCK_FOLLOW_NFT_URI,
  MOCK_PROFILE_HANDLE,
  MOCK_PROFILE_URI,
  MOCK_URI,
  revertCollectModule,
  userAddress,
  userTwo,
  userTwoAddress,
} from '../../__setup.spec';

makeSuiteCleanRoom('Revert Collect Module', function () {
  beforeEach(async function () {
    await expect(
      healthHub.createProfile({
        to: userAddress,
        handle: MOCK_PROFILE_HANDLE,
        imageURI: MOCK_PROFILE_URI,
        followModule: ZERO_ADDRESS,
        followModuleInitData: [],
        followNFTURI: MOCK_FOLLOW_NFT_URI,
      })
    ).to.not.be.reverted;
    await expect(
      healthHub.connect(governance).whitelistCollectModule(revertCollectModule.address, true)
    ).to.not.be.reverted;
    await expect(
      healthHub.post({
        H_profileId: FIRST_PROFILE_ID,
        contentURI: MOCK_URI,
        collectModule: revertCollectModule.address,
        collectModuleInitData: [],
        referenceModule: ZERO_ADDRESS,
        referenceModuleInitData: [],
      })
    ).to.not.be.reverted;
  });

  context('Collecting', function () {
    it('UserTwo should fail to collect without following', async function () {
      await expect(healthHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, [])).to.be.revertedWith(
        ERRORS.COLLECT_NOT_ALLOWED
      );
    });

    it('UserTwo should mirror the original post, fail to collect from their mirror without following the original profile', async function () {
      const secondH_ProfileId = FIRST_PROFILE_ID + 1;
      await expect(
        healthHub.connect(userTwo).createProfile({
          to: userTwoAddress,
          handle: 'usertwo',
          imageURI: MOCK_PROFILE_URI,
          followModule: ZERO_ADDRESS,
          followModuleInitData: [],
          followNFTURI: MOCK_FOLLOW_NFT_URI,
        })
      ).to.not.be.reverted;
      await expect(
        healthHub.connect(userTwo).mirror({
          H_profileId: secondH_ProfileId,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(healthHub.connect(userTwo).collect(secondH_ProfileId, 1, [])).to.be.revertedWith(
        ERRORS.COLLECT_NOT_ALLOWED
      );
    });

    it('UserTwo should fail to collect while following', async function () {
      await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      await expect(healthHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, [])).to.be.revertedWith(
        ERRORS.COLLECT_NOT_ALLOWED
      );
    });

    it('UserTwo should mirror the original post, fail to collect from their mirror while following the original profile', async function () {
      const secondH_ProfileId = FIRST_PROFILE_ID + 1;
      await expect(
        healthHub.connect(userTwo).createProfile({
          to: userTwoAddress,
          handle: 'usertwo',
          imageURI: MOCK_PROFILE_URI,
          followModule: ZERO_ADDRESS,
          followModuleInitData: [],
          followNFTURI: MOCK_FOLLOW_NFT_URI,
        })
      ).to.not.be.reverted;
      await expect(
        healthHub.connect(userTwo).mirror({
          H_profileId: secondH_ProfileId,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      await expect(healthHub.connect(userTwo).collect(secondH_ProfileId, 1, [])).to.be.revertedWith(
        ERRORS.COLLECT_NOT_ALLOWED
      );
    });
  });
});
