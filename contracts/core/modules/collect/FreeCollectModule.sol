// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {ICollectModule} from '../../../interfaces/ICollectModule.sol';
import {ModuleBase} from '../ModuleBase.sol';
import {FollowValidationModuleBase} from '../FollowValidationModuleBase.sol';

/**
 * @title FreeCollectModule
 * @author Layer-H
 *
 * @notice This is a simple Health CollectModule implementation, inheriting from the ICollectModule interface.
 *
 * This module works by allowing all collects.
 */
contract FreeCollectModule is FollowValidationModuleBase, ICollectModule {
    constructor(address hub) ModuleBase(hub) {}

    mapping(uint256 => mapping(uint256 => bool)) internal _followerOnlyByPublicationByProfile;

    /**
     * @dev There is nothing needed at initialization.
     */
    function initializePublicationCollectModule(
        uint256 H_profileId,
        uint256 pubId,
        bytes calldata data
    ) external override onlyHub returns (bytes memory) {
        bool followerOnly = abi.decode(data, (bool));
        if (followerOnly) _followerOnlyByPublicationByProfile[H_profileId][pubId] = true;
        return data;
    }

    /**
     * @dev Processes a collect by:
     *  1. Ensuring the collector is a follower, if needed
     */
    function processCollect(
        uint256 referrerH_ProfileId,
        address collector,
        uint256 H_profileId,
        uint256 pubId,
        bytes calldata data
    ) external view override {
        if (_followerOnlyByPublicationByProfile[H_profileId][pubId])
            _checkFollowValidity(H_profileId, collector);
    }
}
