// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {IHealthHub} from '../interfaces/IHealthHub.sol';
import {Events} from '../libraries/Events.sol';
import {Helpers} from '../libraries/Helpers.sol';
import {DataTypes} from '../libraries/DataTypes.sol';
import {Errors} from '../libraries/Errors.sol';
import {PublishingLogic} from '../libraries/PublishingLogic.sol';
import {InteractionLogic} from '../libraries/InteractionLogic.sol';
import {HealthNFTBase} from '../core/base/HealthNFTBase.sol';
import {HealthMultiState} from '../core/base/HealthMultiState.sol';
import {VersionedInitializable} from '../upgradeability/VersionedInitializable.sol';
import {MockHealthHubV2Storage} from './MockHealthHubV2Storage.sol';

/**
 * @dev A mock upgraded HealthHub contract that is used mainly to validate that the initializer works as expected and
 * that the storage layout after an upgrade is valid.
 */
contract MockHealthHubV2 is
    HealthNFTBase,
    VersionedInitializable,
    HealthMultiState,
    MockHealthHubV2Storage
{
    uint256 internal constant REVISION = 2;

    function initialize(uint256 newValue) external initializer {
        _additionalValue = newValue;
    }

    function setAdditionalValue(uint256 newValue) external {
        _additionalValue = newValue;
    }

    function getAdditionalValue() external view returns (uint256) {
        return _additionalValue;
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return REVISION;
    }
}
