import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils';
import { FollowNFT__factory, UIDataProvider__factory } from '../../typechain-types';
import { MAX_UINT256, ZERO_ADDRESS } from '../helpers/constants';
import { ERRORS } from '../helpers/errors';
import {
  getDecodedSvgImage,
  getMetadataFromBase64TokenUri,
  getSetProfileMetadataURIWithSigParts,
  getTimestamp,
  getToggleFollowWithSigParts,
  loadTestResourceAsUtf8String,
  matchEvent,
  waitForTx,
} from '../helpers/utils';
import {
  approvalFollowModule,
  deployer,
  freeCollectModule,
  FIRST_PROFILE_ID,
  followerOnlyReferenceModule,
  governance,
  governanceAddress,
  healthHub,
  makeSuiteCleanRoom,
  mockFollowModule,
  mockModuleData,
  MOCK_FOLLOW_NFT_URI,
  MOCK_PROFILE_HANDLE,
  MOCK_PROFILE_URI,
  MOCK_URI,
  moduleGlobals,
  OTHER_MOCK_URI,
  timedFeeCollectModule,
  treasuryAddress,
  TREASURY_FEE_BPS,
  user,
  userAddress,
  userTwo,
  userTwoAddress,
  abiCoder,
  userThree,
  testWallet,
  healthPeriphery,
  followNFTImpl,
  collectNFTImpl,
} from '../__setup.spec';

/**
 * @dev Some of these tests may be redundant, but are still present to ensure an isolated environment,
 * in particular if other test files are changed.
 */
makeSuiteCleanRoom('Misc', function () {
  context('NFT Transfer Emitters', function () {
    it('User should not be able to call the follow NFT transfer event emitter function', async function () {
      await expect(
        healthHub.emitFollowNFTTransferEvent(FIRST_PROFILE_ID, 1, userAddress, userTwoAddress)
      ).to.be.revertedWith(ERRORS.NOT_FOLLOW_NFT);
    });

    it('User should not be able to call the collect NFT transfer event emitter function', async function () {
      await expect(
        healthHub.emitCollectNFTTransferEvent(FIRST_PROFILE_ID, 1, 1, userAddress, userTwoAddress)
      ).to.be.revertedWith(ERRORS.NOT_COLLECT_NFT);
    });
  });

  context('Health Hub Misc', function () {
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
    });

    it('UserTwo should fail to burn profile owned by user without being approved', async function () {
      await expect(healthHub.connect(userTwo).burn(FIRST_PROFILE_ID)).to.be.revertedWith(
        ERRORS.NOT_OWNER_OR_APPROVED
      );
    });

    it('User should burn profile owned by user', async function () {
      await expect(healthHub.burn(FIRST_PROFILE_ID)).to.not.be.reverted;
    });

    it('UserTwo should burn profile owned by user if approved', async function () {
      await expect(healthHub.approve(userTwoAddress, FIRST_PROFILE_ID)).to.not.be.reverted;
      await expect(healthHub.connect(userTwo).burn(FIRST_PROFILE_ID)).to.not.be.reverted;
    });

    it('Governance getter should return proper address', async function () {
      expect(await healthHub.getGovernance()).to.eq(governanceAddress);
    });

    it('Profile handle getter should return the correct handle', async function () {
      expect(await healthHub.getHandle(FIRST_PROFILE_ID)).to.eq(MOCK_PROFILE_HANDLE);
    });

    it('Profile dispatcher getter should return the zero address when no dispatcher is set', async function () {
      expect(await healthHub.getDispatcher(FIRST_PROFILE_ID)).to.eq(ZERO_ADDRESS);
    });

    it('Profile creator whitelist getter should return expected values', async function () {
      expect(await healthHub.isProfileCreatorWhitelisted(userAddress)).to.eq(true);
      await expect(
        healthHub.connect(governance).whitelistProfileCreator(userAddress, false)
      ).to.not.be.reverted;
      expect(await healthHub.isProfileCreatorWhitelisted(userAddress)).to.eq(false);
    });

    it('Profile dispatcher getter should return the correct dispatcher address when it is set, then zero after it is transferred', async function () {
      await expect(healthHub.setDispatcher(FIRST_PROFILE_ID, userTwoAddress)).to.not.be.reverted;
      expect(await healthHub.getDispatcher(FIRST_PROFILE_ID)).to.eq(userTwoAddress);

      await expect(
        healthHub.transferFrom(userAddress, userTwoAddress, FIRST_PROFILE_ID)
      ).to.not.be.reverted;
      expect(await healthHub.getDispatcher(FIRST_PROFILE_ID)).to.eq(ZERO_ADDRESS);
    });

    it('Profile follow NFT getter should return the zero address before the first follow, then the correct address afterwards', async function () {
      expect(await healthHub.getFollowNFT(FIRST_PROFILE_ID)).to.eq(ZERO_ADDRESS);

      await expect(healthHub.follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

      expect(await healthHub.getFollowNFT(FIRST_PROFILE_ID)).to.not.eq(ZERO_ADDRESS);
    });

    it('Profile follow module getter should return the zero address, then the correct follow module after it is set', async function () {
      expect(await healthHub.getFollowModule(FIRST_PROFILE_ID)).to.eq(ZERO_ADDRESS);

      await expect(
        healthHub.connect(governance).whitelistFollowModule(mockFollowModule.address, true)
      ).to.not.be.reverted;

      await expect(
        healthHub.setFollowModule(FIRST_PROFILE_ID, mockFollowModule.address, mockModuleData)
      ).to.not.be.reverted;
      expect(await healthHub.getFollowModule(FIRST_PROFILE_ID)).to.eq(mockFollowModule.address);
    });

    it('Profile prescription count getter should return zero, then the correct amount after some prescriptions', async function () {
      expect(await healthHub.getPubCount(FIRST_PROFILE_ID)).to.eq(0);

      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

      const expectedCount = 5;
      for (let i = 0; i < expectedCount; i++) {
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
      }
      expect(await healthHub.getPubCount(FIRST_PROFILE_ID)).to.eq(expectedCount);
    });

    it('Follow NFT impl getter should return the correct address', async function () {
      expect(await healthHub.getFollowNFTImpl()).to.eq(followNFTImpl.address);
    });

    it('Collect NFT impl getter should return the correct address', async function () {
      expect(await healthHub.getCollectNFTImpl()).to.eq(collectNFTImpl.address);
    });

    it('Profile tokenURI should return the accurate URI', async function () {
      const tokenUri = await healthHub.tokenURI(FIRST_PROFILE_ID);
      const metadata = await getMetadataFromBase64TokenUri(tokenUri);
      expect(metadata.name).to.eq(`@${MOCK_PROFILE_HANDLE}`);
      expect(metadata.description).to.eq(`@${MOCK_PROFILE_HANDLE} - Health profile`);
      const expectedAttributes = [
        { trait_type: 'id', value: `#${FIRST_PROFILE_ID.toString()}` },
        { trait_type: 'followers', value: '0' },
        { trait_type: 'owner', value: userAddress.toLowerCase() },
        { trait_type: 'handle', value: `@${MOCK_PROFILE_HANDLE}` },
      ];
      expect(metadata.attributes).to.eql(expectedAttributes);
      const actualSvg = await getDecodedSvgImage(metadata);
      const expectedSvg = loadTestResourceAsUtf8String('profile-token-uri-images/mock-profile.svg');
      expect(actualSvg).to.eq(expectedSvg);
    });

    it('Publication reference module getter should return the correct reference module (or zero in case of no reference module)', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

      await expect(
        healthHub
          .connect(governance)
          .whitelistReferenceModule(followerOnlyReferenceModule.address, true)
      ).to.not.be.reverted;

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
      expect(await healthHub.getReferenceModule(FIRST_PROFILE_ID, 1)).to.eq(ZERO_ADDRESS);

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
      expect(await healthHub.getReferenceModule(FIRST_PROFILE_ID, 2)).to.eq(
        followerOnlyReferenceModule.address
      );
    });

    it('Publication pointer getter should return an empty pointer for posts', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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

      const pointer = await healthHub.getPubPointer(FIRST_PROFILE_ID, 1);
      expect(pointer[0]).to.eq(0);
      expect(pointer[1]).to.eq(0);
    });

    it('Publication pointer getter should return the correct pointer for comments', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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

      const pointer = await healthHub.getPubPointer(FIRST_PROFILE_ID, 2);
      expect(pointer[0]).to.eq(FIRST_PROFILE_ID);
      expect(pointer[1]).to.eq(1);
    });

    it('Publication pointer getter should return the correct pointer for actuates', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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
        healthHub.actuate({
          H_profileId: FIRST_PROFILE_ID,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      const pointer = await healthHub.getPubPointer(FIRST_PROFILE_ID, 2);
      expect(pointer[0]).to.eq(FIRST_PROFILE_ID);
      expect(pointer[1]).to.eq(1);
    });

    it('Publication content URI getter should return the correct URI for posts', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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

      expect(await healthHub.getContentURI(FIRST_PROFILE_ID, 1)).to.eq(MOCK_URI);
    });

    it('Publication content URI getter should return the correct URI for comments', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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
        healthHub.comment({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: OTHER_MOCK_URI,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [true]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      expect(await healthHub.getContentURI(FIRST_PROFILE_ID, 2)).to.eq(OTHER_MOCK_URI);
    });

    it('Publication content URI getter should return the correct URI for actuates', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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
        healthHub.actuate({
          H_profileId: FIRST_PROFILE_ID,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      expect(await healthHub.getContentURI(FIRST_PROFILE_ID, 2)).to.eq(MOCK_URI);
    });

    it('Publication collect module getter should return the correct collectModule for posts', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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

      expect(await healthHub.getCollectModule(FIRST_PROFILE_ID, 1)).to.eq(freeCollectModule.address);
    });

    it('Publication collect module getter should return the correct collectModule for comments', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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
        healthHub.actuate({
          H_profileId: FIRST_PROFILE_ID,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(
        healthHub.comment({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: OTHER_MOCK_URI,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 2,
          referenceModuleData: [],
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [true]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      expect(await healthHub.getCollectModule(FIRST_PROFILE_ID, 3)).to.eq(freeCollectModule.address);
    });

    it('Publication collect module getter should return the zero address for actuates', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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
        healthHub.actuate({
          H_profileId: FIRST_PROFILE_ID,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      expect(await healthHub.getCollectModule(FIRST_PROFILE_ID, 2)).to.eq(ZERO_ADDRESS);
    });

    it('Publication type getter should return the correct prescription type for all prescription types, or nonexistent', async function () {
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

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
        healthHub.comment({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: OTHER_MOCK_URI,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [true]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(
        healthHub.actuate({
          H_profileId: FIRST_PROFILE_ID,
          H_profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      expect(await healthHub.getPubType(FIRST_PROFILE_ID, 1)).to.eq(0);
      expect(await healthHub.getPubType(FIRST_PROFILE_ID, 2)).to.eq(1);
      expect(await healthHub.getPubType(FIRST_PROFILE_ID, 3)).to.eq(2);
      expect(await healthHub.getPubType(FIRST_PROFILE_ID, 4)).to.eq(3);
    });

    it('Profile getter should return accurate profile parameters', async function () {
      const fetchedProfile = await healthHub.getProfile(FIRST_PROFILE_ID);
      expect(fetchedProfile.pubCount).to.eq(0);
      expect(fetchedProfile.handle).to.eq(MOCK_PROFILE_HANDLE);
      expect(fetchedProfile.followModule).to.eq(ZERO_ADDRESS);
      expect(fetchedProfile.followNFT).to.eq(ZERO_ADDRESS);
    });
  });

  context('Follow Module Misc', function () {
    beforeEach(async function () {
      await expect(
        healthHub.connect(governance).whitelistFollowModule(approvalFollowModule.address, true)
      ).to.not.be.reverted;

      await expect(
        healthHub.createProfile({
          to: userAddress,
          handle: MOCK_PROFILE_HANDLE,
          imageURI: MOCK_PROFILE_URI,
          followModule: approvalFollowModule.address,
          followModuleInitData: [],
          followNFTURI: MOCK_FOLLOW_NFT_URI,
        })
      ).to.not.be.reverted;
    });

    it('User should fail to call processFollow directly on a follow module inheriting from the FollowValidatorFollowModuleBase', async function () {
      await expect(approvalFollowModule.processFollow(ZERO_ADDRESS, 0, [])).to.be.revertedWith(
        ERRORS.NOT_HUB
      );
    });

    it('Follow module following check when there are no follows, and thus no deployed Follow NFT should return false', async function () {
      expect(
        await approvalFollowModule.isFollowing(FIRST_PROFILE_ID, userTwoAddress, 0)
      ).to.be.false;
    });

    it('Follow module following check with zero ID input should return false after another address follows, but not the queried address', async function () {
      await expect(
        approvalFollowModule.connect(user).approve(FIRST_PROFILE_ID, [userAddress], [true])
      ).to.not.be.reverted;
      await expect(healthHub.follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

      expect(
        await approvalFollowModule.isFollowing(FIRST_PROFILE_ID, userTwoAddress, 0)
      ).to.be.false;
    });

    it('Follow module following check with specific ID input should revert after following, but the specific ID does not exist yet', async function () {
      await expect(
        approvalFollowModule.connect(user).approve(FIRST_PROFILE_ID, [userAddress], [true])
      ).to.not.be.reverted;
      await expect(healthHub.follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

      await expect(
        approvalFollowModule.isFollowing(FIRST_PROFILE_ID, userAddress, 2)
      ).to.be.revertedWith(ERRORS.ERC721_QUERY_FOR_NONEXISTENT_TOKEN);
    });

    it('Follow module following check with specific ID input should return false if another address owns the specified follow NFT', async function () {
      await expect(
        approvalFollowModule.connect(user).approve(FIRST_PROFILE_ID, [userAddress], [true])
      ).to.not.be.reverted;
      await expect(healthHub.follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

      expect(
        await approvalFollowModule.isFollowing(FIRST_PROFILE_ID, userTwoAddress, 1)
      ).to.be.false;
    });

    it('Follow module following check with specific ID input should return true if the queried address owns the specified follow NFT', async function () {
      await expect(
        approvalFollowModule.connect(user).approve(FIRST_PROFILE_ID, [userAddress], [true])
      ).to.not.be.reverted;
      await expect(healthHub.follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;

      expect(await approvalFollowModule.isFollowing(FIRST_PROFILE_ID, userAddress, 1)).to.be.true;
    });
  });

  context('Collect Module Misc', function () {
    it('Should fail to call processCollect directly on a collect module inheriting from the FollowValidationModuleBase contract', async function () {
      await expect(
        timedFeeCollectModule.processCollect(0, ZERO_ADDRESS, 0, 0, [])
      ).to.be.revertedWith(ERRORS.NOT_HUB);
    });
  });

  context('Module Globals', function () {
    context('Negatives', function () {
      it('User should fail to set the governance address on the module globals', async function () {
        await expect(moduleGlobals.connect(user).setGovernance(ZERO_ADDRESS)).to.be.revertedWith(
          ERRORS.NOT_GOVERNANCE
        );
      });

      it('User should fail to set the treasury on the module globals', async function () {
        await expect(moduleGlobals.connect(user).setTreasury(ZERO_ADDRESS)).to.be.revertedWith(
          ERRORS.NOT_GOVERNANCE
        );
      });

      it('User should fail to set the treasury fee on the module globals', async function () {
        await expect(moduleGlobals.connect(user).setTreasuryFee(0)).to.be.revertedWith(
          ERRORS.NOT_GOVERNANCE
        );
      });
    });

    context('Scenarios', function () {
      it('Governance should set the governance address on the module globals', async function () {
        await expect(
          moduleGlobals.connect(governance).setGovernance(userAddress)
        ).to.not.be.reverted;
      });

      it('Governance should set the treasury on the module globals', async function () {
        await expect(moduleGlobals.connect(governance).setTreasury(userAddress)).to.not.be.reverted;
      });

      it('Governance should set the treasury fee on the module globals', async function () {
        await expect(moduleGlobals.connect(governance).setTreasuryFee(0)).to.not.be.reverted;
      });

      it('Governance should fail to whitelist the zero address as a currency', async function () {
        await expect(
          moduleGlobals.connect(governance).whitelistCurrency(ZERO_ADDRESS, true)
        ).to.be.revertedWith(ERRORS.INIT_PARAMS_INVALID);
      });

      it('Governance getter should return expected address', async function () {
        expect(await moduleGlobals.getGovernance()).to.eq(governanceAddress);
      });

      it('Treasury getter should return expected address', async function () {
        expect(await moduleGlobals.getTreasury()).to.eq(treasuryAddress);
      });

      it('Treasury fee getter should return the expected fee', async function () {
        expect(await moduleGlobals.getTreasuryFee()).to.eq(TREASURY_FEE_BPS);
      });
    });
  });

  context('UI Data Provider', function () {
    it('UI Data Provider should return expected values', async function () {
      // First, create a profile,
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

      // Then, whitelist a collect module
      await expect(
        healthHub.connect(governance).whitelistCollectModule(freeCollectModule.address, true)
      ).to.not.be.reverted;

      // Then, publish twice
      const firstURI = 'first prescription';
      const secondURI = 'second prescription';
      await expect(
        healthHub.post({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: firstURI,
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [true]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(
        healthHub.post({
          H_profileId: FIRST_PROFILE_ID,
          contentURI: secondURI,
          collectModule: freeCollectModule.address,
          collectModuleInitData: abiCoder.encode(['bool'], [true]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      // Then, deploy the data provider
      const healthPeriphery = await new UIDataProvider__factory(deployer).deploy(healthHub.address);

      // `getLatestDataByProfile`, validate the result from the data provider
      const resultByH_ProfileId = await healthPeriphery.getLatestDataByProfile(FIRST_PROFILE_ID);
      const pubByH_ProfileIdStruct = resultByH_ProfileId.prescriptionStruct;
      const profileByH_ProfileIdStruct = resultByH_ProfileId.profileStruct;

      expect(profileByH_ProfileIdStruct.pubCount).to.eq(2);
      expect(profileByH_ProfileIdStruct.followModule).to.eq(ZERO_ADDRESS);
      expect(profileByH_ProfileIdStruct.followNFT).to.eq(ZERO_ADDRESS);
      expect(profileByH_ProfileIdStruct.handle).to.eq(MOCK_PROFILE_HANDLE);
      expect(profileByH_ProfileIdStruct.imageURI).to.eq(MOCK_PROFILE_URI);
      expect(profileByH_ProfileIdStruct.followNFTURI).to.eq(MOCK_FOLLOW_NFT_URI);

      expect(pubByH_ProfileIdStruct.H_profileIdPointed).to.eq(0);
      expect(pubByH_ProfileIdStruct.pubIdPointed).to.eq(0);
      expect(pubByH_ProfileIdStruct.contentURI).to.eq(secondURI);
      expect(pubByH_ProfileIdStruct.referenceModule).to.eq(ZERO_ADDRESS);
      expect(pubByH_ProfileIdStruct.collectModule).to.eq(freeCollectModule.address);
      expect(pubByH_ProfileIdStruct.collectNFT).to.eq(ZERO_ADDRESS);

      // `getLatestDataByHandle`, validate the result from the data provider
      const resultByHandle = await healthPeriphery.getLatestDataByHandle(MOCK_PROFILE_HANDLE);
      const pubByHandleStruct = resultByHandle.prescriptionStruct;
      const profileByHandleStruct = resultByHandle.profileStruct;

      expect(profileByHandleStruct.pubCount).to.eq(2);
      expect(profileByHandleStruct.followModule).to.eq(ZERO_ADDRESS);
      expect(profileByHandleStruct.followNFT).to.eq(ZERO_ADDRESS);
      expect(profileByHandleStruct.handle).to.eq(MOCK_PROFILE_HANDLE);
      expect(profileByHandleStruct.imageURI).to.eq(MOCK_PROFILE_URI);
      expect(profileByHandleStruct.followNFTURI).to.eq(MOCK_FOLLOW_NFT_URI);

      expect(pubByHandleStruct.H_profileIdPointed).to.eq(0);
      expect(pubByHandleStruct.pubIdPointed).to.eq(0);
      expect(pubByHandleStruct.contentURI).to.eq(secondURI);
      expect(pubByHandleStruct.referenceModule).to.eq(ZERO_ADDRESS);
      expect(pubByHandleStruct.collectModule).to.eq(freeCollectModule.address);
      expect(pubByHandleStruct.collectNFT).to.eq(ZERO_ADDRESS);
    });
  });

  context('HealthPeriphery', async function () {
    context('ToggleFollowing', function () {
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
        await expect(healthHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
        await expect(
          healthHub.connect(userThree).follow([FIRST_PROFILE_ID], [[]])
        ).to.not.be.reverted;
        await expect(
          healthHub.connect(testWallet).follow([FIRST_PROFILE_ID], [[]])
        ).to.not.be.reverted;
      });

      context('Generic', function () {
        context('Negatives', function () {
          it('UserTwo should fail to toggle follow with an incorrect H_profileId', async function () {
            await expect(
              healthPeriphery.connect(userTwo).toggleFollow([FIRST_PROFILE_ID + 1], [true])
            ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
          });

          it('UserTwo should fail to toggle follow with array mismatch', async function () {
            await expect(
              healthPeriphery.connect(userTwo).toggleFollow([FIRST_PROFILE_ID, FIRST_PROFILE_ID], [])
            ).to.be.revertedWith(ERRORS.ARRAY_MISMATCH);
          });

          it('UserTwo should fail to toggle follow from a profile that has been burned', async function () {
            await expect(healthHub.burn(FIRST_PROFILE_ID)).to.not.be.reverted;
            await expect(
              healthPeriphery.connect(userTwo).toggleFollow([FIRST_PROFILE_ID], [true])
            ).to.be.revertedWith(ERRORS.TOKEN_DOES_NOT_EXIST);
          });

          it('UserTwo should fail to toggle follow for a followNFT that is not owned by them', async function () {
            const followNFTAddress = await healthHub.getFollowNFT(FIRST_PROFILE_ID);
            const followNFT = FollowNFT__factory.connect(followNFTAddress, user);

            await expect(
              followNFT.connect(userTwo).transferFrom(userTwoAddress, userAddress, 1)
            ).to.not.be.reverted;

            await expect(
              healthPeriphery.connect(userTwo).toggleFollow([FIRST_PROFILE_ID], [true])
            ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
          });
        });

        context('Scenarios', function () {
          it('UserTwo should toggle follow with true value, correct event should be emitted', async function () {
            const tx = healthPeriphery.connect(userTwo).toggleFollow([FIRST_PROFILE_ID], [true]);

            const receipt = await waitForTx(tx);

            expect(receipt.logs.length).to.eq(1);
            matchEvent(receipt, 'FollowsToggled', [
              userTwoAddress,
              [FIRST_PROFILE_ID],
              [true],
              await getTimestamp(),
            ]);
          });

          it('User should create another profile, userTwo follows, then toggles both, one true, one false, correct event should be emitted', async function () {
            await expect(
              healthHub.createProfile({
                to: userAddress,
                handle: 'otherhandle',
                imageURI: OTHER_MOCK_URI,
                followModule: ZERO_ADDRESS,
                followModuleInitData: [],
                followNFTURI: MOCK_FOLLOW_NFT_URI,
              })
            ).to.not.be.reverted;
            await expect(
              healthHub.connect(userTwo).follow([FIRST_PROFILE_ID + 1], [[]])
            ).to.not.be.reverted;

            const tx = healthPeriphery
              .connect(userTwo)
              .toggleFollow([FIRST_PROFILE_ID, FIRST_PROFILE_ID + 1], [true, false]);

            const receipt = await waitForTx(tx);

            expect(receipt.logs.length).to.eq(1);
            matchEvent(receipt, 'FollowsToggled', [
              userTwoAddress,
              [FIRST_PROFILE_ID, FIRST_PROFILE_ID + 1],
              [true, false],
              await getTimestamp(),
            ]);
          });

          it('UserTwo should toggle follow with false value, correct event should be emitted', async function () {
            const tx = healthPeriphery.connect(userTwo).toggleFollow([FIRST_PROFILE_ID], [false]);

            const receipt = await waitForTx(tx);

            expect(receipt.logs.length).to.eq(1);
            matchEvent(receipt, 'FollowsToggled', [
              userTwoAddress,
              [FIRST_PROFILE_ID],
              [false],
              await getTimestamp(),
            ]);
          });
        });
      });

      context('Meta-tx', function () {
        context('Negatives', function () {
          it('TestWallet should fail to toggle follow with sig with signature deadline mismatch', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();

            const { v, r, s } = await getToggleFollowWithSigParts(
              [FIRST_PROFILE_ID],
              [true],
              nonce,
              '0'
            );
            await expect(
              healthPeriphery.toggleFollowWithSig({
                follower: testWallet.address,
                H_profileIds: [FIRST_PROFILE_ID],
                enables: [true],
                sig: {
                  v,
                  r,
                  s,
                  deadline: MAX_UINT256,
                },
              })
            ).to.be.revertedWith(ERRORS.SIGNATURE_INVALID);
          });

          it('TestWallet should fail to toggle follow with sig with invalid deadline', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();

            const { v, r, s } = await getToggleFollowWithSigParts(
              [FIRST_PROFILE_ID],
              [true],
              nonce,
              '0'
            );
            await expect(
              healthPeriphery.toggleFollowWithSig({
                follower: testWallet.address,
                H_profileIds: [FIRST_PROFILE_ID],
                enables: [true],
                sig: {
                  v,
                  r,
                  s,
                  deadline: '0',
                },
              })
            ).to.be.revertedWith(ERRORS.SIGNATURE_EXPIRED);
          });

          it('TestWallet should fail to toggle follow with sig with invalid nonce', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();

            const { v, r, s } = await getToggleFollowWithSigParts(
              [FIRST_PROFILE_ID],
              [true],
              nonce + 1,
              MAX_UINT256
            );

            await expect(
              healthPeriphery.toggleFollowWithSig({
                follower: testWallet.address,
                H_profileIds: [FIRST_PROFILE_ID],
                enables: [true],
                sig: {
                  v,
                  r,
                  s,
                  deadline: MAX_UINT256,
                },
              })
            ).to.be.revertedWith(ERRORS.SIGNATURE_INVALID);
          });

          it('TestWallet should fail to toggle follow a nonexistent profile with sig', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();
            const INVALID_PROFILE = FIRST_PROFILE_ID + 1;
            const { v, r, s } = await getToggleFollowWithSigParts(
              [INVALID_PROFILE],
              [true],
              nonce,
              MAX_UINT256
            );
            await expect(
              healthPeriphery.toggleFollowWithSig({
                follower: testWallet.address,
                H_profileIds: [INVALID_PROFILE],
                enables: [true],
                sig: {
                  v,
                  r,
                  s,
                  deadline: MAX_UINT256,
                },
              })
            ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
          });
        });

        context('Scenarios', function () {
          it('TestWallet should toggle follow profile 1 to true with sig, correct event should be emitted ', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();

            const { v, r, s } = await getToggleFollowWithSigParts(
              [FIRST_PROFILE_ID],
              [true],
              nonce,
              MAX_UINT256
            );

            const tx = healthPeriphery.toggleFollowWithSig({
              follower: testWallet.address,
              H_profileIds: [FIRST_PROFILE_ID],
              enables: [true],
              sig: {
                v,
                r,
                s,
                deadline: MAX_UINT256,
              },
            });

            const receipt = await waitForTx(tx);

            expect(receipt.logs.length).to.eq(1);
            matchEvent(receipt, 'FollowsToggled', [
              testWallet.address,
              [FIRST_PROFILE_ID],
              [true],
              await getTimestamp(),
            ]);
          });

          it('TestWallet should toggle follow profile 1 to false with sig, correct event should be emitted ', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();

            const enabled = false;
            const { v, r, s } = await getToggleFollowWithSigParts(
              [FIRST_PROFILE_ID],
              [enabled],
              nonce,
              MAX_UINT256
            );

            const tx = healthPeriphery.toggleFollowWithSig({
              follower: testWallet.address,
              H_profileIds: [FIRST_PROFILE_ID],
              enables: [enabled],
              sig: {
                v,
                r,
                s,
                deadline: MAX_UINT256,
              },
            });

            const receipt = await waitForTx(tx);

            expect(receipt.logs.length).to.eq(1);
            matchEvent(receipt, 'FollowsToggled', [
              testWallet.address,
              [FIRST_PROFILE_ID],
              [enabled],
              await getTimestamp(),
            ]);
          });
        });
      });
    });

    context('Profile Metadata URI', function () {
      const MOCK_DATA = 'd171c8b1d364bb34553299ab686caa41ac7a2209d4a63e25947764080c4681da';

      context('Generic', function () {
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
        });

        context('Negatives', function () {
          it('User two should fail to set profile metadata URI for a profile that is not theirs while they are not the dispatcher', async function () {
            await expect(
              healthPeriphery.connect(userTwo).setProfileMetadataURI(FIRST_PROFILE_ID, MOCK_DATA)
            ).to.be.revertedWith(ERRORS.NOT_PROFILE_OWNER_OR_DISPATCHER);
          });
        });

        context('Scenarios', function () {
          it("User should set user two as dispatcher, user two should set profile metadata URI for user one's profile, fetched data should be accurate", async function () {
            await expect(
              healthHub.setDispatcher(FIRST_PROFILE_ID, userTwoAddress)
            ).to.not.be.reverted;
            await expect(
              healthPeriphery.connect(userTwo).setProfileMetadataURI(FIRST_PROFILE_ID, MOCK_DATA)
            ).to.not.be.reverted;

            expect(await healthPeriphery.getProfileMetadataURI(FIRST_PROFILE_ID)).to.eq(MOCK_DATA);
            expect(await healthPeriphery.getProfileMetadataURI(FIRST_PROFILE_ID)).to.eq(MOCK_DATA);
          });

          it('Setting profile metadata should emit the correct event', async function () {
            const tx = await waitForTx(
              healthPeriphery.setProfileMetadataURI(FIRST_PROFILE_ID, MOCK_DATA)
            );

            matchEvent(tx, 'ProfileMetadataSet', [
              FIRST_PROFILE_ID,
              MOCK_DATA,
              await getTimestamp(),
            ]);
          });

          it('Setting profile metadata via dispatcher should emit the correct event', async function () {
            await expect(
              healthHub.setDispatcher(FIRST_PROFILE_ID, userTwoAddress)
            ).to.not.be.reverted;

            const tx = await waitForTx(
              healthPeriphery.connect(userTwo).setProfileMetadataURI(FIRST_PROFILE_ID, MOCK_DATA)
            );

            matchEvent(tx, 'ProfileMetadataSet', [
              FIRST_PROFILE_ID,
              MOCK_DATA,
              await getTimestamp(),
            ]);
          });
        });
      });

      context('Meta-tx', async function () {
        beforeEach(async function () {
          await expect(
            healthHub.connect(testWallet).createProfile({
              to: testWallet.address,
              handle: MOCK_PROFILE_HANDLE,
              imageURI: MOCK_PROFILE_URI,
              followModule: ZERO_ADDRESS,
              followModuleInitData: [],
              followNFTURI: MOCK_FOLLOW_NFT_URI,
            })
          ).to.not.be.reverted;
        });

        context('Negatives', async function () {
          it('TestWallet should fail to set profile metadata URI with sig with signature deadline mismatch', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();

            const { v, r, s } = await getSetProfileMetadataURIWithSigParts(
              FIRST_PROFILE_ID,
              MOCK_DATA,
              nonce,
              '0'
            );
            await expect(
              healthPeriphery.setProfileMetadataURIWithSig({
                H_profileId: FIRST_PROFILE_ID,
                metadata: MOCK_DATA,
                sig: {
                  v,
                  r,
                  s,
                  deadline: MAX_UINT256,
                },
              })
            ).to.be.revertedWith(ERRORS.SIGNATURE_INVALID);
          });

          it('TestWallet should fail to set profile metadata URI with sig with invalid deadline', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();

            const { v, r, s } = await getSetProfileMetadataURIWithSigParts(
              FIRST_PROFILE_ID,
              MOCK_DATA,
              nonce,
              '0'
            );
            await expect(
              healthPeriphery.setProfileMetadataURIWithSig({
                H_profileId: FIRST_PROFILE_ID,
                metadata: MOCK_DATA,
                sig: {
                  v,
                  r,
                  s,
                  deadline: '0',
                },
              })
            ).to.be.revertedWith(ERRORS.SIGNATURE_EXPIRED);
          });

          it('TestWallet should fail to set profile metadata URI with sig with invalid nonce', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();

            const { v, r, s } = await getSetProfileMetadataURIWithSigParts(
              FIRST_PROFILE_ID,
              MOCK_DATA,
              nonce + 1,
              MAX_UINT256
            );
            await expect(
              healthPeriphery.setProfileMetadataURIWithSig({
                H_profileId: FIRST_PROFILE_ID,
                metadata: MOCK_DATA,
                sig: {
                  v,
                  r,
                  s,
                  deadline: MAX_UINT256,
                },
              })
            ).to.be.revertedWith(ERRORS.SIGNATURE_INVALID);
          });
        });

        context('Scenarios', function () {
          it('TestWallet should set profile metadata URI with sig, fetched data should be accurate and correct event should be emitted', async function () {
            const nonce = (await healthPeriphery.sigNonces(testWallet.address)).toNumber();

            const { v, r, s } = await getSetProfileMetadataURIWithSigParts(
              FIRST_PROFILE_ID,
              MOCK_DATA,
              nonce,
              MAX_UINT256
            );
            const tx = await waitForTx(
              healthPeriphery.setProfileMetadataURIWithSig({
                H_profileId: FIRST_PROFILE_ID,
                metadata: MOCK_DATA,
                sig: {
                  v,
                  r,
                  s,
                  deadline: MAX_UINT256,
                },
              })
            );

            expect(await healthPeriphery.getProfileMetadataURI(FIRST_PROFILE_ID)).to.eq(MOCK_DATA);
            expect(await healthPeriphery.getProfileMetadataURI(FIRST_PROFILE_ID)).to.eq(MOCK_DATA);

            matchEvent(tx, 'ProfileMetadataSet', [
              FIRST_PROFILE_ID,
              MOCK_DATA,
              await getTimestamp(),
            ]);
          });
        });
      });
    });
  });
});
