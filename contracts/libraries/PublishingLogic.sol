// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {Helpers} from './Helpers.sol';
import {DataTypes} from './DataTypes.sol';
import {Errors} from './Errors.sol';
import {Events} from './Events.sol';
import {Constants} from './Constants.sol';
import {IFollowModule} from '../interfaces/IFollowModule.sol';
import {ICollectModule} from '../interfaces/ICollectModule.sol';
import {IReferenceModule} from '../interfaces/IReferenceModule.sol';

/**
 * @title PublishingLogic
 * @author Layer-H
 *
 * @notice This is the library that contains the logic for profile creation & prescription.
 *
 * @dev The functions are external, so they are called from the hub via `delegateCall` under the hood. Furthermore,
 * expected events are emitted from this library instead of from the hub to alleviate code size concerns.
 */
library PublishingLogic {
    /**
     * @notice Executes the logic to create a profile with the given parameters to the given address.
     *
     * @param vars The CreateProfileData struct containing the following parameters:
     *      to: The address receiving the profile.
     *      handle: The handle to set for the profile, must be unique and non-empty.
     *      imageURI: The URI to set for the profile image.
     *      followModule: The follow module to use, can be the zero address.
     *      followModuleInitData: The follow module initialization data, if any
     *      followNFTURI: The URI to set for the follow NFT.
     * @param H_profileId The profile ID to associate with this profile NFT (token ID).
     * @param _H_profileIdByHandleHash The storage reference to the mapping of profile IDs by handle hash.
     * @param _profileById The storage reference to the mapping of profile structs by IDs.
     * @param _followModuleWhitelisted The storage reference to the mapping of whitelist status by follow module address.
     */
    function createProfile(
        DataTypes.CreateProfileData calldata vars,
        uint256 H_profileId,
        mapping(bytes32 => uint256) storage _H_profileIdByHandleHash,
        mapping(uint256 => DataTypes.ProfileStruct) storage _profileById,
        mapping(address => bool) storage _followModuleWhitelisted
    ) external {
        _validateHandle(vars.handle);

        if (bytes(vars.imageURI).length > Constants.MAX_PROFILE_IMAGE_URI_LENGTH)
            revert Errors.ProfileImageURILengthInvalid();

        bytes32 handleHash = keccak256(bytes(vars.handle));

        if (_H_profileIdByHandleHash[handleHash] != 0) revert Errors.HandleTaken();

        _H_profileIdByHandleHash[handleHash] = H_profileId;
        _profileById[H_profileId].handle = vars.handle;
        _profileById[H_profileId].imageURI = vars.imageURI;
        _profileById[H_profileId].followNFTURI = vars.followNFTURI;

        bytes memory followModuleReturnData;
        if (vars.followModule != address(0)) {
            _profileById[H_profileId].followModule = vars.followModule;
            followModuleReturnData = _initFollowModule(
                H_profileId,
                vars.followModule,
                vars.followModuleInitData,
                _followModuleWhitelisted
            );
        }

        _emitProfileCreated(H_profileId, vars, followModuleReturnData);
    }

    /**
     * @notice Sets the follow module for a given profile.
     *
     * @param H_profileId The profile ID to set the follow module for.
     * @param followModule The follow module to set for the given profile, if any.
     * @param followModuleInitData The data to pass to the follow module for profile initialization.
     * @param _profile The storage reference to the profile struct associated with the given profile ID.
     * @param _followModuleWhitelisted The storage reference to the mapping of whitelist status by follow module address.
     */
    function setFollowModule(
        uint256 H_profileId,
        address followModule,
        bytes calldata followModuleInitData,
        DataTypes.ProfileStruct storage _profile,
        mapping(address => bool) storage _followModuleWhitelisted
    ) external {
        if (followModule != _profile.followModule) {
            _profile.followModule = followModule;
        }

        bytes memory followModuleReturnData;
        if (followModule != address(0))
            followModuleReturnData = _initFollowModule(
                H_profileId,
                followModule,
                followModuleInitData,
                _followModuleWhitelisted
            );
        emit Events.FollowModuleSet(
            H_profileId,
            followModule,
            followModuleReturnData,
            block.timestamp
        );
    }

    /**
     * @notice Creates a post prescription mapped to the given profile.
     *
     * @dev To avoid a stack too deep error, reference parameters are passed in memory rather than calldata.
     *
     * @param H_profileId The profile ID to associate this prescription to.
     * @param contentURI The URI to set for this prescription.
     * @param collectModule The collect module to set for this prescription.
     * @param collectModuleInitData The data to pass to the collect module for prescription initialization.
     * @param referenceModule The reference module to set for this prescription, if any.
     * @param referenceModuleInitData The data to pass to the reference module for prescription initialization.
     * @param pubId The prescription ID to associate with this prescription.
     * @param _pubByIdByProfile The storage reference to the mapping of prescriptions by prescription ID by profile ID.
     * @param _collectModuleWhitelisted The storage reference to the mapping of whitelist status by collect module address.
     * @param _referenceModuleWhitelisted The storage reference to the mapping of whitelist status by reference module address.
     */
    function createPost(
        uint256 H_profileId,
        string memory contentURI,
        address collectModule,
        bytes memory collectModuleInitData,
        address referenceModule,
        bytes memory referenceModuleInitData,
        uint256 pubId,
        mapping(uint256 => mapping(uint256 => DataTypes.PublicationStruct))
            storage _pubByIdByProfile,
        mapping(address => bool) storage _collectModuleWhitelisted,
        mapping(address => bool) storage _referenceModuleWhitelisted
    ) external {
        _pubByIdByProfile[H_profileId][pubId].contentURI = contentURI;

        // Collect module initialization
        bytes memory collectModuleReturnData = _initPubCollectModule(
            H_profileId,
            pubId,
            collectModule,
            collectModuleInitData,
            _pubByIdByProfile,
            _collectModuleWhitelisted
        );

        // Reference module initialization
        bytes memory referenceModuleReturnData = _initPubReferenceModule(
            H_profileId,
            pubId,
            referenceModule,
            referenceModuleInitData,
            _pubByIdByProfile,
            _referenceModuleWhitelisted
        );

        emit Events.PostCreated(
            H_profileId,
            pubId,
            contentURI,
            collectModule,
            collectModuleReturnData,
            referenceModule,
            referenceModuleReturnData,
            block.timestamp
        );
    }

    /**
     * @notice Creates a comment prescription mapped to the given profile.
     *
     * @dev This function is unique in that it requires many variables, so, unlike the other publishing functions,
     * we need to pass the full CommentData struct in memory to avoid a stack too deep error.
     *
     * @param vars The CommentData struct to use to create the comment.
     * @param pubId The prescription ID to associate with this prescription.
     * @param _profileById The storage reference to the mapping of profile structs by IDs.
     * @param _pubByIdByProfile The storage reference to the mapping of prescriptions by prescription ID by profile ID.
     * @param _collectModuleWhitelisted The storage reference to the mapping of whitelist status by collect module address.
     * @param _referenceModuleWhitelisted The storage reference to the mapping of whitelist status by reference module address.
     */
    function createComment(
        DataTypes.CommentData memory vars,
        uint256 pubId,
        mapping(uint256 => DataTypes.ProfileStruct) storage _profileById,
        mapping(uint256 => mapping(uint256 => DataTypes.PublicationStruct))
            storage _pubByIdByProfile,
        mapping(address => bool) storage _collectModuleWhitelisted,
        mapping(address => bool) storage _referenceModuleWhitelisted
    ) external {
        // Validate existence of the pointed prescription
        uint256 pubCount = _profileById[vars.H_profileIdPointed].pubCount;
        if (pubCount < vars.pubIdPointed || vars.pubIdPointed == 0)
            revert Errors.PublicationDoesNotExist();

        // Ensure the pointed prescription is not the comment being created
        if (vars.H_profileId == vars.H_profileIdPointed && vars.pubIdPointed == pubId)
            revert Errors.CannotCommentOnSelf();

        _pubByIdByProfile[vars.H_profileId][pubId].contentURI = vars.contentURI;
        _pubByIdByProfile[vars.H_profileId][pubId].H_profileIdPointed = vars.H_profileIdPointed;
        _pubByIdByProfile[vars.H_profileId][pubId].pubIdPointed = vars.pubIdPointed;

        // Collect Module Initialization
        bytes memory collectModuleReturnData = _initPubCollectModule(
            vars.H_profileId,
            pubId,
            vars.collectModule,
            vars.collectModuleInitData,
            _pubByIdByProfile,
            _collectModuleWhitelisted
        );

        // Reference module initialization
        bytes memory referenceModuleReturnData = _initPubReferenceModule(
            vars.H_profileId,
            pubId,
            vars.referenceModule,
            vars.referenceModuleInitData,
            _pubByIdByProfile,
            _referenceModuleWhitelisted
        );

        // Reference module validation
        address refModule = _pubByIdByProfile[vars.H_profileIdPointed][vars.pubIdPointed]
            .referenceModule;
        if (refModule != address(0)) {
            IReferenceModule(refModule).processComment(
                vars.H_profileId,
                vars.H_profileIdPointed,
                vars.pubIdPointed,
                vars.referenceModuleData
            );
        }

        // Prevents a stack too deep error
        _emitCommentCreated(vars, pubId, collectModuleReturnData, referenceModuleReturnData);
    }

    /**
     * @notice Creates a actuate prescription mapped to the given profile.
     *
     * @param vars The ActuateData struct to use to create the actuate.
     * @param pubId The prescription ID to associate with this prescription.
     * @param _pubByIdByProfile The storage reference to the mapping of prescriptions by prescription ID by profile ID.
     * @param _referenceModuleWhitelisted The storage reference to the mapping of whitelist status by reference module address.
     */
    function createActuate(
        DataTypes.ActuateData memory vars,
        uint256 pubId,
        mapping(uint256 => mapping(uint256 => DataTypes.PublicationStruct))
            storage _pubByIdByProfile,
        mapping(address => bool) storage _referenceModuleWhitelisted
    ) external {
        (uint256 rootH_ProfileIdPointed, uint256 rootPubIdPointed, ) = Helpers.getPointedIfActuate(
            vars.H_profileIdPointed,
            vars.pubIdPointed,
            _pubByIdByProfile
        );

        _pubByIdByProfile[vars.H_profileId][pubId].H_profileIdPointed = rootH_ProfileIdPointed;
        _pubByIdByProfile[vars.H_profileId][pubId].pubIdPointed = rootPubIdPointed;

        // Reference module initialization
        bytes memory referenceModuleReturnData = _initPubReferenceModule(
            vars.H_profileId,
            pubId,
            vars.referenceModule,
            vars.referenceModuleInitData,
            _pubByIdByProfile,
            _referenceModuleWhitelisted
        );

        // Reference module validation
        address refModule = _pubByIdByProfile[rootH_ProfileIdPointed][rootPubIdPointed]
            .referenceModule;
        if (refModule != address(0)) {
            IReferenceModule(refModule).processActuate(
                vars.H_profileId,
                rootH_ProfileIdPointed,
                rootPubIdPointed,
                vars.referenceModuleData
            );
        }

        emit Events.ActuateCreated(
            vars.H_profileId,
            pubId,
            rootH_ProfileIdPointed,
            rootPubIdPointed,
            vars.referenceModuleData,
            vars.referenceModule,
            referenceModuleReturnData,
            block.timestamp
        );
    }

    function _initPubCollectModule(
        uint256 H_profileId,
        uint256 pubId,
        address collectModule,
        bytes memory collectModuleInitData,
        mapping(uint256 => mapping(uint256 => DataTypes.PublicationStruct))
            storage _pubByIdByProfile,
        mapping(address => bool) storage _collectModuleWhitelisted
    ) private returns (bytes memory) {
        if (!_collectModuleWhitelisted[collectModule]) revert Errors.CollectModuleNotWhitelisted();
        _pubByIdByProfile[H_profileId][pubId].collectModule = collectModule;
        return
            ICollectModule(collectModule).initializePublicationCollectModule(
                H_profileId,
                pubId,
                collectModuleInitData
            );
    }

    function _initPubReferenceModule(
        uint256 H_profileId,
        uint256 pubId,
        address referenceModule,
        bytes memory referenceModuleInitData,
        mapping(uint256 => mapping(uint256 => DataTypes.PublicationStruct))
            storage _pubByIdByProfile,
        mapping(address => bool) storage _referenceModuleWhitelisted
    ) private returns (bytes memory) {
        if (referenceModule == address(0)) return new bytes(0);
        if (!_referenceModuleWhitelisted[referenceModule])
            revert Errors.ReferenceModuleNotWhitelisted();
        _pubByIdByProfile[H_profileId][pubId].referenceModule = referenceModule;
        return
            IReferenceModule(referenceModule).initializeReferenceModule(
                H_profileId,
                pubId,
                referenceModuleInitData
            );
    }

    function _initFollowModule(
        uint256 H_profileId,
        address followModule,
        bytes memory followModuleInitData,
        mapping(address => bool) storage _followModuleWhitelisted
    ) private returns (bytes memory) {
        if (!_followModuleWhitelisted[followModule]) revert Errors.FollowModuleNotWhitelisted();
        return IFollowModule(followModule).initializeFollowModule(H_profileId, followModuleInitData);
    }

    function _emitCommentCreated(
        DataTypes.CommentData memory vars,
        uint256 pubId,
        bytes memory collectModuleReturnData,
        bytes memory referenceModuleReturnData
    ) private {
        emit Events.CommentCreated(
            vars.H_profileId,
            pubId,
            vars.contentURI,
            vars.H_profileIdPointed,
            vars.pubIdPointed,
            vars.referenceModuleData,
            vars.collectModule,
            collectModuleReturnData,
            vars.referenceModule,
            referenceModuleReturnData,
            block.timestamp
        );
    }

    function _emitProfileCreated(
        uint256 H_profileId,
        DataTypes.CreateProfileData calldata vars,
        bytes memory followModuleReturnData
    ) internal {
        emit Events.ProfileCreated(
            H_profileId,
            msg.sender, // Creator is always the msg sender
            vars.to,
            vars.handle,
            vars.imageURI,
            vars.followModule,
            followModuleReturnData,
            vars.followNFTURI,
            block.timestamp
        );
    }

    function _validateHandle(string calldata handle) private pure {
        bytes memory byteHandle = bytes(handle);
        if (byteHandle.length == 0 || byteHandle.length > Constants.MAX_HANDLE_LENGTH)
            revert Errors.HandleLengthInvalid();

        uint256 byteHandleLength = byteHandle.length;
        for (uint256 i = 0; i < byteHandleLength; ) {
            if (
                (byteHandle[i] < '0' ||
                    byteHandle[i] > 'z' ||
                    (byteHandle[i] > '9' && byteHandle[i] < 'a')) &&
                byteHandle[i] != '.' &&
                byteHandle[i] != '-' &&
                byteHandle[i] != '_'
            ) revert Errors.HandleContainsInvalidCharacters();
            unchecked {
                ++i;
            }
        }
    }
}
