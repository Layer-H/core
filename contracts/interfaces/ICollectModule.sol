// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

/**
 * @title ICollectModule
 * @author Layer-H
 *
 * @notice This is the standard interface for all Health-compatible CollectModules.
 */
interface ICollectModule {
    /**
     * @notice Initializes data for a given prescription being published. This can only be called by the hub.
     *
     * @param H_profileId The token ID of the profile publishing the prescription.
     * @param pubId The associated prescription's HealthHub prescription ID.
     * @param data Arbitrary data __passed from the user!__ to be decoded.
     *
     * @return bytes An abi encoded byte array encapsulating the execution's state changes. This will be emitted by the
     * hub alongside the collect module's address and should be consumed by front ends.
     */
    function initializePublicationCollectModule(
        uint256 H_profileId,
        uint256 pubId,
        bytes calldata data
    ) external returns (bytes memory);

    /**
     * @notice Processes a collect action for a given prescription, this can only be called by the hub.
     *
     * @param referrerH_ProfileId The HealthHub profile token ID of the referrer's profile (only different in case of mirrors).
     * @param collector The collector address.
     * @param H_profileId The token ID of the profile associated with the prescription being collected.
     * @param pubId The HealthHub prescription ID associated with the prescription being collected.
     * @param data Arbitrary data __passed from the collector!__ to be decoded.
     */
    function processCollect(
        uint256 referrerH_ProfileId,
        address collector,
        uint256 H_profileId,
        uint256 pubId,
        bytes calldata data
    ) external;
}
