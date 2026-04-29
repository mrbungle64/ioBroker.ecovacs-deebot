'use strict';

const mapHelper = require('./mapHelper');
const adapterObjects = require('./adapterObjects');
const helper = require('./adapterHelper');

async function processMaps(adapter, ctx, mapData) {
    ctx.adapter.log.debug('[processMaps] Processing map data');
    await processMapData(adapter, ctx, mapData);
    await processMapChannels(adapter, ctx, mapData);
}

async function processMapData(adapter, ctx, mapData) {
    for (const i in mapData['maps']) {
        if (Object.prototype.hasOwnProperty.call(mapData['maps'], i)) {
            const mapChannel = 'map.' + mapData['maps'][i]['mapID'];
            await createAndUpdateMapData(adapter, ctx, mapChannel, mapData['maps'][i]);
        }
    }
}

async function createAndUpdateMapData(adapter, ctx, mapChannel, mapData) {
    await createMapObjectsNotExists(adapter, ctx, mapData);
    await ctx.adapterProxy.setStateConditionalAsync(mapChannel + '.mapName', mapData['mapName'], true);
    vacbotRunGetAreaData(adapter, ctx, mapData['mapID']);
}

async function createMapObjectsNotExists(adapter, ctx, mapArray) {
    const mapID = mapArray['mapID'];
    const mapChannel = 'map.' + mapID;
    await ctx.adapterProxy.createChannelNotExists(mapChannel, 'Map ' + mapID);
    await ctx.adapterProxy.createObjectNotExists(
        mapChannel + '.mapID', 'ID of the map',
        'string', 'text', false, mapArray['mapID']);
    await ctx.adapterProxy.createObjectNotExists(
        mapChannel + '.mapName', 'Name of the map',
        'string', 'text', false, mapArray['mapName']);
    await ctx.adapterProxy.createObjectNotExists(
        mapChannel + '.mapIsAvailable', 'Is the map still available?',
        'boolean', 'indicator.status', false, true);
    await ctx.adapterProxy.createObjectNotExists(
        mapChannel + '.mapDeactivationTimestamp', 'When was the map deactivated (null if active)',
        'number', 'value.datetime', false, null);
    if (ctx.getModel().isSupportedFeature('map.virtualBoundaries.save')) {
        await ctx.adapterProxy.createObjectNotExists(
            mapChannel + '.saveVirtualBoundarySet', 'Save this virtual boundary set to savedBoundarySet channel',
            'boolean', 'button', true, false);
    } else {
        await ctx.adapterProxy.deleteObjectIfExists(mapChannel + '.saveVirtualBoundarySet');
    }
    if (ctx.getModel().isSupportedFeature('map.mapImage')) {
        await ctx.adapterProxy.createObjectNotExists(
            mapChannel + '.loadMapImage', 'Load map images for mapID ' + mapID,
            'boolean', 'button', true, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            mapChannel + '.map64', 'Map as Base64-encoded data',
            'string', 'value', true, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'history.timestampOfLastMapImageReceived', 'Timestamp of last received map image',
            'number', 'value.datetime', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'history.dateOfLastMapImageReceived', 'Human readable timestamp of last received map image',
            'string', 'value.datetime', false, '', '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists(mapChannel + '.loadMapImage');
        await ctx.adapterProxy.deleteObjectIfExists(mapChannel + '.map64');
        await ctx.adapterProxy.deleteObjectIfExists('history.timestampOfLastMapImageReceived');
        await ctx.adapterProxy.deleteObjectIfExists('history.dateOfLastMapImageReceived');
    }
}

async function updateMapStates(adapter, ctx, mapChannel, isAvailable) {
    await ctx.adapterProxy.setStateConditionalAsync(mapChannel + '.mapIsAvailable', isAvailable, true);
    if (isAvailable) {
        await ctx.adapterProxy.setStateConditionalAsync(mapChannel + '.mapDeactivationTimestamp', null, true);
    } else {
        const timestamp = helper.getUnixTimestamp();
        await ctx.adapterProxy.setStateConditionalAsync(mapChannel + '.mapDeactivationTimestamp', timestamp, true);
    }
}

function vacbotRunGetAreaData(adapter, ctx, mapID) {
    if (ctx.getModel().isSupportedFeature('map.spotAreas')) {
        ctx.vacbot.run('GetSpotAreas', mapID);
        ctx.adapter.log.debug('[processMaps] Run GetSpotAreas cmd for mapID: ' + mapID);
    }
    if (ctx.getModel().isSupportedFeature('map.virtualBoundaries')) {
        ctx.vacbot.run('GetVirtualBoundaries', mapID);
        ctx.adapter.log.debug('[processMaps] Run GetVirtualBoundaries cmd for mapID: ' + mapID);
    }
}

async function processMapChannels(adapter, ctx, mapData) {
    const mapsArray = mapData['maps'];
    const availableMaps = [];
    for (const i in mapsArray) {
        if (Object.prototype.hasOwnProperty.call(mapsArray, i)) {
            const mapID = mapsArray[i]['mapID'];
            availableMaps[mapID] = true;
        }
    }
    const channels = await ctx.adapterProxy.getChannelsOfAsync('map');
    for (const r in channels) {
        if (Object.prototype.hasOwnProperty.call(channels, r)) {
            const mapObj = channels[r];
            if (!mapHelper.isMapSubSetChannel(mapObj._id)) {
                const mapID = mapObj._id.split('.')[3];
                ctx.adapter.log.debug('[processMapChannels] Checking mapID: ' + mapID);
                if (!isNaN(Number(mapID)) && (!availableMaps[mapID])) {
                    // map not existent (anymore)
                    ctx.adapter.log.debug('[processMapChannels] Not existent mapID: ' + mapID);
                    const state = await ctx.adapterProxy.getStateAsync(mapObj._id + '.isAvailable');
                    const stateDeprecated = await ctx.adapterProxy.getStateAsync(mapObj._id + '.mapIsAvailable');
                    if ((state && (state.val === true)) || (stateDeprecated && (stateDeprecated.val === true))) {
                        // map was available before
                        ctx.adapter.log.debug('[processMapChannels] Not existent anymore mapID: ' + mapID);
                        await deactivateMap(adapter, ctx, mapObj._id, mapID);
                    }
                } else {
                    await updateMapStates(adapter, ctx, mapObj._id, true);
                }
            }
        }
    }
}

async function deactivateMap(adapter, ctx, mapChannel, mapID) {
    const spotAreas = {
        'mapID': mapID,
        'mapSpotAreas': []
    };
    ctx.adapter.log.debug('[deactivateSpotAreasForMap] Map is not available anymore mapID: ' + mapID);
    await updateMapStates(adapter, ctx, mapChannel, false);
    await processSpotAreas(adapter, ctx, spotAreas); //deactivate spotAreas for this map
}

async function processSpotAreas(adapter, ctx, spotAreas) {
    const spotAreaArray = [];
    const mapID = spotAreas['mapID'];
    ctx.adapter.log.debug('[processSpotAreas] Processing spot areas for mapID ' + mapID);
    const mapChannel = 'map.' + mapID;
    for (const i in spotAreas['mapSpotAreas']) {
        if (Object.prototype.hasOwnProperty.call(spotAreas['mapSpotAreas'], i)) {
            const spotAreaID = spotAreas['mapSpotAreas'][i]['mapSpotAreaID'];
            spotAreaArray[spotAreaID] = spotAreas['mapSpotAreas'][i];
        }
    }
    if (spotAreas['mapSpotAreas'].length) {
        await ctx.adapterProxy.createChannelNotExists(mapChannel + '.spotAreas', 'Spot areas of the map');
    }
    for (const spotAreaID in spotAreaArray) {
        if (Object.prototype.hasOwnProperty.call(spotAreaArray, spotAreaID)) {
            await createSpotAreaObjectsNotExists(adapter, ctx, mapID, spotAreaID);
            const spotAreaSync = ctx.adapter.getConfigValue('feature.control.spotAreaSync');
            if ((spotAreaSync === 'onlyCreate') || (spotAreaSync === 'fullSynchronization')) {
                const state = await ctx.adapterProxy.getStateAsync('map.currentMapMID');
                if (state && (state.val === mapID)) {
                    await ctx.adapterProxy.createObjectNotExists(
                        'control.spotArea_' + spotAreaID, '',
                        'boolean', 'button', true, false);
                }
            }
            vacbotRunGetSpotAreaInfo(adapter, ctx, mapID, spotAreaID);
        }
    }
    await processSpotAreaChannels(adapter, ctx, mapID, spotAreaArray);
}

function vacbotRunGetSpotAreaInfo(adapter, ctx, mapID, spotAreaID) {
    ctx.vacbot.run('GetSpotAreaInfo', mapID, spotAreaID);
    ctx.adapter.log.debug('[vacbotRunGetSpotAreaInfo] Run GetSpotAreaInfo cmd for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
}

async function processSpotAreaChannels(adapter, ctx, mapID, spotAreaArray) {
    const channels = await ctx.adapterProxy.getChannelsOfAsync('map');
    for (const r in channels) {
        if (Object.prototype.hasOwnProperty.call(channels, r)) {
            const spotAreaObj = channels[r];
            if (mapHelper.isSpotAreasChannel(spotAreaObj._id) && spotAreaObj._id.includes('.' + mapID + '.')) {
                const spotAreaID = spotAreaObj._id.split('.').pop();
                if (!spotAreaArray[spotAreaID]) {
                    // not existent (anymore)
                    const state = await ctx.adapterProxy.getStateAsync(spotAreaObj._id + '.isAvailable');
                    const stateDeprecated = await ctx.adapterProxy.getStateAsync(spotAreaObj._id + '.spotAreaIsAvailable');
                    if ((state && (state.val === true)) || (stateDeprecated && (stateDeprecated.val === true))) {
                        // spotArea was available before
                        const timestamp = helper.getUnixTimestamp();
                        ctx.adapter.log.debug('[processSpotAreaChannels] SpotArea is not available anymore spotAreaID: ' + spotAreaID);
                        await ctx.adapterProxy.setStateConditionalAsync(spotAreaObj._id + '.spotAreaIsAvailable', false, true);
                        await ctx.adapterProxy.setStateConditionalAsync(spotAreaObj._id + '.spotAreaDeactivationTimestamp', timestamp, true);
                        await ctx.adapterProxy.deleteObjectIfExists(spotAreaObj._id + '.cleanSpotArea');
                        await ctx.adapterProxy.deleteObjectIfExists(spotAreaObj._id + '.markForNextSpotAreaCleaning');
                        await ctx.adapterProxy.deleteObjectIfExists(spotAreaObj._id + '.cleanSpeed');
                        await ctx.adapterProxy.deleteObjectIfExists(spotAreaObj._id + '.waterLevel');
                        const spotAreaSync = ctx.adapter.getConfigValue('feature.control.spotAreaSync');
                        if (spotAreaSync === 'fullSynchronization') {
                            await ctx.adapterProxy.deleteObjectIfExists('control.spotArea_' + spotAreaID);
                        }
                    }
                }
            }
        }
    }
}

async function processSpotAreaInfo(adapter, ctx, spotArea) {
    const mapID = spotArea['mapID'];
    const mapChannel = 'map.' + mapID;
    const spotAreaID = spotArea['mapSpotAreaID'];
    ctx.adapter.log.debug('[processSpotAreaInfo] Processing spot area info for mapID ' + mapID + ' and spotAreaID ' + spotAreaID);
    const spotAreaObj = await ctx.adapterProxy.getObjectAsync(mapChannel + '.spotAreas.' + spotAreaID);
    if (spotAreaObj) {
        await updateSpotAreaStates(adapter, ctx, mapChannel + '.spotAreas.' + spotAreaID, spotArea);
        let mapSpotAreaName = '';
        const state = await ctx.adapterProxy.getStateAsync(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName');
        if (state && state.val) {
            mapSpotAreaName = state.val;
        }
        if (retrieveSpotAreaNameFromAPI(adapter, ctx, mapSpotAreaName)) {
            mapSpotAreaName = mapHelper.getAreaName_i18n(adapter, ctx, spotArea['mapSpotAreaName']);
        }
        await ctx.adapterProxy.setStateConditionalAsync(mapChannel + '.spotAreas.' + spotAreaID + '.spotAreaName', mapSpotAreaName, true);
        if (spotAreaObj && spotAreaObj.common) {
            spotAreaObj.common.name = 'Spot area ' + spotAreaID + ' (' + mapSpotAreaName + ')';
            await ctx.adapterProxy.extendObjectAsync(mapChannel + '.spotAreas.' + spotAreaID, spotAreaObj);
        }
        if (ctx.adapter.getConfigValue('feature.control.spotAreaSync') === 'fullSynchronization') {
            // control channel
            const controlSpotAreaId = 'control.spotArea_' + spotAreaID;
            if (ctx.currentMapID === mapID) {
                await ctx.adapterProxy.createObjectNotExists(
                    controlSpotAreaId, '',
                    'boolean', 'button', true, false);
                const obj = await ctx.adapterProxy.getObjectAsync(controlSpotAreaId);
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
function retrieveSpotAreaNameFromAPI(adapter, ctx, mapSpotAreaName) {
    let retrieveSpotAreaNameFromAPI = true;
    if (mapSpotAreaName !== '') {
        const keepModifiedName = ctx.adapter.getConfigValue('feature.control.spotAreaKeepModifiedNames');
        // If the value of 'spotAreaKeepModifiedNames' is '1',
        // the spot area name is not retrieved via the API anymore
        if (Number(keepModifiedName)) {
            retrieveSpotAreaNameFromAPI = false;
        } else {
            // Otherwise, the spot area name is retrieved via the API
            // but labels and custom names are not supported by older models (non 950 type models)
            retrieveSpotAreaNameFromAPI = ctx.getModel().is950type();
        }
    }
    return retrieveSpotAreaNameFromAPI;
}

async function createSpotAreaObjectsNotExists(adapter, ctx, mapID, spotAreaID) {
    const spotAreaChannel = 'map.' + mapID + '.spotAreas.' + spotAreaID;
    // create spotArea
    await ctx.adapterProxy.createChannelNotExists(spotAreaChannel, 'Spot area ' + spotAreaID);
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.spotAreaID', 'ID of the spot area',
        'string', 'text', false, spotAreaID);
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.spotAreaIsAvailable', 'Is the spot area still available?',
        'boolean', 'indicator.status', false, true);
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.spotAreaDeactivationTimestamp', 'When was the spot area deactivated (null if active)',
        'number', 'value.datetime', false, null);
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.spotAreaBoundaries', 'Boundaries of the spot area',
        'string', 'text', false, '');
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.spotAreaSubtype', 'Subtype of the spot area',
        'string', 'text', false, '');
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.cleanSpotArea', 'Clean spot area ' + spotAreaID,
        'boolean', 'button', true, false);
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.markForNextSpotAreaCleaning', 'Mark spot area for next spot area cleaning',
        'boolean', 'value', true, false);
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.spotAreaName', 'Name of the spot area',
        'string', 'text', true, '');

    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.lastTimeEnteredTimestamp', 'Timestamp for internal use',
        'number', 'value.datetime', false, 0);
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.lastTimePresenceTimestamp', 'Last time the bot was operating in this spot area (timestamp)',
        'number', 'value.datetime', false, 0);
    await ctx.adapterProxy.createObjectNotExists(
        spotAreaChannel + '.lastTimePresenceDateTime', 'Last time the bot was operating in this spot area (Human readable timestamp)',
        'string', 'value.datetime', false, '');
    if (ctx.vacbot.hasMoppingSystem()) {
        await ctx.adapterProxy.createObjectNotExists(
            spotAreaChannel + '.lastTimeMoppingTimestamp', 'Last time the bot was mopping in this spot area (timestamp)',
            'number', 'value.datetime', false, 0);
        await ctx.adapterProxy.createObjectNotExists(
            spotAreaChannel + '.lastTimeMoppingDateTime', 'Last time the bot was mopping in this spot area (Human readable timestamp)',
            'string', 'value.datetime', false, '');
    }
    await ctx.adapterProxy.deleteObjectIfExists(spotAreaChannel + '.lastTimeLeavedTimestamp');

    if (ctx.getModel().isSupportedFeature('map.spotAreas.cleanSpeed') && ctx.adapter.canvasModuleIsInstalled) {
        await adapterObjects.createControlCleanSpeedIfNotExists(adapter, ctx, 0, spotAreaChannel + '.cleanSpeed', 'Clean speed for the spot area');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists(spotAreaChannel + '.cleanSpeed');
    }
    if (ctx.getModel().isSupportedFeature('map.spotAreas.waterLevel') && ctx.adapter.canvasModuleIsInstalled) {
        await adapterObjects.createControlWaterLevelIfNotExists(adapter, ctx, 0, spotAreaChannel + '.waterLevel', 'Water level for the spot area');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists(spotAreaChannel + '.waterLevel');
    }
}

async function updateSpotAreaStates(adapter, ctx, spotAreaChannel, spotAreaArray) {
    await ctx.adapterProxy.setStateConditionalAsync(spotAreaChannel + '.spotAreaIsAvailable', true, true);
    await ctx.adapterProxy.setStateConditionalAsync(spotAreaChannel + '.spotAreaDeactivationTimestamp', null, true);
    await ctx.adapterProxy.setStateConditionalAsync(spotAreaChannel + '.spotAreaBoundaries', spotAreaArray['mapSpotAreaBoundaries'], true);
    await ctx.adapterProxy.setStateConditionalAsync(spotAreaChannel + '.spotAreaSubtype', spotAreaArray['mapSpotAreaSubType'], true);
    if (spotAreaArray['mapSpotAreaSequenceNumber'] >= 0) {
        await ctx.adapterProxy.createObjectNotExists(
            spotAreaChannel + '.spotAreaSequenceNumber', 'Sequence number for the spot area',
            'number', 'value', false, spotAreaArray['mapSpotAreaSequenceNumber']);
        await ctx.adapterProxy.setStateConditionalAsync(spotAreaChannel + '.spotAreaSequenceNumber', spotAreaArray['mapSpotAreaSequenceNumber'], true);
    }
    if (Object.keys(spotAreaArray['mapSpotAreaCleanSet']).length >= 3) {
        await ctx.adapterProxy.createObjectNotExists(
            spotAreaChannel + '.cleanPreference', 'Cleaning preference values for this spot area (ready-only)',
            'json', 'value', false, JSON.stringify(spotAreaArray['mapSpotAreaCleanSet']), '');
        await setCleaningPreferenceValues(adapter, ctx, spotAreaChannel, spotAreaArray['mapSpotAreaCleanSet']);
    }
    if (ctx.getModel().isSupportedFeature('control.goToPosition') && ctx.getDevice().useNativeGoToPosition()) {
        if (spotAreaArray['mapSpotAreaBoundaries'] !== '') {
            const calculatedCenter = mapHelper.getCalculatedCenterForBoundary(spotAreaArray['mapSpotAreaBoundaries']);
            if (calculatedCenter !== '') {
                const obj = await ctx.adapterProxy.getObjectAsync(spotAreaChannel + '.cleanSpotArea_silentApproach');
                if (obj) {
                    if ((obj.native) && (calculatedCenter !== obj.native.goToPositionValues)) {
                        await createGoToPositionButtons(adapter, ctx, calculatedCenter, spotAreaChannel);
                    }
                } else {
                    await createGoToPositionButtons(adapter, ctx, calculatedCenter, spotAreaChannel);
                }
            } else {
                ctx.adapter.log.debug(`getCalculatedCenterForBoundary returned invalid values for mapSpotAreaID '${spotAreaArray['mapSpotAreaID']}'`);
            }
        }
    }
}

async function createGoToPositionButtons(adapter, ctx, calculatedCenter, spotAreaChannel) {
    await mapHelper.saveGoToPositionValues(adapter, ctx, calculatedCenter, spotAreaChannel + '.goToCalculatedCenterPosition', 'Go to calculated center position');
    await mapHelper.saveGoToPositionValues(adapter, ctx, calculatedCenter, spotAreaChannel + '.cleanSpotArea_silentApproach', 'Clean this spot area after arrived at calculated go to position');
}

async function processVirtualBoundaries(adapter, ctx, virtualBoundaries) {
    const virtualBoundaryArray = [];
    const virtualBoundariesCombined = [...virtualBoundaries['mapVirtualWalls'], ...virtualBoundaries['mapNoMopZones']];
    const mapID = virtualBoundaries['mapID'];
    const mapChannel = 'map.' + mapID;
    if (virtualBoundariesCombined.length) {
        await ctx.adapterProxy.createChannelNotExists(mapChannel + '.virtualBoundaries', 'Virtual boundaries of the map');
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
            await ctx.adapterProxy.createChannelNotExists(virtualBoundaryChannel, name);
            await createVirtualBoundaryObjectsNotExists(adapter, ctx, virtualBoundaryChannel, mapVirtualBoundaryID, mapVirtualBoundaryType);
            vacbotRunGetVirtualBoundaryInfo(adapter, ctx, mapID, mapVirtualBoundaryID, mapVirtualBoundaryType);
        }
    }
    await processVirtualBoundaryChannels(adapter, ctx, mapID, virtualBoundaryArray);
}

async function processVirtualBoundaryChannels(adapter, ctx, mapID, virtualBoundaryArray) {
    const channels = await ctx.adapterProxy.getChannelsOfAsync('map');
    for (const r in channels) {
        const virtualBoundaryObj = channels[r];
        if (mapHelper.isVirtualBoundariesChannel(virtualBoundaryObj._id) && virtualBoundaryObj._id.includes('.' + mapID + '.')) {
            const virtualBoundaryId = virtualBoundaryObj._id.split('.').pop();
            const virtualBoundary = virtualBoundaryArray[virtualBoundaryId];
            if (!virtualBoundary) {
                // not existent (anymore)
                ctx.adapter.log.debug('[processVirtualBoundaryChannels] virtual boundary ' + virtualBoundaryId + ' not existent anymore');
                await deleteVirtualBoundaryObjects(adapter, ctx, virtualBoundaryObj._id);
            }
        }
    }
}

function vacbotRunGetVirtualBoundaryInfo(adapter, ctx, mapID, mapVirtualBoundaryID, mapVirtualBoundaryType) {
    ctx.vacbot.run('GetVirtualBoundaryInfo', mapID, mapVirtualBoundaryID, mapVirtualBoundaryType);
    ctx.adapter.log.debug('[processVirtualBoundaries] Run GetVirtualBoundaryInfo cmd for mapID ' + mapID + ' and virtualBoundaryID ' + mapVirtualBoundaryID);
}

async function processVirtualBoundaryInfo(adapter, ctx, virtualBoundaryArray) {
    const mapID = virtualBoundaryArray['mapID'];
    const mapVirtualBoundaryID = virtualBoundaryArray['mapVirtualBoundaryID'];
    if (mapID && mapVirtualBoundaryID) {
        const virtualBoundaryChannel = 'map.' + mapID + '.virtualBoundaries.' + mapVirtualBoundaryID;
        await updateVirtualBoundaryStates(adapter, ctx, virtualBoundaryChannel, virtualBoundaryArray);
    }
}

async function createVirtualBoundaryObjectsNotExists(adapter, ctx, virtualBoundaryChannel, mapVirtualBoundaryID, mapVirtualBoundaryType) {
    await ctx.adapterProxy.createObjectNotExists(
        virtualBoundaryChannel + '.virtualBoundaryID', 'ID of the virtual boundary',
        'string', 'text', false, mapVirtualBoundaryID);
    await ctx.adapterProxy.createObjectNotExists(
        virtualBoundaryChannel + '.virtualBoundaryType', 'Type of the virtual boundary (Virtual Wall / No-Mop-Zone)',
        'string', 'text', false, mapVirtualBoundaryType);
    await ctx.adapterProxy.createObjectNotExists(
        virtualBoundaryChannel + '.virtualBoundaryCoordinates', 'Coordinate of the virtual boundary 2 or 4 pairs of x,y in [] defining a line or a rectangle', 'string',
        'text', false, '');
    await createVirtualBoundaryButtonsNotExists(adapter, ctx, virtualBoundaryChannel);
}

async function createVirtualBoundaryButtonsNotExists(adapter, ctx, virtualBoundaryChannel) {
    if (ctx.getModel().isSupportedFeature('map.virtualBoundaries.save')) {
        await ctx.adapterProxy.createObjectNotExists(
            virtualBoundaryChannel + '.saveVirtualBoundary', 'Save this virtual boundary to savedBoundaries channel',
            'boolean', 'button', true, false);
    } else {
        await ctx.adapterProxy.deleteObjectIfExists(virtualBoundaryChannel + '.saveVirtualBoundary');
    }
    if (ctx.getModel().isSupportedFeature('map.virtualBoundaries.delete')) {
        await ctx.adapterProxy.createObjectNotExists(
            virtualBoundaryChannel + '.deleteVirtualBoundary', 'Delete this virtual boundary from the map',
            'boolean', 'button', true, false);
    } else {
        await ctx.adapterProxy.deleteObjectIfExists(virtualBoundaryChannel + '.deleteVirtualBoundary');
    }
}

async function updateVirtualBoundaryStates(adapter, ctx, virtualBoundaryChannel, virtualBoundary) {
    await ctx.adapterProxy.setStateConditionalAsync(virtualBoundaryChannel + '.virtualBoundaryCoordinates', virtualBoundary['mapVirtualBoundaryCoordinates'], true);
    await ctx.adapterProxy.setStateConditionalAsync(virtualBoundaryChannel + '.virtualBoundaryID', virtualBoundary['mapVirtualBoundaryID'], true);
    await ctx.adapterProxy.setStateConditionalAsync(virtualBoundaryChannel + '.virtualBoundaryType', virtualBoundary['mapVirtualBoundaryType'], true);
    const obj = await ctx.adapterProxy.getObjectAsync(virtualBoundaryChannel);
    if (obj) {
        obj.native = {
            'virtualBoundaryCoordinates': virtualBoundary['mapVirtualBoundaryCoordinates'],
            'virtualBoundaryID': virtualBoundary['mapVirtualBoundaryID'],
            'virtualBoundaryType': virtualBoundary['mapVirtualBoundaryType']
        };
        await ctx.adapterProxy.extendObjectAsync(virtualBoundaryChannel, obj);
    }
}

async function deleteVirtualBoundaryObjects(adapter, ctx, virtualBoundaryChannel) {
    ctx.adapter.log.debug('[processVirtualBoundaries] delete virtual boundary channel: ' + virtualBoundaryChannel);
    await ctx.adapterProxy.deleteObjectIfExists(virtualBoundaryChannel + '.virtualBoundaryID');
    await ctx.adapterProxy.deleteObjectIfExists(virtualBoundaryChannel + '.virtualBoundaryType');
    await ctx.adapterProxy.deleteObjectIfExists(virtualBoundaryChannel + '.virtualBoundaryCoordinates');
    await ctx.adapterProxy.deleteObjectIfExists(virtualBoundaryChannel + '.saveVirtualBoundary');
    await ctx.adapterProxy.deleteObjectIfExists(virtualBoundaryChannel + '.deleteVirtualBoundary');
    await ctx.adapterProxy.deleteChannelIfExists(virtualBoundaryChannel);
}

async function createOrUpdateLastTimePresenceAndLastCleanedSpotArea(adapter, ctx, duration) {
    const spotAreaChannel = 'map.' + ctx.currentMapID + '.spotAreas.' + ctx.currentSpotAreaID;
    const formattedDate = ctx.adapter.getCurrentDateAndTimeFormatted();
    const timestamp = helper.getUnixTimestamp();
    ctx.adapterProxy.setStateConditional(spotAreaChannel + '.lastTimePresenceTimestamp', timestamp, true);
    ctx.adapterProxy.setStateConditional(spotAreaChannel + '.lastTimePresenceDateTime', formattedDate, true);
    if (ctx.vacbot.hasMoppingSystem() && ctx.waterboxInstalled) {
        ctx.adapterProxy.setStateConditional(spotAreaChannel + '.lastTimeMoppingTimestamp', timestamp, true);
        ctx.adapterProxy.setStateConditional(spotAreaChannel + '.lastTimeMoppingDateTime', formattedDate, true);
    }
    ctx.adapterProxy.createChannelNotExists('map.lastCleanedSpotArea', 'Information about the last cleaned spot area').then(() => {
        ctx.adapterProxy.createObjectNotExists(
            'map.lastCleanedSpotArea.mapID', 'ID of the map of last cleaned spot area',
            'string', 'value', false, '', '').then(() => {
            ctx.adapterProxy.setStateConditional('map.lastCleanedSpotArea.mapID', ctx.currentMapID, true);
        });
        ctx.adapterProxy.createObjectNotExists(
            'map.lastCleanedSpotArea.spotAreaID', 'ID of the last cleaned spot area',
            'string', 'value', false, '', '').then(() => {
            ctx.adapterProxy.setStateConditional('map.lastCleanedSpotArea.spotAreaID', ctx.currentSpotAreaID, true);
        });
        ctx.adapterProxy.createObjectNotExists(
            'map.lastCleanedSpotArea.spotAreaName', 'Name of the last cleaned spot area',
            'string', 'value', false, '', '').then(() => {
            ctx.adapterProxy.setStateConditional('map.lastCleanedSpotArea.spotAreaName', ctx.currentSpotAreaName, true);
        });
        ctx.adapterProxy.createObjectNotExists(
            'map.lastCleanedSpotArea.totalSeconds', 'Total time in seconds (duration)',
            'number', 'value', false, 0, 'sec').then(() => {
            ctx.adapterProxy.setStateConditional('map.lastCleanedSpotArea.totalSeconds', duration, true);
        });
        ctx.adapterProxy.createObjectNotExists(
            'map.lastCleanedSpotArea.totalTime', 'Total time in seconds (human readable)',
            'string', 'value', false, '', '').then(() => {
            ctx.adapterProxy.setStateConditional('map.lastCleanedSpotArea.totalTime', helper.getTimeStringFormatted(duration), true);
        });
        ctx.adapterProxy.createObjectNotExists(
            'map.lastCleanedSpotArea.timestamp', 'Last time the bot was operating in this spot area (timestamp)',
            'number', 'value', false, 0, '').then(() => {
            ctx.adapterProxy.setStateConditional('map.lastCleanedSpotArea.timestamp', timestamp, true);
        });
        ctx.adapterProxy.createObjectNotExists(
            'map.lastCleanedSpotArea.dateTime', 'Last time the bot was operating in this spot area (human readable)',
            'string', 'value', false, '', '').then(() => {
            ctx.adapterProxy.setStateConditional('map.lastCleanedSpotArea.dateTime', formattedDate, true);
        });
    });
}

async function setCleaningPreferenceValues(adapter, ctx, spotAreaChannel, cleanSetObj) {
    await ctx.adapterProxy.setStateConditionalAsync(spotAreaChannel + '.cleanPreference', JSON.stringify(cleanSetObj), true);
    const obj = await ctx.adapterProxy.getObjectAsync(spotAreaChannel + '.cleanPreference');
    if (obj) {
        obj.native = {
            'cleanCount': cleanSetObj.cleanCount,
            'cleanSpeed': cleanSetObj.cleanSpeed,
            'waterLevel': cleanSetObj.waterLevel
        };
        await ctx.adapterProxy.extendObjectAsync(spotAreaChannel + '.cleanPreference', obj);
        //
        // This is working code.
        // But it is not in use yet, because it is only a one-way process for the moment
        /*
        if (ctx.cleanPreference !== null) {
            if (ctx.getModel().isSupportedFeature('map.spotAreas.cleanSpeed') && ctx.adapter.canvasModuleIsInstalled) {
                let cleanSpeed = 0;
                if (ctx.cleanPreference) {
                    cleanSpeed = cleanSetObj.cleanSpeed;
                }
                await ctx.adapterProxy.setStateConditionalAsync(spotAreaChannel + '.cleanSpeed', cleanSpeed, true);
            }
            if (ctx.getModel().isSupportedFeature('map.spotAreas.waterLevel') && ctx.adapter.canvasModuleIsInstalled) {
                let waterLevel = 0;
                if (ctx.cleanPreference) {
                    waterLevel = cleanSetObj.waterLevel;
                }
                await ctx.adapterProxy.setStateConditionalAsync(spotAreaChannel + '.waterLevel', waterLevel, true);
            }
        }
        */
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
