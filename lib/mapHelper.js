const Model = require('./deebotModel');

function processMaps(adapter, maps) {
    const model = new Model(adapter.vacbot.deviceClass, adapter.config);
    if (!model.isSupportedFeature('map')) {
        return;
    }

    const mapArray = [];
    if (typeof maps != 'object') {
        adapter.log.debug('[processMaps] Wrong parameter type for maps: ' + typeof maps);
        return;
    }

    for (const i in maps['maps']) {
        if (Object.prototype.hasOwnProperty.call(maps['maps'], i)) {
            //adapter.log.debug("[processMaps] Pushing "+maps["maps"][i]["mapID"]);
            mapArray[maps['maps'][i]['mapID']] = maps['maps'][i];
            //adapter.log.debug("[processMaps] Sending GetSpotAreas command for map "+maps["maps"][i]["mapID"]);
            adapter.vacbot.run('GetSpotAreas', maps['maps'][i]['mapID']);
        }
    }

    //adapter.log.debug("[processMaps] Start checking Maps");
    adapter.getChannelsOf('map', function (err, channel) { //check existing map states
        if (err) {
            adapter.log.error('[processMaps] Error: ' + err);
            return;
        }

        //adapter.log.debug("[processMaps] Checking existent channels...");
        for (const r in channel) {
            const mapObj = channel[r];
            if (mapObj._id.includes('spotArea') || mapObj._id.includes('virtualWall') || mapObj._id.includes('noMopZone')) { // don't process subchannels
                //adapter.log.debug("[processMaps] skipping channel: " + mapObj._id);
            } else {
                //adapter.log.debug("[processMaps] processing channel: " + mapObj._id);
                const extMapId = mapObj._id.split('.').pop();
                const map = mapArray[extMapId];
                if (!map) { //map not existent (anymore)
                    adapter.setStateChanged(mapObj._id + '.mapIsAvailable', false, true, function (err, id, notChanged) {
                        if (!notChanged) { //map was available before
                            //adapter.log.debug("[processMaps] Map: " + extMapId + " not available");
                            processSpotAreas(adapter, {'mapID': extMapId, 'mapSpotAreas': []}); //deactivate spotAreas for this map
                            adapter.setStateChanged(mapObj._id + '.mapDeactivationTimestamp', Math.floor(Date.now() / 1000), true);
                            // adapter.delObject(mapObj._id + ".mapID");
                            // adapter.delObject(mapObj._id + ".mapName");
                        }
                    });
                } else {
                    /*adapter.setStateChanged(mapObj._id + '.mapIsAvailable', true, true, function (err, id, notChanged) {
                        if (!notChanged) { //map status has changed
                            const path = id.substring(0, id.lastIndexOf('.'));
                            //adapter.log.debug("[processMaps] Map: " + path + " mapped");
                        }
                    });*/
                    adapter.setStateChanged(mapObj._id + '.mapName', map['mapName'], true);
                    // adapter.setStateChanged(mapObj._id + ".mapStatus", map["mapStatus"], true); //meaning of status currently unknown
                    adapter.setStateChanged(mapObj._id + '.mapDeactivationTimestamp', null, true);
                }
                delete mapArray[extMapId];
            }
        }
        //adapter.log.debug("[processMaps] Creating non-existent channels/states...");
        for (const extMapId in mapArray) { //create new map states
            if (Object.prototype.hasOwnProperty.call(mapArray, extMapId)) {
                adapter.getObject('map.' + extMapId, function (err, mapObj) {
                    if (mapObj) {
                        //adapter.log.debug("[processMaps] Map object already existing: "+extMapId);
                        adapter.setStateChanged(mapObj._id + '.mapName', mapArray[extMapId]['mapName'], true);
                        // adapter.setStateChanged(mapObj._id + ".mapStatus", mapArray[extMapId]["mapStatus"], true); //meaning of status currently unknown
                        adapter.setStateChanged(mapObj._id + '.mapIsAvailable', true, true);
                        adapter.setStateChanged(mapObj._id + '.mapDeactivationTimestamp', null, true);
                    } else {
                        adapter.createChannelNotExists('map.' + extMapId, 'Map ' + extMapId);
                        adapter.createObjectNotExists('map.' + extMapId + '.mapID', 'ID of the map', 'string', 'text', false, mapArray[extMapId]['mapID'], '');
                        adapter.createObjectNotExists('map.' + extMapId + '.mapName', 'Name of the map', 'string', 'text', false, mapArray[extMapId]['mapName'], '');
                        // adapter.createObjectNotExists("map."+extMapId+".mapStatus", "Status of the map","string", "indicator.status", false, mapArray[extMapId]["mapStatus"], ""); //meaning of status currently unknown
                        adapter.createObjectNotExists('map.' + extMapId + '.mapIsAvailable', 'Is the map still available?', 'boolean', 'indicator.status', false, true, '');
                        adapter.createObjectNotExists('map.' + extMapId + '.mapDeactivationTimestamp', 'When was the map deactivated (null if active)', 'number', 'value.datetime', false, null, '');
                        adapter.createChannelNotExists('map.' + extMapId + '.spotAreas', 'SpotAreas');
                    }
                    delete mapArray[extMapId];
                });
            }
        }
    });
}

function processSpotAreas(adapter, spotAreas) {
    const model = new Model(adapter.vacbot.deviceClass, adapter.config);
    if (!model.isSupportedFeature('map.spotAreas')) {
        return;
    }

    const spotAreaArray = [];
    if (typeof spotAreas != 'object') {
        //adapter.log.debug("[processSpotAreas] Wrong parameter type for spotAreas: "+typeof spotAreas);
        return false;
    }

    const mapID = spotAreas['mapID'];
    for (const i in spotAreas['mapSpotAreas']) {
        if (Object.prototype.hasOwnProperty.call(spotAreas['mapSpotAreas'], i)) {
            //adapter.log.debug("[processSpotAreas] Pushing for map "+mapID+" spotArea "+spotAreas["mapSpotAreas"][i]["mapSpotAreaID"]);
            spotAreaArray[spotAreas['mapSpotAreas'][i]['mapSpotAreaID']] = spotAreas['mapSpotAreas'][i];
            //adapter.log.debug("[processSpotAreas] Sending GetSpotAreaInfo command for map "+mapID+" spotArea "+spotAreas["mapSpotAreas"][i]["mapSpotAreaID"]);
            adapter.vacbot.run('GetSpotAreaInfo', mapID, spotAreas['mapSpotAreas'][i]['mapSpotAreaID']);
        }
    }

    //adapter.log.debug("[processSpotAreas] Start checking SpotAreas " + "map."+mapID+".spotAreas");
    adapter.getChannelsOf('map', function (err, channel) { //check existing spotArea states
        if (err) {
            adapter.log.error('[processSpotAreas] Error: ' + err);
            return;
        }
        //adapter.log.debug("[processSpotAreas] Checking existent channels for mapId... " + mapID + " with channels: " + JSON.stringify(channel));
        for (const r in channel) {
            const spotAreaObj = channel[r];
            if (!spotAreaObj._id.includes('spotAreas.') || !spotAreaObj._id.includes(mapID)) { // only process subchannels of spotAreas of specified map
                //adapter.log.debug("[processSpotAreas] skipping channel: " + spotAreaObj._id);
            } else {
                //adapter.log.debug("[processSpotAreas] processing channel: " + spotAreaObj._id);
                const extSpotAreaId = spotAreaObj._id.split('.').pop();
                const spotArea = spotAreaArray[extSpotAreaId];
                if (!spotArea) { //not existent (anymore)
                    adapter.setStateChanged(spotAreaObj._id + '.spotAreaIsAvailable', false, true, function (err, id, notChanged) {
                        if (!notChanged) { // was available before
                            //adapter.log.debug("[processSpotAreas] SpotArea: " + extSpotAreaId + " on map " + mapID + " not available");
                            adapter.setStateChanged(spotAreaObj._id + '.spotAreaDeactivationTimestamp', Math.floor(Date.now() / 1000), true);
                            adapter.getState(spotAreaObj._id + '.cleanSpotArea', (err, state) => {
                                if ((!err) && (state)) {
                                    adapter.delObject(state._id);
                                    const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
                                    if (spotAreaSync === 'fullSynchronization') {
                                        adapter.getState('control.spotArea_' + extSpotAreaId, (err, state) => {
                                            if (!err && state) {
                                                adapter.delObject('control.spotArea_' + extSpotAreaId);
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    });
                } else {
                    adapter.setStateChanged(spotAreaObj._id + '.spotAreaIsAvailable', true, true, function (err, id, notChanged) {
                        if (!notChanged) { // status has changed
                            const path = id.substring(0, id.lastIndexOf('.'));
                            //adapter.log.debug("[processSpotAreas] SpotArea: " + path + " mapped with  " + JSON.stringify(spotArea));
                            adapter.setStateChanged(path + '.spotAreaID', spotArea['mapSpotAreaID']);
                            adapter.setStateChanged(spotAreaObj._id + '.spotAreaDeactivationTimestamp', null, true);
                        }
                    });
                }
                delete spotAreaArray[extSpotAreaId];
            }
        }
        //adapter.log.debug("[processSpotAreas] Creating non-existent channels/states...");
        for (const extSpotAreaId in spotAreaArray) { //create new states
            adapter.getObject('map.' + mapID + '.' + extSpotAreaId, function (err, spotAreaObj) {
                if (spotAreaObj) {
                    //adapter.log.debug("[processSpotAreas] SpotArea object already existing: "+extSpotAreaId);
                    adapter.setStateChanged('map.' + mapID + '.spotAreas.' + extSpotAreaId + '.spotAreaIsAvailable', true, true);
                    adapter.setStateChanged(spotAreaObj._id + '.spotAreaDeactivationTimestamp', null, true);
                } else { //create spotArea
                    //adapter.log.debug("[processSpotAreas] Creating SpotArea : "+JSON.stringify(spotAreaArray[extSpotAreaId]));
                    adapter.createChannelNotExists('map.' + mapID, 'Map ' + mapID);
                    adapter.createChannelNotExists('map.' + mapID + '.spotAreas.' + extSpotAreaId, 'SpotArea ' + extSpotAreaId);
                    adapter.createObjectNotExists('map.' + mapID + '.spotAreas.' + extSpotAreaId + '.spotAreaID', 'ID of the SpotArea', 'string', 'text', false, spotAreaArray[extSpotAreaId]['mapSpotAreaID'], '');
                    adapter.createObjectNotExists('map.' + mapID + '.spotAreas.' + extSpotAreaId + '.spotAreaIsAvailable', 'Is the SpotArea still available?', 'boolean', 'indicator.status', false, true, '');
                    adapter.createObjectNotExists('map.' + mapID + '.spotAreas.' + extSpotAreaId + '.spotAreaDeactivationTimestamp', 'When was the SpotArea deactivated (null if active)', 'number', 'value.datetime', false, null, '');
                    adapter.getObject('map.' + mapID + '.spotAreas.' + extSpotAreaId + '.spotAreaName', function (err, obj) {
                        if (!obj) {
                            adapter.createObjectNotExists('map.' + mapID + '.spotAreas.' + extSpotAreaId + '.spotAreaName', 'Name of the SpotArea', 'string', 'text', false, null, '');
                        }
                    });
                    adapter.createObjectNotExists(
                        'map.' + mapID + '.spotAreas.' + extSpotAreaId + '.cleanSpotArea', 'Clean spot area ' + extSpotAreaId,
                        'boolean', 'button', true, false, '');
                }
                const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
                if ((spotAreaSync === 'onlyCreate') || (spotAreaSync === 'fullSynchronization')) {
                    adapter.createObjectNotExists(
                        'control.spotArea_' + extSpotAreaId, 'Spot area ' + extSpotAreaId,
                        'boolean', 'button', true, false, '');
                }
            });
        }
    });
}

function processSpotAreaInfo(adapter, spotArea) {
    const model = new Model(adapter.vacbot.deviceClass, adapter.config);
    if (!model.isSupportedFeature('map.spotAreas')) {
        return;
    }

    adapter.getObject('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'], function (err, spotAreaObj) {
        if (err) {
            adapter.log.error('[processSpotAreaInfo] Error: ' + err);
            return;
        }
        if (spotAreaObj) {
            //adapter.log.debug("[processSpotAreaInfo] Processing states on SpotArea "+spotArea["mapID"] + " for spotArea "+spotArea["mapSpotAreaID"]);
            adapter.setStateChanged('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaIsAvailable', true, true);
            adapter.setStateChanged('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaDeactivationTimestamp', null, true);
            adapter.setStateChanged('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaName', spotArea['mapSpotAreaName'], true);
        } else {
            //adapter.log.debug("[processSpotAreas] SpotArea not existing, creating...: "+spotArea["mapID"] + " " +spotArea["mapSpotAreaID"]);
            adapter.createChannelNotExists('map.' + spotArea['mapID'], 'Map ' + spotArea['mapID']);
            adapter.createChannelNotExists('map.' + spotArea['mapID'] + '.spotAreas', 'SpotAreas');
            adapter.createChannelNotExists('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'], 'SpotArea ' + spotArea['mapSpotAreaID']);
            adapter.createObjectNotExists('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaID', 'ID of the SpotArea', 'string', 'text', false, spotArea['mapSpotAreaID'], '');
            adapter.createObjectNotExists('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaIsAvailable', 'Is the SpotArea still available?', 'boolean', 'indicator.status', false, true, '');
            adapter.createObjectNotExists('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaDeactivationTimestamp', 'When was the SpotArea deactivated (null if active)', 'number', 'value.datetime', false, null, '');
            adapter.createObjectNotExists('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaName', 'Name of the SpotArea', 'string', 'text', false, spotArea['mapSpotAreaName'], '');
        }
        const spotAreaSync = adapter.getConfigValue('feature.control.spotAreaSync');
        if ((spotAreaSync === 'onlyCreate') || (spotAreaSync === 'fullSynchronization')) {
            adapter.createObjectNotExists(
                'control.spotArea_' + spotArea['mapSpotAreaID'], 'Spot area ' + spotArea['mapSpotAreaID'],
                'boolean', 'button', true, false, '');
        }
    });
}

module.exports = {
    processMaps,
    processSpotAreas,
    processSpotAreaInfo
};
