const helper = require('./adapterHelper');

function processMaps(adapter, maps) {
    if (!adapter.getModel().isSupportedFeature('map')) {
        return;
    }
    const mapArray = [];
    if (typeof maps != 'object') {
        adapter.log.error('[processMaps] Wrong parameter type for maps: ' + typeof maps);
        return;
    }
    for (const i in maps['maps']) {
        if (Object.prototype.hasOwnProperty.call(maps['maps'], i)) {
            const mapID = maps['maps'][i]['mapID'];
            mapArray[mapID] = maps['maps'][i];
            adapter.vacbot.run('GetSpotAreas', mapID);
            adapter.vacbot.run('GetVirtualBoundaries', mapID);
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
                const extMapId = mapObj._id.split('.').pop();
                const map = mapArray[extMapId];
                if (!map) {
                    // map not existent (anymore)
                    adapter.setStateChanged(mapObj._id + '.mapIsAvailable', false, true, function (err, id, notChanged) {
                        if (!notChanged) {
                            // map was available before
                            processSpotAreas(adapter, {'mapID': extMapId, 'mapSpotAreas': []}); //deactivate spotAreas for this map
                            const timestamp = Math.floor(Date.now() / 1000);
                            adapter.setStateConditional(mapObj._id + '.mapDeactivationTimestamp', timestamp, true);
                        }
                    });
                } else {
                    adapter.setStateConditional(mapObj._id + '.mapName', map['mapName'], true);
                    adapter.setStateConditional(mapObj._id + '.mapIsAvailable', true, true);
                    adapter.setStateConditional(mapObj._id + '.mapDeactivationTimestamp', null, true);
                }
                delete mapArray[extMapId];
            }
        }
        for (const extMapId in mapArray) {
            // create new map states
            if (Object.prototype.hasOwnProperty.call(mapArray, extMapId)) {
                const mapChannel = 'map.' + extMapId;
                adapter.getObject(mapChannel, function (err, mapObj) {
                    if (mapObj) {
                        adapter.setStateConditional(mapObj._id + '.mapName', mapArray[extMapId]['mapName'], true);
                        adapter.setStateConditional(mapObj._id + '.mapIsAvailable', true, true);
                        adapter.setStateConditional(mapObj._id + '.mapDeactivationTimestamp', null, true);
                    } else {
                        adapter.createChannelNotExists(mapChannel, 'Map ' + extMapId);
                        adapter.createObjectNotExists(
                            mapChannel + '.mapID', 'ID of the map',
                            'string', 'text', false, mapArray[extMapId]['mapID'], '');
                        adapter.createObjectNotExists(
                            mapChannel + '.mapName', 'Name of the map',
                            'string', 'text', false, mapArray[extMapId]['mapName'], '');
                        adapter.createObjectNotExists(
                            mapChannel + '.mapIsAvailable', 'Is the map still available?',
                            'boolean', 'indicator.status', false, true, '');
                        adapter.createObjectNotExists(
                            mapChannel + '.mapDeactivationTimestamp', 'When was the map deactivated (null if active)',
                            'number', 'value.datetime', false, null, '');
                        if (adapter.getModel().isSupportedFeature('map.spotAreas')) {
                            adapter.createChannelNotExists(mapChannel + '.spotAreas', 'SpotAreas');
                        }
                        if (adapter.getModel().isSupportedFeature('map.virtualBoundaries')) {
                            adapter.createChannelNotExists(mapChannel + '.virtualBoundaries', 'Active virtual boundaries in the map');
                        }
                    }
                    delete mapArray[extMapId];
                });
            }
        }
    });
}

function processSpotAreas(adapter, spotAreas) {
    if (!adapter.getModel().isSupportedFeature('map.spotAreas')) {
        return;
    }
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
    adapter.getChannelsOf('map', function (err, channel) {
        // check existing spotArea states
        if (err) {
            adapter.log.error('[processSpotAreas] Error: ' + err);
            return;
        }
        for (const r in channel) {
            const spotAreaObj = channel[r];
            if (spotAreaObj._id.includes(mapID) && spotAreaObj._id.includes('spotAreas.')) {
                const extSpotAreaId = spotAreaObj._id.split('.').pop();
                const spotArea = spotAreaArray[extSpotAreaId];
                if (!spotArea) {
                    // not existent (anymore)
                    adapter.setStateChanged(spotAreaObj._id + '.spotAreaIsAvailable', false, true, function (err, id, notChanged) {
                        if (!notChanged) {
                            // was available before
                            const timestamp = Math.floor(Date.now() / 1000);
                            adapter.setStateConditional(spotAreaObj._id + '.spotAreaDeactivationTimestamp', timestamp, true);
                            adapter.getState(spotAreaObj._id + '.cleanSpotArea', (err, state) => {
                                if (!err && state) {
                                    adapter.deleteObjectIfExists(state._id);
                                    const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
                                    if (spotAreaSync === 'fullSynchronization') {
                                        adapter.deleteObjectIfExists('control.spotArea_' + extSpotAreaId);
                                    }
                                }
                            });
                        }
                    });
                } else {
                    adapter.setStateChanged(spotAreaObj._id + '.spotAreaIsAvailable', true, true, function (err, id, notChanged) {
                        if (!notChanged) {
                            // status has changed
                            const path = id.substring(0, id.lastIndexOf('.'));
                            adapter.setStateConditional(path + '.spotAreaID', spotArea['mapSpotAreaID']);
                            adapter.setStateConditional(spotAreaObj._id + '.spotAreaDeactivationTimestamp', null, true);
                        }
                    });
                }
                delete spotAreaArray[extSpotAreaId];
            }
        }
        for (const extSpotAreaId in spotAreaArray) {
            // create new states
            adapter.getObject(mapChannel + '.' + extSpotAreaId, function (err, spotAreaObj) {
                const spotAreaChannel = mapChannel + '.spotAreas.' + extSpotAreaId;
                if (spotAreaObj) {
                    adapter.setStateConditional(spotAreaChannel + '.spotAreaIsAvailable', true, true);
                    adapter.setStateConditional(spotAreaObj._id + '.spotAreaDeactivationTimestamp', null, true);
                } else {
                    // create spotArea
                    adapter.createChannelNotExists(mapChannel, 'Map ' + mapID);
                    adapter.createChannelNotExists(spotAreaChannel, 'SpotArea ' + extSpotAreaId);
                    adapter.createObjectNotExists(
                        spotAreaChannel + '.spotAreaID', 'ID of the SpotArea',
                        'string', 'text', false, spotAreaArray[extSpotAreaId]['mapSpotAreaID'], '');
                    adapter.createObjectNotExists(
                        spotAreaChannel + '.spotAreaIsAvailable', 'Is the SpotArea still available?',
                        'boolean', 'indicator.status', false, true, '');
                    adapter.createObjectNotExists(
                        spotAreaChannel + '.spotAreaDeactivationTimestamp', 'When was the SpotArea deactivated (null if active)',
                        'number', 'value.datetime', false, null, '');
                    adapter.createObjectNotExists(
                        spotAreaChannel + '.spotAreaBoundaries', 'Boundaries of the SpotArea',
                        'string', 'text', false, '', '');
                    adapter.createObjectNotExists(
                        spotAreaChannel + '.cleanSpotArea', 'Clean spot area ' + extSpotAreaId,
                        'boolean', 'button', true, false, '');
                }
            });
        }
    });
}

function processSpotAreaInfo(adapter, spotArea) {
    const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
    if (!adapter.getModel().isSupportedFeature('map.spotAreas')) {
        return;
    }
    const mapID = spotArea['mapID'];
    const mapChannel = 'map.' + mapID;
    const spotAreaID = spotArea['mapSpotAreaID'];
    adapter.getObject(mapChannel + '.spotAreas.' + spotAreaID, function (err, spotAreaObj) {
        if (err) {
            adapter.log.error('[processSpotAreaInfo] Error: ' + err);
            return;
        }
        const mapSpotAreaName = getAreaName_i18n(adapter, spotArea['mapSpotAreaName']);
        if (spotAreaObj) {
            adapter.setStateConditional(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaIsAvailable', true, true);
            adapter.setStateConditional(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaDeactivationTimestamp', null, true);
            adapter.setStateConditional(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaBoundaries', spotArea['mapSpotAreaBoundaries'], true);
            let id = mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName';
            adapter.getObject(id, function (err, obj) {
                if (!obj) {
                    adapter.createObjectNotExists(
                        mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName', 'Name of the SpotArea',
                        'string', 'text', false, mapSpotAreaName, '');
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
            adapter.createChannelNotExists(mapChannel, 'Map ' + mapID);
            adapter.createChannelNotExists(mapChannel + '.spotAreas', 'SpotAreas');
            adapter.createChannelNotExists(mapChannel + '.spotAreas.' + spotAreaID, 'SpotArea ' + spotAreaID);
            adapter.createObjectNotExists(
                mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaID', 'ID of the SpotArea',
                'string', 'text', false, spotAreaID, '');
            adapter.createObjectNotExists(
                mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaIsAvailable', 'Is the SpotArea still available?',
                'boolean', 'indicator.status', false, true, '');
            adapter.createObjectNotExists(
                mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaDeactivationTimestamp', 'When was the SpotArea deactivated (null if active)',
                'number', 'value.datetime', false, null, '');
            adapter.createObjectNotExists(
                mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName', 'Name of the SpotArea',
                'string', 'text', false, mapSpotAreaName, '');
            adapter.createObjectNotExists(
                mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaBoundaries', 'Boundaries of the SpotArea',
                'string', 'text', false, spotArea['mapSpotAreaBoundaries'], '');
        }
        if ((spotAreaSync === 'onlyCreate') || (spotAreaSync === 'fullSynchronization')) {
            adapter.createObjectNotExists(
                'control.spotArea_' + spotAreaID, mapSpotAreaName,
                'boolean', 'button', true, false, '');
        }
    });
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
    adapter.getChannelsOf('map', function (err, channel) { //check existing virtualBoundary states
        if (err) {
            adapter.log.error('[processVirtualBoundaries] Error: ' + err);
            return;
        }
        for (const r in channel) {
            const virtualBoundaryObj = channel[r];
            if (virtualBoundaryObj._id.includes(mapID) && virtualBoundaryObj._id.includes('virtualBoundaries.')) {
                const extVirtualBoundaryId = virtualBoundaryObj._id.split('.').pop();
                const virtualBoundary = virtualBoundaryArray[extVirtualBoundaryId];
                if (!virtualBoundary) {
                    // not existent (anymore)
                    adapter.log.debug('[processVirtualBoundaries] delete virtual boundary: ' + extVirtualBoundaryId + ' in ' + virtualBoundaryObj._id);
                    // TODO should be done dynamically with getStates or similar and check if existent
                    adapter.deleteObjectIfExists(virtualBoundaryObj._id + '.virtualBoundaryID');
                    adapter.deleteObjectIfExists(virtualBoundaryObj._id + '.virtualBoundaryType');
                    adapter.deleteObjectIfExists(virtualBoundaryObj._id + '.virtualBoundaryCoordinates');
                    //adapter.deleteObjectIfExists(virtualBoundaryObj._id + '.saveVirtualBoundary');
                    //adapter.deleteObjectIfExists(virtualBoundaryObj._id + '.deleteVirtualBoundary');
                    adapter.deleteObjectIfExists(virtualBoundaryObj._id);
                } else {
                    adapter.setStateChanged(virtualBoundaryObj._id + '.virtualBoundaryIsAvailable', true, true, function (err, id, notChanged) {
                        if (!notChanged) {
                            // status has changed
                            adapter.setStateConditional(virtualBoundaryObj._id + '.virtualBoundaryID', virtualBoundary['virtualBoundaryID'], true);
                            adapter.setStateConditional(virtualBoundaryObj._id + '.virtualBoundaryType', virtualBoundary['virtualBoundaryType'], true);
                            adapter.setStateConditional(virtualBoundaryObj._id + '.virtualBoundaryCoordinates', virtualBoundary['virtualBoundaryCoordinates'], true);
                        }
                    });
                }
                delete virtualBoundaryArray[extVirtualBoundaryId];
            }
        }
        for (const extVirtualBoundaryId in virtualBoundaryArray) {
            // create new states
            const mapChannel = 'map.' + mapID;
            const virtualBoundaryChannel = mapChannel + '.virtualBoundaries.' + extVirtualBoundaryId;
            adapter.getObject(virtualBoundaryChannel, function (err, virtualBoundaryObj) {
                if (virtualBoundaryObj) {
                    // update virtualBoundary
                    adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryType', virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryType'], true);
                } else {
                    // create virtualBoundary
                    adapter.createChannelNotExists(mapChannel, 'Map ' + mapID);
                    adapter.createChannelNotExists(virtualBoundaryChannel, 'virtualBoundary ' + extVirtualBoundaryId);
                    adapter.createObjectNotExists(
                        virtualBoundaryChannel + '.virtualBoundaryID', 'ID of the VirtualBoundary',
                        'string', 'text', false, virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryID'], '');
                    adapter.createObjectNotExists(
                        virtualBoundaryChannel + '.virtualBoundaryType', 'Type of the virtualBoundary (Virutal Wall / No Mop Zone)',
                        'string', 'text', false, virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryType'], ''); //dropdown mit mapping von vw/mw
                    // adapter.createObjectNotExists(
                    //     virtualBoundaryChannel + '.saveVirtualBoundary', 'Save the virtual Boundary' + extVirtualBoundaryId,
                    //     'boolean', 'button', true, false, '');
                    // adapter.createObjectNotExists(
                    //     virtualBoundaryChannel + '.deleteVirtualBoundary', 'Delete the virtual Boundary from the map' + extVirtualBoundaryId,
                    //     'boolean', 'button', true, false, '');
                }
            });
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
                    adapter.createObjectNotExists(virtualBoundaryChannel + '.virtualBoundaryCoordinates', 'Coordinate of the virtualBoundary 2 or 4 pairs of x,y in [] defining a line or a rectangle', 'string', 'text', false, virtualBoundary['mapVirtualBoundaryCoordinates'], '');
                } else {
                    adapter.setStateConditional(virtualBoundaryChannel + '.virtualBoundaryCoordinates', virtualBoundary['mapVirtualBoundaryCoordinates'], true);
                }
            });
        } else {
            adapter.createChannelNotExists(mapChannel, 'Map ' + virtualBoundary['mapID']);
            adapter.createChannelNotExists(virtualBoundaryChannel, 'virtualBoundary ' + virtualBoundary['mapVirtualBoundaryID']);
            adapter.createObjectNotExists(virtualBoundaryChannel + '.virtualBoundaryID', 'ID of the VirtualBoundary', 'string', 'text', false, virtualBoundary['mapVirtualBoundaryID'], '');
            adapter.createObjectNotExists(virtualBoundaryChannel + '.virtualBoundaryType', 'Type of the virtualBoundary (Virutal Wall / No Mop Zone)', 'string', 'text', false, virtualBoundary['mapVirtualBoundaryType'], ''); //dropdown mit mapping von vw/mw
            adapter.createObjectNotExists(virtualBoundaryChannel + '.virtualBoundaryCoordinates', 'Coordinate of the virtualBoundary 2 or 4 pairs of x,y in [] defining a line or a rectangle', 'string', 'text', false, virtualBoundary['mapVirtualBoundaryCoordinates'], '');
            // adapter.createObjectNotExists(
            //     virtualBoundaryChannel + '.saveVirtualBoundary', 'Save the virtual Boundary' + virtualBoundary['mapVirtualBoundaryID'],
            //     'boolean', 'button', true, false, '');
            // adapter.createObjectNotExists(
            //     virtualBoundaryChannel + '.deleteVirtualBoundary', 'Delete the virtual Boundary from the map' + virtualBoundary['mapVirtualBoundaryID'],
            //     'boolean', 'button', true, false, '');
        }
    });
}

function getAreaName_i18n(adapter, spotAreaName) {
    let languageCode = 'en';
    if (adapter.config.languageForSpotAreaNames) {
        languageCode = adapter.config.languageForSpotAreaNames;
    }
    return adapter.vacbot.getAreaName_i18n(spotAreaName, languageCode);
}

function positionIsInRectangleForPosition(x, y, positionForRectangle, areaSize = 500) {
    const positionArray = positionForRectangle.split(',');
    const x1 = parseInt(positionArray[0]) - areaSize;
    const y1 = parseInt(positionArray[1]) - areaSize;
    const x2 = parseInt(positionArray[0]) + areaSize;
    const y2 = parseInt(positionArray[1]) + areaSize;
    const positionValues = x1 + ',' + y1 + ',' + x2 + ',' + y2;
    return positionIsInAreaValueString(x, y, positionValues);
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
    processMaps,
    processSpotAreas,
    processSpotAreaInfo,
    processVirtualBoundaries,
    processVirtualBoundaryInfo,
    positionIsInAreaValueString,
    positionIsInRectangleForPosition,
    getDistanceToChargeStation,
    getAreaName_i18n
};
