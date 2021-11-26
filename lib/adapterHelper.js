'use strict';

function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

function isIdValid(id) {
    const pattern = /^[a-z][\w-]*(?:\.[\w-]+)*$/i;
    return pattern.test(id);
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

function getTimeStringFormatted(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const timeStringFormatted = hours + 'h ' + ((minutes < 10) ? '0' : '') + minutes + 'm ' + ((seconds < 10) ? '0' : '') + seconds + 's';
    return timeStringFormatted;
}

function getDeviceStatusByStatus(status) {
    switch (status) {
        case 'stop':
            return 'stopped';
        case 'pause':
            return 'paused';
        case 'alert':
            return 'error';
        case 'auto':
        case 'edge':
        case 'spot':
        case 'single_room':
        case 'custom_area':
        case 'spot_area':
            return 'cleaning';
        default:
            return status;
    }
}

function isValidChargeStatus(status) {
    switch (status) {
        case 'returning':
        case 'charging':
        case 'idle':
            return true;
        default:
            return false;
    }
}

function isValidCleanStatus(status) {
    switch (status) {
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
            return false;
    }
}

function singleAreaValueStringIsValid(valueString) {
    const pattern = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$/;
    return pattern.test(valueString);
}

function areaValueStringIsValid(valueString) {
    if (valueString.endsWith(';')) {
        valueString = valueString.slice(0, -1);
    }
    const array = valueString.split(';');
    for (let i = 0; i < array.length; i++) {
        if (!singleAreaValueStringIsValid(array[i])) {
            return false;
        }
    }
    return (array.length > 0);
}

function areaValueStringWithCleaningsIsValid(valueString) {
    const pattern = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,[1-2]$/;
    return pattern.test(valueString);
}

function positionValueStringIsValid(valueString) {
    const pattern = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$/;
    return pattern.test(valueString);
}

function isSingleSpotAreaValue(valueString) {
    const pattern = /^[0-9]+$/;
    return pattern.test(valueString);
}

module.exports = {
    decrypt,
    isIdValid,
    getChannelNameById,
    getSubChannelNameById,
    getStateNameById,
    getDeviceStatusByStatus,
    isValidChargeStatus,
    isValidCleanStatus,
    areaValueStringIsValid,
    singleAreaValueStringIsValid,
    areaValueStringWithCleaningsIsValid,
    positionValueStringIsValid,
    isSingleSpotAreaValue,
    getTimeStringFormatted
};
