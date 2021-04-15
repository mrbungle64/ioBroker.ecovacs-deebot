const helper = require('./adapterHelper');

function isMapSubSetChannel(id) {
    return isSpotAreasChannel(id) || isVirtualBoundariesChannel(id);
}

function isSpotAreasChannel(id) {
    return !!id.includes('.spotAreas.');
}

function isVirtualBoundariesChannel(id) {
    return !!id.includes('.virtualBoundaries.');
}

function cleanSpotArea(adapter, mapID, mssID) {
    if (mapID === adapter.currentMapID && (!adapter.deebotPositionIsInvalid || !adapter.getModel().isSupportedFeature('map.deebotPositionIsInvalid'))) {
        adapter.log.info('Start cleaning spot area: ' + mssID + ' on map ' + mapID);
        adapter.vacbot.run('spotArea', 'start', mssID);
        if (adapter.spotAreaCleanings > 1) {
            adapter.cleaningQueue.createForId('control', 'spotArea', mssID);
        }
    } else {
        adapter.log.error('failed start cleaning spot area: ' + mssID + ' - position invalid or bot not on map ' + mapID + ' (current mapID: ' + adapter.currentMapID + ')');
    }
    //TODO: relocate if not correct map, queueing until relocate finished (async)
}

async function saveLastUsedSpotAreaValues(adapter) {
    // TODO: Consolidate saveLastUsedSpotAreaValues() and saveLastUsedCustomAreaValues()
    const state = await adapter.getStateAsync('control.spotArea');
    if (state && state.val) {
        await adapter.createChannelNotExists('map.savedSpotAreas', 'Saved areas');
        const timestamp = Math.floor(Date.now() / 1000);
        const dateTime = adapter.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
        const savedAreaID = 'map.savedSpotAreas.spotArea_' + timestamp;
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

function saveLastUsedCustomAreaValues(adapter) {
    adapter.getStateAsync('map.lastUsedCustomAreaValues').then(state => {
        if (state && state.val) {
            adapter.createChannelNotExists('map.savedCustomAreas', 'Saved areas').then(() => {
                const timestamp = Math.floor(Date.now() / 1000);
                let dateTime = adapter.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                const savedAreaID = 'map.savedCustomAreas.customArea_' + timestamp;
                const customAreaValues = state.val;
                let currentMapID = adapter.currentMapID;
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

async function saveVirtualBoundary(adapter, mapID, mssID) {
    await adapter.createChannelNotExists('map.savedBoundaries', 'Saved virtual boundaries in the map for de-/activation');
    adapter.log.info('save virtual boundary: ' + mssID + ' on map ' + mapID);
    const obj = await adapter.getObjectAsync('map.' + mapID + '.virtualBoundaries.' + mssID);
    if (obj && obj.native && obj.native.virtualBoundaryCoordinates && obj.native.virtualBoundaryID && obj.native.virtualBoundaryType) {
        await adapter.createChannelNotExists('map.savedBoundaries', 'Saved virtual boundaries in the map for de-/activation');
        const timestamp = Math.floor(Date.now() / 1000);
        const dateTime = adapter.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
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

function saveVirtualBoundarySet(adapter, mapID) {
    adapter.createChannelNotExists('map.savedBoundarySets', 'Saved virtual boundary sets').then(() => {
        const virtualBoundarySet = [];
        adapter.log.info('save virtual boundary set on map ' + mapID);
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
            const timestamp = Math.floor(Date.now() / 1000);
            const dateTime = adapter.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
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

async function createVirtualBoundarySet(adapter, stateId) {
    const obj = await adapter.getObjectAsync(stateId);
    if (obj && obj.native) {
        const mapID = obj.native.currentMapID;
        const channels = await getVirtualBoundaryChannels(adapter, mapID);
        await deleteVirtualBoundariesForSet(adapter, stateId, channels);
        await createVirtualBoundariesForSet(adapter, stateId, channels);
        adapter.intervalQueue.add('GetMaps');
    }
}

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
                        const mapID = obj.native.currentMapID.toString();
                        adapter.log.info('DeleteVirtualBoundary ' + channelObj.native.virtualBoundaryID);
                        adapter.commandQueue.run('DeleteVirtualBoundary', mapID, channelObj.native.virtualBoundaryID, channelObj.native.virtualBoundaryType);
                    }
                }
            }
        }
    }
}

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

async function deleteVirtualBoundary(adapter, mapID, mssID) {
    const objID = 'map.' + mapID + '.virtualBoundaries.' + mssID;
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

function rerunLastUsedCustomAreaValues(adapter) {
    adapter.getStateAsync('map.lastUsedCustomAreaValues').then(state => {
        if (state && state.val) {
            adapter.startCustomArea(state.val, adapter.customAreaCleanings);
        }
    });
}

function cleanSavedCustomArea(adapter, id) {
    const pattern = /map\.savedCustomAreas\.customArea_[0-9]{10}$/;
    if (pattern.test(id)) {
        adapter.getObjectAsync(id).then(obj => {
            if (obj && obj.native && obj.native.area) {
                adapter.startCustomArea(obj.native.area, adapter.customAreaCleanings);
            }
        });
    }
}

function cleanSavedSpotArea(adapter, id) {
    const pattern = /map\.savedSpotAreas\.spotArea_[0-9]{10}$/;
    if (pattern.test(id)) {
        adapter.getObjectAsync(id).then(obj => {
            if (obj && obj.native && obj.native.area) {
                adapter.cleaningQueue.run('spotArea', 'start', obj.native.area);
            }
        });
    }
}

function goToPosition(adapter, state) {
    const goToPositionValues = state.val.replace(/ /g, '');
    if (helper.positionValueStringIsValid(goToPositionValues)) {
        const accuracy = 150;
        const goToAreaValues = getPositionValuesForExtendedArea(goToPositionValues, accuracy);
        adapter.goToPositionArea = goToAreaValues;
        adapter.log.info('Go to position: ' + goToPositionValues);
        adapter.startCustomArea(goToAreaValues, 1);
    } else if (state.val !== '') {
        adapter.log.warn('Invalid input for go to position: ' + state.val);
    }
}

async function resetCleanSpeedOrWaterLevel(adapter, type) {
    const channels = await adapter.getChannelsOfAsync('map');
    for (const r in channels) {
        const spotAreaObj = channels[r];
        if (isSpotAreasChannel(spotAreaObj._id)) {
            adapter.setStateConditional(spotAreaObj._id + '.' + type, 0, true);
        }
    }
}

function getAreaName_i18n(adapter, spotAreaName) {
    let languageCode = 'en';
    if (adapter.config.languageForSpotAreaNames) {
        languageCode = adapter.config.languageForSpotAreaNames;
    }
    return adapter.vacbot.getAreaName_i18n(spotAreaName, languageCode);
}

function positionIsInRectangleForPosition(x, y, positionForRectangle, areaSize = 500) {
    const positionValues = getPositionValuesForExtendedArea(positionForRectangle, areaSize);
    return positionIsInAreaValueString(x, y, positionValues);
}

function getPositionValuesForExtendedArea(positionForRectangle, areaSize) {
    const positionArray = positionForRectangle.split(',');
    const x1 = parseInt(positionArray[0]) - areaSize;
    const y1 = parseInt(positionArray[1]) - areaSize;
    const x2 = parseInt(positionArray[0]) + areaSize;
    const y2 = parseInt(positionArray[1]) + areaSize;
    return x1 + ',' + y1 + ',' + x2 + ',' + y2;
}

function positionIsInAreaValueString(x, y, areaValueString) {
    if (helper.areaValueStringIsValid(areaValueString)) {
        const areaArray = areaValueString.split(',');
        const x1 = parseInt(areaArray[0]);
        const y1 = parseInt(areaArray[1]);
        const x2 = parseInt(areaArray[2]);
        const y2 = parseInt(areaArray[3]);
        x = parseInt(x);
        y = parseInt(y);
        if ((x >= x1) && (y >= y1) && (x <= x2) && (y <= y2)) {
            return true;
        }
    }
    return false;
}

function getDistanceToChargeStation(deebotPosition, chargePosition) {
    const deebotPosX = deebotPosition.split(',')[0];
    const deebotPosY = deebotPosition.split(',')[1];
    const chargePosX = chargePosition.split(',')[0];
    const chargePosY = chargePosition.split(',')[1];
    const distance = getDistance(deebotPosX, deebotPosY, chargePosX, chargePosY);
    return (distance / 1000).toFixed(1);
}

function getDistance(x1, y1, x2, y2) {
    let xs = x2 - x1;
    let ys = y2 - y1;
    xs *= xs;
    ys *= ys;
    return Math.sqrt(xs + ys);
}

module.exports = {
    isMapSubSetChannel,
    isSpotAreasChannel,
    isVirtualBoundariesChannel,
    positionIsInAreaValueString,
    positionIsInRectangleForPosition,
    getDistanceToChargeStation,
    getAreaName_i18n,
    saveVirtualBoundary,
    saveVirtualBoundarySet,
    saveLastUsedCustomAreaValues,
    saveLastUsedSpotAreaValues,
    rerunLastUsedCustomAreaValues,
    resetCleanSpeedOrWaterLevel,
    cleanSavedCustomArea,
    cleanSavedSpotArea,
    createVirtualBoundary,
    createVirtualBoundarySet,
    deleteVirtualBoundary,
    cleanSpotArea,
    goToPosition
};
