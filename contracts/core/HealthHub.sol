// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {IHealthHub} from '../interfaces/IHealthHub.sol';
import {Events} from '../libraries/Events.sol';
import {Helpers} from '../libraries/Helpers.sol';
import {Constants} from '../libraries/Constants.sol';
import {DataTypes} from '../libraries/DataTypes.sol';
import {Errors} from '../libraries/Errors.sol';
import {PublishingLogic} from '../libraries/PublishingLogic.sol';
import {ProfileTokenURILogic} from '../libraries/ProfileTokenURILogic.sol';
import {InteractionLogic} from '../libraries/InteractionLogic.sol';
import {HealthNFTBase} from './base/HealthNFTBase.sol';
import {HealthMultiState} from './base/HealthMultiState.sol';
import {HealthHubStorage} from './storage/HealthHubStorage.sol';
import {VersionedInitializable} from '../upgradeability/VersionedInitializable.sol';
import {IERC721Enumerable} from '@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol';

/**
 * @title HealthHub
 * @author Layer-H
 *
 * @notice This is the main entrypoint of the Layer-H. It contains governance functionality as well as
 * publishing and profile interaction functionality.
 *
 * NOTE: The Layer-H is unique in that frontend operators need to track a potentially overwhelming
 * number of NFT contracts and interactions at once. For that reason, we've made two quirky design decisions:
 *      1. Both Follow & Collect NFTs invoke an HealthHub callback on transfer with the sole purpose of emitting an event.
 *      2. Almost every event in the protocol emits the current block timestamp, reducing the need to fetch it manually.
 */
contract HealthHub is HealthNFTBase, VersionedInitializable, HealthMultiState, HealthHubStorage, IHealthHub {
    uint256 internal constant REVISION = 1;

    address internal immutable FOLLOW_NFT_IMPL;
    address internal immutable COLLECT_NFT_IMPL;

    /**
     * @dev This modifier reverts if the caller is not the configured governance address.
     */
    modifier onlyGov() {
        _validateCallerIsGovernance();
        _;
    }

    /**
     * @dev The constructor sets the immutable follow & collect NFT implementations.
     *
     * @param followNFTImpl The follow NFT implementation address.
     * @param collectNFTImpl The collect NFT implementation address.
     */
    constructor(address followNFTImpl, address collectNFTImpl) {
        if (followNFTImpl == address(0)) revert Errors.InitParamsInvalid();
        if (collectNFTImpl == address(0)) revert Errors.InitParamsInvalid();
        FOLLOW_NFT_IMPL = followNFTImpl;
        COLLECT_NFT_IMPL = collectNFTImpl;
    }

    /// @inheritdoc IHealthHub
    function initialize(
        string calldata name,
        string calldata symbol,
        address newGovernance
    ) external override initializer {
        super._initialize(name, symbol);
        _setState(DataTypes.ProtocolState.Paused);
        _setGovernance(newGovernance);
    }

    /// ***********************
    /// *****GOV FUNCTIONS*****
    /// ***********************

    /// @inheritdoc IHealthHub
    function setGovernance(address newGovernance) external override onlyGov {
        _setGovernance(newGovernance);
    }

    /// @inheritdoc IHealthHub
    function setEmergencyAdmin(address newEmergencyAdmin) external override onlyGov {
        address prevEmergencyAdmin = _emergencyAdmin;
        _emergencyAdmin = newEmergencyAdmin;
        emit Events.EmergencyAdminSet(
            msg.sender,
            prevEmergencyAdmin,
            newEmergencyAdmin,
            block.timestamp
        );
    }

    /// @inheritdoc IHealthHub
    function setState(DataTypes.ProtocolState newState) external override {
        if (msg.sender == _emergencyAdmin) {
            if (newState == DataTypes.ProtocolState.Unpaused)
                revert Errors.EmergencyAdminCannotUnpause();
            _validateNotPaused();
        } else if (msg.sender != _governance) {
            revert Errors.NotGovernanceOrEmergencyAdmin();
        }
        _setState(newState);
    }

    ///@inheritdoc IHealthHub
    function whitelistProfileCreator(address profileCreator, bool whitelist)
        external
        override
        onlyGov
    {
        _profileCreatorWhitelisted[profileCreator] = whitelist;
        emit Events.ProfileCreatorWhitelisted(profileCreator, whitelist, block.timestamp);
    }

    /// @inheritdoc IHealthHub
    function whitelistFollowModule(address followModule, bool whitelist) external override onlyGov {
        _followModuleWhitelisted[followModule] = whitelist;
        emit Events.FollowModuleWhitelisted(followModule, whitelist, block.timestamp);
    }

    /// @inheritdoc IHealthHub
    function whitelistReferenceModule(address referenceModule, bool whitelist)
        external
        override
        onlyGov
    {
        _referenceModuleWhitelisted[referenceModule] = whitelist;
        emit Events.ReferenceModuleWhitelisted(referenceModule, whitelist, block.timestamp);
    }

    /// @inheritdoc IHealthHub
    function whitelistCollectModule(address collectModule, bool whitelist)
        external
        override
        onlyGov
    {
        _collectModuleWhitelisted[collectModule] = whitelist;
        emit Events.CollectModuleWhitelisted(collectModule, whitelist, block.timestamp);
    }

    /// *********************************
    /// *****PROFILE OWNER FUNCTIONS*****
    /// *********************************

    /// @inheritdoc IHealthHub
    function createProfile(DataTypes.CreateProfileData calldata vars)
        external
        override
        whenNotPaused
        returns (uint256)
    {
        if (!_profileCreatorWhitelisted[msg.sender]) revert Errors.ProfileCreatorNotWhitelisted();
        unchecked {
            uint256 H_profileId = ++_profileCounter;
            _mint(vars.to, H_profileId);
            PublishingLogic.createProfile(
                vars,
                H_profileId,
                _H_profileIdByHandleHash,
                _profileById,
                _followModuleWhitelisted
            );
            return H_profileId;
        }
    }

    /// @inheritdoc IHealthHub
    function setDefaultProfile(uint256 H_profileId) external override whenNotPaused {
        _setDefaultProfile(msg.sender, H_profileId);
    }

    /// @inheritdoc IHealthHub
    function setDefaultProfileWithSig(DataTypes.SetDefaultProfileWithSigData calldata vars)
        external
        override
        whenNotPaused
    {
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            SET_DEFAULT_PROFILE_WITH_SIG_TYPEHASH,
                            vars.wallet,
                            vars.H_profileId,
                            sigNonces[vars.wallet]++,
                            vars.sig.deadline
                        )
                    )
                ),
                vars.wallet,
                vars.sig
            );
            _setDefaultProfile(vars.wallet, vars.H_profileId);
        }
    }

    /// @inheritdoc IHealthHub
    function setFollowModule(
        uint256 H_profileId,
        address followModule,
        bytes calldata followModuleInitData
    ) external override whenNotPaused {
        _validateCallerIsProfileOwner(H_profileId);
        PublishingLogic.setFollowModule(
            H_profileId,
            followModule,
            followModuleInitData,
            _profileById[H_profileId],
            _followModuleWhitelisted
        );
    }

    /// @inheritdoc IHealthHub
    function setFollowModuleWithSig(DataTypes.SetFollowModuleWithSigData calldata vars)
        external
        override
        whenNotPaused
    {
        address owner = ownerOf(vars.H_profileId);
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            SET_FOLLOW_MODULE_WITH_SIG_TYPEHASH,
                            vars.H_profileId,
                            vars.followModule,
                            keccak256(vars.followModuleInitData),
                            sigNonces[owner]++,
                            vars.sig.deadline
                        )
                    )
                ),
                owner,
                vars.sig
            );
        }
        PublishingLogic.setFollowModule(
            vars.H_profileId,
            vars.followModule,
            vars.followModuleInitData,
            _profileById[vars.H_profileId],
            _followModuleWhitelisted
        );
    }

    /// @inheritdoc IHealthHub
    function setDispatcher(uint256 H_profileId, address dispatcher) external override whenNotPaused {
        _validateCallerIsProfileOwner(H_profileId);
        _setDispatcher(H_profileId, dispatcher);
    }

    /// @inheritdoc IHealthHub
    function setDispatcherWithSig(DataTypes.SetDispatcherWithSigData calldata vars)
        external
        override
        whenNotPaused
    {
        address owner = ownerOf(vars.H_profileId);
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            SET_DISPATCHER_WITH_SIG_TYPEHASH,
                            vars.H_profileId,
                            vars.dispatcher,
                            sigNonces[owner]++,
                            vars.sig.deadline
                        )
                    )
                ),
                owner,
                vars.sig
            );
        }
        _setDispatcher(vars.H_profileId, vars.dispatcher);
    }

    /// @inheritdoc IHealthHub
    function setProfileImageURI(uint256 H_profileId, string calldata imageURI)
        external
        override
        whenNotPaused
    {
        _validateCallerIsProfileOwnerOrDispatcher(H_profileId);
        _setProfileImageURI(H_profileId, imageURI);
    }

    /// @inheritdoc IHealthHub
    function setProfileImageURIWithSig(DataTypes.SetProfileImageURIWithSigData calldata vars)
        external
        override
        whenNotPaused
    {
        address owner = ownerOf(vars.H_profileId);
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            SET_PROFILE_IMAGE_URI_WITH_SIG_TYPEHASH,
                            vars.H_profileId,
                            keccak256(bytes(vars.imageURI)),
                            sigNonces[owner]++,
                            vars.sig.deadline
                        )
                    )
                ),
                owner,
                vars.sig
            );
        }
        _setProfileImageURI(vars.H_profileId, vars.imageURI);
    }

    /// @inheritdoc IHealthHub
    function setFollowNFTURI(uint256 H_profileId, string calldata followNFTURI)
        external
        override
        whenNotPaused
    {
        _validateCallerIsProfileOwnerOrDispatcher(H_profileId);
        _setFollowNFTURI(H_profileId, followNFTURI);
    }

    /// @inheritdoc IHealthHub
    function setFollowNFTURIWithSig(DataTypes.SetFollowNFTURIWithSigData calldata vars)
        external
        override
        whenNotPaused
    {
        address owner = ownerOf(vars.H_profileId);
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            SET_FOLLOW_NFT_URI_WITH_SIG_TYPEHASH,
                            vars.H_profileId,
                            keccak256(bytes(vars.followNFTURI)),
                            sigNonces[owner]++,
                            vars.sig.deadline
                        )
                    )
                ),
                owner,
                vars.sig
            );
        }
        _setFollowNFTURI(vars.H_profileId, vars.followNFTURI);
    }

    /// @inheritdoc IHealthHub
    function post(DataTypes.PostData calldata vars)
        external
        override
        whenPublishingEnabled
        returns (uint256)
    {
        _validateCallerIsProfileOwnerOrDispatcher(vars.H_profileId);
        return
            _createPost(
                vars.H_profileId,
                vars.contentURI,
                vars.collectModule,
                vars.collectModuleInitData,
                vars.referenceModule,
                vars.referenceModuleInitData
            );
    }

    /// @inheritdoc IHealthHub
    function postWithSig(DataTypes.PostWithSigData calldata vars)
        external
        override
        whenPublishingEnabled
        returns (uint256)
    {
        address owner = ownerOf(vars.H_profileId);
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            POST_WITH_SIG_TYPEHASH,
                            vars.H_profileId,
                            keccak256(bytes(vars.contentURI)),
                            vars.collectModule,
                            keccak256(vars.collectModuleInitData),
                            vars.referenceModule,
                            keccak256(vars.referenceModuleInitData),
                            sigNonces[owner]++,
                            vars.sig.deadline
                        )
                    )
                ),
                owner,
                vars.sig
            );
        }
        return
            _createPost(
                vars.H_profileId,
                vars.contentURI,
                vars.collectModule,
                vars.collectModuleInitData,
                vars.referenceModule,
                vars.referenceModuleInitData
            );
    }

    /// @inheritdoc IHealthHub
    function comment(DataTypes.CommentData calldata vars)
        external
        override
        whenPublishingEnabled
        returns (uint256)
    {
        _validateCallerIsProfileOwnerOrDispatcher(vars.H_profileId);
        return _createComment(vars);
    }

    /// @inheritdoc IHealthHub
    function commentWithSig(DataTypes.CommentWithSigData calldata vars)
        external
        override
        whenPublishingEnabled
        returns (uint256)
    {
        address owner = ownerOf(vars.H_profileId);
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            COMMENT_WITH_SIG_TYPEHASH,
                            vars.H_profileId,
                            keccak256(bytes(vars.contentURI)),
                            vars.H_profileIdPointed,
                            vars.pubIdPointed,
                            keccak256(vars.referenceModuleData),
                            vars.collectModule,
                            keccak256(vars.collectModuleInitData),
                            vars.referenceModule,
                            keccak256(vars.referenceModuleInitData),
                            sigNonces[owner]++,
                            vars.sig.deadline
                        )
                    )
                ),
                owner,
                vars.sig
            );
        }
        return
            _createComment(
                DataTypes.CommentData(
                    vars.H_profileId,
                    vars.contentURI,
                    vars.H_profileIdPointed,
                    vars.pubIdPointed,
                    vars.referenceModuleData,
                    vars.collectModule,
                    vars.collectModuleInitData,
                    vars.referenceModule,
                    vars.referenceModuleInitData
                )
            );
    }

    /// @inheritdoc IHealthHub
    function actuate(DataTypes.ActuateData calldata vars)
        external
        override
        whenPublishingEnabled
        returns (uint256)
    {
        _validateCallerIsProfileOwnerOrDispatcher(vars.H_profileId);
        return _createActuate(vars);
    }

    /// @inheritdoc IHealthHub
    function actuateWithSig(DataTypes.ActuateWithSigData calldata vars)
        external
        override
        whenPublishingEnabled
        returns (uint256)
    {
        address owner = ownerOf(vars.H_profileId);
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            MIRROR_WITH_SIG_TYPEHASH,
                            vars.H_profileId,
                            vars.H_profileIdPointed,
                            vars.pubIdPointed,
                            keccak256(vars.referenceModuleData),
                            vars.referenceModule,
                            keccak256(vars.referenceModuleInitData),
                            sigNonces[owner]++,
                            vars.sig.deadline
                        )
                    )
                ),
                owner,
                vars.sig
            );
        }
        return
            _createActuate(
                DataTypes.ActuateData(
                    vars.H_profileId,
                    vars.H_profileIdPointed,
                    vars.pubIdPointed,
                    vars.referenceModuleData,
                    vars.referenceModule,
                    vars.referenceModuleInitData
                )
            );
    }

    /**
     * @notice Burns a profile, this maintains the profile data struct, but deletes the
     * handle hash to profile ID mapping value.
     *
     * NOTE: This overrides the HealthNFTBase contract's `burn()` function and calls it to fully burn
     * the NFT.
     */
    function burn(uint256 tokenId) public override whenNotPaused {
        super.burn(tokenId);
        _clearHandleHash(tokenId);
    }

    /**
     * @notice Burns a profile with a signature, this maintains the profile data struct, but deletes the
     * handle hash to profile ID mapping value.
     *
     * NOTE: This overrides the HealthNFTBase contract's `burnWithSig()` function and calls it to fully burn
     * the NFT.
     */
    function burnWithSig(uint256 tokenId, DataTypes.EIP712Signature calldata sig)
        public
        override
        whenNotPaused
    {
        super.burnWithSig(tokenId, sig);
        _clearHandleHash(tokenId);
    }

    /// ***************************************
    /// *****PROFILE INTERACTION FUNCTIONS*****
    /// ***************************************

    /// @inheritdoc IHealthHub
    function follow(uint256[] calldata H_profileIds, bytes[] calldata datas)
        external
        override
        whenNotPaused
        returns (uint256[] memory)
    {
        return
            InteractionLogic.follow(
                msg.sender,
                H_profileIds,
                datas,
                _profileById,
                _H_profileIdByHandleHash
            );
    }

    /// @inheritdoc IHealthHub
    function followWithSig(DataTypes.FollowWithSigData calldata vars)
        external
        override
        whenNotPaused
        returns (uint256[] memory)
    {
        uint256 dataLength = vars.datas.length;
        bytes32[] memory dataHashes = new bytes32[](dataLength);
        for (uint256 i = 0; i < dataLength; ) {
            dataHashes[i] = keccak256(vars.datas[i]);
            unchecked {
                ++i;
            }
        }
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            FOLLOW_WITH_SIG_TYPEHASH,
                            keccak256(abi.encodePacked(vars.H_profileIds)),
                            keccak256(abi.encodePacked(dataHashes)),
                            sigNonces[vars.follower]++,
                            vars.sig.deadline
                        )
                    )
                ),
                vars.follower,
                vars.sig
            );
        }
        return
            InteractionLogic.follow(
                vars.follower,
                vars.H_profileIds,
                vars.datas,
                _profileById,
                _H_profileIdByHandleHash
            );
    }

    /// @inheritdoc IHealthHub
    function collect(
        uint256 H_profileId,
        uint256 pubId,
        bytes calldata data
    ) external override whenNotPaused returns (uint256) {
        return
            InteractionLogic.collect(
                msg.sender,
                H_profileId,
                pubId,
                data,
                COLLECT_NFT_IMPL,
                _pubByIdByProfile,
                _profileById
            );
    }

    /// @inheritdoc IHealthHub
    function collectWithSig(DataTypes.CollectWithSigData calldata vars)
        external
        override
        whenNotPaused
        returns (uint256)
    {
        unchecked {
            _validateRecoveredAddress(
                _calculateDigest(
                    keccak256(
                        abi.encode(
                            COLLECT_WITH_SIG_TYPEHASH,
                            vars.H_profileId,
                            vars.pubId,
                            keccak256(vars.data),
                            sigNonces[vars.collector]++,
                            vars.sig.deadline
                        )
                    )
                ),
                vars.collector,
                vars.sig
            );
        }
        return
            InteractionLogic.collect(
                vars.collector,
                vars.H_profileId,
                vars.pubId,
                vars.data,
                COLLECT_NFT_IMPL,
                _pubByIdByProfile,
                _profileById
            );
    }

    /// @inheritdoc IHealthHub
    function emitFollowNFTTransferEvent(
        uint256 H_profileId,
        uint256 followNFTId,
        address from,
        address to
    ) external override {
        address expectedFollowNFT = _profileById[H_profileId].followNFT;
        if (msg.sender != expectedFollowNFT) revert Errors.CallerNotFollowNFT();
        emit Events.FollowNFTTransferred(H_profileId, followNFTId, from, to, block.timestamp);
    }

    /// @inheritdoc IHealthHub
    function emitCollectNFTTransferEvent(
        uint256 H_profileId,
        uint256 pubId,
        uint256 collectNFTId,
        address from,
        address to
    ) external override {
        address expectedCollectNFT = _pubByIdByProfile[H_profileId][pubId].collectNFT;
        if (msg.sender != expectedCollectNFT) revert Errors.CallerNotCollectNFT();
        emit Events.CollectNFTTransferred(
            H_profileId,
            pubId,
            collectNFTId,
            from,
            to,
            block.timestamp
        );
    }

    /// *********************************
    /// *****EXTERNAL VIEW FUNCTIONS*****
    /// *********************************

    /// @inheritdoc IHealthHub
    function isProfileCreatorWhitelisted(address profileCreator)
        external
        view
        override
        returns (bool)
    {
        return _profileCreatorWhitelisted[profileCreator];
    }

    /// @inheritdoc IHealthHub
    function defaultProfile(address wallet) external view override returns (uint256) {
        return _defaultProfileByAddress[wallet];
    }

    /// @inheritdoc IHealthHub
    function isFollowModuleWhitelisted(address followModule) external view override returns (bool) {
        return _followModuleWhitelisted[followModule];
    }

    /// @inheritdoc IHealthHub
    function isReferenceModuleWhitelisted(address referenceModule)
        external
        view
        override
        returns (bool)
    {
        return _referenceModuleWhitelisted[referenceModule];
    }

    /// @inheritdoc IHealthHub
    function isCollectModuleWhitelisted(address collectModule)
        external
        view
        override
        returns (bool)
    {
        return _collectModuleWhitelisted[collectModule];
    }

    /// @inheritdoc IHealthHub
    function getGovernance() external view override returns (address) {
        return _governance;
    }

    /// @inheritdoc IHealthHub
    function getDispatcher(uint256 H_profileId) external view override returns (address) {
        return _dispatcherByProfile[H_profileId];
    }

    /// @inheritdoc IHealthHub
    function getPubCount(uint256 H_profileId) external view override returns (uint256) {
        return _profileById[H_profileId].pubCount;
    }

    /// @inheritdoc IHealthHub
    function getFollowNFT(uint256 H_profileId) external view override returns (address) {
        return _profileById[H_profileId].followNFT;
    }

    /// @inheritdoc IHealthHub
    function getFollowNFTURI(uint256 H_profileId) external view override returns (string memory) {
        return _profileById[H_profileId].followNFTURI;
    }

    /// @inheritdoc IHealthHub
    function getCollectNFT(uint256 H_profileId, uint256 pubId)
        external
        view
        override
        returns (address)
    {
        return _pubByIdByProfile[H_profileId][pubId].collectNFT;
    }

    /// @inheritdoc IHealthHub
    function getFollowModule(uint256 H_profileId) external view override returns (address) {
        return _profileById[H_profileId].followModule;
    }

    /// @inheritdoc IHealthHub
    function getCollectModule(uint256 H_profileId, uint256 pubId)
        external
        view
        override
        returns (address)
    {
        return _pubByIdByProfile[H_profileId][pubId].collectModule;
    }

    /// @inheritdoc IHealthHub
    function getReferenceModule(uint256 H_profileId, uint256 pubId)
        external
        view
        override
        returns (address)
    {
        return _pubByIdByProfile[H_profileId][pubId].referenceModule;
    }

    /// @inheritdoc IHealthHub
    function getHandle(uint256 H_profileId) external view override returns (string memory) {
        return _profileById[H_profileId].handle;
    }

    /// @inheritdoc IHealthHub
    function getPubPointer(uint256 H_profileId, uint256 pubId)
        external
        view
        override
        returns (uint256, uint256)
    {
        uint256 H_profileIdPointed = _pubByIdByProfile[H_profileId][pubId].H_profileIdPointed;
        uint256 pubIdPointed = _pubByIdByProfile[H_profileId][pubId].pubIdPointed;
        return (H_profileIdPointed, pubIdPointed);
    }

    /// @inheritdoc IHealthHub
    function getContentURI(uint256 H_profileId, uint256 pubId)
        external
        view
        override
        returns (string memory)
    {
        (uint256 rootH_ProfileId, uint256 rootPubId, ) = Helpers.getPointedIfActuate(
            H_profileId,
            pubId,
            _pubByIdByProfile
        );
        return _pubByIdByProfile[rootH_ProfileId][rootPubId].contentURI;
    }

    /// @inheritdoc IHealthHub
    function getH_ProfileIdByHandle(string calldata handle) external view override returns (uint256) {
        bytes32 handleHash = keccak256(bytes(handle));
        return _H_profileIdByHandleHash[handleHash];
    }

    /// @inheritdoc IHealthHub
    function getProfile(uint256 H_profileId)
        external
        view
        override
        returns (DataTypes.ProfileStruct memory)
    {
        return _profileById[H_profileId];
    }

    /// @inheritdoc IHealthHub
    function getPub(uint256 H_profileId, uint256 pubId)
        external
        view
        override
        returns (DataTypes.PublicationStruct memory)
    {
        return _pubByIdByProfile[H_profileId][pubId];
    }

    /// @inheritdoc IHealthHub
    function getPubType(uint256 H_profileId, uint256 pubId)
        external
        view
        override
        returns (DataTypes.PubType)
    {
        if (pubId == 0 || _profileById[H_profileId].pubCount < pubId) {
            return DataTypes.PubType.Nonexistent;
        } else if (_pubByIdByProfile[H_profileId][pubId].collectModule == address(0)) {
            return DataTypes.PubType.Actuate;
        } else if (_pubByIdByProfile[H_profileId][pubId].H_profileIdPointed == 0) {
            return DataTypes.PubType.Post;
        } else {
            return DataTypes.PubType.Comment;
        }
    }

    /**
     * @dev Overrides the ERC721 tokenURI function to return the associated URI with a given profile.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address followNFT = _profileById[tokenId].followNFT;
        return
            ProfileTokenURILogic.getProfileTokenURI(
                tokenId,
                followNFT == address(0) ? 0 : IERC721Enumerable(followNFT).totalSupply(),
                ownerOf(tokenId),
                _profileById[tokenId].handle,
                _profileById[tokenId].imageURI
            );
    }

    /// @inheritdoc IHealthHub
    function getFollowNFTImpl() external view override returns (address) {
        return FOLLOW_NFT_IMPL;
    }

    /// @inheritdoc IHealthHub
    function getCollectNFTImpl() external view override returns (address) {
        return COLLECT_NFT_IMPL;
    }

    /// ****************************
    /// *****INTERNAL FUNCTIONS*****
    /// ****************************

    function _setGovernance(address newGovernance) internal {
        address prevGovernance = _governance;
        _governance = newGovernance;
        emit Events.GovernanceSet(msg.sender, prevGovernance, newGovernance, block.timestamp);
    }

    function _createPost(
        uint256 H_profileId,
        string memory contentURI,
        address collectModule,
        bytes memory collectModuleData,
        address referenceModule,
        bytes memory referenceModuleData
    ) internal returns (uint256) {
        unchecked {
            uint256 pubId = ++_profileById[H_profileId].pubCount;
            PublishingLogic.createPost(
                H_profileId,
                contentURI,
                collectModule,
                collectModuleData,
                referenceModule,
                referenceModuleData,
                pubId,
                _pubByIdByProfile,
                _collectModuleWhitelisted,
                _referenceModuleWhitelisted
            );
            return pubId;
        }
    }

    /*
     * If the profile ID is zero, this is the equivalent of "unsetting" a default profile.
     * Note that the wallet address should either be the message sender or validated via a signature
     * prior to this function call.
     */
    function _setDefaultProfile(address wallet, uint256 H_profileId) internal {
        if (H_profileId > 0 && wallet != ownerOf(H_profileId)) revert Errors.NotProfileOwner();

        _defaultProfileByAddress[wallet] = H_profileId;

        emit Events.DefaultProfileSet(wallet, H_profileId, block.timestamp);
    }

    function _createComment(DataTypes.CommentData memory vars) internal returns (uint256) {
        unchecked {
            uint256 pubId = ++_profileById[vars.H_profileId].pubCount;
            PublishingLogic.createComment(
                vars,
                pubId,
                _profileById,
                _pubByIdByProfile,
                _collectModuleWhitelisted,
                _referenceModuleWhitelisted
            );
            return pubId;
        }
    }

    function _createActuate(DataTypes.ActuateData memory vars) internal returns (uint256) {
        unchecked {
            uint256 pubId = ++_profileById[vars.H_profileId].pubCount;
            PublishingLogic.createActuate(
                vars,
                pubId,
                _pubByIdByProfile,
                _referenceModuleWhitelisted
            );
            return pubId;
        }
    }

    function _setDispatcher(uint256 H_profileId, address dispatcher) internal {
        _dispatcherByProfile[H_profileId] = dispatcher;
        emit Events.DispatcherSet(H_profileId, dispatcher, block.timestamp);
    }

    function _setProfileImageURI(uint256 H_profileId, string calldata imageURI) internal {
        if (bytes(imageURI).length > Constants.MAX_PROFILE_IMAGE_URI_LENGTH)
            revert Errors.ProfileImageURILengthInvalid();
        _profileById[H_profileId].imageURI = imageURI;
        emit Events.ProfileImageURISet(H_profileId, imageURI, block.timestamp);
    }

    function _setFollowNFTURI(uint256 H_profileId, string calldata followNFTURI) internal {
        _profileById[H_profileId].followNFTURI = followNFTURI;
        emit Events.FollowNFTURISet(H_profileId, followNFTURI, block.timestamp);
    }

    function _clearHandleHash(uint256 H_profileId) internal {
        bytes32 handleHash = keccak256(bytes(_profileById[H_profileId].handle));
        _H_profileIdByHandleHash[handleHash] = 0;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override whenNotPaused {
        if (_dispatcherByProfile[tokenId] != address(0)) {
            _setDispatcher(tokenId, address(0));
        }

        if (_defaultProfileByAddress[from] == tokenId) {
            _defaultProfileByAddress[from] = 0;
        }

        super._beforeTokenTransfer(from, to, tokenId);
    }

    function _validateCallerIsProfileOwnerOrDispatcher(uint256 H_profileId) internal view {
        if (msg.sender == ownerOf(H_profileId) || msg.sender == _dispatcherByProfile[H_profileId]) {
            return;
        }
        revert Errors.NotProfileOwnerOrDispatcher();
    }

    function _validateCallerIsProfileOwner(uint256 H_profileId) internal view {
        if (msg.sender != ownerOf(H_profileId)) revert Errors.NotProfileOwner();
    }

    function _validateCallerIsGovernance() internal view {
        if (msg.sender != _governance) revert Errors.NotGovernance();
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return REVISION;
    }
}
