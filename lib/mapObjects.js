const mapHelper = require('./mapHelper');

function processMaps(adapter, mapData) {
    const mapArray = [];
    if (typeof mapData != 'object') {
        adapter.log.error('[processMaps] Wrong parameter type for maps: ' + typeof mapData);
        return;
    }
    for (const i in mapData['maps']) {
        if (Object.prototype.hasOwnProperty.call(mapData['maps'], i)) {
            const mapID = mapData['maps'][i]['mapID'];
            mapArray[mapID] = mapData['maps'][i];
            if (adapter.getModel().isSupportedFeature('map.spotAreas')) {
                adapter.vacbot.run('GetSpotAreas', mapID);
            }
            if (adapter.getModel().isSupportedFeature('map.virtualBoundaries')) {
                adapter.vacbot.run('GetVirtualBoundaries', mapID);
            }
        }
    }
    adapter.getChannelsOf('map', function (err, channel) {
        // check existing map states
        if (err) {
            adapter.log.error('[processMaps] Error: ' + err);
            return;
        }
        for (const r in channel) {
            const mapObj = channel[r];
            if (!mapObj._id.includes('spotAreas') && !mapObj._id.includes('virtualBoundaries') && !mapObj._id.includes('savedCustomAreas')) {
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
                } else {
                    updateMapStates(adapter, mapObj._id, mapArray[mapID]['mapName']);
                }
                delete mapArray[mapID];
            }
        }
        for (const mapID in mapArray) {
            if (Object.prototype.hasOwnProperty.call(mapArray, mapID)) {
                const mapChannel = 'map.' + mapID;
                adapter.getObject(mapChannel, function (err, mapChannelObj) {
                    if (!mapChannelObj) {
                        createMapObjects(adapter, mapArray, mapID);
                    } else {
                        updateMapStates(adapter, mapChannelObj._id, mapArray[mapID]['mapName']);
                    }
                    delete mapArray[mapID];
                });
            }
        }
    });
}

function createMapObjects(adapter, mapArray, mapID) {
    const mapChannel = 'map.' + mapID;
    adapter.createChannelNotExists(mapChannel, 'Map ' + mapID);
    adapter.createObjectNotExists(
        mapChannel + '.mapID', 'ID of the map',
        'string', 'text', false, mapArray[mapID]['mapID']);
    adapter.createObjectNotExists(
        mapChannel + '.mapName', 'Name of the map',
        'string', 'text', false, mapArray[mapID]['mapName']);
    adapter.createObjectNotExists(
        mapChannel + '.mapIsAvailable', 'Is the map still available?',
        'boolean', 'indicator.status', false, true);
    adapter.createObjectNotExists(
        mapChannel + '.mapDeactivationTimestamp', 'When was the map deactivated (null if active)',
        'number', 'value.datetime', false, null);

    if (adapter.getModel().isSupportedFeature('map.spotAreas')) {
        adapter.createChannelNotExists(mapChannel + '.spotAreas', 'SpotAreas');
    }
    if (adapter.getModel().isSupportedFeature('map.virtualBoundaries')) {
        adapter.createChannelNotExists(mapChannel + '.virtualBoundaries', 'Active virtual boundaries in the map');
    }
}

function updateMapStates(adapter, mapChannel, channelName) {
    adapter.setStateConditional(mapChannel + '.mapName', channelName, true);
    adapter.setStateConditional(mapChannel + '.mapIsAvailable', true, true);
    adapter.setStateConditional(mapChannel + '.mapDeactivationTimestamp', null, true);
}

function deactivateSpotAreasForMap(adapter, mapChannel, mapID) {
    processSpotAreas(adapter, {'mapID': mapID, 'mapSpotAreas': []}); //deactivate spotAreas for this map
    const timestamp = Math.floor(Date.now() / 1000);
    adapter.setStateConditional(mapChannel + '.mapDeactivationTimestamp', timestamp, true);
}

function processSpotAreas(adapter, spotAreas) {
    const spotAreaArray = [];
    if (typeof spotAreas != 'object') {
        return false;
    }
    const mapID = spotAreas['mapID'];
    if (!mapID) {
        adapter.log.warn('[processSpotAreas] mapID not valid: ' + mapID);
        return;
    }
    const mapChannel = 'map.' + mapID;
    for (const i in spotAreas['mapSpotAreas']) {
        if (Object.prototype.hasOwnProperty.call(spotAreas['mapSpotAreas'], i)) {
            spotAreaArray[spotAreas['mapSpotAreas'][i]['mapSpotAreaID']] = spotAreas['mapSpotAreas'][i];
            adapter.vacbot.run('GetSpotAreaInfo', mapID, spotAreas['mapSpotAreas'][i]['mapSpotAreaID']);
        }
    }
    adapter.getChannelsOf('map.' + mapID + '.spotAreas', function (err, channel) {
        // check existing spotArea states
        if (err) {
            adapter.log.error('[processSpotAreas] Error: ' + err);
            return;
        }
        for (const r in channel) {
            const spotAreaObj = channel[r];
            const spotAreaID = spotAreaObj._id.split('.').pop();
            const spotArea = spotAreaArray[spotAreaID];
            if (!spotArea) {
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
            } else {
                adapter.setStateChanged(spotAreaObj._id + '.spotAreaIsAvailable', true, true, function (err, id, notChanged) {
                    if (!notChanged) {
                        // status has changed
                        const path = id.substring(0, id.lastIndexOf('.'));
                        adapter.setStateConditional(path + '.spotAreaID', spotArea['mapSpotAreaID'], true);
                        adapter.setStateConditional(spotAreaObj._id + '.spotAreaDeactivationTimestamp', null, true);
                    }
                });
            }
            delete spotAreaArray[spotAreaID];
        }
        for (const spotAreaID in spotAreaArray) {
            if (Object.prototype.hasOwnProperty.call(spotAreaArray, spotAreaID)) {
                const spotAreaChannel = mapChannel + '.spotAreas.' + spotAreaID;
                adapter.getObject(spotAreaChannel, function (err, spotAreaObj) {
                    if (!spotAreaObj) {
                        createSpotAreaObjects(adapter, mapID, spotAreaID);
                    } else {
                        updateSpotAreaStates(adapter, spotAreaChannel, spotAreaArray[spotAreaID]);
                    }
                });
            }
        }
    });
}

function processSpotAreaInfo(adapter, spotArea) {
    const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
    const mapID = spotArea['mapID'];
    const mapChannel = 'map.' + mapID;
    const spotAreaID = spotArea['mapSpotAreaID'];
    adapter.getObject(mapChannel + '.spotAreas.' + spotAreaID, function (err, spotAreaObj) {
        if (err) {
            adapter.log.error('[processSpotAreaInfo] Error: ' + err);
            return;
        }
        const mapSpotAreaName = mapHelper.getAreaName_i18n(adapter, spotArea['mapSpotAreaName']);
        if (spotAreaObj) {
            updateSpotAreaStates(adapter, mapChannel + '.spotAreas.' + spotAreaID, spotArea);
            let id = mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName';
            adapter.getObject(id, function (err, obj) {
                if (!obj) {
                    adapter.createObjectNotExists(
                        mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName', 'Name of the SpotArea',
                        'string', 'text', false, mapSpotAreaName);
                } else {
                    adapter.setStateConditional(id, mapSpotAreaName, true);
                    if (spotAreaSync === 'fullSynchronization') {
                        // control channel
                        id = 'control.spotArea_' + spotAreaID;
                        adapter.getObject(id, function (err, obj) {
                            if (!err && obj && obj.common) {
                                obj.common.name = mapSpotAreaName;
                                adapter.extendObject(id, obj, function (err) {
                                    if (err) {
                                        adapter.log.error('Cannot write object: ' + err);
                                    }
                                });
                            }
                        });
                    }
                }
            });
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
    const spotAreasChannel = 'map.' + mapID + '.spotAreas';
    const spotAreaChannel = spotAreasChannel+ '.' + spotAreaID;
    // create spotArea
    adapter.createChannelNotExists(spotAreasChannel, 'SpotAreas');
    adapter.createChannelNotExists(spotAreaChannel, 'SpotArea ' + spotAreaID);
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
}

function updateSpotAreaStates(adapter, spotAreaChannel, spotAreaArray) {
    adapter.setStateConditional(spotAreaChannel + '.spotAreaIsAvailable', true, true);
    adapter.setStateConditional(spotAreaChannel + '.spotAreaDeactivationTimestamp', null, true);
    adapter.setStateConditional(spotAreaChannel + '.spotAreaBoundaries', spotAreaArray['mapSpotAreaBoundaries'], true);
}

function processVirtualBoundaries(adapter, virtualBoundaries) {
    if (!adapter.getModel().isSupportedFeature('map.virtualBoundaries')) {
        return;
    }
    if (typeof virtualBoundaries !== 'object') {
        adapter.log.error('[processVirtualBoundaries] Wrong parameter type for virtualBoundaries: ' + typeof virtualBoundaries);
        return;
    }
    const virtualBoundaryArray = [];
    const virtualBoundariesCombined = [...virtualBoundaries['mapVirtualWalls'], ...virtualBoundaries['mapNoMopZones']];
    const mapID = virtualBoundaries['mapID'];
    for (const i in virtualBoundariesCombined) {
        if (Object.prototype.hasOwnProperty.call(virtualBoundariesCombined, i)) {
            virtualBoundaryArray[virtualBoundariesCombined[i]['mapVirtualBoundaryID']] = virtualBoundariesCombined[i];
            adapter.vacbot.run('GetVirtualBoundaryInfo', mapID, virtualBoundariesCombined[i]['mapVirtualBoundaryID'], virtualBoundariesCombined[i]['mapVirtualBoundaryType']);
        }
    }
    adapter.getChannelsOf('map.' + mapID + '.virtualBoundaries', function (err, channel) { //check existing virtualBoundary states
        if (err) {
            adapter.log.error('[processVirtualBoundaries] Error: ' + err);
            return;
        }
        for (const r in channel) {
            const virtualBoundaryObj = channel[r];
            const extVirtualBoundaryId = virtualBoundaryObj._id.split('.').pop();
            const virtualBoundary = virtualBoundaryArray[extVirtualBoundaryId];
            if (!virtualBoundary) {
                // not existent (anymore)
                adapter.log.debug('[processVirtualBoundaries] delete virtual boundary: ' + extVirtualBoundaryId + ' in ' + virtualBoundaryObj._id);
                deleteVirtualBoundaryObjects(adapter, virtualBoundaryObj._id);
            } else {
                updateVirtualBoundaryStates(adapter, virtualBoundaryObj._id, virtualBoundary);
            }
            delete virtualBoundaryArray[extVirtualBoundaryId];
        }
        for (const extVirtualBoundaryId in virtualBoundaryArray) {
            if (Object.prototype.hasOwnProperty.call(virtualBoundaryArray, extVirtualBoundaryId)) {
                // create new states
                const mapChannel = 'map.' + mapID;
                const virtualBoundaryChannel = mapChannel + '.virtualBoundaries.' + extVirtualBoundaryId;
                adapter.getObject(virtualBoundaryChannel, function (err, virtualBoundaryObj) {
                    if (virtualBoundaryObj) {
                        // update virtualBoundary
                        adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryType', virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryType'], true);
                    } else {
                        createVirtualBoundaryObjects(adapter, virtualBoundaryChannel, virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryID'], virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryType']);
                    }
                });
            }
        }
    });
}

function processVirtualBoundaryInfo(adapter, virtualBoundary) {
    if (!adapter.getModel().isSupportedFeature('map.virtualBoundaries')) {
        return;
    }
    const mapChannel = 'map.' + virtualBoundary['mapID'];
    const virtualBoundaryChannel = mapChannel + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'];
    adapter.getObject(virtualBoundaryChannel, function (err, virtualBoundaryObj) {
        if (err) {
            adapter.log.error('[processVirtualBoundaryInfo] Error: ' + err);
            return;
        }
        if (virtualBoundaryObj) {
            adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryType', virtualBoundary['mapVirtualBoundaryType'], true);
            adapter.getObject(virtualBoundaryChannel + '.virtualBoundaryCoordinates', function (err, obj) {
                if (!obj) {
                    adapter.createObjectNotExists(
                        virtualBoundaryChannel + '.virtualBoundaryCoordinates', 'Coordinate of the virtualBoundary 2 or 4 pairs of x,y in [] defining a line or a rectangle',
                        'string', 'text', false, virtualBoundary['mapVirtualBoundaryCoordinates']);
                } else {
                    adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryCoordinates', virtualBoundary['mapVirtualBoundaryCoordinates'], true);
                }
            });
        } else {
            createVirtualBoundaryObjects(adapter, mapChannel, virtualBoundary['mapVirtualBoundaryID'], virtualBoundary['mapVirtualBoundaryType']);
        }
    });
}

function createVirtualBoundaryObjects(adapter, virtualBoundaryChannel, mapVirtualBoundaryID, mapVirtualBoundaryType) {
    adapter.createChannelNotExists(virtualBoundaryChannel, 'virtualBoundary ' + mapVirtualBoundaryID);
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
