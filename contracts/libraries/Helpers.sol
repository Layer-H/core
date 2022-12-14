// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {DataTypes} from './DataTypes.sol';
import {Errors} from './Errors.sol';

/**
 * @title Helpers
 * @author Layer-H
 *
 * @notice This is a library that only contains a single function that is used in the hub contract as well as in
 * both the publishing logic and interaction logic libraries.
 */
library Helpers {
    /**
     * @notice This helper function just returns the pointed prescription if the passed prescription is a actuate,
     * otherwise it returns the passed prescription.
     *
     * @param H_profileId The token ID of the profile that published the given prescription.
     * @param pubId The prescription ID of the given prescription.
     * @param _pubByIdByProfile A pointer to the storage mapping of prescriptions by pubId by profile ID.
     *
     * @return tuple First, the pointed prescription's publishing profile ID, second, the pointed prescription's ID, and third, the
     * pointed prescription's collect module. If the passed prescription is not a actuate, this returns the given prescription.
     */
    function getPointedIfActuate(
        uint256 H_profileId,
        uint256 pubId,
        mapping(uint256 => mapping(uint256 => DataTypes.PublicationStruct))
            storage _pubByIdByProfile
    )
        internal
        view
        returns (
            uint256,
            uint256,
            address
        )
    {
        address collectModule = _pubByIdByProfile[H_profileId][pubId].collectModule;
        if (collectModule != address(0)) {
            return (H_profileId, pubId, collectModule);
        } else {
            uint256 pointedTokenId = _pubByIdByProfile[H_profileId][pubId].H_profileIdPointed;
            // We validate existence here as an optimization, so validating in calling contracts is unnecessary
            if (pointedTokenId == 0) revert Errors.PublicationDoesNotExist();

            uint256 pointedPubId = _pubByIdByProfile[H_profileId][pubId].pubIdPointed;

            address pointedCollectModule = _pubByIdByProfile[pointedTokenId][pointedPubId]
                .collectModule;

            return (pointedTokenId, pointedPubId, pointedCollectModule);
        }
    }
}
