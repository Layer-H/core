import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { FollowNFT__factory } from '../../../typechain-types';
import { ZERO_ADDRESS } from '../../helpers/constants';
import { ERRORS } from '../../helpers/errors';
import { getTimestamp, matchEvent, waitForTx } from '../../helpers/utils';
import {
  freeCollectModule,
  FIRST_PROFILE_ID,
  followerOnlyReferenceModule,
  governance,
  healthHub,
  makeSuiteCleanRoom,
  MOCK_FOLLOW_NFT_URI,
  MOCK_PROFILE_HANDLE,
  MOCK_PROFILE_URI,
  MOCK_URI,
  user,
  userAddress,
  userThreeAddress,
  userTwo,
  userTwoAddress,
  abiCoder,
} from '../../__setup.spec';

makeSuiteCleanRoom('Follower Only Reference Module', function () {
  const SECOND_PROFILE_ID = FIRST_PROFILE_ID + 1;

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
      healthHub.createProfile({
        to: userTwoAddress,
        handle: 'user2',
        imageURI: MOCK_PROFILE_URI,
        followModule: ZERO_ADDRESS,
        followModuleInitData: [],
        followNFTURI: MOCK_FOLLOW_NFT_URI,
      })
    ).to.not.be.reverted;
    await expect(
      healthHub
        .connect(governance)
        .whitelistReferenceModule(followerOnlyReferenceModule.address, true)
    ).to.not.be.reverted;
    await expect(
      healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
    ).to.not.be.reverted;
    await expect(
      healthHub.post({
        H_profileId: FIRST_PROFILE_ID,
        contentURI: MOCK_URI,
        collectModule: freeCollectModule.address,
        collectModuleInitData: abiCoder.encode(['bool'], [true]),
        referenceModule: followerOnlyReferenceModule.address,
        referenceModuleInitData: [],
      })
    ).to.not.be.reverted;
  });

  context('Negatives', function () {
    // We don't need a `publishing` or `initialization` context because initialization never reverts in the FollowerOnlyReferenceModule.
    context('Commenting', function () {
      it('Commenting should fail if commenter is not a follower and follow NFT not yet deployed', async function () {
        await expect(
          healthHub.connect(userTwo).comment({
            H_profileId: SECOND_PROFILE_ID,
            contentURI: MOCK_URI,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            collectModule: freeCollectModule.address,
            collectModuleInitData: abiCoder.encode(['bool'], [true]),
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
      });

      it('Commenting should fail if commenter follows, then transfers the follow NFT before attempting to comment', async function () {
        await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(
          followNFT.connect(userTwo).transferFrom(userTwoAddress, userThreeAddress, 1)
        ).to.not.be.reverted;

        await expect(
          healthHub.connect(userTwo).comment({
            H_profileId: SECOND_PROFILE_ID,
            contentURI: MOCK_URI,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            collectModule: freeCollectModule.address,
            collectModuleInitData: abiCoder.encode(['bool'], [true]),
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
      });
    });

    context('Mirroring', function () {
      it('Mirroring should fail if mirrorer is not a follower and follow NFT not yet deployed', async function () {
        await expect(
          healthHub.connect(userTwo).mirror({
            H_profileId: SECOND_PROFILE_ID,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
      });

      it('Mirroring should fail if mirrorer follows, then transfers the follow NFT before attempting to mirror', async function () {
        await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(
          followNFT.connect(userTwo).transferFrom(userTwoAddress, userAddress, 1)
        ).to.not.be.reverted;

        await expect(
          healthHub.connect(userTwo).mirror({
            H_profileId: SECOND_PROFILE_ID,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
      });
    });
  });

  context('Scenarios', function () {
    context('Publishing', function () {
      it('Posting with follower only reference module as reference module should emit expected events', async function () {
        const tx = healthHub.post({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [true]),
          referenceModule: followerOnlyReferenceModule.address,
          referenceModuleInitData: [],
        });
        const receipt = await waitForTx(tx);

        expect(receipt.logs.length).to.eq(1);
        matchEvent(receipt, 'PostCreated', [
          FIRST_PROFILE_ID,
          2,
          MOCK_URI,
          freeCollectModule.address,
          abiCoder.encode(['bool'], [true]),
          followerOnlyReferenceModule.address,
          [],
          await getTimestamp(),
        ]);
      });
    });

    context('Commenting', function () {
      it('Commenting should work if the commenter is a follower', async function () {
        await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(
          healthHub.connect(userTwo).comment({
            H_profileId: SECOND_PROFILE_ID,
            contentURI: MOCK_URI,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            collectModule: freeCollectModule.address,
            collectModuleInitData: abiCoder.encode(['bool'], [true]),
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });

      it('Commenting should work if the commenter is the prescription owner and he is following himself', async function () {
        await expect(healthHub.follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(
          healthHub.comment({
            H_profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            collectModule: freeCollectModule.address,
            collectModuleInitData: abiCoder.encode(['bool'], [true]),
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });

      it('Commenting should work if the commenter is the prescription owner even when he is not following himself and follow NFT was not deployed', async function () {
        await expect(
          healthHub.comment({
            H_profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            collectModule: freeCollectModule.address,
            collectModuleInitData: abiCoder.encode(['bool'], [true]),
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });

      it('Commenting should work if the commenter is the prescription owner even when he is not following himself and follow NFT was deployed', async function () {
        await expect(healthHub.follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(followNFT.transferFrom(userAddress, userTwoAddress, 1)).to.not.be.reverted;

        await expect(
          healthHub.comment({
            H_profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            collectModule: freeCollectModule.address,
            collectModuleInitData: abiCoder.encode(['bool'], [true]),
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });

      it('Commenting should work if the commenter follows, transfers the follow NFT then receives it back before attempting to comment', async function () {
        await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(
          followNFT.connect(userTwo).transferFrom(userTwoAddress, userAddress, 1)
        ).to.not.be.reverted;

        await expect(followNFT.transferFrom(userAddress, userTwoAddress, 1)).to.not.be.reverted;

        await expect(
          healthHub.connect(userTwo).comment({
            H_profileId: SECOND_PROFILE_ID,
            contentURI: MOCK_URI,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            collectModule: freeCollectModule.address,
            collectModuleInitData: abiCoder.encode(['bool'], [true]),
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });
    });

    context('Mirroring', function () {
      it('Mirroring should work if mirrorer is a follower', async function () {
        await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(
          healthHub.connect(userTwo).mirror({
            H_profileId: SECOND_PROFILE_ID,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });

      it('Mirroring should work if mirrorer follows, transfers the follow NFT then receives it back before attempting to mirror', async function () {
        await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(
          followNFT.connect(userTwo).transferFrom(userTwoAddress, userAddress, 1)
        ).to.not.be.reverted;

        await expect(followNFT.transferFrom(userAddress, userTwoAddress, 1)).to.not.be.reverted;

        await expect(
          healthHub.connect(userTwo).mirror({
            H_profileId: SECOND_PROFILE_ID,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });

      it('Mirroring should work if the mirrorer is the prescription owner and he is following himself', async function () {
        await expect(healthHub.follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(
          healthHub.mirror({
            H_profileId: FIRST_PROFILE_ID,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });

      it('Mirroring should work if the mirrorer is the prescription owner even when he is not following himself and follow NFT was not deployed', async function () {
        await expect(
          healthHub.mirror({
            H_profileId: FIRST_PROFILE_ID,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });

      it('Mirroring should work if the mirrorer is the prescription owner even when he is not following himself and follow NFT was deployed', async function () {
        await expect(healthHub.follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        const followNFT = FollowNFT__factory.connect(
          await healthHub.getFollowNFT(FIRST_PROFILE_ID),
          user
        );

        await expect(followNFT.transferFrom(userAddress, userTwoAddress, 1)).to.not.be.reverted;

        await expect(
          healthHub.mirror({
            H_profileId: FIRST_PROFILE_ID,
            H_profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
      });
    });
  });
});
