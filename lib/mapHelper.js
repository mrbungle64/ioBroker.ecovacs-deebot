const Model = require('./deebotModel');
const helper = require('./adapterHelper');

function processMaps(adapter, maps) {
    const model = new Model(adapter.vacbot.deviceClass, adapter.config);
    if (!model.isSupportedFeature('map')) {
        return;
    }

    const mapArray = [];
    if (typeof maps != 'object') {
        adapter.log.error('[processMaps] Wrong parameter type for maps: ' + typeof maps);
        return;
    }

    for (const i in maps['maps']) {
        if (Object.prototype.hasOwnProperty.call(maps['maps'], i)) {
            //adapter.log.debug("[processMaps] Pushing "+maps["maps"][i]["mapID"]);
            mapArray[maps['maps'][i]['mapID']] = maps['maps'][i];
            //adapter.log.debug("[processMaps] Sending GetSpotAreas command for map "+maps["maps"][i]["mapID"]);
            adapter.vacbot.run('GetSpotAreas', maps['maps'][i]['mapID']);
            //adapter.log.debug("[processMaps] Sending GetVirtualBoundaries command for map "+maps["maps"][i]["mapID"]);
            adapter.vacbot.run('GetVirtualBoundaries', maps['maps'][i]['mapID']);
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
                        if (!model.isSupportedFeature('map.spotAreas')) {
                            adapter.createChannelNotExists('map.' + extMapId + '.spotAreas', 'SpotAreas');
                        }
                        if (!model.isSupportedFeature('map.virtualBoundaries')) {
                            adapter.createChannelNotExists('map.' + extMapId + '.virtualBoundaries', 'Virtual boundaries');
                            adapter.createChannelNotExists('map.' + extMapId + '.virtualBoundaries', 'Active virtual boundaries in the map');
                        }
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
    if (isNaN(mapID)) {
        adapter.log.warn('[processSpotAreas] mapID is not a number: ' + mapID);
        return;
    }
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
            adapter.getObject('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaName', function (err, obj) {
                if (!obj) {
                    //adapter.log.debug("[processSpotAreas] SpotArea: name state not existing, creating state for " + JSON.stringify(spotArea["mapSpotAreaID"]));
                    adapter.createObjectNotExists('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaName', 'Name of the SpotArea', 'string', 'text', false, spotArea['mapSpotAreaName'], '');
                } else {
                    adapter.setStateChanged('map.' + spotArea['mapID'] + '.spotAreas.' + spotArea['mapSpotAreaID'] + '.spotAreaName', spotArea['mapSpotAreaName'], true);
                }
            });

        } else {
            //adapter.log.debug("[processSpotAreaInfo] SpotArea not existing, creating...: "+spotArea["mapID"] + " " +spotArea["mapSpotAreaID"]);
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

function processVirtualBoundaries(adapter, virtualBoundaries) {
    const model = new Model(adapter.vacbot.deviceClass, adapter.config);
    if (!model.isSupportedFeature('map.virtualBoundaries')) {
        return;
    }
    if (typeof virtualBoundaries !== 'object') {
        adapter.log.error('[processVirtualBoundaries] Wrong parameter type for virtualBoundaries: '+typeof virtualBoundaries);
        return;
    }
    if (isNaN(virtualBoundaries['mapID'])) {
        adapter.log.warn('[processVirtualBoundaries] mapID is not a number: ' + virtualBoundaries['mapID']);
        return;
    }

    const virtualBoundaryArray = [];
    const virtualBoundariesCombined = [...virtualBoundaries['mapVirtualWalls'], ...virtualBoundaries['mapNoMopZones']];
    const mapID = virtualBoundaries['mapID'];
    for (const i in virtualBoundariesCombined) {
        if (Object.prototype.hasOwnProperty.call(virtualBoundariesCombined, i)) {
            //adapter.log.debug("[processVirtualBoundaries] Pushing for map "+mapID+" virtualBoundary "+virtualBoundariesCombined[i]["mapVirtualBoundaryID"]);
            virtualBoundaryArray[virtualBoundariesCombined[i]['mapVirtualBoundaryID']] = virtualBoundariesCombined[i];
            //adapter.log.debug("[processVirtualBoundaries] Sending GetVirtualBoundaryInfo command for map "+mapID+" virtualBoundary "+virtualBoundariesCombined[i]["mapVirtualBoundaryID"]+" virtualBoundaryType "+virtualBoundariesCombined[i]["mapVirtualBoundaryType"]);
            adapter.vacbot.run('GetVirtualBoundaryInfo', mapID, virtualBoundariesCombined[i]['mapVirtualBoundaryID'], virtualBoundariesCombined[i]['mapVirtualBoundaryType']);
        }
    }

    //adapter.log.debug("[processVirtualBoundaries] Start checking virtualBoundaries " + "map."+mapID+".virtualBoundaries");
    adapter.getChannelsOf('map', function (err, channel) { //check existing virtualBoundary states
        if (err) {
            adapter.log.error('[processVirtualBoundaries] Error: ' + err);
            return;
        }
        //adapter.log.debug("[processVirtualBoundaries] Checking existent channels for mapId... " + mapID + " with channels: " + JSON.stringify(channel));
        for (const r in channel) {
            const virtualBoundaryObj = channel[r];
            if (!virtualBoundaryObj._id.includes('virtualBoundaries') || !virtualBoundaryObj._id.includes(mapID)) { // only process subchannels of virtualBoundaries.availableBoundaries of specified map
                //adapter.log.debug("[processVirtualBoundaries] skipping channel: " + virtualBoundaryObj._id);
            } else {
                //adapter.log.debug("[processVirtualBoundaries] processing channel: " + virtualBoundaryObj._id);
                const extVirtualBoundaryId = virtualBoundaryObj._id.split('.').pop();
                const virtualBoundary = virtualBoundaryArray[extVirtualBoundaryId];
                if (!virtualBoundary) { //not existent (anymore)
                    adapter.log.debug('[processVirtualBoundaries] delete virtual boundary: ' + extVirtualBoundaryId + ' in ' + virtualBoundaryObj._id);
                    //TODO should be done dynamically with getStates or similar and check if existent
                    adapter.delObject(virtualBoundaryObj._id+'.virtualBoundaryID');
                    adapter.delObject(virtualBoundaryObj._id+'.virtualBoundaryType');
                    adapter.delObject(virtualBoundaryObj._id+'.virtualBoundaryCoordinates');
                    adapter.delObject(virtualBoundaryObj._id+'.saveVirtualBoundary');
                    adapter.delObject(virtualBoundaryObj._id+'.deleteVirtualBoundary');
                    adapter.delObject(virtualBoundaryObj._id);

                } else {
                    adapter.setStateChanged(virtualBoundaryObj._id + '.virtualBoundaryIsAvailable', true, true, function (err, id, notChanged) {
                        if (!notChanged) { // status has changed
                            const path = id.substring(0, id.lastIndexOf('.'));
                            //adapter.log.debug("[processVirtualBoundaries] virtualBoundary: " + path + " mapped with  " + JSON.stringify(virtualBoundary));
                            adapter.setStateChanged(path + '.virtualBoundaryID', virtualBoundary['virtualBoundaryID']);
                            adapter.setStateChanged(virtualBoundaryObj._id + '.virtualBoundaryType', virtualBoundary['virtualBoundaryType'], true);
                            adapter.setStateChanged(virtualBoundaryObj._id + '.virtualBoundaryCoordinates',  virtualBoundary['virtualBoundaryCoordinates'], true);
                        }
                    });
                }
                delete virtualBoundaryArray[extVirtualBoundaryId];
            }
        }
        //adapter.log.debug("[processVirtualBoundaries] Creating non-existent channels/states...");
        for (const extVirtualBoundaryId in virtualBoundaryArray) { //create new states
            adapter.getObject('map.' + mapID + '.' + extVirtualBoundaryId, function (err, virtualBoundaryObj) {
                if (virtualBoundaryObj) { //update virtualBoundary
                    //adapter.log.debug("[processVirtualBoundaries] virtualBoundary object already existing, updating : "+extVirtualBoundaryId);
                    adapter.setStateChanged('map.' + mapID + '.virtualBoundaries.' + extVirtualBoundaryId + '.virtualBoundaryType', virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryType'], true);
                } else { //create virtualBoundary
                    //adapter.log.debug("[processVirtualBoundaries] Creating virtualBoundary : "+JSON.stringify(virtualBoundaryArray[extVirtualBoundaryId]));
                    adapter.createChannelNotExists('map.' + mapID, 'Map ' + mapID);
                    adapter.createChannelNotExists('map.' + mapID + '.virtualBoundaries.' + extVirtualBoundaryId, 'virtualBoundary ' + extVirtualBoundaryId);
                    adapter.createObjectNotExists('map.' + mapID + '.virtualBoundaries.' + extVirtualBoundaryId + '.virtualBoundaryID', 'ID of the VirtualBoundary', 'string', 'text', false, virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryID'], '');
                    adapter.createObjectNotExists('map.' + mapID + '.virtualBoundaries.' + extVirtualBoundaryId + '.virtualBoundaryType', 'Type of the virtualBoundary (Virutal Wall / No Mop Zone)', 'string', 'text', false, virtualBoundaryArray[extVirtualBoundaryId]['mapVirtualBoundaryType'], ''); //dropdown mit mapping von vw/mw

                    // adapter.createObjectNotExists(
                    //     'map.' + mapID + '.virtualBoundaries.' + extVirtualBoundaryId + '.saveVirtualBoundary', 'Save the virtual Boundary' + extVirtualBoundaryId,
                    //     'boolean', 'button', true, false, '');
                    // adapter.createObjectNotExists(
                    //     'map.' + mapID + '.virtualBoundaries.' + extVirtualBoundaryId + '.deleteVirtualBoundary', 'Delete the virtual Boundary from the map' + extVirtualBoundaryId,
                    //     'boolean', 'button', true, false, '');
                }
            });
        }
    });
}

function processVirtualBoundaryInfo(adapter, virtualBoundary) {
    const model = new Model(adapter.vacbot.deviceClass, adapter.config);
    if (!model.isSupportedFeature('map.virtualBoundaries')) {
        return;
    }

    adapter.getObject('map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'], function (err, virtualBoundaryObj) {
        if (err) {
            adapter.log.error('[processVirtualBoundaryInfo] Error: ' + err);
            return;
        }
        if (virtualBoundaryObj) {
            //adapter.log.debug("[processVirtualBoundaryInfo] Processing states on VirtualBoundary "+virtualBoundary["mapID"] + " for virtualBoundary "+virtualBoundary["mapVirtualBoundaryID"]);
            adapter.setStateChanged('map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'] + '.virtualBoundaryType', virtualBoundary['mapVirtualBoundaryType'], true);
            adapter.getObject('map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'] + '.virtualBoundaryCoordinates', function (err, obj) {
                if (!obj) {
                    adapter.createObjectNotExists('map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'] + '.virtualBoundaryCoordinates', 'Coordinate of the virtualBoundary 2 or 4 pairs of x,y in [] defining a line or a rectangle', 'string', 'text', false, virtualBoundary['mapVirtualBoundaryCoordinates'], '');
                } else {
                    adapter.setStateChanged('map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'] + '.virtualBoundaryCoordinates', virtualBoundary['mapVirtualBoundaryCoordinates'], true);
                }
            });
        } else {
            if (isNaN(virtualBoundary['mapID'])) {
                adapter.log.warn('[processVirtualBoundaries] mapID is not a number: ' + virtualBoundary['mapID']);
                return;
            }
            //adapter.log.debug("[processSpotAreas] virtualBoundary not existing, creating...: "+virtualBoundary["mapID"] + " " +virtualBoundary["mapVirtualBoundaryID"]);

            adapter.createChannelNotExists('map.' + virtualBoundary['mapID'], 'Map ' + virtualBoundary['mapID']);
            adapter.createChannelNotExists('map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'], 'virtualBoundary ' + virtualBoundary['mapVirtualBoundaryID']);
            adapter.createObjectNotExists('map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'] + '.virtualBoundaryID', 'ID of the VirtualBoundary', 'string', 'text', false, virtualBoundary['mapVirtualBoundaryID'], '');
            adapter.createObjectNotExists('map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'] + '.virtualBoundaryType', 'Type of the virtualBoundary (Virutal Wall / No Mop Zone)', 'string', 'text', false, virtualBoundary['mapVirtualBoundaryType'], ''); //dropdown mit mapping von vw/mw
            adapter.createObjectNotExists('map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'] + '.virtualBoundaryCoordinates', 'Coordinate of the virtualBoundary 2 or 4 pairs of x,y in [] defining a line or a rectangle', 'string', 'text', false, virtualBoundary['mapVirtualBoundaryCoordinates'], '');

            // adapter.createObjectNotExists(
            //     'map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'] + '.saveVirtualBoundary', 'Save the virtual Boundary' + virtualBoundary['mapVirtualBoundaryID'],
            //     'boolean', 'button', true, false, '');
            // adapter.createObjectNotExists(
            //     'map.' + virtualBoundary['mapID'] + '.virtualBoundaries.' + virtualBoundary['mapVirtualBoundaryID'] + '.deleteVirtualBoundary', 'Delete the virtual Boundary from the map' + virtualBoundary['mapVirtualBoundaryID'],
            //     'boolean', 'button', true, false, '');
        }
    });
}

function positionIsInRectangleForPosition(x, y, positionForRectangle) {
    const accuracy = 500;
    const positionArray = positionForRectangle.split(',');
    const x1 = parseInt(positionArray[0]) - accuracy;
    const y1 = parseInt(positionArray[1]) - accuracy;
    const x2 = parseInt(positionArray[0]) + accuracy;
    const y2 = parseInt(positionArray[1]) + accuracy;
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

module.exports = {
    processMaps,
    processSpotAreas,
    processSpotAreaInfo,
    processVirtualBoundaries,
    processVirtualBoundaryInfo,
    positionIsInAreaValueString,
    positionIsInRectangleForPosition
};
