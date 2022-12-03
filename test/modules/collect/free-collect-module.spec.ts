import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { ZERO_ADDRESS } from '../../helpers/constants';
import { ERRORS } from '../../helpers/errors';
import {
  approvalFollowModule,
  freeCollectModule,
  FIRST_PROFILE_ID,
  governance,
  healthHub,
  makeSuiteCleanRoom,
  MOCK_FOLLOW_NFT_URI,
  MOCK_PROFILE_HANDLE,
  MOCK_PROFILE_URI,
  MOCK_URI,
  user,
  userAddress,
  userTwo,
  userTwoAddress,
  abiCoder,
} from '../../__setup.spec';

makeSuiteCleanRoom('Free Collect Module', function () {
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
      healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
    ).to.not.be.reverted;
  });

  context('Negatives', function () {
    context('Collecting', function () {
      it('UserTwo should fail to collect without following without any follow module set', async function () {
        await expect(
          healthHub.post({
            H_profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: freeCollectModule.address,
            collectModuleInitData: abiCoder.encode(['bool'], [true]),
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
        await expect(healthHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, [])).to.be.revertedWith(
          ERRORS.FOLLOW_INVALID
        );
      });

      it('UserTwo should actuate the original post, fail to collect from their actuate without following the original profile', async function () {
        await expect(
          healthHub.post({
            H_profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: freeCollectModule.address,
            collectModuleInitData: abiCoder.encode(['bool'], [true]),
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
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
          healthHub.connect(userTwo).actuate({
            H_profileId: secondH_ProfileId,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;

        await expect(healthHub.connect(userTwo).collect(secondH_ProfileId, 1, [])).to.be.revertedWith(
          ERRORS.FOLLOW_INVALID
        );
      });
    });
  });

  context('Scenarios', function () {
    it('User should post with the free collect module as the collect module and data, allowing non-followers to collect, user two collects without following', async function () {
      await expect(
        healthHub.post({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [false]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      await expect(healthHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, [])).to.not.be.reverted;
    });

    it('UserTwo should collect with success when following if the configuration only allows followers', async function () {
      await expect(
        healthHub.post({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [true]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      await expect(healthHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, [])).to.not.be.reverted;
    });

    it('UserTwo should collect with success when following according the follow module set', async function () {
      await expect(
        healthHub.post({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [true]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      await expect(
        healthHub.connect(governance).whitelistFollowModule(approvalFollowModule.address, true)
      ).to.not.be.reverted;
      await expect(
        healthHub.setFollowModule(FIRST_PROFILE_ID, approvalFollowModule.address, [])
      ).to.not.be.reverted;
      await expect(
        approvalFollowModule.connect(user).approve(FIRST_PROFILE_ID, [userTwoAddress], [true])
      ).to.not.be.reverted;
      await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      await expect(healthHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, [])).to.not.be.reverted;
    });

    it('UserTwo should actuate the original post, collect with success from their actuate when following the original profile which has no follow module set', async function () {
      await expect(
        healthHub.post({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [true]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      const secondH_ProfileId = FIRST_PROFILE_ID + 1;
      await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
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
        healthHub.connect(userTwo).actuate({
          H_profileId: secondH_ProfileId,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(healthHub.connect(userTwo).collect(secondH_ProfileId, 1, [])).to.not.be.reverted;
    });
  });
});
