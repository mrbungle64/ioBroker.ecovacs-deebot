'use strict';

function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

function getChannelNameById(id) {
    return id.split('.')[2];
}

function getSubChannelNameById(id) {
    const pos = id.split('.').length - 2;
    return id.split('.')[pos];
}

function getStateNameById(id) {
    const pos = id.split('.').length - 1;
    return id.split('.')[pos];
}

function isValidChargeStatus(status) {
    switch(status) {
        case 'returning':
        case 'charging':
        case 'idle':
            return true;
        default:
            return  false;
    }
}

function isValidCleanStatus(status) {
    switch(status) {
        case 'stop':
        case 'pause':
        case 'auto':
        case 'edge':
        case 'spot':
        case 'spot_area':
        case 'custom_area':
        case 'single_room':
        case 'idle':
        case 'returning':
        case 'error':
        case 'alert':
            return true;
        default:
            return  false;
    }
}

module.exports = {
    decrypt,
    getChannelNameById,
    getSubChannelNameById,
    getStateNameById,
    isValidChargeStatus,
    isValidCleanStatus
};
