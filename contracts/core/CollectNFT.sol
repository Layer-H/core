// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {ICollectNFT} from '../interfaces/ICollectNFT.sol';
import {IHealthHub} from '../interfaces/IHealthHub.sol';
import {Errors} from '../libraries/Errors.sol';
import {Events} from '../libraries/Events.sol';
import {HealthNFTBase} from './base/HealthNFTBase.sol';

/**
 * @title CollectNFT
 * @author Layer-H
 *
 * @notice This is the NFT contract that is minted upon collecting a given prescription. It is cloned upon
 * the first collect for a given prescription, and the token URI points to the original prescription's contentURI.
 */
contract CollectNFT is HealthNFTBase, ICollectNFT {
    address public immutable HUB;

    uint256 internal _H_profileId;
    uint256 internal _pubId;
    uint256 internal _tokenIdCounter;

    bool private _initialized;

    // We create the CollectNFT with the pre-computed HUB address before deploying the hub proxy in order
    // to initialize the hub proxy at construction.
    constructor(address hub) {
        if (hub == address(0)) revert Errors.InitParamsInvalid();
        HUB = hub;
        _initialized = true;
    }

    /// @inheritdoc ICollectNFT
    function initialize(
        uint256 H_profileId,
        uint256 pubId,
        string calldata name,
        string calldata symbol
    ) external override {
        if (_initialized) revert Errors.Initialized();
        _initialized = true;
        _H_profileId = H_profileId;
        _pubId = pubId;
        super._initialize(name, symbol);
        emit Events.CollectNFTInitialized(H_profileId, pubId, block.timestamp);
    }

    /// @inheritdoc ICollectNFT
    function mint(address to) external override returns (uint256) {
        if (msg.sender != HUB) revert Errors.NotHub();
        unchecked {
            uint256 tokenId = ++_tokenIdCounter;
            _mint(to, tokenId);
            return tokenId;
        }
    }

    /// @inheritdoc ICollectNFT
    function getSourcePublicationPointer() external view override returns (uint256, uint256) {
        return (_H_profileId, _pubId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert Errors.TokenDoesNotExist();
        return IHealthHub(HUB).getContentURI(_H_profileId, _pubId);
    }

    /**
     * @dev Upon transfers, we emit the transfer event in the hub.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        super._beforeTokenTransfer(from, to, tokenId);
        IHealthHub(HUB).emitCollectNFTTransferEvent(_H_profileId, _pubId, tokenId, from, to);
    }
}
