// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {IHealthHub} from '../interfaces/IHealthHub.sol';
import {Proxy} from '@openzeppelin/contracts/proxy/Proxy.sol';
import {Address} from '@openzeppelin/contracts/utils/Address.sol';

contract FollowNFTProxy is Proxy {
    using Address for address;
    address immutable HUB;

    constructor(bytes memory data) {
        HUB = msg.sender;
        IHealthHub(msg.sender).getFollowNFTImpl().functionDelegateCall(data);
    }

    function _implementation() internal view override returns (address) {
        return IHealthHub(HUB).getFollowNFTImpl();
    }
}
