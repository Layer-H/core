import '@nomiclabs/hardhat-ethers';
import { BigNumberish, Bytes, logger, utils, BigNumber, Contract, Signer } from 'ethers';
import {
  eventsLib,
  helper,
  healthHub,
  HEALTH_HUB_NFT_NAME,
  healthPeriphery,
  HEALTH_PERIPHERY_NAME,
  testWallet,
  user,
} from '../__setup.spec';
import { expect } from 'chai';
import { HARDHAT_CHAINID, MAX_UINT256 } from './constants';
import { BytesLike, hexlify, keccak256, RLP, toUtf8Bytes } from 'ethers/lib/utils';
import { HealthHub__factory } from '../../typechain-types';
import { TransactionReceipt, TransactionResponse } from '@ethersproject/providers';
import hre, { ethers } from 'hardhat';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CollectWithSigDataStruct,
  CommentDataStruct,
  CommentWithSigDataStruct,
  CreateProfileDataStruct,
  FollowWithSigDataStruct,
  ActuateDataStruct,
  ActuateWithSigDataStruct,
  PostDataStruct,
  PostWithSigDataStruct,
} from '../../typechain-types/HealthHub';

export enum ProtocolState {
  Unpaused,
  PublishingPaused,
  Paused,
}

export function matchEvent(
  receipt: TransactionReceipt,
  name: string,
  expectedArgs?: any[],
  eventContract: Contract = eventsLib,
  emitterAddress?: string
) {
  const events = receipt.logs;

  if (events != undefined) {
    // match name from list of events in eventContract, when found, compute the sigHash
    let sigHash: string | undefined;
    for (let contractEvent of Object.keys(eventContract.interface.events)) {
      if (contractEvent.startsWith(name) && contractEvent.charAt(name.length) == '(') {
        sigHash = keccak256(toUtf8Bytes(contractEvent));
        break;
      }
    }
    // Throw if the sigHash was not found
    if (!sigHash) {
      logger.throwError(
        `Event "${name}" not found in provided contract (default: Events libary). \nAre you sure you're using the right contract?`
      );
    }

    // Find the given event in the emitted logs
    let invalidParamsButExists = false;
    for (let emittedEvent of events) {
      // If we find one with the correct sighash, check if it is the one we're looking for
      if (emittedEvent.topics[0] == sigHash) {
        // If an emitter address is passed, validate that this is indeed the correct emitter, if not, continue
        if (emitterAddress) {
          if (emittedEvent.address != emitterAddress) continue;
        }
        const event = eventContract.interface.parseLog(emittedEvent);
        // If there are expected arguments, validate them, otherwise, return here
        if (expectedArgs) {
          if (expectedArgs.length != event.args.length) {
            logger.throwError(
              `Event "${name}" emitted with correct signature, but expected args are of invalid length`
            );
          }
          invalidParamsButExists = false;
          // Iterate through arguments and check them, if there is a mismatch, continue with the loop
          for (let i = 0; i < expectedArgs.length; i++) {
            // Parse empty arrays as empty bytes
            if (expectedArgs[i].constructor == Array && expectedArgs[i].length == 0) {
              expectedArgs[i] = '0x';
            }

            // Break out of the expected args loop if there is a mismatch, this will continue the emitted event loop
            if (BigNumber.isBigNumber(event.args[i])) {
              if (!event.args[i].eq(BigNumber.from(expectedArgs[i]))) {
                invalidParamsButExists = true;
                break;
              }
            } else if (event.args[i].constructor == Array) {
              let params = event.args[i];
              let expected = expectedArgs[i];
              if (expected != '0x' && params.length != expected.length) {
                invalidParamsButExists = true;
                break;
              }
              for (let j = 0; j < params.length; j++) {
                if (BigNumber.isBigNumber(params[j])) {
                  if (!params[j].eq(BigNumber.from(expected[j]))) {
                    invalidParamsButExists = true;
                    break;
                  }
                } else if (params[j] != expected[j]) {
                  invalidParamsButExists = true;
                  break;
                }
              }
              if (invalidParamsButExists) break;
            } else if (event.args[i] != expectedArgs[i]) {
              invalidParamsButExists = true;
              break;
            }
          }
          // Return if the for loop did not cause a break, so a match has been found, otherwise proceed with the event loop
          if (!invalidParamsButExists) {
            return;
          }
        } else {
          return;
        }
      }
    }
    // Throw if the event args were not expected or the event was not found in the logs
    if (invalidParamsButExists) {
      logger.throwError(`Event "${name}" found in logs but with unexpected args`);
    } else {
      logger.throwError(
        `Event "${name}" not found emitted by "${emitterAddress}" in given transaction log`
      );
    }
  } else {
    logger.throwError('No events were emitted');
  }
}

export function computeContractAddress(deployerAddress: string, nonce: number): string {
  const hexNonce = hexlify(nonce);
  return '0x' + keccak256(RLP.encode([deployerAddress, hexNonce])).substr(26);
}

export function getChainId(): number {
  return hre.network.config.chainId || HARDHAT_CHAINID;
}

export function getAbbreviation(handle: string) {
  let slice = handle.substr(0, 4);
  if (slice.charAt(3) == ' ') {
    slice = slice.substr(0, 3);
  }
  return slice;
}

export async function waitForTx(
  tx: Promise<TransactionResponse> | TransactionResponse,
  skipCheck = false
): Promise<TransactionReceipt> {
  if (!skipCheck) await expect(tx).to.not.be.reverted;
  return await (await tx).wait();
}

export async function getBlockNumber(): Promise<number> {
  return (await helper.getBlockNumber()).toNumber();
}

export async function resetFork(): Promise<void> {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.MAINNET_RPC_URL,
          blockNumber: 12012081,
        },
      },
    ],
  });
  console.log('\t> Fork reset');

  await hre.network.provider.request({
    method: 'evm_setNextBlockTimestamp',
    params: [1614290545], // Original block timestamp + 1
  });

  console.log('\t> Timestamp reset to 1614290545');
}

export async function getTimestamp(): Promise<any> {
  const blockNumber = await hre.ethers.provider.send('eth_blockNumber', []);
  const block = await hre.ethers.provider.send('eth_getBlockByNumber', [blockNumber, false]);
  return block.timestamp;
}

export async function setNextBlockTimestamp(timestamp: number): Promise<void> {
  await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
}

export async function mine(blocks: number): Promise<void> {
  for (let i = 0; i < blocks; i++) {
    await hre.ethers.provider.send('evm_mine', []);
  }
}

let snapshotId: string = '0x1';
export async function takeSnapshot() {
  snapshotId = await hre.ethers.provider.send('evm_snapshot', []);
}

export async function revertToSnapshot() {
  await hre.ethers.provider.send('evm_revert', [snapshotId]);
}

export async function cancelWithPermitForAll(nft: string = healthHub.address) {
  const nftContract = HealthHub__factory.connect(nft, testWallet);
  const name = await nftContract.name();
  const nonce = (await nftContract.sigNonces(testWallet.address)).toNumber();
  const { v, r, s } = await getPermitForAllParts(
    nft,
    name,
    testWallet.address,
    testWallet.address,
    false,
    nonce,
    MAX_UINT256
  );
  await nftContract.permitForAll(testWallet.address, testWallet.address, false, {
    v,
    r,
    s,
    deadline: MAX_UINT256,
  });
}

export async function getPermitParts(
  nft: string,
  name: string,
  spender: string,
  tokenId: BigNumberish,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildPermitParams(nft, name, spender, tokenId, nonce, deadline);
  return await getSig(msgParams);
}

export async function getPermitForAllParts(
  nft: string,
  name: string,
  owner: string,
  operator: string,
  approved: boolean,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildPermitForAllParams(nft, name, owner, operator, approved, nonce, deadline);
  return await getSig(msgParams);
}

export async function getBurnWithSigparts(
  nft: string,
  name: string,
  tokenId: BigNumberish,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildBurnWithSigParams(nft, name, tokenId, nonce, deadline);
  return await getSig(msgParams);
}

export async function getDelegateBySigParts(
  nft: string,
  name: string,
  delegator: string,
  delegatee: string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildDelegateBySigParams(nft, name, delegator, delegatee, nonce, deadline);
  return await getSig(msgParams);
}

const buildDelegateBySigParams = (
  nft: string,
  name: string,
  delegator: string,
  delegatee: string,
  nonce: number,
  deadline: string
) => ({
  types: {
    DelegateBySig: [
      { name: 'delegator', type: 'address' },
      { name: 'delegatee', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: {
    name: name,
    version: '1',
    chainId: getChainId(),
    verifyingContract: nft,
  },
  value: {
    delegator: delegator,
    delegatee: delegatee,
    nonce: nonce,
    deadline: deadline,
  },
});

export async function getSetFollowModuleWithSigParts(
  H_profileId: BigNumberish,
  followModule: string,
  followModuleInitData: Bytes | string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildSetFollowModuleWithSigParams(
    H_profileId,
    followModule,
    followModuleInitData,
    nonce,
    deadline
  );
  return await getSig(msgParams);
}

export async function getSetDispatcherWithSigParts(
  H_profileId: BigNumberish,
  dispatcher: string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildSetDispatcherWithSigParams(H_profileId, dispatcher, nonce, deadline);
  return await getSig(msgParams);
}

export async function getSetProfileImageURIWithSigParts(
  H_profileId: BigNumberish,
  imageURI: string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildSetProfileImageURIWithSigParams(H_profileId, imageURI, nonce, deadline);
  return await getSig(msgParams);
}

export async function getSetDefaultProfileWithSigParts(
  wallet: string,
  H_profileId: BigNumberish,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildSetDefaultProfileWithSigParams(H_profileId, wallet, nonce, deadline);
  return await getSig(msgParams);
}

export async function getSetFollowNFTURIWithSigParts(
  H_profileId: BigNumberish,
  followNFTURI: string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildSetFollowNFTURIWithSigParams(H_profileId, followNFTURI, nonce, deadline);
  return await getSig(msgParams);
}

export async function getPostWithSigParts(
  H_profileId: BigNumberish,
  contentURI: string,
  collectModule: string,
  collectModuleInitData: Bytes | string,
  referenceModule: string,
  referenceModuleInitData: Bytes | string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildPostWithSigParams(
    H_profileId,
    contentURI,
    collectModule,
    collectModuleInitData,
    referenceModule,
    referenceModuleInitData,
    nonce,
    deadline
  );
  return await getSig(msgParams);
}

export async function getCommentWithSigParts(
  H_profileId: BigNumberish,
  contentURI: string,
  H_profileIdPointed: BigNumberish,
  pubIdPointed: string,
  referenceModuleData: Bytes | string,
  collectModule: string,
  collectModuleInitData: Bytes | string,
  referenceModule: string,
  referenceModuleInitData: Bytes | string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildCommentWithSigParams(
    H_profileId,
    contentURI,
    H_profileIdPointed,
    pubIdPointed,
    referenceModuleData,
    collectModule,
    collectModuleInitData,
    referenceModule,
    referenceModuleInitData,
    nonce,
    deadline
  );
  return await getSig(msgParams);
}

export async function getActuateWithSigParts(
  H_profileId: BigNumberish,
  H_profileIdPointed: BigNumberish,
  pubIdPointed: string,
  referenceModuleData: Bytes | string,
  referenceModule: string,
  referenceModuleInitData: Bytes | string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildActuateWithSigParams(
    H_profileId,
    H_profileIdPointed,
    pubIdPointed,
    referenceModuleData,
    referenceModule,
    referenceModuleInitData,
    nonce,
    deadline
  );
  return await getSig(msgParams);
}

export async function getFollowWithSigParts(
  H_profileIds: string[] | number[],
  datas: Bytes[] | string[],
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildFollowWithSigParams(H_profileIds, datas, nonce, deadline);
  return await getSig(msgParams);
}

export async function getToggleFollowWithSigParts(
  H_profileIds: string[] | number[],
  enables: boolean[],
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildToggleFollowWithSigParams(H_profileIds, enables, nonce, deadline);
  return await getSig(msgParams);
}

export async function getSetProfileMetadataURIWithSigParts(
  H_profileId: string | number,
  metadata: string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildSetProfileMetadataURIWithSigParams(H_profileId, metadata, nonce, deadline);
  return await getSig(msgParams);
}

export async function getCollectWithSigParts(
  H_profileId: BigNumberish,
  pubId: string,
  data: Bytes | string,
  nonce: number,
  deadline: string
): Promise<{ v: number; r: string; s: string }> {
  const msgParams = buildCollectWithSigParams(H_profileId, pubId, data, nonce, deadline);
  return await getSig(msgParams);
}

export function expectEqualArrays(actual: BigNumberish[], expected: BigNumberish[]) {
  if (actual.length != expected.length) {
    logger.throwError(
      `${actual} length ${actual.length} does not match ${expected} length ${expect.length}`
    );
  }

  let areEquals = true;
  for (let i = 0; areEquals && i < actual.length; i++) {
    areEquals = BigNumber.from(actual[i]).eq(BigNumber.from(expected[i]));
  }

  if (!areEquals) {
    logger.throwError(`${actual} does not match ${expected}`);
  }
}

export interface CreateProfileReturningTokenIdStruct {
  sender?: Signer;
  vars: CreateProfileDataStruct;
}

export async function createProfileReturningTokenId({
  sender = user,
  vars,
}: CreateProfileReturningTokenIdStruct): Promise<BigNumber> {
  const tokenId = await healthHub.connect(sender).callStatic.createProfile(vars);
  await expect(healthHub.connect(sender).createProfile(vars)).to.not.be.reverted;
  return tokenId;
}

export interface FollowDataStruct {
  H_profileIds: BigNumberish[];
  datas: BytesLike[];
}

export interface FollowReturningTokenIdsStruct {
  sender?: Signer;
  vars: FollowDataStruct | FollowWithSigDataStruct;
}

export async function followReturningTokenIds({
  sender = user,
  vars,
}: FollowReturningTokenIdsStruct): Promise<BigNumber[]> {
  let tokenIds;
  if ('sig' in vars) {
    tokenIds = await healthHub.connect(sender).callStatic.followWithSig(vars);
    await expect(healthHub.connect(sender).followWithSig(vars)).to.not.be.reverted;
  } else {
    tokenIds = await healthHub.connect(sender).callStatic.follow(vars.H_profileIds, vars.datas);
    await expect(healthHub.connect(sender).follow(vars.H_profileIds, vars.datas)).to.not.be.reverted;
  }
  return tokenIds;
}

export interface CollectDataStruct {
  H_profileId: BigNumberish;
  pubId: BigNumberish;
  data: BytesLike;
}

export interface CollectReturningTokenIdsStruct {
  sender?: Signer;
  vars: CollectDataStruct | CollectWithSigDataStruct;
}

export async function collectReturningTokenIds({
  sender = user,
  vars,
}: CollectReturningTokenIdsStruct): Promise<BigNumber> {
  let tokenId;
  if ('sig' in vars) {
    tokenId = await healthHub.connect(sender).callStatic.collectWithSig(vars);
    await expect(healthHub.connect(sender).collectWithSig(vars)).to.not.be.reverted;
  } else {
    tokenId = await healthHub
      .connect(sender)
      .callStatic.collect(vars.H_profileId, vars.pubId, vars.data);
    await expect(healthHub.connect(sender).collect(vars.H_profileId, vars.pubId, vars.data)).to.not.be
      .reverted;
  }
  return tokenId;
}

export interface CommentReturningTokenIdStruct {
  sender?: Signer;
  vars: CommentDataStruct | CommentWithSigDataStruct;
}

export async function commentReturningTokenId({
  sender = user,
  vars,
}: CommentReturningTokenIdStruct): Promise<BigNumber> {
  let tokenId;
  if ('sig' in vars) {
    tokenId = await healthHub.connect(sender).callStatic.commentWithSig(vars);
    await expect(healthHub.connect(sender).commentWithSig(vars)).to.not.be.reverted;
  } else {
    tokenId = await healthHub.connect(sender).callStatic.comment(vars);
    await expect(healthHub.connect(sender).comment(vars)).to.not.be.reverted;
  }
  return tokenId;
}

export interface ActuateReturningTokenIdStruct {
  sender?: Signer;
  vars: ActuateDataStruct | ActuateWithSigDataStruct;
}

export async function actuateReturningTokenId({
  sender = user,
  vars,
}: ActuateReturningTokenIdStruct): Promise<BigNumber> {
  let tokenId;
  if ('sig' in vars) {
    tokenId = await healthHub.connect(sender).callStatic.actuateWithSig(vars);
    await expect(healthHub.connect(sender).actuateWithSig(vars)).to.not.be.reverted;
  } else {
    tokenId = await healthHub.connect(sender).callStatic.actuate(vars);
    await expect(healthHub.connect(sender).actuate(vars)).to.not.be.reverted;
  }
  return tokenId;
}

export interface PostReturningTokenIdStruct {
  sender?: Signer;
  vars: PostDataStruct | PostWithSigDataStruct;
}

export async function postReturningTokenId({
  sender = user,
  vars,
}: PostReturningTokenIdStruct): Promise<BigNumber> {
  let tokenId;
  if ('sig' in vars) {
    tokenId = await healthHub.connect(sender).callStatic.postWithSig(vars);
    await expect(healthHub.connect(sender).postWithSig(vars)).to.not.be.reverted;
  } else {
    tokenId = await healthHub.connect(sender).callStatic.post(vars);
    await expect(healthHub.connect(sender).post(vars)).to.not.be.reverted;
  }
  return tokenId;
}

export interface TokenUriMetadataAttribute {
  trait_type: string;
  value: string;
}

export interface ProfileTokenUriMetadata {
  name: string;
  description: string;
  image: string;
  attributes: TokenUriMetadataAttribute[];
}

export async function getMetadataFromBase64TokenUri(
  tokenUri: string
): Promise<ProfileTokenUriMetadata> {
  const splittedTokenUri = tokenUri.split('data:application/json;base64,');
  if (splittedTokenUri.length != 2) {
    logger.throwError('Wrong or unrecognized token URI format');
  } else {
    const jsonMetadataBase64String = splittedTokenUri[1];
    const jsonMetadataBytes = ethers.utils.base64.decode(jsonMetadataBase64String);
    const jsonMetadataString = ethers.utils.toUtf8String(jsonMetadataBytes);
    return JSON.parse(jsonMetadataString);
  }
}

export async function getDecodedSvgImage(tokenUriMetadata: ProfileTokenUriMetadata) {
  const splittedImage = tokenUriMetadata.image.split('data:image/svg+xml;base64,');
  if (splittedImage.length != 2) {
    logger.throwError('Wrong or unrecognized token URI format');
  } else {
    return ethers.utils.toUtf8String(ethers.utils.base64.decode(splittedImage[1]));
  }
}

export function loadTestResourceAsUtf8String(relativePathToResouceDir: string) {
  return readFileSync(join('test', 'resources', relativePathToResouceDir), 'utf8');
}

// Modified from AaveTokenV2 repo
const buildPermitParams = (
  nft: string,
  name: string,
  spender: string,
  tokenId: BigNumberish,
  nonce: number,
  deadline: string
) => ({
  types: {
    Permit: [
      { name: 'spender', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: {
    name: name,
    version: '1',
    chainId: getChainId(),
    verifyingContract: nft,
  },
  value: {
    spender: spender,
    tokenId: tokenId,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildPermitForAllParams = (
  nft: string,
  name: string,
  owner: string,
  operator: string,
  approved: boolean,
  nonce: number,
  deadline: string
) => ({
  types: {
    PermitForAll: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: {
    name: name,
    version: '1',
    chainId: getChainId(),
    verifyingContract: nft,
  },
  value: {
    owner: owner,
    operator: operator,
    approved: approved,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildBurnWithSigParams = (
  nft: string,
  name: string,
  tokenId: BigNumberish,
  nonce: number,
  deadline: string
) => ({
  types: {
    BurnWithSig: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: {
    name: name,
    version: '1',
    chainId: getChainId(),
    verifyingContract: nft,
  },
  value: {
    tokenId: tokenId,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildSetFollowModuleWithSigParams = (
  H_profileId: BigNumberish,
  followModule: string,
  followModuleInitData: Bytes | string,
  nonce: number,
  deadline: string
) => ({
  types: {
    SetFollowModuleWithSig: [
      { name: 'H_profileId', type: 'uint256' },
      { name: 'followModule', type: 'address' },
      { name: 'followModuleInitData', type: 'bytes' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    H_profileId: H_profileId,
    followModule: followModule,
    followModuleInitData: followModuleInitData,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildSetDispatcherWithSigParams = (
  H_profileId: BigNumberish,
  dispatcher: string,
  nonce: number,
  deadline: string
) => ({
  types: {
    SetDispatcherWithSig: [
      { name: 'H_profileId', type: 'uint256' },
      { name: 'dispatcher', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    H_profileId: H_profileId,
    dispatcher: dispatcher,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildSetProfileImageURIWithSigParams = (
  H_profileId: BigNumberish,
  imageURI: string,
  nonce: number,
  deadline: string
) => ({
  types: {
    SetProfileImageURIWithSig: [
      { name: 'H_profileId', type: 'uint256' },
      { name: 'imageURI', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    H_profileId: H_profileId,
    imageURI: imageURI,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildSetDefaultProfileWithSigParams = (
  H_profileId: BigNumberish,
  wallet: string,
  nonce: number,
  deadline: string
) => ({
  types: {
    SetDefaultProfileWithSig: [
      { name: 'wallet', type: 'address' },
      { name: 'H_profileId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    wallet: wallet,
    H_profileId: H_profileId,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildSetFollowNFTURIWithSigParams = (
  H_profileId: BigNumberish,
  followNFTURI: string,
  nonce: number,
  deadline: string
) => ({
  types: {
    SetFollowNFTURIWithSig: [
      { name: 'H_profileId', type: 'uint256' },
      { name: 'followNFTURI', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    H_profileId: H_profileId,
    followNFTURI: followNFTURI,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildPostWithSigParams = (
  H_profileId: BigNumberish,
  contentURI: string,
  collectModule: string,
  collectModuleInitData: Bytes | string,
  referenceModule: string,
  referenceModuleInitData: Bytes | string,
  nonce: number,
  deadline: string
) => ({
  types: {
    PostWithSig: [
      { name: 'H_profileId', type: 'uint256' },
      { name: 'contentURI', type: 'string' },
      { name: 'collectModule', type: 'address' },
      { name: 'collectModuleInitData', type: 'bytes' },
      { name: 'referenceModule', type: 'address' },
      { name: 'referenceModuleInitData', type: 'bytes' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    H_profileId: H_profileId,
    contentURI: contentURI,
    collectModule: collectModule,
    collectModuleInitData: collectModuleInitData,
    referenceModule: referenceModule,
    referenceModuleInitData: referenceModuleInitData,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildCommentWithSigParams = (
  H_profileId: BigNumberish,
  contentURI: string,
  H_profileIdPointed: BigNumberish,
  pubIdPointed: string,
  referenceModuleData: Bytes | string,
  collectModule: string,
  collectModuleInitData: Bytes | string,
  referenceModule: string,
  referenceModuleInitData: Bytes | string,
  nonce: number,
  deadline: string
) => ({
  types: {
    CommentWithSig: [
      { name: 'H_profileId', type: 'uint256' },
      { name: 'contentURI', type: 'string' },
      { name: 'H_profileIdPointed', type: 'uint256' },
      { name: 'pubIdPointed', type: 'uint256' },
      { name: 'referenceModuleData', type: 'bytes' },
      { name: 'collectModule', type: 'address' },
      { name: 'collectModuleInitData', type: 'bytes' },
      { name: 'referenceModule', type: 'address' },
      { name: 'referenceModuleInitData', type: 'bytes' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    H_profileId: H_profileId,
    contentURI: contentURI,
    H_profileIdPointed: H_profileIdPointed,
    pubIdPointed: pubIdPointed,
    referenceModuleData: referenceModuleData,
    collectModule: collectModule,
    collectModuleInitData: collectModuleInitData,
    referenceModule: referenceModule,
    referenceModuleInitData: referenceModuleInitData,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildActuateWithSigParams = (
  H_profileId: BigNumberish,
  H_profileIdPointed: BigNumberish,
  pubIdPointed: string,
  referenceModuleData: Bytes | string,
  referenceModule: string,
  referenceModuleInitData: Bytes | string,
  nonce: number,
  deadline: string
) => ({
  types: {
    ActuateWithSig: [
      { name: 'H_profileId', type: 'uint256' },
      { name: 'H_profileIdPointed', type: 'uint256' },
      { name: 'pubIdPointed', type: 'uint256' },
      { name: 'referenceModuleData', type: 'bytes' },
      { name: 'referenceModule', type: 'address' },
      { name: 'referenceModuleInitData', type: 'bytes' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    H_profileId: H_profileId,
    H_profileIdPointed: H_profileIdPointed,
    pubIdPointed: pubIdPointed,
    referenceModuleData: referenceModuleData,
    referenceModule: referenceModule,
    referenceModuleInitData: referenceModuleInitData,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildFollowWithSigParams = (
  H_profileIds: string[] | number[],
  datas: Bytes[] | string[],
  nonce: number,
  deadline: string
) => ({
  types: {
    FollowWithSig: [
      { name: 'H_profileIds', type: 'uint256[]' },
      { name: 'datas', type: 'bytes[]' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    H_profileIds: H_profileIds,
    datas: datas,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildToggleFollowWithSigParams = (
  H_profileIds: string[] | number[],
  enables: boolean[],
  nonce: number,
  deadline: string
) => ({
  types: {
    ToggleFollowWithSig: [
      { name: 'H_profileIds', type: 'uint256[]' },
      { name: 'enables', type: 'bool[]' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: {
    name: HEALTH_PERIPHERY_NAME,
    version: '1',
    chainId: getChainId(),
    verifyingContract: healthPeriphery.address,
  },
  value: {
    H_profileIds: H_profileIds,
    enables: enables,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildSetProfileMetadataURIWithSigParams = (
  H_profileId: string | number,
  metadata: string,
  nonce: number,
  deadline: string
) => ({
  types: {
    SetProfileMetadataURIWithSig: [
      { name: 'H_profileId', type: 'uint256' },
      { name: 'metadata', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: {
    name: HEALTH_PERIPHERY_NAME,
    version: '1',
    chainId: getChainId(),
    verifyingContract: healthPeriphery.address,
  },
  value: {
    H_profileId: H_profileId,
    metadata: metadata,
    nonce: nonce,
    deadline: deadline,
  },
});

const buildCollectWithSigParams = (
  H_profileId: BigNumberish,
  pubId: string,
  data: Bytes | string,
  nonce: number,
  deadline: string
) => ({
  types: {
    CollectWithSig: [
      { name: 'H_profileId', type: 'uint256' },
      { name: 'pubId', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  domain: domain(),
  value: {
    H_profileId: H_profileId,
    pubId: pubId,
    data: data,
    nonce: nonce,
    deadline: deadline,
  },
});

async function getSig(msgParams: {
  domain: any;
  types: any;
  value: any;
}): Promise<{ v: number; r: string; s: string }> {
  const sig = await testWallet._signTypedData(msgParams.domain, msgParams.types, msgParams.value);
  return utils.splitSignature(sig);
}

function domain(): { name: string; version: string; chainId: number; verifyingContract: string } {
  return {
    name: HEALTH_HUB_NFT_NAME,
    version: '1',
    chainId: getChainId(),
    verifyingContract: healthHub.address,
  };
}
