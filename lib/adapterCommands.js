'use strict';

const helper = require('./adapterHelper');
const mapHelper = require('./mapHelper');

async function handleStateChange(adapter, id, state) {
    let stateName = helper.getStateNameById(id);
    if (!state.ack) {
        if (stateName === 'clean_home') {
            switch (adapter.getDevice().status) {
                case 'error':
                    adapter.log.warn('Please check bot for errors');
                    return;
                case 'paused':
                    stateName = 'resume';
                    adapter.setStateConditional(id, true, true);
                    break;
                case 'cleaning':
                    stateName = 'charge';
                    adapter.setStateConditional(id, false, true);
                    break;
                default:
                    stateName = 'clean';
                    adapter.setStateConditional(id, true, true);
            }
            adapter.log.debug('clean_home => ' + stateName);
        } else {
            adapter.getObject(id, (err, obj) => {
                if ((!err) && (obj) && (obj.common.role === 'button')) {
                    adapter.setStateConditional(id, false, true);
                }
            });
        }
    }

    const MAX_RETRIES = 3;
    const RETRY_PAUSE = 6000;
    const timestamp = Math.floor(Date.now() / 1000);
    const date = adapter.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');

    // id cropped by namespace
    const stateId = id.replace(adapter.namespace + '.', '');

    const channelName = helper.getChannelNameById(id);
    const subChannelName = helper.getSubChannelNameById(id);

    if (channelName !== 'history') {
        adapter.log.debug('state change ' + stateId + ' => ' + state.val);
        adapter.setStateConditional('history.timestampOfLastStateChange', timestamp, true);
        adapter.setStateConditional('history.dateOfLastStateChange', date, true);
        if ((stateName === 'error') && (adapter.connectionFailed)) {
            if ((!adapter.retrypauseTimeout) && (adapter.retries <= MAX_RETRIES)) {
                adapter.retrypauseTimeout = setTimeout(() => {
                    adapter.reconnect();
                }, RETRY_PAUSE);
            }
        }
    }

    if (!adapter.connected) {
        if (channelName === 'control') {
            adapter.getState(id, (err, state) => {
                if ((!err) && (state) && (state.val)) {
                    adapter.log.info('Not connected yet... Skip control cmd: ' + stateName);
                }
            });
        }
        return;
    }

    if (channelName === 'control') {
        if (stateName === 'customArea_cleanings') {
            adapter.customAreaCleanings = state.val;
            adapter.log.info('Set customArea_cleanings to ' + state.val);
            return;
        }
        if (stateName === 'spotArea_cleanings') {
            adapter.spotAreaCleanings = state.val;
            adapter.log.info('Set spotArea_cleanings to ' + state.val);
            return;
        }
    }

    if ((channelName === 'control') && (subChannelName === 'extended')) {
        switch (stateName) {
            case 'pauseWhenEnteringSpotArea': {
                if (helper.isSingleSpotAreaValue(state.val)) {
                    adapter.pauseWhenEnteringSpotArea = state.val;
                    if (adapter.pauseWhenEnteringSpotArea) {
                        adapter.log.info('Pause when entering spotArea: ' + adapter.pauseWhenEnteringSpotArea);
                    }
                }
                break;
            }
            case 'pauseWhenLeavingSpotArea': {
                if (helper.isSingleSpotAreaValue(state.val)) {
                    adapter.pauseWhenLeavingSpotArea = state.val;
                    if (adapter.pauseWhenLeavingSpotArea) {
                        adapter.log.info('Pause when leaving spotArea: ' + adapter.pauseWhenLeavingSpotArea);
                    }
                }
                break;
            }
            case 'pauseBeforeDockingChargingStation': {
                adapter.pauseBeforeDockingChargingStation = state.val;
                if (adapter.pauseBeforeDockingChargingStation) {
                    adapter.log.info('Pause before docking onto charging station');
                } else {
                    adapter.log.info('Do not pause before docking onto charging station');
                }
                break;
            }
            case 'pauseBeforeDockingIfWaterboxInstalled': {
                adapter.pauseBeforeDockingIfWaterboxInstalled = state.val;
                if (state.val) {
                    adapter.log.info('Always pause before docking onto charging station if waterbox installed');
                } else {
                    adapter.log.info('Do not pause before docking onto charging station if waterbox installed');
                }
                break;
            }
        }
    }

    // From here on the commands are handled
    // -------------------------------------
    if (state.ack) {
        return;
    }

    if (channelName === 'map') {

        if (stateName === 'lastUsedCustomAreaValues_save') {
            await mapHelper.saveLastUsedCustomAreaValues(adapter);
            return;
        }
        if (stateName === 'currentSpotAreaValues_save') {
            await mapHelper.saveCurrentSpotAreaValues(adapter);
            return;
        }
        if (stateName === 'lastUsedCustomAreaValues_rerun') {
            mapHelper.rerunLastUsedCustomAreaValues(adapter);
            return;
        }
        if (subChannelName === 'savedCustomAreas') {
            mapHelper.cleanSavedCustomArea(adapter, id);
            return;
        }
        if (subChannelName === 'savedSpotAreas') {
            mapHelper.cleanSavedSpotArea(adapter, id);
            return;
        }
        if (stateName === 'loadCurrentMapImage') {
            adapter.log.info('Loading current map image');
            adapter.vacbot.run('GetMapImage', adapter.currentMapID, 'outline');
            return;
        }

        if (stateId.includes('map.savedBoundaries.virtualBoundary_')) {
            await mapHelper.createVirtualBoundary(adapter, stateId);
            return;
        }
        if (stateId.includes('map.savedBoundarySets.virtualBoundarySet_')) {
            await mapHelper.createVirtualBoundarySet(adapter, stateId);
            return;
        }

        const path = id.split('.');
        const mapID = path[3];
        const mssID = path[5];

        if (stateName === 'saveVirtualBoundarySet') {
            mapHelper.saveVirtualBoundarySet(adapter, mapID);
            return;
        }
        const mapSpotAreaPattern = /cleanSpotArea/;
        if (mapSpotAreaPattern.test(id)) {
            mapHelper.cleanSpotArea(adapter, mapID, mssID);
            return;
        }
        if (stateName === 'saveVirtualBoundary') {
            await mapHelper.saveVirtualBoundary(adapter, mapID, mssID);
            return;
        }
        if (stateName === 'deleteVirtualBoundary') {
            await mapHelper.deleteVirtualBoundary(adapter, mapID, mssID);
            return;
        }
        if (stateName === 'loadMapImage') {
            adapter.log.info('Loading map image');
            adapter.vacbot.run('GetMapImage', mapID, 'outline');
            return;
        }
        if ((parseInt(state.val) > 0) && (adapter.currentMapID === mapID) && (adapter.deebotPositionCurrentSpotAreaID === mssID)) {
            if (stateName === 'waterLevel') {
                runSetWaterLevel(adapter, state.val);
                return;
            }
            if (stateName === 'cleanSpeed') {
                runSetCleanSpeed(adapter, state.val);
                return;
            }
        }
    }

    if (subChannelName === 'move') {
        switch (stateName) {
            case 'forward':
            case 'left':
            case 'right':
            case 'backward':
            case 'turnAround':
                adapter.log.info('move: ' + stateName);
                adapter.vacbot.run('move' + stateName);
                break;
            default:
                adapter.log.warn('Unhandled move cmd: ' + stateName + ' - ' + id);
        }
        return;
    }

    if ((channelName === 'control') && (subChannelName === 'extended')) {
        switch (stateName) {
            case 'volume': {
                const volume = parseInt(state.val);
                if ((volume >= 1) && (volume <= 10)) {
                    adapter.vacbot.run('setVolume', volume);
                    adapter.log.info('Set volume: ' + state.val);
                }
                break;
            }
            case 'advancedMode': {
                const command = state.val === true ? 'EnableAdvancedMode' : 'DisableAdvancedMode';
                adapter.vacbot.run(command);
                adapter.log.info('Change advancedMode: ' + command);
                break;
            }
            case 'autoEmpty': {
                const command = state.val === true ? 'EnableAutoEmpty' : 'DisableAutoEmpty';
                adapter.vacbot.run(command);
                adapter.log.info('Change autoEmpty: ' + command);
                break;
            }
            case 'emptyDustBin': {
                adapter.vacbot.run('EmptyDustBin');
                adapter.setStateConditional('control.extended.emptyDustBin', false, true);
                adapter.log.info('Empty dust bin');
                break;
            }
            case 'doNotDisturb': {
                const command = state.val === true ? 'EnableDoNotDisturb' : 'DisableDoNotDisturb';
                adapter.vacbot.run(command);
                adapter.log.info('Set doNotDisturb: ' + state.val);
                break;
            }
            case 'continuousCleaning': {
                const command = state.val === true ? 'EnableContinuousCleaning' : 'DisableContinuousCleaning';
                adapter.vacbot.run(command);
                adapter.log.info('Set continuousCleaning: ' + state.val);
                break;
            }
            case 'goToPosition': {
                goToPosition(adapter, state);
                break;
            }
        }
        return;
    }

    if (channelName === 'consumable') {
        // control buttons
        switch (stateName) {
            case 'main_brush_reset':
                adapter.log.debug('Reset main brush to 100%');
                adapter.commandQueue.add('ResetLifeSpan', 'main_brush');
                break;
            case 'side_brush_reset':
                adapter.log.debug('Reset side brush to 100%');
                adapter.commandQueue.add('ResetLifeSpan', 'side_brush');
                break;
            case 'filter_reset':
                adapter.log.debug('Reset filter to 100%');
                adapter.commandQueue.add('ResetLifeSpan', 'filter');
                break;
            default:
                adapter.log.warn('Unhandled consumable state: ' + stateName + ' - ' + id);
        }
        adapter.commandQueue.addGetLifespan();
        adapter.commandQueue.runAll();
    }

    if (channelName === 'control') {
        if (stateName === 'reconnect') {
            adapter.reconnect();
            return;
        }
        if (stateName === 'cleanSpeed') {
            runSetCleanSpeed(adapter, state.val);
            return;
        }
        if (stateName === 'cleanSpeed_reset') {
            await mapHelper.resetCleanSpeedOrWaterLevel(adapter, 'cleanSpeed');
            return;
        }
        if (stateName === 'waterLevel') {
            runSetWaterLevel(adapter, state.val);
            return;
        }
        if (stateName === 'waterLevel_reset') {
            await mapHelper.resetCleanSpeedOrWaterLevel(adapter, 'waterLevel');
            return;
        }

        // spotarea cleaning (generic)
        const pattern = /spotArea_[0-9]{1,2}$/;
        if (pattern.test(id)) {
            // spotArea buttons
            const areaNumber = id.split('_')[1];
            startSpotAreaCleaning(adapter, areaNumber);
            adapter.clearGoToPosition();
            return;
        }
        if (state.val !== '') {
            switch (stateName) {
                case 'spotArea': {
                    // 950 type models have native support for up to 2 spot area cleanings
                    if (adapter.vacbot.is950type() && (adapter.spotAreaCleanings === 2)) {
                        startSpotAreaCleaning(adapter, state.val, adapter.spotAreaCleanings);
                        adapter.log.debug('Using API for running multiple spot area cleanings');
                    } else {
                        startSpotAreaCleaning(adapter, state.val);
                        if (adapter.spotAreaCleanings > 1) {
                            adapter.log.debug('Using workaround for running multiple spot area cleanings');
                            adapter.cleaningQueue.createForId(channelName, stateName, state.val);
                        }
                    }
                    adapter.clearGoToPosition();
                    break;
                }
                case 'customArea': {
                    let customAreaValues = state.val.replace(/ /g, '');
                    if (helper.areaValueStringWithCleaningsIsValid(customAreaValues)) {
                        const customAreaCleanings = customAreaValues.split(',')[4];
                        customAreaValues = customAreaValues.split(',', 4).toString();
                        startCustomAreaCleaning(adapter, customAreaValues, customAreaCleanings);
                        adapter.setStateConditional('control.customArea_cleanings', customAreaCleanings, true);
                    } else if (helper.areaValueStringIsValid(customAreaValues)) {
                        startCustomAreaCleaning(adapter, customAreaValues, adapter.customAreaCleanings);
                    } else {
                        adapter.log.warn('Invalid input for custom area: ' + state.val);
                    }
                    adapter.clearGoToPosition();
                    break;
                }
            }
        }

        if ((stateName === 'stop') || (stateName === 'charge')) {
            adapter.commandQueue.resetQueue();
            adapter.cleaningQueue.resetQueue();
        }

        // control buttons
        switch (stateName) {
            case 'clean':
                adapter.log.info('Run: ' + stateName);
                adapter.vacbot.run(handleCleanCommand(adapter, stateName));
                adapter.clearGoToPosition();
                break;
            case 'edge':
            case 'spot':
            case 'stop':
            case 'charge':
            case 'relocate':
                adapter.log.info('Run: ' + stateName);
                adapter.vacbot.run(stateName);
                adapter.clearGoToPosition();
                break;
            case 'resume':
            case 'playSound':
                adapter.log.info('Run: ' + stateName);
                adapter.vacbot.run(stateName);
                break;
            case 'playSoundId':
                adapter.log.info('Run: ' + stateName + ' ' + state.val);
                adapter.vacbot.run('playSound', state.val);
                break;
            case 'playIamHere':
                adapter.log.info('Run: ' + stateName);
                adapter.vacbot.run('playSound', 30);
                break;
            case 'pause':
                if (adapter.getDevice().isPaused()) {
                    adapter.log.info('Resuming cleaning');
                    adapter.vacbot.run('resume');
                } else {
                    adapter.log.info('Cleaning paused');
                    adapter.vacbot.run('pause');
                }
                break;
            case 'volume':
            case 'spotArea':
            case 'customArea':
            case 'goToPosition':
                break;
            default:
                adapter.log.warn('Unhandled control state: ' + stateName + ' - ' + id);
        }
    }
}

function handleCleanCommand(adapter, command) {
    const useV2commands = !!Number(adapter.getConfigValue('feature.control.v2commands'));
    if (useV2commands) {
        adapter.log.debug('Using V2 variant for ' + command + ' command');
        command = command + '_V2';
    }
    return command;
}

function runSetCleanSpeed(adapter, value) {
    adapter.cleanSpeed = Math.round(value);
    adapter.vacbot.run('SetCleanSpeed', adapter.cleanSpeed);
    adapter.log.info('Set Clean Speed: ' + adapter.cleanSpeed);
}

function runSetWaterLevel(adapter, value) {
    adapter.waterLevel = Math.round(value);
    adapter.vacbot.run('SetWaterLevel', adapter.waterLevel);
    adapter.log.info('Set water level: ' + adapter.waterLevel);
}

function startSpotAreaCleaning(adapter, areaValues, cleanings = 1) {
    const useV2commands = !!Number(adapter.getConfigValue('feature.control.v2commands'));
    if (useV2commands) {
        adapter.log.info('Start spot area cleaning (V2): ' + areaValues + ' (' + cleanings + 'x)');
        adapter.vacbot.run('spotArea_V2', areaValues, cleanings);
    } else {
        adapter.log.info('Start spot area cleaning: ' + areaValues + ' (' + cleanings + 'x)');
        adapter.vacbot.run('spotArea', 'start', areaValues, cleanings);
    }
}

function startCustomAreaCleaning(adapter, areaValues, cleanings = 1) {
    const useV2commands = !!Number(adapter.getConfigValue('feature.control.v2commands'));
    if (useV2commands) {
        adapter.log.info('Start custom area cleaning (V2): ' + areaValues + ' (' + cleanings + 'x)');
        adapter.vacbot.run('customArea_V2', areaValues, cleanings);
    } else {
        adapter.log.info('Start custom area cleaning: ' + areaValues + ' (' + cleanings + 'x)');
        adapter.vacbot.run('customArea', 'start', areaValues, cleanings);
    }
}

function goToPosition(adapter, state) {
    const goToPositionValues = state.val.replace(/ /g, '');
    if (helper.positionValueStringIsValid(goToPositionValues)) {
        const accuracy = 150;
        const goToAreaValues = mapHelper.getPositionValuesForExtendedArea(goToPositionValues, accuracy);
        adapter.goToPositionArea = goToAreaValues;
        adapter.log.info('Go to position: ' + goToPositionValues);
        startCustomAreaCleaning(adapter, goToAreaValues, 1);
    } else if (state.val !== '') {
        adapter.log.warn('Invalid input for go to position: ' + state.val);
    }
}

module.exports = {
    handleStateChange,
    startCustomAreaCleaning
};
