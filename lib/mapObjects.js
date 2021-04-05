const mapHelper = require('./mapHelper');
const adapterObjects = require('./adapterObjects');

async function processMaps(adapter, mapData) {
    adapter.log.debug('[processMaps] Processing map data');
    const mapArray = [];
    if (typeof mapData != 'object') {
        adapter.log.error('[processMaps] Wrong parameter type for maps: ' + typeof mapData);
        return;
    }
    const processMapData = new Promise(() => {
        for (const i in mapData['maps']) {
            if (Object.prototype.hasOwnProperty.call(mapData['maps'], i)) {
                const mapID = mapData['maps'][i]['mapID'];
                mapArray[mapID] = mapData['maps'][i];
                const mapChannel = 'map.' + mapID;
                createMapObjectsNotExists(adapter, mapArray[mapID]).then(() => {
                    updateMapStates(adapter, mapChannel, mapArray[mapID]['mapName']).then(()=> {
                        vacbotRunGetAreaData(adapter, mapID);
                    });
                });
            }
        }
    });
    processMapData.then(() =>
        processMapChannels(adapter, mapArray)
    );
}

async function createMapObjectsNotExists(adapter, mapArray) {
    const mapID = mapArray['mapID'];
    const mapChannel = 'map.' + mapID;
    await adapter.createChannelNotExists(mapChannel, 'Map ' + mapID);
    await adapter.createObjectNotExists(
        mapChannel + '.mapID', 'ID of the map',
        'string', 'text', false, mapArray['mapID']);
    await adapter.createObjectNotExists(
        mapChannel + '.mapName', 'Name of the map',
        'string', 'text', false, mapArray['mapName']);
    await adapter.createObjectNotExists(
        mapChannel + '.mapIsAvailable', 'Is the map still available?',
        'boolean', 'indicator.status', false, true);
    await adapter.createObjectNotExists(
        mapChannel + '.mapDeactivationTimestamp', 'When was the map deactivated (null if active)',
        'number', 'value.datetime', false, null);
}

async function updateMapStates(adapter, mapChannel, channelName) {
    await adapter.setStateConditionalAsync(mapChannel + '.mapName', channelName, true);
    await adapter.setStateConditionalAsync(mapChannel + '.mapIsAvailable', true, true);
    await adapter.setStateConditionalAsync(mapChannel + '.mapDeactivationTimestamp', null, true);
}

function vacbotRunGetAreaData(adapter, mapID) {
    if (adapter.getModel().isSupportedFeature('map.spotAreas')) {
        adapter.vacbot.run('GetSpotAreas', mapID);
        adapter.log.debug('[processMaps] Run GetSpotAreas cmd for mapID: ' + mapID);
    }
    if (adapter.getModel().isSupportedFeature('map.virtualBoundaries')) {
        adapter.vacbot.run('GetVirtualBoundaries', mapID);
        adapter.log.debug('[processMaps] Run GetVirtualBoundaries cmd for mapID: ' + mapID);
    }
}

async function processMapChannels(adapter, mapArray) {
    adapter.getChannelsOf('map', function (err, channel) {
        // check existing map states
        if (err) {
            adapter.log.error('[processMaps] Error: ' + err);
            return;
        }
        for (const r in channel) {
            const mapObj = channel[r];
            if (!mapHelper.isSubchannel(mapObj._id)) {
                const mapID = mapObj._id.split('.').pop();
                if (!mapArray[mapID]) {
                    // map not existent (anymore)
                    adapter.getState(mapObj._id + '.mapIsAvailable', (err, state) => {
                        if (!err && state) {
                            if (state.val === true) {
                                // map was available before
                                deactivateSpotAreasForMap(adapter, mapObj._id, mapID);
                            }
                        }
                    });
                }
            }
        }
    });
}

async function deactivateSpotAreasForMap(adapter, mapChannel, mapID) {
    const spotAreas = {
        'mapID': mapID,
        'mapSpotAreas': []
    };
    await processSpotAreas(adapter, spotAreas); //deactivate spotAreas for this map
    const timestamp = Math.floor(Date.now() / 1000);
    await adapter.setStateConditionalAsync(mapChannel + '.mapDeactivationTimestamp', timestamp, true);
}

async function processSpotAreas(adapter, spotAreas) {
    const spotAreaArray = [];
    if (typeof spotAreas != 'object') {
        adapter.log.error('[processMaps] Wrong parameter type for spot areas: ' + typeof spotAreas);
        return false;
    }
    const mapID = spotAreas['mapID'];
    adapter.log.debug('[processSpotAreas] Processing spot areas for mapID ' + mapID);
    if (!mapID) {
        adapter.log.warn('[processSpotAreas] mapID not valid: ' + mapID);
        return;
    }
    const mapChannel = 'map.' + mapID;
    for (const i in spotAreas['mapSpotAreas']) {
        if (Object.prototype.hasOwnProperty.call(spotAreas['mapSpotAreas'], i)) {
            const spotAreaID = spotAreas['mapSpotAreas'][i]['mapSpotAreaID'];
            spotAreaArray[spotAreaID] = spotAreas['mapSpotAreas'][i];
        }
    }
    if (spotAreas['mapSpotAreas'].length) {
        await adapter.createChannelNotExists(mapChannel + '.spotAreas', 'Spot areas of the map');
    }
    const processSpotAreas = new Promise(() => {
        for (const spotAreaID in spotAreaArray) {
            if (Object.prototype.hasOwnProperty.call(spotAreaArray, spotAreaID)) {
                createSpotAreaObjectsNotExists(adapter, mapID, spotAreaID).then(() => {
                    const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
                    if ((spotAreaSync === 'onlyCreate') || (spotAreaSync === 'fullSynchronization')) {
                        adapter.getStateAsync('map.currentMapMID').then((obj) => {
                            if (obj && (obj.val === mapID)) {
                                adapter.createObjectNotExists(
                                    'control.spotArea_' + spotAreaID, '',
                                    'boolean', 'button', true, false);
                            }
                        });
                    }
                    vacbotRunGetSpotAreaInfo(adapter, mapID, spotAreaID);
                });
            }
        }
    });
    processSpotAreas.then(() => {
        processSpotAreaChannels(adapter, spotAreaArray, mapID);
    });
}

function vacbotRunGetSpotAreaInfo(adapter, mapID, spotAreaID) {
    adapter.vacbot.run('GetSpotAreaInfo', mapID, spotAreaID);
    adapter.log.debug('[processSpotAreas] Run GetSpotAreaInfo cmd for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
}

async function processSpotAreaChannels(adapter, spotAreaArray, mapID) {
    adapter.getChannelsOf('map', function (err, channel) {
        // check existing spotArea states
        if (err) {
            adapter.log.error('[processSpotAreas] Error: ' + err);
            return;
        }
        for (const r in channel) {
            const spotAreaObj = channel[r];
            if (mapHelper.isSpotAreasChannel(spotAreaObj._id) && spotAreaObj._id.includes('.' + mapID + '.')) {
                const spotAreaID = spotAreaObj._id.split('.').pop();
                if (!spotAreaArray[spotAreaID]) {
                    // not existent (anymore)
                    adapter.getState(spotAreaObj._id + '.spotAreaIsAvailable', (err, state) => {
                        if (!err && state) {
                            if (state.val === true) {
                                // spotArea was available before
                                const timestamp = Math.floor(Date.now() / 1000);
                                adapter.setStateConditional(spotAreaObj._id + '.spotAreaDeactivationTimestamp', timestamp, true);
                                adapter.deleteObjectIfExists(spotAreaObj._id + '.cleanSpotArea');
                                const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
                                if (spotAreaSync === 'fullSynchronization') {
                                    adapter.deleteObjectIfExists('control.spotArea_' + spotAreaID);
                                }
                            }
                        }
                    });
                }
            }
        }
    });
}

async function processSpotAreaInfo(adapter, spotArea) {
    const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
    const mapID = spotArea['mapID'];
    const mapChannel = 'map.' + mapID;
    const spotAreaID = spotArea['mapSpotAreaID'];
    adapter.log.debug('[processSpotAreaInfo] Processing spot area info for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
    adapter.getObjectAsync(mapChannel + '.spotAreas.' + spotAreaID).then(spotAreaObj => {
        const mapSpotAreaName = mapHelper.getAreaName_i18n(adapter, spotArea['mapSpotAreaName']);
        if (spotAreaObj) {
            updateSpotAreaStates(adapter, mapChannel + '.spotAreas.' + spotAreaID, spotArea).then(() => {
                adapter.setStateConditionalAsync(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName', mapSpotAreaName, true).then(() => {
                    // control channel
                    if (spotAreaSync === 'fullSynchronization') {
                        const controlSpotAreaId = 'control.spotArea_' + spotAreaID;
                        adapter.getStateAsync('map.currentMapMID').then((state) => {
                            if (state && (state.val === mapID)) {
                                adapter.createObjectNotExists(
                                    controlSpotAreaId, '',
                                    'boolean', 'button', true, false).then(() => {
                                    adapter.getObjectAsync(controlSpotAreaId).then(obj => {
                                        if (obj && obj.common) {
                                            obj.common.name = mapSpotAreaName;
                                            adapter.extendObject(controlSpotAreaId, obj, function (err) {
                                                if (err) {
                                                    adapter.log.error('Cannot write object: ' + err);
                                                }
                                            });
                                        }
                                    });
                                });
                            }
                        });
                    }
                });
            });
        }
    });
}

async function createSpotAreaObjectsNotExists(adapter, mapID, spotAreaID) {
    const spotAreaChannel = 'map.' + mapID + '.spotAreas.' + spotAreaID;
    // create spotArea
    await adapter.createChannelNotExists(spotAreaChannel, 'Spot area ' + spotAreaID);
    await adapter.createObjectNotExists(
        spotAreaChannel + '.spotAreaID', 'ID of the spot area',
        'string', 'text', false, spotAreaID);
    await adapter.createObjectNotExists(
        spotAreaChannel + '.spotAreaIsAvailable', 'Is the spot area still available?',
        'boolean', 'indicator.status', false, true);
    await adapter.createObjectNotExists(
        spotAreaChannel + '.spotAreaDeactivationTimestamp', 'When was the spot area deactivated (null if active)',
        'number', 'value.datetime', false, null);
    await adapter.createObjectNotExists(
        spotAreaChannel + '.spotAreaBoundaries', 'Boundaries of the spot area',
        'string', 'text', false, '');
    await adapter.createObjectNotExists(
        spotAreaChannel + '.cleanSpotArea', 'Clean spot area ' + spotAreaID,
        'boolean', 'button', true, false);
    await adapter.createObjectNotExists(
        spotAreaChannel + '.spotAreaName', 'Name of the spot area',
        'string', 'text', false, '');
    if (adapter.getModel().isSupportedFeature('map.spotAreas.cleanSpeed')) {
        await adapterObjects.createControlCleanSpeedIfNotExists(adapter, 0, spotAreaChannel + '.cleanSpeed', 'Clean speed for the spot area');
    } else {
        await adapter.deleteObjectIfExists(spotAreaChannel + '.cleanSpeed');
    }
    if (adapter.getModel().isSupportedFeature('map.spotAreas.waterLevel')) {
        await adapterObjects.createControlWaterLevelIfNotExists(adapter, 0, spotAreaChannel + '.waterLevel', 'Water level for the spot area');
    } else {
        await adapter.deleteObjectIfExists(spotAreaChannel + '.waterLevel');
    }
}

async function updateSpotAreaStates(adapter, spotAreaChannel, spotAreaArray) {
    await adapter.setStateConditionalAsync(spotAreaChannel + '.spotAreaIsAvailable', true, true);
    await adapter.setStateConditionalAsync(spotAreaChannel + '.spotAreaDeactivationTimestamp', null, true);
    await adapter.setStateConditionalAsync(spotAreaChannel + '.spotAreaBoundaries', spotAreaArray['mapSpotAreaBoundaries'], true);
}

async function processVirtualBoundaries(adapter, virtualBoundaries) {
    if (typeof virtualBoundaries !== 'object') {
        adapter.log.error('[processVirtualBoundaries] Wrong parameter type for virtualBoundaries: ' + typeof virtualBoundaries);
        return;
    }
    const virtualBoundaryArray = [];
    const virtualBoundariesCombined = [...virtualBoundaries['mapVirtualWalls'], ...virtualBoundaries['mapNoMopZones']];
    const mapID = virtualBoundaries['mapID'];
    const mapChannel = 'map.' + mapID;
    if (virtualBoundariesCombined.length) {
        await adapter.createChannelNotExists(mapChannel + '.virtualBoundaries', 'Virtual boundaries of the map');
    }
    for (const i in virtualBoundariesCombined) {
        if (Object.prototype.hasOwnProperty.call(virtualBoundariesCombined, i)) {
            virtualBoundaryArray[virtualBoundariesCombined[i]['mapVirtualBoundaryID']] = virtualBoundariesCombined[i];
        }
    }
    await processVirtualBoundaryChannels(adapter, mapID, virtualBoundaryArray);
    for (const extVirtualBoundaryId in virtualBoundaryArray) {
        if (Object.prototype.hasOwnProperty.call(virtualBoundaryArray, extVirtualBoundaryId)) {
            // create new states
            const mapChannel = 'map.' + mapID;
            const virtualBoundaryChannel = mapChannel + '.virtualBoundaries.' + extVirtualBoundaryId;
            const mapVirtualBoundaryID = virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryID'];
            const mapVirtualBoundaryType = virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryType'];
            const hrType = mapVirtualBoundaryType==='vw' ? 'Virtual Wall' : 'No-Mop-Zone';
            const name = 'Virtual boundary ' + mapVirtualBoundaryID + ' (' + hrType + ')';
            adapter.createChannelNotExists(virtualBoundaryChannel, name).then(() => {
                createVirtualBoundaryObjectsNotExists(adapter, virtualBoundaryChannel, mapVirtualBoundaryID, mapVirtualBoundaryType).then(() => {
                    vacbotRunGetVirtualBoundaryInfo(adapter, mapID, mapVirtualBoundaryID, mapVirtualBoundaryType);
                });
            });
        }
    }
}

function vacbotRunGetVirtualBoundaryInfo(adapter, mapID, mapVirtualBoundaryID, mapVirtualBoundaryType) {
    adapter.vacbot.run('GetVirtualBoundaryInfo', mapID, mapVirtualBoundaryID, mapVirtualBoundaryType);
}

async function processVirtualBoundaryInfo(adapter, virtualBoundaryArray) {
    const virtualBoundaryChannel = 'map.' + virtualBoundaryArray['mapID'] + '.virtualBoundaries.' + virtualBoundaryArray['mapVirtualBoundaryID'];
    await updateVirtualBoundaryStates(adapter, virtualBoundaryChannel, virtualBoundaryArray);
}

async function createVirtualBoundaryObjectsNotExists(adapter, virtualBoundaryChannel, mapVirtualBoundaryID, mapVirtualBoundaryType) {
    await adapter.createObjectNotExists(
        virtualBoundaryChannel + '.virtualBoundaryID', 'ID of the virtual boundary',
        'string', 'text', false, mapVirtualBoundaryID);
    await adapter.createObjectNotExists(
        virtualBoundaryChannel + '.virtualBoundaryType', 'Type of the virtual boundary (Virtual Wall / No-Mop-Zone)',
        'string', 'text', false, mapVirtualBoundaryType);
    await adapter.createObjectNotExists(
        virtualBoundaryChannel + '.virtualBoundaryCoordinates', 'Coordinate of the virtual boundary 2 or 4 pairs of x,y in [] defining a line or a rectangle', 'string',
        'text', false, '');
    await createVirtualBoundaryButtonsNotExists(adapter, virtualBoundaryChannel);
}

async function createVirtualBoundaryButtonsNotExists(adapter, virtualBoundaryChannel) {
    if (adapter.getModel().isSupportedFeature('map.virtualBoundaries.save')) {
        await adapter.createObjectNotExists(
            virtualBoundaryChannel + '.saveVirtualBoundary', 'Save this virtual boundary to savedBoundaries channel',
            'boolean', 'button', true, false);
    } else {
        await adapter.deleteObjectIfExists(virtualBoundaryChannel + '.saveVirtualBoundary');
    }
    if (adapter.getModel().isSupportedFeature('map.virtualBoundaries.delete')) {
        await adapter.createObjectNotExists(
            virtualBoundaryChannel + '.deleteVirtualBoundary', 'Delete this virtual boundary from the map',
            'boolean', 'button', true, false);
    } else {
        await adapter.deleteObjectIfExists(virtualBoundaryChannel + '.deleteVirtualBoundary');
    }
}

async function updateVirtualBoundaryStates(adapter, virtualBoundaryChannel, virtualBoundary) {
    await adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryID', virtualBoundary['mapVirtualBoundaryID'], true);
    await adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryType', virtualBoundary['mapVirtualBoundaryType'], true);
    await adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryCoordinates', virtualBoundary['mapVirtualBoundaryCoordinates'], true);
}

async function processVirtualBoundaryChannels(adapter, mapID, virtualBoundaryArray = null) {
    adapter.getChannelsOf('map', function (err, channel) {
        // check existing virtualBoundary states
        if (err) {
            adapter.log.error('[processVirtualBoundaries] Error: ' + err);
            return;
        }
        let runGetMaps = (!virtualBoundaryArray);
        for (const r in channel) {
            const virtualBoundaryObj = channel[r];
            if (mapHelper.isVirtualBoundariesChannel(virtualBoundaryObj._id) && virtualBoundaryObj._id.includes('.' + mapID + '.')) {
                const extVirtualBoundaryId = virtualBoundaryObj._id.split('.').pop();
                if (Number(extVirtualBoundaryId) >= 0) {
                    if (virtualBoundaryArray) {
                        const virtualBoundary = virtualBoundaryArray[extVirtualBoundaryId];
                        if (!virtualBoundary) {
                            // not existent (anymore)
                            deleteVirtualBoundaryObjects(adapter, virtualBoundaryObj._id);
                        }
                    } else {
                        if (virtualBoundaryObj.native.markedForDeletion && virtualBoundaryObj.native.timestamp) {
                            // marked for deletion
                            const now = Math.floor(Date.now() / 1000);
                            if (now >= (virtualBoundaryObj.native.timestamp + 60)) {
                                runGetMaps = false;
                                deleteVirtualBoundaryObjects(adapter, virtualBoundaryObj._id);
                            }
                        }
                    }
                }
            }
        }
        if (runGetMaps) {
            //adapter.log.debug('[processVirtualBoundaryChannels] GetMaps: ' + mapID);
            //adapter.vacbot.run('GetMaps');
        }
    });
}

async function deleteVirtualBoundaryObjects(adapter, virtualBoundaryChannel) {
    adapter.log.debug('[processVirtualBoundaries] delete virtual boundary channel: ' + virtualBoundaryChannel);
    await adapter.deleteObjectIfExists(virtualBoundaryChannel + '.virtualBoundaryID');
    await adapter.deleteObjectIfExists(virtualBoundaryChannel + '.virtualBoundaryType');
    await adapter.deleteObjectIfExists(virtualBoundaryChannel + '.virtualBoundaryCoordinates');
    await adapter.deleteObjectIfExists(virtualBoundaryChannel + '.saveVirtualBoundary');
    await adapter.deleteObjectIfExists(virtualBoundaryChannel + '.deleteVirtualBoundary');
    await adapter.deleteChannelIfExists(virtualBoundaryChannel);
}

module.exports = {
    processMaps,
    processSpotAreas,
    processSpotAreaInfo,
    processVirtualBoundaries,
    processVirtualBoundaryInfo,
    processVirtualBoundaryChannels
};
