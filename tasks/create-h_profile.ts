import { task } from 'hardhat/config';
import { HealthHub__factory } from '../typechain-types';
import { CreateProfileDataStruct } from '../typechain-types/HealthHub';
import { waitForTx, initEnv, getAddrs, ZERO_ADDRESS } from './helpers/utils';

task('create-profile', 'creates a profile').setAction(async ({}, hre) => {
  const [governance, , user] = await initEnv(hre);
  const addrs = getAddrs();
  const healthHub = HealthHub__factory.connect(addrs['healthHub proxy'], governance);

  await waitForTx(healthHub.whitelistProfileCreator(user.address, true));

  const inputStruct: CreateProfileDataStruct = {
    to: user.address,
    handle: 'onchainengineer',
    imageURI: '#',
    followModule: ZERO_ADDRESS,
    followModuleInitData: [],
    followNFTURI: '#',
  };

  await waitForTx(healthHub.connect(user).createProfile(inputStruct));

  console.log(`Total supply (should be 1): ${await healthHub.totalSupply()}`);
  console.log(
    `Profile owner: ${await healthHub.ownerOf(1)}, user address (should be the same): ${user.address}`
  );
  console.log(`Profile ID by handle: ${await healthHub.getH_ProfileIdByHandle('onchainengineer')}`);
});
