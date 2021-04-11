const mapHelper = require('./mapHelper');
const adapterObjects = require('./adapterObjects');

async function processMaps(adapter, mapData) {
    adapter.log.debug('[processMaps] Processing map data');
    await processMapData(adapter, mapData);
    await processMapChannels(adapter, mapData);
}

async function processMapData(adapter, mapData) {
    for (const i in mapData['maps']) {
        if (Object.prototype.hasOwnProperty.call(mapData['maps'], i)) {
            const mapChannel = 'map.' + mapData['maps'][i]['mapID'];
            await createAndUpdateMapData(adapter, mapChannel, mapData['maps'][i]);
        }
    }
}

async function createAndUpdateMapData(adapter, mapChannel, mapData) {
    await createMapObjectsNotExists(adapter, mapData);
    await updateMapStates(adapter, mapChannel, mapData['mapName']);
    vacbotRunGetAreaData(adapter, mapData['mapID']);
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
    if (adapter.getModel().isSupportedFeature('map.virtualBoundaries.save')) {
        await adapter.createObjectNotExists(
            mapChannel + '.saveVirtualBoundarySet', 'Save this virtual boundary set to savedBoundarySet channel',
            'boolean', 'button', true, false);
    } else {
        await adapter.deleteObjectIfExists(mapChannel + '.saveVirtualBoundarySet');
    }
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
    const channels = await adapter.getChannelsOfAsync('map');
    for (const r in channels) {
        if (Object.prototype.hasOwnProperty.call(channels, r)) {
            const mapObj = channels[r];
            if (!mapHelper.isMapSubSetChannel(mapObj._id)) {
                const mapID = mapObj._id.split('.').pop();
                if (!mapArray[mapID]) {
                    // map not existent (anymore)
                    const state = await adapter.getStateAsync(mapObj._id + '.mapIsAvailable');
                    if (state && (state.val === true)) {
                        // map was available before
                        await deactivateSpotAreasForMap(adapter, mapObj._id, mapID);
                    }
                }
            }
        }
    }
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
    const mapID = spotAreas['mapID'];
    adapter.log.debug('[processSpotAreas] Processing spot areas for mapID ' + mapID);
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
    for (const spotAreaID in spotAreaArray) {
        if (Object.prototype.hasOwnProperty.call(spotAreaArray, spotAreaID)) {
            await createSpotAreaObjectsNotExists(adapter, mapID, spotAreaID);
            const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
            if ((spotAreaSync === 'onlyCreate') || (spotAreaSync === 'fullSynchronization')) {
                const state = await adapter.getStateAsync('map.currentMapMID');
                if (state && (state.val === mapID)) {
                    await adapter.createObjectNotExists(
                        'control.spotArea_' + spotAreaID, '',
                        'boolean', 'button', true, false);
                }
            }
            vacbotRunGetSpotAreaInfo(adapter, mapID, spotAreaID);
        }
    }
    await processSpotAreaChannels(adapter, mapID, spotAreaArray);
}

function vacbotRunGetSpotAreaInfo(adapter, mapID, spotAreaID) {
    adapter.vacbot.run('GetSpotAreaInfo', mapID, spotAreaID);
    adapter.log.debug('[processSpotAreas] Run GetSpotAreaInfo cmd for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
}

async function processSpotAreaChannels(adapter, mapID, spotAreaArray) {
    const channels = adapter.getChannelsOfAsync('map');
    for (const r in channels) {
        if (Object.prototype.hasOwnProperty.call(channels, r)) {
            const spotAreaObj = channels[r];
            if (mapHelper.isSpotAreasChannel(spotAreaObj._id) && spotAreaObj._id.includes('.' + mapID + '.')) {
                const spotAreaID = spotAreaObj._id.split('.').pop();
                if (!spotAreaArray[spotAreaID]) {
                    // not existent (anymore)
                    const state = adapter.getState(spotAreaObj._id + '.spotAreaIsAvailable');
                    if (state && (state.val === true)) {
                        // spotArea was available before
                        const timestamp = Math.floor(Date.now() / 1000);
                        await adapter.setStateConditionalAsync(spotAreaObj._id + '.spotAreaDeactivationTimestamp', timestamp, true);
                        await adapter.deleteObjectIfExists(spotAreaObj._id + '.cleanSpotArea');
                        const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
                        if (spotAreaSync === 'fullSynchronization') {
                            await adapter.deleteObjectIfExists('control.spotArea_' + spotAreaID);
                        }
                    }
                }
            }
        }
    }
}

async function processSpotAreaInfo(adapter, spotArea) {
    const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
    const mapID = spotArea['mapID'];
    const mapChannel = 'map.' + mapID;
    const spotAreaID = spotArea['mapSpotAreaID'];
    adapter.log.debug('[processSpotAreaInfo] Processing spot area info for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
    const spotAreaObj = adapter.getObjectAsync(mapChannel + '.spotAreas.' + spotAreaID);
    if (spotAreaObj) {
        await updateSpotAreaStates(adapter, mapChannel + '.spotAreas.' + spotAreaID, spotArea);
        const mapSpotAreaName = mapHelper.getAreaName_i18n(adapter, spotArea['mapSpotAreaName']);
        await adapter.setStateConditionalAsync(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName', mapSpotAreaName, true);
        // control channel
        if (spotAreaSync === 'fullSynchronization') {
            if (spotAreaObj && spotAreaObj.common) {
                spotAreaObj.common.name = 'Spot area ' + spotAreaID + ' (' + mapSpotAreaName + ')';
                await adapter.extendObjectAsync(mapChannel + '.spotAreas.' + spotAreaID, spotAreaObj);
            }
            const controlSpotAreaId = 'control.spotArea_' + spotAreaID;
            if (adapter.currentMapID === Number(mapID)) {
                await adapter.createObjectNotExists(
                    controlSpotAreaId, '',
                    'boolean', 'button', true, false);
                const obj = adapter.getObjectAsync(controlSpotAreaId);
                if (obj && obj.common) {
                    obj.common.name = mapSpotAreaName;
                    await adapter.extendObject(controlSpotAreaId, obj);
                }
            }
        }
    }
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
    for (const virtualBoundaryId in virtualBoundaryArray) {
        if (Object.prototype.hasOwnProperty.call(virtualBoundaryArray, virtualBoundaryId)) {
            // create new states
            const mapChannel = 'map.' + mapID;
            const virtualBoundaryChannel = mapChannel + '.virtualBoundaries.' + virtualBoundaryId;
            const mapVirtualBoundaryID = virtualBoundaryArray[virtualBoundaryId]['mapVirtualBoundaryID'];
            const mapVirtualBoundaryType = virtualBoundaryArray[virtualBoundaryId]['mapVirtualBoundaryType'];
            const hrType = mapVirtualBoundaryType==='vw' ? 'Virtual Wall' : 'No-Mop-Zone';
            const name = 'Virtual boundary ' + mapVirtualBoundaryID + ' (' + hrType + ')';
            await adapter.createChannelNotExists(virtualBoundaryChannel, name);
            await createVirtualBoundaryObjectsNotExists(adapter, virtualBoundaryChannel, mapVirtualBoundaryID, mapVirtualBoundaryType);
            vacbotRunGetVirtualBoundaryInfo(adapter, mapID, mapVirtualBoundaryID, mapVirtualBoundaryType);
        }
    }
    await processVirtualBoundaryChannels(adapter, mapID, virtualBoundaryArray);
}

async function processVirtualBoundaryChannels(adapter, mapID, virtualBoundaryArray) {
    const channels = await adapter.getChannelsOfAsync('map');
    for (const r in channels) {
        const virtualBoundaryObj = channels[r];
        if (mapHelper.isVirtualBoundariesChannel(virtualBoundaryObj._id) && virtualBoundaryObj._id.includes('.' + mapID + '.')) {
            const virtualBoundaryId = virtualBoundaryObj._id.split('.').pop();
            const virtualBoundary = virtualBoundaryArray[virtualBoundaryId];
            if (!virtualBoundary) {
                // not existent (anymore)
                adapter.log.debug('[processVirtualBoundaryChannels] virtual boundary ' + virtualBoundaryId + ' not existent anymore');
                await deleteVirtualBoundaryObjects(adapter, virtualBoundaryObj._id);
            }
        }
    }
}

function vacbotRunGetVirtualBoundaryInfo(adapter, mapID, mapVirtualBoundaryID, mapVirtualBoundaryType) {
    adapter.vacbot.run('GetVirtualBoundaryInfo', mapID, mapVirtualBoundaryID, mapVirtualBoundaryType);
    adapter.log.debug('[processVirtualBoundaries] Run GetVirtualBoundaryInfo cmd for mapID ' + mapID + ' and virtualBoundaryID ' + mapVirtualBoundaryID);
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
    await adapter.setStateConditionalAsync(virtualBoundaryChannel + '.virtualBoundaryCoordinates', virtualBoundary['mapVirtualBoundaryCoordinates'], true);
    await adapter.setStateConditionalAsync(virtualBoundaryChannel + '.virtualBoundaryID', virtualBoundary['mapVirtualBoundaryID'], true);
    await adapter.setStateConditionalAsync(virtualBoundaryChannel + '.virtualBoundaryType', virtualBoundary['mapVirtualBoundaryType'], true);
    const obj = await adapter.getObjectAsync(virtualBoundaryChannel);
    if (obj) {
        obj.native = {
            'virtualBoundaryCoordinates': virtualBoundary['mapVirtualBoundaryCoordinates'],
            'virtualBoundaryID': virtualBoundary['mapVirtualBoundaryID'],
            'virtualBoundaryType': virtualBoundary['mapVirtualBoundaryType']
        };
        await adapter.extendObjectAsync(virtualBoundaryChannel, obj);
    }
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
    processVirtualBoundaryInfo
};
