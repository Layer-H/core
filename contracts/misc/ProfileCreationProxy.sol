// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {IHealthHub} from '../interfaces/IHealthHub.sol';
import {DataTypes} from '../libraries/DataTypes.sol';
import {Errors} from '../libraries/Errors.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @title ProfileCreationProxy
 * @author Layer-H
 *
 * @notice This is an ownable proxy contract that enforces ".health" handle suffixes at profile creation.
 * Only the owner can create profiles.
 */
contract ProfileCreationProxy is Ownable {
    IHealthHub immutable HEALTH_HUB;

    constructor(address owner, IHealthHub hub) {
        _transferOwnership(owner);
        HEALTH_HUB = hub;
    }

    function proxyCreateProfile(DataTypes.CreateProfileData memory vars) external onlyOwner {
        uint256 handleLength = bytes(vars.handle).length;
        if (handleLength < 5) revert Errors.HandleLengthInvalid();

        bytes1 firstByte = bytes(vars.handle)[0];
        if (firstByte == '-' || firstByte == '_' || firstByte == '.')
            revert Errors.HandleFirstCharInvalid();

        for (uint256 i = 1; i < handleLength; ) {
            if (bytes(vars.handle)[i] == '.') revert Errors.HandleContainsInvalidCharacters();
            unchecked {
                ++i;
            }
        }

        vars.handle = string(abi.encodePacked(vars.handle, '.health'));
        HEALTH_HUB.createProfile(vars);
    }
}
