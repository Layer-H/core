// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {IFollowModule} from '../../../interfaces/IFollowModule.sol';
import {IHealthHub} from '../../../interfaces/IHealthHub.sol';
import {Errors} from '../../../libraries/Errors.sol';
import {ModuleBase} from '../ModuleBase.sol';
import {IERC721} from '@openzeppelin/contracts/token/ERC721/IERC721.sol';

/**
 * @title FollowValidatorFollowModuleBase
 * @author Layer-H
 *
 * @notice This abstract contract adds the default expected behavior for follow validation in a follow module
 * to inheriting contracts.
 */
abstract contract FollowValidatorFollowModuleBase is ModuleBase, IFollowModule {
    /**
     * @notice Standard function to validate follow NFT ownership. This module is agnostic to follow NFT token IDs
     * and other properties.
     */
    function isFollowing(
        uint256 profileId,
        address follower,
        uint256 followNFTTokenId
    ) external view override returns (bool) {
        address followNFT = IHealthHub(HUB).getFollowNFT(profileId);
        if (followNFT == address(0)) {
            return false;
        } else {
            return
                followNFTTokenId == 0
                    ? IERC721(followNFT).balanceOf(follower) != 0
                    : IERC721(followNFT).ownerOf(followNFTTokenId) == follower;
        }
    }
}