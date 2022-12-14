// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {IReferenceModule} from '../../../interfaces/IReferenceModule.sol';
import {ModuleBase} from '../ModuleBase.sol';
import {FollowValidationModuleBase} from '../FollowValidationModuleBase.sol';
import {IERC721} from '@openzeppelin/contracts/token/ERC721/IERC721.sol';

/**
 * @title FollowerOnlyReferenceModule
 * @author Layer-H
 *
 * @notice A simple reference module that validates that comments or actuates originate from a profile owned
 * by a follower.
 */
contract FollowerOnlyReferenceModule is FollowValidationModuleBase, IReferenceModule {
    constructor(address hub) ModuleBase(hub) {}

    /**
     * @dev There is nothing needed at initialization.
     */
    function initializeReferenceModule(
        uint256 H_profileId,
        uint256 pubId,
        bytes calldata data
    ) external pure override returns (bytes memory) {
        return new bytes(0);
    }

    /**
     * @notice Validates that the commenting profile's owner is a follower.
     *
     * NOTE: We don't need to care what the pointed prescription is in this context.
     */
    function processComment(
        uint256 H_profileId,
        uint256 H_profileIdPointed,
        uint256 pubIdPointed,
        bytes calldata data
    ) external view override {
        address commentCreator = IERC721(HUB).ownerOf(H_profileId);
        _checkFollowValidity(H_profileIdPointed, commentCreator);
    }

    /**
     * @notice Validates that the commenting profile's owner is a follower.
     *
     * NOTE: We don't need to care what the pointed prescription is in this context.
     */
    function processActuate(
        uint256 H_profileId,
        uint256 H_profileIdPointed,
        uint256 pubIdPointed,
        bytes calldata data
    ) external view override {
        address actuateCreator = IERC721(HUB).ownerOf(H_profileId);
        _checkFollowValidity(H_profileIdPointed, actuateCreator);
    }
}
