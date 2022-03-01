'use strict';

/**
 * It takes a key and a value, and returns the value decrypted with the key
 * @param {String} key - the key used to encrypt the message
 * @param {String} value - the encrypted string
 * @returns {String} The decrypted string
 */
function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

/**
 * Given an id, return true if it is a valid id, false otherwise
 * @param {String} id - The id of the object
 * @returns {Boolean} a Boolean value
 */
function isIdValid(id) {
    const pattern = /^[a-z][\w-]*(?:\.[\w-]+)*$/i;
    return pattern.test(id);
}

/**
 * Given a channel id, return the channel name
 * @param {String} id - The id of the channel
 * @returns {String} The channel name
 */
function getChannelNameById(id) {
    return id.split('.')[2];
}

/**
 * Given a channel ID, return the name of the sub channel
 * @param {String} id - The id of the channel
 * @returns {String} The name of the sub channel
 */
function getSubChannelNameById(id) {
    const pos = id.split('.').length - 2;
    return id.split('.')[pos];
}

/**
 * Given a state ID, return the name of the state
 * @param {String} id - The id of the state to get the name of
 * @returns {String} The state name
 */
function getStateNameById(id) {
    const pos = id.split('.').length - 1;
    return id.split('.')[pos];
}

/**
 * Given a total number of seconds, return a string that is formatted as hours, minutes, and seconds
 * @param {Number} totalSeconds - The total number of seconds to format
 * @returns {String} a string that is formatted as hours, minutes, and seconds
 */
function getTimeStringFormatted(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return hours + 'h ' + ((minutes < 10) ? '0' : '') + minutes + 'm ' + ((seconds < 10) ? '0' : '') + seconds + 's';
}

/**
 * Given a status, return the corresponding device status
 * @param {String} status - The current status of the vacuum cleaner
 * @returns {String} The status of the vacuum cleaner
 */
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

/**
 * Given a charge status, return true if the status is valid, false otherwise
 * @param {String} status - The current charge status
 * @returns {Boolean} a Boolean value
 */
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

/**
 * It checks to see if the status is a valid status.
 * @param {String} status - The current status of the vacuum cleaner
 * @returns {Boolean} a Boolean value
 */
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

/**
 * Given a string, return true if the string is a valid area value string, and false otherwise
 * @param {String} value - The string to be validated
 * @returns {Boolean} a Boolean value
 */
function singleAreaValueStringIsValid(value) {
    const pattern = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$/;
    return pattern.test(value);
}

/**
 * Given a string representing a list of areas, return true if the string is valid and false otherwise
 * @param {String} value - The value string to be validated
 * @returns {Boolean} a Boolean value
 */
function areaValueStringIsValid(value) {
    if (value.endsWith(';')) {
        value = value.slice(0, -1);
    }
    const array = value.split(';');
    for (let i = 0; i < array.length; i++) {
        if (!singleAreaValueStringIsValid(array[i])) {
            return false;
        }
    }
    return (array.length > 0);
}

/**
 * Given a string, return true if it is a valid area value string, and false otherwise
 * @param {String} value - The string to be validated
 * @returns {Boolean} a Boolean value
 */
function areaValueStringWithCleaningsIsValid(value) {
    const pattern = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,[1-2]$/;
    return pattern.test(value);
}

/**
 * Given a string, return true if the string is a valid position value string, and false otherwise
 * @param {String} value - The string to be tested
 * @returns {Boolean} a Boolean value
 */
function positionValueStringIsValid(value) {
    const pattern = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$/;
    return pattern.test(value);
}

/**
 * Given a string, return true if the string is a single spot area number, and false otherwise
 * @param {String} value - The value of the spot area(s)
 * @returns {Boolean} a Boolean value
 */
function isSingleSpotAreaValue(value) {
    const pattern = /^[0-9]+$/;
    return pattern.test(value);
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
