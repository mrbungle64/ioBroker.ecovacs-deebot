'use strict';

const helper = require('./adapterHelper');
const {getCurrentMapChannel} = require('./mapObjects');

/**
 * Given a channel id, return true if the channel is a map subset channel
 * @param {String} id - The id of the channel to check
 * @returns {Boolean} a boolean value
 */
function isMapSubSetChannel(id) {
    return isSpotAreasChannel(id) || isVirtualBoundariesChannel(id);
}

/**
 * Given a channel id, return true if the channel is a spot areas channel
 * @param {String} id - The channel ID
 * @returns {Boolean} a boolean value
 */
function isSpotAreasChannel(id) {
    return !!id.includes('.spotAreas.');
}

/**
 * Given a channel id, return true if the channel is a virtual boundaries channel
 * @param {String} id - The id of the channel
 * @returns {Boolean} a boolean value
 */
function isVirtualBoundariesChannel(id) {
    return !!id.includes('.virtualBoundaries.');
}

/**
 * Save the current spot area values to the map.savedSpotAreas channel
 * @param {Object} adapter - The adapter object
 */
async function saveCurrentSpotAreaValues(adapter) {
    // TODO: Consolidate saveCurrentSpotAreaValues() and saveLastUsedCustomAreaValues()
    let state = await adapter.getStateAsync('map.currentUsedSpotAreas');
    if (!state || !state.val) {
        state = await adapter.getStateAsync('control.spotArea');
    }
    if (state && state.val) {
        await adapter.createChannelNotExists('map.savedSpotAreas', 'Saved areas');
        const timestamp = helper.getUnixTimestamp();
        const dateTime = adapter.getCurrentDateAndTimeFormatted();
        const savedAreaID = 'map.savedSpotAreas.spotArea_' + timestamp;
        adapter.log.info('Saving current spot area values: ' + state.val + ' on map ' + adapter.currentMapID);
        adapter.setObjectNotExists(
            savedAreaID, {
                type: 'state',
                common: {
                    name: 'myAreaName (mapID ' + adapter.currentMapID + ', spotArea ' + state.val + ')',
                    type: 'boolean',
                    role: 'button',
                    read: true,
                    write: true,
                    def: false,
                    unit: ''
                },
                native: {
                    currentMapID: adapter.currentMapID,
                    area: state.val,
                    dateTime: dateTime
                }
            }
        );
    }
}

/**
 * Save the last used custom area values to the corresponding object in the map.savedCustomAreas channel
 * @param {Object} adapter - The adapter object
 */
function saveLastUsedCustomAreaValues(adapter) {
    adapter.getStateAsync('map.lastUsedCustomAreaValues').then(state => {
        if (state && state.val) {
            adapter.createChannelNotExists('map.savedCustomAreas', 'Saved areas').then(() => {
                const timestamp = helper.getUnixTimestamp();
                let dateTime = adapter.getCurrentDateAndTimeFormatted();
                const savedAreaID = 'map.savedCustomAreas.customArea_' + timestamp;
                const customAreaValues = state.val;
                let currentMapID = adapter.currentMapID;
                adapter.log.info('Saving last used custom area values: ' + customAreaValues + ' on map ' + currentMapID);
                adapter.getObjectAsync('map.lastUsedCustomAreaValues').then(obj => {
                    if (obj) {
                        if ((obj.native) && (obj.native.dateTime) && (obj.native.currentMapID)) {
                            dateTime = obj.native.dateTime;
                            currentMapID = obj.native.currentMapID;
                        }
                        adapter.setObjectNotExists(
                            savedAreaID, {
                                type: 'state',
                                common: {
                                    name: 'myAreaName (mapID ' + currentMapID + ', customArea ' + customAreaValues + ')',
                                    type: 'boolean',
                                    role: 'button',
                                    read: true,
                                    write: true,
                                    def: false,
                                    unit: ''
                                },
                                native: {
                                    currentMapID: currentMapID,
                                    area: customAreaValues,
                                    dateTime: dateTime
                                }
                            });
                    }
                });
            });
        }
    });
}

/**
 * Save the virtual boundary of the map with the given mapID and the given mssID
 * to the corresponding object in the map.savedBoundaries channel
 * @param {Object} adapter - The adapter object
 * @param mapID {String} - The ID of the map
 * @param mssID {String} - The ID of the MSS that is being saved
 */
async function saveVirtualBoundary(adapter, mapID, mssID) {
    await adapter.createChannelNotExists('map.savedBoundaries', 'Saved virtual boundaries in the map for de-/activation');
    adapter.log.info('Saving virtual boundary: ' + mssID + ' on map ' + mapID);
    const mapChannel = await getCurrentMapChannel(adapter, mapID);
    const obj = await adapter.getObjectAsync(mapChannel + '.virtualBoundaries.' + mssID);
    if (obj && obj.native && obj.native.virtualBoundaryCoordinates && obj.native.virtualBoundaryID && obj.native.virtualBoundaryType) {
        await adapter.createChannelNotExists('map.savedBoundaries', 'Saved virtual boundaries in the map for de-/activation');
        const timestamp = helper.getUnixTimestamp();
        const dateTime = adapter.getCurrentDateAndTimeFormatted();
        const savedBoundaryID = 'map.savedBoundaries.virtualBoundary_' + timestamp;
        await adapter.setObjectNotExistsAsync(
            savedBoundaryID, {
                'type': 'state',
                'common': {
                    'name': 'myAreaName (mapID ' + mapID + ', virtualBoundary ' + obj.native.virtualBoundaryCoordinates + ')',
                    'type': 'boolean',
                    'role': 'button',
                    'read': true,
                    'write': true,
                    'def': false,
                    'unit': ''
                },
                native: {
                    'currentMapID': mapID,
                    'boundaryType': obj.native.virtualBoundaryType,
                    'boundaryCoordinates': obj.native.virtualBoundaryCoordinates,
                    'dateTime': dateTime,
                    'channelName': obj.common.name
                }
            });
    }
}

/**
 * Save the whole virtual boundary set of the map with the given mapID
 * to the corresponding object in the map.savedBoundarySets channel
 * @param {Object} adapter - The adapter object
 * @param {String} mapID - The ID of the map
 */
function saveVirtualBoundarySet(adapter, mapID) {
    adapter.createChannelNotExists('map.savedBoundarySets', 'Saved virtual boundary sets').then(() => {
        const virtualBoundarySet = [];
        adapter.log.info('Saving virtual boundary set on map ' + mapID);
        adapter.getChannelsOfAsync('map').then(virtualBoundaryChannels => {
            for (const r in virtualBoundaryChannels) {
                const channelObj = virtualBoundaryChannels[r];
                if (isVirtualBoundariesChannel(channelObj._id) && channelObj._id.includes('.' + mapID + '.')) {
                    if (channelObj.native && channelObj.native.virtualBoundaryCoordinates && channelObj.native.virtualBoundaryID && channelObj.native.virtualBoundaryType) {
                        const obj = {
                            'virtualBoundaryID': channelObj.native.virtualBoundaryID,
                            'boundaryType': channelObj.native.virtualBoundaryType,
                            'boundaryCoordinates': channelObj.native.virtualBoundaryCoordinates,
                            'channelName': channelObj.common.name
                        };
                        virtualBoundarySet.push(obj);
                    }
                }
            }
        }).then(() => {
            const timestamp = helper.getUnixTimestamp();
            const dateTime = adapter.getCurrentDateAndTimeFormatted();
            const savedBoundarySetID = 'map.savedBoundarySets.virtualBoundarySet_' + timestamp;
            adapter.setObjectNotExists(
                savedBoundarySetID, {
                    'type': 'state',
                    'common': {
                        'name': 'mySetName (mapID ' + mapID + ', date ' + dateTime + ')',
                        'type': 'boolean',
                        'role': 'button',
                        'read': true,
                        'write': true,
                        'def': false,
                        'unit': ''
                    },
                    'native': {
                        'currentMapID': mapID,
                        'virtualBoundarySet': virtualBoundarySet,
                        'dateTime': dateTime
                    }
                });
        });
    });
}

/**
 * Create a virtual boundary by the given state ID
 * @param {Object} adapter - The adapter object
 * @param {String} stateId - The ID of the state object to create the virtual boundary on
 */
async function createVirtualBoundary(adapter, stateId) {
    const obj = await adapter.getObjectAsync(stateId);
    if (obj && obj.native && obj.native.currentMapID) {
        adapter.log.info('Create virtual boundary on map ' + obj.native.currentMapID + ' with type ' + obj.native.boundaryType);
        adapter.vacbot.run('AddVirtualBoundary', obj.native.currentMapID.toString(), obj.native.boundaryCoordinates, obj.native.boundaryType);
        if (obj.native.boundaryType === 'vw') {
            adapter.intervalQueue.add('GetMaps');
        }
    }
}

/**
 * Get all the virtual boundary channels of a map
 * @param {Object} adapter - The adapter object that is used to communicate with the server
 * @param {String} mapID - The ID of the map that you want to get the virtual boundary channels for
 * @returns {Promise<Array>} an array of objects
 */
async function getVirtualBoundaryChannels(adapter, mapID) {
    const virtualBoundaryChannels = [];
    const channels = await adapter.getChannelsOfAsync('map');
    for (const r in channels) {
        if (Object.prototype.hasOwnProperty.call(channels, r)) {
            const channelObj = channels[r];
            if (isVirtualBoundariesChannel(channelObj._id) && channelObj._id.includes('.' + mapID + '.')) {
                const obj = {
                    'id': channelObj._id,
                    'native': channelObj.native
                };
                virtualBoundaryChannels.push(obj);
            }
        }
    }
    return virtualBoundaryChannels;
}

/**
 * Create virtual boundaries for the given state
 * @param {Object} adapter - The adapter object that is calling this function
 * @param {String} stateId - The state ID of the virtual boundary set
 */
async function createVirtualBoundarySet(adapter, stateId) {
    const obj = await adapter.getObjectAsync(stateId);
    if (obj && obj.native) {
        const channels = await getVirtualBoundaryChannels(adapter, obj.native.currentMapID);
        await deleteVirtualBoundariesForSet(adapter, stateId, channels);
        await createVirtualBoundariesForSet(adapter, stateId, channels);
        adapter.intervalQueue.add('GetMaps');
    }
}

/**
 * Delete the virtual boundaries for a set
 * @param {Object} adapter - The adapter object
 * @param {String} stateId - The ID of the object to delete the virtual boundaries for
 * @param {Object} virtualBoundaryChannels - A virtualBoundaryChannels object
 */
async function deleteVirtualBoundariesForSet(adapter, stateId, virtualBoundaryChannels) {
    const obj = await adapter.getObjectAsync(stateId);
    if (obj && obj.native && obj.native.currentMapID && obj.native.virtualBoundarySet) {
        const virtualBoundarySet = obj.native.virtualBoundarySet;
        for (const r in virtualBoundaryChannels) {
            if (Object.prototype.hasOwnProperty.call(virtualBoundaryChannels, r)) {
                const channelObj = virtualBoundaryChannels[r];
                if (channelObj.native && channelObj.native.virtualBoundaryCoordinates && channelObj.native.virtualBoundaryID && channelObj.native.virtualBoundaryType) {
                    let match = false;
                    for (const i in virtualBoundarySet) {
                        if (Object.prototype.hasOwnProperty.call(virtualBoundarySet, i)) {
                            if (!match) {
                                const virtualBoundary = virtualBoundarySet[i];
                                const match1 = (channelObj.native.virtualBoundaryID === virtualBoundary.virtualBoundaryID);
                                const match2 = (channelObj.native.virtualBoundaryCoordinates === virtualBoundary.boundaryCoordinates);
                                match = match1 || match2;
                            }
                        }
                    }
                    if (!match) {
                        adapter.log.info('DeleteVirtualBoundary ' + channelObj.native.virtualBoundaryID);
                        adapter.commandQueue.run('DeleteVirtualBoundary', obj.native.currentMapID.toString(), channelObj.native.virtualBoundaryID, channelObj.native.virtualBoundaryType);
                    }
                }
            }
        }
    }
}

/**
 * Create the virtual boundaries for a set
 * @param {Object} adapter - The adapter object
 * @param {String} stateId - The ID of the object to delete the virtual boundaries for
 * @param {Object} virtualBoundaryChannels - A virtualBoundaryChannels object
 */
async function createVirtualBoundariesForSet(adapter, stateId, virtualBoundaryChannels) {
    const obj = await adapter.getObjectAsync(stateId);
    if (obj && obj.native && obj.native.currentMapID && obj.native.virtualBoundarySet) {
        const virtualBoundarySet = obj.native.virtualBoundarySet;
        for (const i in virtualBoundarySet) {
            let match = false;
            if (Object.prototype.hasOwnProperty.call(virtualBoundarySet, i)) {
                const virtualBoundary = virtualBoundarySet[i];
                for (const r in virtualBoundaryChannels) {
                    if (Object.prototype.hasOwnProperty.call(virtualBoundaryChannels, r)) {
                        const channelObj = virtualBoundaryChannels[r];
                        if (!match) {
                            if (channelObj.native && channelObj.native.virtualBoundaryCoordinates && channelObj.native.virtualBoundaryID) {
                                const match1 = (channelObj.native.virtualBoundaryID === virtualBoundary.virtualBoundaryID);
                                const match2 = (channelObj.native.virtualBoundaryCoordinates === virtualBoundary.boundaryCoordinates);
                                match = match1 || match2;
                            }
                        }
                    }
                }
                if (!match) {
                    adapter.log.info('AddVirtualBoundary ' + virtualBoundary.boundaryCoordinates);
                    adapter.commandQueue.run('AddVirtualBoundary', obj.native.currentMapID.toString(), virtualBoundary.boundaryCoordinates, virtualBoundary.boundaryType);
                }
            }
        }
    }
}

/**
 * Delete a virtual boundary of the map with the given mapID and the given mssID
 * @param {Object} adapter - The adapter object.
 * @param {String} mapID - The ID of the map that the virtual boundary is on
 * @param {String} mssID - The ID of the virtual boundary to delete
 */
async function deleteVirtualBoundary(adapter, mapID, mssID) {
    const mapChannel = await getCurrentMapChannel(adapter, mapID);
    const objID = mapChannel + '.virtualBoundaries.' + mssID;
    const obj = await adapter.getObjectAsync(objID);
    if (obj) {
        const stateID = objID + '.virtualBoundaryType';
        const state = await adapter.getStateAsync(stateID);
        if (state && state.val) {
            const type = state.val;
            adapter.log.info('Delete virtual boundary on server: ' + mssID + ' on map ' + mapID + ' with type ' + type);
            adapter.commandQueue.run('DeleteVirtualBoundary', mapID.toString(), mssID, type);
        }
    }
    adapter.intervalQueue.add('GetMaps');
}

/**
 * Get the translated name of a spot area
 * @param {Object} adapter - the adapter object
 * @param {String} spotAreaName - The name of the spot area
 * @returns {String} the translated name
 */
function getAreaName_i18n(adapter, spotAreaName) {
    if (adapter.config.languageForSpotAreaNames === '') {
        return spotAreaName;
    }
    return adapter.vacbot.getAreaName_i18n(spotAreaName, adapter.config.languageForSpotAreaNames);
}

/**
 * Given a position, return true if the position is in the area of the rectangle
 * @param {Number} x - The x coordinate of the position you want to check
 * @param {Number} y - The y-coordinate of the position
 * @param {String} positionForRectangle - The position of the rectangle
 * @param [areaSize=500] - The size of the area to check
 * @returns {Boolean} a boolean value.
 */
function positionIsInRectangleForPosition(x, y, positionForRectangle, areaSize = 500) {
    const positionValues = getPositionValuesForExtendedArea(positionForRectangle, areaSize);
    return positionIsInAreaValueString(x, y, positionValues);
}

/**
 * Given a position for a rectangle and a size, return the position values for the extended area
 * @param {String} positionForRectangle - The position of the rectangle in the format "x1,y1,x2,y2"
 * @param {Number} areaSize - The size of the area around the rectangle that you want to capture
 * @returns {String} a string that is the x1,y1,x2,y2 values for the area around the rectangle
 */
function getPositionValuesForExtendedArea(positionForRectangle, areaSize) {
    const positionArray = positionForRectangle.split(',');
    const x1 = parseInt(positionArray[0]) - areaSize;
    const y1 = parseInt(positionArray[1]) - areaSize;
    const x2 = parseInt(positionArray[0]) + areaSize;
    const y2 = parseInt(positionArray[1]) + areaSize;
    return x1 + ',' + y1 + ',' + x2 + ',' + y2;
}

/**
 * Given a position and an area value string, return true if the position is in the area
 * @param {Number} x - The x coordinate of the position
 * @param {Number} y - The y coordinate of the position
 * @param {String} areaValueString - a string of the form "x1,y1,x2,y2" where x1,y1 are the coordinates of the top left corner of
 * the area and x2,y2 are the coordinates of the bottom right corner of the area
 * @returns {Boolean} a boolean value
 */
function positionIsInAreaValueString(x, y, areaValueString) {
    if (helper.singleAreaValueStringIsValid(areaValueString)) {
        const areaArray = areaValueString.split(',');
        const x1 = parseInt(areaArray[0]);
        const y1 = parseInt(areaArray[1]);
        const x2 = parseInt(areaArray[2]);
        const y2 = parseInt(areaArray[3]);
        if ((x >= x1) && (y >= y1) && (x <= x2) && (y <= y2)) {
            return true;
        }
    }
    return false;
}

module.exports = {
    isMapSubSetChannel,
    isSpotAreasChannel,
    isVirtualBoundariesChannel,
    positionIsInAreaValueString,
    positionIsInRectangleForPosition,
    getAreaName_i18n,
    saveVirtualBoundary,
    saveVirtualBoundarySet,
    saveLastUsedCustomAreaValues,
    saveCurrentSpotAreaValues,
    createVirtualBoundary,
    createVirtualBoundarySet,
    deleteVirtualBoundary,
    getPositionValuesForExtendedArea
};