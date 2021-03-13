const mapHelper = require('./mapHelper');

function processMaps(adapter, mapData) {
    adapter.log.debug('[processMaps] Processing map data');
    const mapArray = [];
    if (typeof mapData != 'object') {
        adapter.log.error('[processMaps] Wrong parameter type for maps: ' + typeof mapData);
        return;
    }
    for (const i in mapData['maps']) {
        if (Object.prototype.hasOwnProperty.call(mapData['maps'], i)) {
            const mapID = mapData['maps'][i]['mapID'];
            mapArray[mapID] = mapData['maps'][i];
            const mapChannel = 'map.' + mapID;
            adapter.getObject(mapChannel, function (err, mapChannelObj) {
                if (!mapChannelObj) {
                    createMapObjects(adapter, mapArray[mapID]);
                } else {
                    updateMapStates(adapter, mapChannelObj._id, mapArray[mapID]['mapName']);
                }
                if (adapter.getModel().isSupportedFeature('map.spotAreas')) {
                    adapter.vacbot.run('GetSpotAreas', mapID);
                    adapter.log.debug('[processMaps] Run GetSpotAreas cmd for mapID: ' + mapID);
                }
                if (adapter.getModel().isSupportedFeature('map.virtualBoundaries')) {
                    adapter.vacbot.run('GetVirtualBoundaries', mapID);
                    adapter.log.debug('[processMaps] Run GetVirtualBoundaries cmd for mapID: ' + mapID);
                }
            });
        }
    }
    processMapChannels(adapter, mapArray);
}

function createMapObjects(adapter, mapArray) {
    const mapID = mapArray['mapID'];
    const mapChannel = 'map.' + mapID;
    adapter.createChannelNotExists(mapChannel, 'Map ' + mapID);
    adapter.createObjectNotExists(
        mapChannel + '.mapID', 'ID of the map',
        'string', 'text', false, mapArray['mapID']);
    adapter.createObjectNotExists(
        mapChannel + '.mapName', 'Name of the map',
        'string', 'text', false, mapArray['mapName']);
    adapter.createObjectNotExists(
        mapChannel + '.mapIsAvailable', 'Is the map still available?',
        'boolean', 'indicator.status', false, true);
    adapter.createObjectNotExists(
        mapChannel + '.mapDeactivationTimestamp', 'When was the map deactivated (null if active)',
        'number', 'value.datetime', false, null);
}

function updateMapStates(adapter, mapChannel, channelName) {
    adapter.setStateConditional(mapChannel + '.mapName', channelName, true);
    adapter.setStateConditional(mapChannel + '.mapIsAvailable', true, true);
    adapter.setStateConditional(mapChannel + '.mapDeactivationTimestamp', null, true);
}

function processMapChannels(adapter, mapArray) {
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

function deactivateSpotAreasForMap(adapter, mapChannel, mapID) {
    processSpotAreas(adapter, {'mapID': mapID, 'mapSpotAreas': []}); //deactivate spotAreas for this map
    const timestamp = Math.floor(Date.now() / 1000);
    adapter.setStateConditional(mapChannel + '.mapDeactivationTimestamp', timestamp, true);
}

function processSpotAreas(adapter, spotAreas) {
    const spotAreaArray = [];
    if (typeof spotAreas != 'object') {
        adapter.log.error('[processMaps] Wrong parameter type for spotAreas: ' + typeof spotAreas);
        return false;
    }
    const mapID = spotAreas['mapID'];
    adapter.log.debug('[processSpotAreas] Processing spot areas for mapID ' + mapID);
    if (!mapID) {
        adapter.log.warn('[processSpotAreas] mapID not valid: ' + mapID);
        return;
    }
    const mapChannel = 'map.' + mapID;
    if (spotAreas['mapSpotAreas'].length) {
        adapter.createChannelNotExists(mapChannel + '.spotAreas', 'SpotAreas of the map').then(() => {
            for (const i in spotAreas['mapSpotAreas']) {
                if (Object.prototype.hasOwnProperty.call(spotAreas['mapSpotAreas'], i)) {
                    const spotAreaID = spotAreas['mapSpotAreas'][i]['mapSpotAreaID'];
                    spotAreaArray[spotAreaID] = spotAreas['mapSpotAreas'][i];
                    const spotAreaChannel = mapChannel + '.spotAreas.' + spotAreaID;
                    adapter.getObject(spotAreaChannel, function (err, spotAreaObj) {
                        if (!spotAreaObj) {
                            createSpotAreaObjects(adapter, mapID, spotAreaID);
                        }
                    });
                    adapter.vacbot.run('GetSpotAreaInfo', mapID, spotAreaID);
                    adapter.log.debug('[processSpotAreas] Run GetSpotAreaInfo cmd for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
                }
            }
        });
    }
    processSpotAreaChannels(adapter, spotAreaArray, mapID);
}

function processSpotAreaChannels(adapter, spotAreaArray, mapID) {
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

function processSpotAreaInfo(adapter, spotArea) {
    const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
    const mapID = spotArea['mapID'];
    const mapChannel = 'map.' + mapID;
    const spotAreaID = spotArea['mapSpotAreaID'];
    adapter.log.silly('[silly][processSpotAreaInfo] Processing spot area info for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
    adapter.getObject(mapChannel + '.spotAreas.' + spotAreaID, function (err, spotAreaObj) {
        if (err) {
            adapter.log.error('[processSpotAreaInfo] Error: ' + err);
            return;
        }
        const mapSpotAreaName = mapHelper.getAreaName_i18n(adapter, spotArea['mapSpotAreaName']);
        if (spotAreaObj) {
            updateSpotAreaStates(adapter, mapChannel + '.spotAreas.' + spotAreaID, spotArea);
            adapter.setStateConditional(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName', mapSpotAreaName, true);
            if (spotAreaSync === 'fullSynchronization') {
                // control channel
                const controlSpotAreaId = 'control.spotArea_' + spotAreaID;
                adapter.getObject(controlSpotAreaId, function (err, obj) {
                    if (!err && obj && obj.common) {
                        obj.common.name = mapSpotAreaName;
                        adapter.extendObject(controlSpotAreaId, obj, function (err) {
                            if (err) {
                                adapter.log.error('Cannot write object: ' + err);
                            }
                        });
                    }
                });
            }
        } else {
            createSpotAreaObjects(adapter, mapID, spotAreaID);
        }
        if ((spotAreaSync === 'onlyCreate') || (spotAreaSync === 'fullSynchronization')) {
            adapter.createObjectNotExists(
                'control.spotArea_' + spotAreaID, mapSpotAreaName,
                'boolean', 'button', true, false);
        }
    });
}

function createSpotAreaObjects(adapter, mapID, spotAreaID) {
    const spotAreaChannel = 'map.' + mapID + '.spotAreas.' + spotAreaID;
    // create spotArea
    adapter.createChannelNotExists(spotAreaChannel, 'SpotArea ' + spotAreaID).then(() => {
        adapter.createObjectNotExists(
            spotAreaChannel + '.spotAreaID', 'ID of the SpotArea',
            'string', 'text', false, spotAreaID);
        adapter.createObjectNotExists(
            spotAreaChannel + '.spotAreaIsAvailable', 'Is the SpotArea still available?',
            'boolean', 'indicator.status', false, true);
        adapter.createObjectNotExists(
            spotAreaChannel + '.spotAreaDeactivationTimestamp', 'When was the SpotArea deactivated (null if active)',
            'number', 'value.datetime', false, null);
        adapter.createObjectNotExists(
            spotAreaChannel + '.spotAreaBoundaries', 'Boundaries of the SpotArea',
            'string', 'text', false, '');
        adapter.createObjectNotExists(
            spotAreaChannel + '.cleanSpotArea', 'Clean spot area ' + spotAreaID,
            'boolean', 'button', true, false);
        adapter.createObjectNotExists(
            spotAreaChannel + '.spotAreaName', 'Name of the SpotArea',
            'string', 'text', false, '');
    });
}

function updateSpotAreaStates(adapter, spotAreaChannel, spotAreaArray) {
    adapter.setStateConditional(spotAreaChannel + '.spotAreaIsAvailable', true, true);
    adapter.setStateConditional(spotAreaChannel + '.spotAreaDeactivationTimestamp', null, true);
    adapter.setStateConditional(spotAreaChannel + '.spotAreaBoundaries', spotAreaArray['mapSpotAreaBoundaries'], true);
}

function processVirtualBoundaries(adapter, virtualBoundaries) {
    if (typeof virtualBoundaries !== 'object') {
        adapter.log.error('[processVirtualBoundaries] Wrong parameter type for virtualBoundaries: ' + typeof virtualBoundaries);
        return;
    }
    const virtualBoundaryArray = [];
    const virtualBoundariesCombined = [...virtualBoundaries['mapVirtualWalls'], ...virtualBoundaries['mapNoMopZones']];
    const mapID = virtualBoundaries['mapID'];
    const mapChannel = 'map.' + mapID;
    if (virtualBoundariesCombined.length) {
        adapter.createChannelNotExists(mapChannel + '.virtualBoundaries', 'Virtual boundaries of the map');
    }
    for (const i in virtualBoundariesCombined) {
        if (Object.prototype.hasOwnProperty.call(virtualBoundariesCombined, i)) {
            virtualBoundaryArray[virtualBoundariesCombined[i]['mapVirtualBoundaryID']] = virtualBoundariesCombined[i];
        }
    }
    adapter.getChannelsOf('map', function (err, channel) {
        // check existing virtualBoundary states
        if (err) {
            adapter.log.error('[processVirtualBoundaries] Error: ' + err);
            return;
        }
        for (const r in channel) {
            const virtualBoundaryObj = channel[r];
            if (mapHelper.isVirtualBoundariesChannel(virtualBoundaryObj._id) && virtualBoundaryObj._id.includes('.' + mapID + '.')) {
                const extVirtualBoundaryId = virtualBoundaryObj._id.split('.').pop();
                const virtualBoundary = virtualBoundaryArray[extVirtualBoundaryId];
                if (!virtualBoundary) {
                    // not existent (anymore)
                    adapter.log.debug('[processVirtualBoundaries] delete virtual boundary: ' + extVirtualBoundaryId + ' in ' + virtualBoundaryObj._id);
                    deleteVirtualBoundaryObjects(adapter, virtualBoundaryObj._id);
                    delete virtualBoundaryArray[extVirtualBoundaryId];
                }
            }
        }
        for (const extVirtualBoundaryId in virtualBoundaryArray) {
            if (Object.prototype.hasOwnProperty.call(virtualBoundaryArray, extVirtualBoundaryId)) {
                // create new states
                const mapChannel = 'map.' + mapID;
                const virtualBoundaryChannel = mapChannel + '.virtualBoundaries.' + extVirtualBoundaryId;
                adapter.getObject(virtualBoundaryChannel, function (err, virtualBoundaryObj) {
                    if (!virtualBoundaryObj) {
                        createVirtualBoundaryObjects(adapter, virtualBoundaryChannel, virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryID'], virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryType']);
                    }
                });
                adapter.vacbot.run('GetVirtualBoundaryInfo', mapID, virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryID'], virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryType']);
            }
        }
    });
}

function processVirtualBoundaryInfo(adapter, virtualBoundary) {
    const mapChannel = 'map.' + virtualBoundary['mapID'];
    const virtualBoundaryChannel = mapChannel + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'];
    adapter.getObject(virtualBoundaryChannel, function (err, virtualBoundaryObj) {
        if (err) {
            adapter.log.error('[processVirtualBoundaryInfo] Error: ' + err);
            return;
        }
        if (virtualBoundaryObj) {
            updateVirtualBoundaryStates(adapter, virtualBoundaryChannel, virtualBoundary);
        } else {
            createVirtualBoundaryObjects(adapter, mapChannel, virtualBoundary['mapVirtualBoundaryID'], virtualBoundary['mapVirtualBoundaryType']);
        }
    });
}

function createVirtualBoundaryObjects(adapter, virtualBoundaryChannel, mapVirtualBoundaryID, mapVirtualBoundaryType) {
    adapter.createChannelNotExists(virtualBoundaryChannel, 'virtualBoundary ' + mapVirtualBoundaryID).then(() => {
        adapter.createObjectNotExists(
            virtualBoundaryChannel + '.virtualBoundaryID', 'ID of the VirtualBoundary',
            'string', 'text', false, mapVirtualBoundaryID);
        adapter.createObjectNotExists(
            virtualBoundaryChannel + '.virtualBoundaryType', 'Type of the virtualBoundary (Virtual Wall / No Mop Zone)',
            'string', 'text', false, mapVirtualBoundaryType);
        adapter.createObjectNotExists(
            virtualBoundaryChannel + '.virtualBoundaryCoordinates', 'Coordinate of the virtualBoundary 2 or 4 pairs of x,y in [] defining a line or a rectangle', 'string',
            'text', false, '');
        if (adapter.getModel().isSupportedFeature('map.virtualBoundaries.save')) {
            adapter.createObjectNotExists(
                virtualBoundaryChannel + '.saveVirtualBoundary', 'Save the virtual Boundary' + mapVirtualBoundaryID,
                'boolean', 'button', true, false);
        }
        if (adapter.getModel().isSupportedFeature('map.virtualBoundaries.delete')) {
            adapter.createObjectNotExists(
                virtualBoundaryChannel + '.deleteVirtualBoundary', 'Delete the virtual Boundary from the map' + mapVirtualBoundaryID,
                'boolean', 'button', true, false);
        }
    });
}

function updateVirtualBoundaryStates(adapter, virtualBoundaryChannel, virtualBoundary) {
    adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryID', virtualBoundary['mapVirtualBoundaryID'], true);
    adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryType', virtualBoundary['mapVirtualBoundaryType'], true);
    adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryCoordinates', virtualBoundary['mapVirtualBoundaryCoordinates'], true);
}

function deleteVirtualBoundaryObjects(adapter, virtualBoundaryChannel) {
    adapter.deleteObjectIfExists(virtualBoundaryChannel + '.virtualBoundaryID');
    adapter.deleteObjectIfExists(virtualBoundaryChannel + '.virtualBoundaryType');
    adapter.deleteObjectIfExists(virtualBoundaryChannel + '.virtualBoundaryCoordinates');
    adapter.deleteObjectIfExists(virtualBoundaryChannel + '.saveVirtualBoundary');
    adapter.deleteObjectIfExists(virtualBoundaryChannel + '.deleteVirtualBoundary');
    adapter.deleteObjectIfExists(virtualBoundaryChannel);
}

module.exports = {
    processMaps,
    processSpotAreas,
    processSpotAreaInfo,
    processVirtualBoundaries,
    processVirtualBoundaryInfo
};
