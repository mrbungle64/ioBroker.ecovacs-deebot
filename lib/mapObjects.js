'use strict';

const mapHelper = require('./mapHelper');
const adapterObjects = require('./adapterObjects');
const helper = require('./adapterHelper');

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
    await adapter.setStateConditionalAsync(mapChannel + '.mapName', mapData['mapName'], true);
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
    if (adapter.getModel().isSupportedFeature('map.mapImage')) {
        await adapter.createObjectNotExists(
            mapChannel + '.loadMapImage', 'Load map images for mapID ' + mapID,
            'boolean', 'button', true, false, '');
        await adapter.createObjectNotExists(
            mapChannel + '.map64', 'Map as Base64-encoded data',
            'string', 'value', true, '', '');
        await adapter.createObjectNotExists(
            'history.timestampOfLastMapImageReceived', 'Timestamp of last received map image',
            'number', 'value.datetime', false, 0, '');
        await adapter.createObjectNotExists(
            'history.dateOfLastMapImageReceived', 'Human readable timestamp of last received map image',
            'string', 'value.datetime', false, '', '');
    } else {
        await adapter.deleteObjectIfExists(mapChannel + '.loadMapImage');
        await adapter.deleteObjectIfExists(mapChannel + '.map64');
        await adapter.deleteObjectIfExists('history.timestampOfLastMapImageReceived');
        await adapter.deleteObjectIfExists('history.dateOfLastMapImageReceived');
    }
}

async function updateMapStates(adapter, mapChannel, isAvailable) {
    await adapter.setStateConditionalAsync(mapChannel + '.mapIsAvailable', isAvailable, true);
    if (isAvailable) {
        await adapter.setStateConditionalAsync(mapChannel + '.mapDeactivationTimestamp', null, true);
    } else {
        const timestamp = helper.getUnixTimestamp();
        await adapter.setStateConditionalAsync(mapChannel + '.mapDeactivationTimestamp', timestamp, true);
    }
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

async function processMapChannels(adapter, mapData) {
    const mapsArray = mapData['maps'];
    const availableMaps = [];
    for (const i in mapsArray) {
        if (Object.prototype.hasOwnProperty.call(mapsArray, i)) {
            const mapID = mapsArray[i]['mapID'];
            availableMaps[mapID] = true;
        }
    }
    const channels = await adapter.getChannelsOfAsync('map');
    for (const r in channels) {
        if (Object.prototype.hasOwnProperty.call(channels, r)) {
            const mapObj = channels[r];
            if (!mapHelper.isMapSubSetChannel(mapObj._id)) {
                const mapID = mapObj._id.split('.')[3];
                adapter.log.debug('[processMapChannels] Checking mapID: ' + mapID);
                if (!isNaN(Number(mapID)) && (!availableMaps[mapID])) {
                    // map not existent (anymore)
                    adapter.log.debug('[processMapChannels] Not existent mapID: ' + mapID);
                    const state = await adapter.getStateAsync(mapObj._id + '.isAvailable');
                    const stateDeprecated = await adapter.getStateAsync(mapObj._id + '.mapIsAvailable');
                    if ((state && (state.val === true)) || (stateDeprecated && (stateDeprecated.val === true))) {
                        // map was available before
                        adapter.log.debug('[processMapChannels] Not existent anymore mapID: ' + mapID);
                        await deactivateMap(adapter, mapObj._id, mapID);
                    }
                } else {
                    await updateMapStates(adapter, mapObj._id, true);
                }
            }
        }
    }
}

async function deactivateMap(adapter, mapChannel, mapID) {
    const spotAreas = {
        'mapID': mapID,
        'mapSpotAreas': []
    };
    adapter.log.debug('[deactivateSpotAreasForMap] Map is not available anymore mapID: ' + mapID);
    await updateMapStates(adapter, mapChannel, false);
    await processSpotAreas(adapter, spotAreas); //deactivate spotAreas for this map
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
    adapter.log.debug('[vacbotRunGetSpotAreaInfo] Run GetSpotAreaInfo cmd for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
}

async function processSpotAreaChannels(adapter, mapID, spotAreaArray) {
    const channels = await adapter.getChannelsOfAsync('map');
    for (const r in channels) {
        if (Object.prototype.hasOwnProperty.call(channels, r)) {
            const spotAreaObj = channels[r];
            if (mapHelper.isSpotAreasChannel(spotAreaObj._id) && spotAreaObj._id.includes('.' + mapID + '.')) {
                const spotAreaID = spotAreaObj._id.split('.').pop();
                if (!spotAreaArray[spotAreaID]) {
                    // not existent (anymore)
                    const state = await adapter.getStateAsync(spotAreaObj._id + '.isAvailable');
                    const stateDeprecated = await adapter.getStateAsync(spotAreaObj._id + '.spotAreaIsAvailable');
                    if ((state && (state.val === true)) || (stateDeprecated && (stateDeprecated.val === true))) {
                        // spotArea was available before
                        const timestamp = helper.getUnixTimestamp();
                        adapter.log.debug('[processSpotAreaChannels] SpotArea is not available anymore spotAreaID: ' + spotAreaID);
                        await adapter.setStateConditionalAsync(spotAreaObj._id + '.spotAreaIsAvailable', false, true);
                        await adapter.setStateConditionalAsync(spotAreaObj._id + '.spotAreaDeactivationTimestamp', timestamp, true);
                        await adapter.deleteObjectIfExists(spotAreaObj._id + '.cleanSpotArea');
                        await adapter.deleteObjectIfExists(spotAreaObj._id + '.markForNextSpotAreaCleaning');
                        await adapter.deleteObjectIfExists(spotAreaObj._id + '.cleanSpeed');
                        await adapter.deleteObjectIfExists(spotAreaObj._id + '.waterLevel');
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
    const mapID = spotArea['mapID'];
    const mapChannel = 'map.' + mapID;
    const spotAreaID = spotArea['mapSpotAreaID'];
    adapter.log.debug('[processSpotAreaInfo] Processing spot area info for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
    const spotAreaObj = await adapter.getObjectAsync(mapChannel + '.spotAreas.' + spotAreaID);
    if (spotAreaObj) {
        await updateSpotAreaStates(adapter, mapChannel + '.spotAreas.' + spotAreaID, spotArea);
        let mapSpotAreaName = '';
        const state = await adapter.getStateAsync(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName');
        if (state && state.val) {
            mapSpotAreaName = state.val;
        }
        if (retrieveSpotAreaNameFromAPI(adapter, mapSpotAreaName)) {
            mapSpotAreaName = mapHelper.getAreaName_i18n(adapter, spotArea['mapSpotAreaName']);
        }
        await adapter.setStateConditionalAsync(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName', mapSpotAreaName, true);
        if (spotAreaObj && spotAreaObj.common) {
            spotAreaObj.common.name = 'Spot area ' + spotAreaID + ' (' + mapSpotAreaName + ')';
            await adapter.extendObjectAsync(mapChannel + '.spotAreas.' + spotAreaID, spotAreaObj);
        }
        if (adapter.getConfigValue('feature.control.spotAreaSync') === 'fullSynchronization') {
            // control channel
            const controlSpotAreaId = 'control.spotArea_' + spotAreaID;
            if (adapter.currentMapID === mapID) {
                await adapter.createObjectNotExists(
                    controlSpotAreaId, '',
                    'boolean', 'button', true, false);
                const obj = await adapter.getObjectAsync(controlSpotAreaId);
                if (obj && obj.common) {
                    obj.common.name = mapSpotAreaName;
                    await adapter.extendObject(controlSpotAreaId, obj);
                }
            }
        }
    }
}

/**
 * If the spot area name is modified by the user, the name is not retrieved via the API
 * @param {Object} adapter - the adapter instance
 * @param {string} mapSpotAreaName - the name of the spot area as it is currently set in the adapter.
 * @returns {boolean} if the spot area name is retrieved via the API
 */
function retrieveSpotAreaNameFromAPI(adapter, mapSpotAreaName) {
    let retrieveSpotAreaNameFromAPI = true;
    if (mapSpotAreaName !== '') {
        const keepModifiedName = adapter.getConfigValue('feature.control.spotAreaKeepModifiedNames');
        // If the value of 'spotAreaKeepModifiedNames' is '1',
        // the spot area name is not retrieved via the API anymore
        if (Number(keepModifiedName)) {
            retrieveSpotAreaNameFromAPI = false;
        } else {
            // Otherwise, the spot area name is retrieved via the API
            // but labels and custom names are not supported by older models (non 950 type models)
            retrieveSpotAreaNameFromAPI = adapter.getModel().is950type();
        }
    }
    return retrieveSpotAreaNameFromAPI;
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
        spotAreaChannel + '.markForNextSpotAreaCleaning', 'Mark spot area for next spot area cleaning',
        'boolean', 'value', true, false);
    // TODO: Remove correction in Q3/2022
    const spotAreaNameObj = await adapter.getObjectAsync(spotAreaChannel + '.spotAreaName');
    if (spotAreaNameObj && spotAreaNameObj.common) {
        if (spotAreaNameObj.common.write === false) {
            adapter.log.info('Setting write permission for ' + spotAreaChannel + '.spotAreaName');
            spotAreaNameObj.common.write = true;
            await adapter.extendObjectAsync(spotAreaChannel + '.spotAreaName', spotAreaNameObj);
        }
    } else {
        await adapter.createObjectNotExists(
            spotAreaChannel + '.spotAreaName', 'Name of the spot area',
            'string', 'text', true, '');
    }

    await adapter.createObjectNotExists(
        spotAreaChannel + '.lastTimeEnteredTimestamp', 'Timestamp for internal use',
        'number', 'value.datetime', false, 0);
    await adapter.createObjectNotExists(
        spotAreaChannel + '.lastTimePresenceTimestamp', 'Last time the bot was operating in this spot area (timestamp)',
        'number', 'value.datetime', false, 0);
    await adapter.createObjectNotExists(
        spotAreaChannel + '.lastTimePresenceDateTime', 'Last time the bot was operating in this spot area (Human readable timestamp)',
        'string', 'value.datetime', false, '');
    if (adapter.vacbot.hasMoppingSystem()) {
        await adapter.createObjectNotExists(
            spotAreaChannel + '.lastTimeMoppingTimestamp', 'Last time the bot was mopping in this spot area (timestamp)',
            'number', 'value.datetime', false, 0);
        await adapter.createObjectNotExists(
            spotAreaChannel + '.lastTimeMoppingDateTime', 'Last time the bot was mopping in this spot area (Human readable timestamp)',
            'string', 'value.datetime', false, '');
    }
    await adapter.deleteObjectIfExists(spotAreaChannel + '.lastTimeLeavedTimestamp');

    if (adapter.getModel().isSupportedFeature('map.spotAreas.cleanSpeed') && adapter.canvasModuleIsInstalled) {
        await adapterObjects.createControlCleanSpeedIfNotExists(adapter, 0, spotAreaChannel + '.cleanSpeed', 'Clean speed for the spot area');
    } else {
        await adapter.deleteObjectIfExists(spotAreaChannel + '.cleanSpeed');
    }
    if (adapter.getModel().isSupportedFeature('map.spotAreas.waterLevel') && adapter.canvasModuleIsInstalled) {
        await adapterObjects.createControlWaterLevelIfNotExists(adapter, 0, spotAreaChannel + '.waterLevel', 'Water level for the spot area');
    } else {
        await adapter.deleteObjectIfExists(spotAreaChannel + '.waterLevel');
    }
}

async function updateSpotAreaStates(adapter, spotAreaChannel, spotAreaArray) {
    await adapter.setStateConditionalAsync(spotAreaChannel + '.spotAreaIsAvailable', true, true);
    await adapter.setStateConditionalAsync(spotAreaChannel + '.spotAreaDeactivationTimestamp', null, true);
    await adapter.setStateConditionalAsync(spotAreaChannel + '.spotAreaBoundaries', spotAreaArray['mapSpotAreaBoundaries'], true);
    if (spotAreaArray['mapSpotAreaSequenceNumber'] >= 0) {
        await adapter.createObjectNotExists(
            spotAreaChannel + '.spotAreaSequenceNumber', 'Sequence number for the spot area',
            'number', 'value', false, spotAreaArray['mapSpotAreaSequenceNumber']);
        await adapter.setStateConditionalAsync(spotAreaChannel + '.spotAreaSequenceNumber', spotAreaArray['mapSpotAreaSequenceNumber'], true);
    }
    if (Object.keys(spotAreaArray['mapSpotAreaCleanSet']).length >= 3) {
        await adapter.createObjectNotExists(
            spotAreaChannel + '.cleanPreference', 'Cleaning preference values for this spot area (ready-only)',
            'json', 'value', false, JSON.stringify(spotAreaArray['mapSpotAreaCleanSet']), '');
        await setCleaningPreferenceValues(adapter, spotAreaChannel, spotAreaArray['mapSpotAreaCleanSet']);
    }
    if (adapter.getDevice().useNativeGoToPosition() && (adapter.currentMapID) && (spotAreaArray['mapSpotAreaBoundaries'] !== '')) {
        const calculatedCenter = mapHelper.getCalculatedCenterForBoundary(spotAreaArray['mapSpotAreaBoundaries']);
        if (calculatedCenter !== '') {
            const obj = await adapter.getObjectAsync(spotAreaChannel + '.cleanSpotArea_silentApproach');
            if (obj) {
                if ((obj.native) && (calculatedCenter !== obj.native.goToPositionValues)) {
                    await createGoToPositionButtons(adapter, calculatedCenter, spotAreaChannel);
                }
            } else {
                await createGoToPositionButtons(adapter, calculatedCenter, spotAreaChannel);
            }
        } else {
            adapter.log.debug(`getCalculatedCenterForBoundary returned invalid values for mapSpotAreaID '${spotAreaArray['mapSpotAreaID']}'`);
        }
    }
}

async function createGoToPositionButtons(adapter, calculatedCenter, spotAreaChannel) {
    await mapHelper.saveGoToPositionValues(adapter, calculatedCenter, spotAreaChannel + '.goToCalculatedCenterPosition', 'Go to calculated center position');
    await mapHelper.saveGoToPositionValues(adapter, calculatedCenter, spotAreaChannel + '.cleanSpotArea_silentApproach', 'Clean this spot area after arrived at calculated go to position');
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
    const mapID = virtualBoundaryArray['mapID'];
    const mapVirtualBoundaryID = virtualBoundaryArray['mapVirtualBoundaryID'];
    if (mapID && mapVirtualBoundaryID) {
        const virtualBoundaryChannel = 'map.' + mapID + '.virtualBoundaries.' + mapVirtualBoundaryID;
        await updateVirtualBoundaryStates(adapter, virtualBoundaryChannel, virtualBoundaryArray);
    }
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

async function createOrUpdateLastTimePresenceAndLastCleanedSpotArea(adapter, duration) {
    const spotAreaChannel = 'map.' + adapter.currentMapID + '.spotAreas.' + adapter.currentSpotAreaID;
    const formattedDate = adapter.getCurrentDateAndTimeFormatted();
    const timestamp = helper.getUnixTimestamp();
    adapter.setStateConditional(spotAreaChannel + '.lastTimePresenceTimestamp', timestamp, true);
    adapter.setStateConditional(spotAreaChannel + '.lastTimePresenceDateTime', formattedDate, true);
    if (adapter.vacbot.hasMoppingSystem() && adapter.waterboxInstalled) {
        adapter.setStateConditional(spotAreaChannel + '.lastTimeMoppingTimestamp', timestamp, true);
        adapter.setStateConditional(spotAreaChannel + '.lastTimeMoppingDateTime', formattedDate, true);
    }
    adapter.createChannelNotExists('map.lastCleanedSpotArea', 'Information about the last cleaned spot area').then(() => {
        adapter.createObjectNotExists(
            'map.lastCleanedSpotArea.mapID', 'ID of the map of last cleaned spot area',
            'string', 'value', false, '', '').then(() => {
            adapter.setStateConditional('map.lastCleanedSpotArea.mapID', adapter.currentMapID, true);
        });
        adapter.createObjectNotExists(
            'map.lastCleanedSpotArea.spotAreaID', 'ID of the last cleaned spot area',
            'string', 'value', false, '', '').then(() => {
            adapter.setStateConditional('map.lastCleanedSpotArea.spotAreaID', adapter.currentSpotAreaID, true);
        });
        adapter.createObjectNotExists(
            'map.lastCleanedSpotArea.spotAreaName', 'Name of the last cleaned spot area',
            'string', 'value', false, '', '').then(() => {
            adapter.setStateConditional('map.lastCleanedSpotArea.spotAreaName', adapter.currentSpotAreaName, true);
        });
        adapter.createObjectNotExists(
            'map.lastCleanedSpotArea.totalSeconds', 'Total time in seconds (duration)',
            'number', 'value', false, '', 'sec').then(() => {
            adapter.setStateConditional('map.lastCleanedSpotArea.totalSeconds', duration, true);
        });
        adapter.createObjectNotExists(
            'map.lastCleanedSpotArea.totalTime', 'Total time in seconds (human readable)',
            'string', 'value', false, '', '').then(() => {
            adapter.setStateConditional('map.lastCleanedSpotArea.totalTime', helper.getTimeStringFormatted(duration), true);
        });
        adapter.createObjectNotExists(
            'map.lastCleanedSpotArea.timestamp', 'Last time the bot was operating in this spot area (timestamp)',
            'number', 'value', false, '', '').then(() => {
            adapter.setStateConditional('map.lastCleanedSpotArea.timestamp', timestamp, true);
        });
        adapter.createObjectNotExists(
            'map.lastCleanedSpotArea.dateTime', 'Last time the bot was operating in this spot area (human readable)',
            'string', 'value', false, '', '').then(() => {
            adapter.setStateConditional('map.lastCleanedSpotArea.dateTime', formattedDate, true);
        });
    });
}

async function setCleaningPreferenceValues(adapter, spotAreaChannel, cleanSetObj) {
    await adapter.setStateConditionalAsync(spotAreaChannel + '.cleanPreference', JSON.stringify(cleanSetObj), true);
    const obj = await adapter.getObjectAsync(spotAreaChannel + '.cleanPreference');
    if (obj) {
        obj.native = {
            'cleanCount': cleanSetObj.cleanCount,
            'cleanSpeed': cleanSetObj.cleanSpeed,
            'waterLevel': cleanSetObj.waterLevel
        };
        await adapter.extendObjectAsync(spotAreaChannel + '.cleanPreference', obj);
        if (adapter.cleanPreference !== null) {
            if (adapter.getModel().isSupportedFeature('map.spotAreas.cleanSpeed') && adapter.canvasModuleIsInstalled) {
                let cleanSpeed = 0;
                if (adapter.cleanPreference) {
                    cleanSpeed = cleanSetObj.cleanSpeed;
                }
                await adapter.setStateConditionalAsync(spotAreaChannel + '.cleanSpeed', cleanSpeed, true);
            }
            if (adapter.getModel().isSupportedFeature('map.spotAreas.waterLevel') && adapter.canvasModuleIsInstalled) {
                let waterLevel = 0;
                if (adapter.cleanPreference) {
                    waterLevel = cleanSetObj.waterLevel;
                }
                await adapter.setStateConditionalAsync(spotAreaChannel + '.waterLevel', waterLevel, true);
            }
        }
    }
}

module.exports = {
    createOrUpdateLastTimePresenceAndLastCleanedSpotArea,
    processMaps,
    processSpotAreas,
    processSpotAreaInfo,
    processVirtualBoundaries,
    processVirtualBoundaryInfo
};
