'use strict';

const helper = require('./adapterHelper');
const mapHelper = require('./mapHelper');
const C = require('./constants');
const commandRegistry = require('./commandRegistry').createRegistry();

function registerAllCommands() {
    // control.genericCommand.run
    commandRegistry.register('control.genericCommand.run', async (adapter, ctx, state) => {
        const commandState = await ctx.adapterProxy.getStateAsync('control.extended.genericCommand.command');
        const payloadState = await ctx.adapterProxy.getStateAsync('control.extended.genericCommand.payload');
        const command = commandState.val;
        let payload = null;
        if (payloadState.val !== '') {
            payload = JSON.parse(payloadState.val);
        }
        await adapter.setStateAsync('control.extended.genericCommand.responsePayload', '', true);
        await adapter.setStateAsync('control.extended.genericCommand.command', command, true);
        ctx.adapter.log.info('Run generic cmd: ' + command);
        if (payload) {
            ctx.vacbot.run('Generic', command, payload);
            ctx.adapter.log.info('Payload: ' + JSON.stringify(payload));
            await adapter.setStateAsync('control.extended.genericCommand.payload', JSON.stringify(payload), true);
        } else {
            ctx.vacbot.run('Generic', command);
        }
    });

    // history.triggerDustboxRemoved
    commandRegistry.register('history.triggerDustboxRemoved', (adapter, ctx, state) => {
        ctx.adapter.log.info('Dustbox was removed (manually triggered)');
        adapter.setHistoryValuesForDustboxRemoval();
    });

    // cleaninglog.requestCleaningLog
    commandRegistry.register('cleaninglog.requestCleaningLog', (adapter, ctx, state) => {
        ctx.adapter.log.info('Cleaning log was requested (manually triggered)');
        ctx.vacbot.run('GetCleanLogs');
    });

    // info.currentSchedule_refresh
    commandRegistry.register('info.currentSchedule_refresh', (adapter, ctx, state) => {
        ctx.vacbot.run(handleV2commands(adapter, ctx, 'GetSchedule'));
        ctx.adapter.log.info('Refresh schedule data');
    });

    // map commands
    commandRegistry.register('map.lastUsedCustomAreaValues_save', async (adapter, ctx, state) => {
        await mapHelper.saveLastUsedCustomAreaValues(adapter, ctx);
    });
    commandRegistry.register('map.currentSpotAreaValues_save', async (adapter, ctx, state) => {
        await mapHelper.saveCurrentSpotAreaValues(adapter, ctx);
    });
    commandRegistry.register('map.lastUsedCustomAreaValues_rerun', (adapter, ctx, state) => {
        rerunLastUsedCustomAreaValues(adapter, ctx);
    });
    commandRegistry.register('map.loadCurrentMapImage', (adapter, ctx, state) => {
        ctx.adapter.log.info('Loading current map image');
        ctx.vacbot.run('GetMapImage', ctx.currentMapID, 'outline');
    });

    // move commands
    ['forward', 'left', 'right', 'backward', 'turnAround'].forEach(cmd => {
        commandRegistry.register(`control.move.${cmd}`, (adapter, ctx, state) => {
            ctx.adapter.log.info('move: ' + cmd);
            ctx.vacbot.run('move' + cmd);
        });
    });

    // control.linkedPurification
    commandRegistry.register('control.linkedPurification.selfLinkedPurification', (adapter, ctx, state) => {
        const value = Number(state.val);
        ctx.vacbot.run('SetAutonomousClean', value);
        ctx.adapter.log.info('Set linkedPurification: ' + state.val);
    });
    commandRegistry.register('control.linkedPurification.linkedPurificationAQ', (adapter, ctx, state) => {
        const enable = Number(state.val.split(',')[0]);
        const aqStart = Number(state.val.split(',')[1]);
        const aqEnd = Number(state.val.split(',')[2]);
        ctx.vacbot.run('SetAirbotAutoModel', enable, aqEnd, aqStart);
        ctx.adapter.log.info('Set linkedPurificationAQ: ' + state.val);
    });

    // control.airPurifierModules
    commandRegistry.register('control.airPurifierModules.uvSanitization', (adapter, ctx, state) => {
        const enable = Number(state.val);
        ctx.vacbot.run('SetUVCleaner', enable);
        ctx.adapter.log.info('Set uvSanitization: ' + enable);
    });
    commandRegistry.register('control.airPurifierModules.airFreshening', (adapter, ctx, state) => {
        let level = Number(state.val);
        const enable = Number(level > 0);
        level = (level > 0) ? level : 1;
        ctx.vacbot.run('SetFreshenerLevel', level, enable);
        ctx.adapter.log.info('Set airFreshening: ' + state.val);
    });
    commandRegistry.register('control.airPurifierModules.humidification', (adapter, ctx, state) => {
        let level = Number(state.val);
        const enable = Number(level > 0);
        level = (level > 0) ? level : 45;
        ctx.vacbot.run('SetHumidifierLevel', level, enable);
        ctx.adapter.log.info('Set humidification: ' + state.val);
    });

    // control.ota
    commandRegistry.register('control.ota.autoUpdate', (adapter, ctx, state) => {
        const enable = Boolean(state.val);
        ctx.vacbot.run('SetOta', enable);
        ctx.adapter.log.info('Set OTA auto-update: ' + enable);
    });

    // control.extended commands
    commandRegistry.register('control.extended.volume', (adapter, ctx, state) => {
        const volume = parseInt(state.val);
        if ((volume >= 0) && (volume <= 10)) {
            ctx.vacbot.run('SetVolume', volume);
            ctx.adapter.log.info('Set volume: ' + state.val);
        }
    });
    commandRegistry.register('control.extended.atmoVolume', (adapter, ctx, state) => {
        const volume = parseInt(state.val);
        if ((volume >= 0) && (volume <= 16)) {
            ctx.vacbot.run('SetAtmoVolume', volume);
            ctx.adapter.log.info('Set atmo volume: ' + volume);
        }
    });
    commandRegistry.register('control.extended.atmoLight', (adapter, ctx, state) => {
        const brightness = parseInt(state.val);
        if ((brightness >= 0) && (brightness <= 4)) {
            ctx.vacbot.run('SetAtmoLight', brightness);
            ctx.adapter.log.info('Set atmo light/brightness: ' + brightness);
        }
    });
    commandRegistry.register('control.extended.bluetoothSpeaker', (adapter, ctx, state) => {
        const enable = Number(state.val);
        ctx.vacbot.run('SetBlueSpeaker', enable);
        ctx.adapter.log.info('Set bluetoothSpeaker: ' + state.val);
    });
    commandRegistry.register('control.extended.microphone', (adapter, ctx, state) => {
        const enable = Number(state.val);
        ctx.vacbot.run('SetMic', enable);
        ctx.adapter.log.info('Set microphone: ' + state.val);
    });
    commandRegistry.register('control.extended.voiceReport', (adapter, ctx, state) => {
        const enable = Number(state.val);
        ctx.vacbot.run('SetVoiceSimple', enable);
        ctx.adapter.log.info('Set voiceReport: ' + state.val);
    });
    commandRegistry.register('control.extended.advancedMode', (adapter, ctx, state) => {
        const command = state.val === true ? 'EnableAdvancedMode' : 'DisableAdvancedMode';
        ctx.vacbot.run(command);
        ctx.adapter.log.info('Change advancedMode: ' + command);
    });
    commandRegistry.register('control.extended.autoBoostSuction', (adapter, ctx, state) => {
        const command = state.val === true ? 'EnableCarpetPressure' : 'DisableCarpetPressure';
        ctx.vacbot.run(command);
        ctx.adapter.log.info('Change autoBoostSuction: ' + command);
    });
    commandRegistry.register('control.extended.cleanPreference', (adapter, ctx, state) => {
        ctx.cleanPreference = state.val;
        const command = state.val === true ? 'EnableCleanPreference' : 'DisableCleanPreference';
        ctx.vacbot.run(command);
        ctx.adapter.log.info('Change cleanPreference: ' + command);
    });
    commandRegistry.register('control.extended.edgeDeepCleaning', (adapter, ctx, state) => {
        const command = state.val === true ? 'EnableBorderSpin' : 'DisableBorderSpin';
        ctx.vacbot.run(command);
        ctx.adapter.log.info('Change edgeDeepCleaning: ' + command);
    });
    commandRegistry.register('control.extended.mopOnlyMode', (adapter, ctx, state) => {
        const command = state.val === true ? 'EnableMopOnlyMode' : 'DisableMopOnlyMode';
        ctx.vacbot.run(command);
        ctx.adapter.log.info('Change mopOnlyMode: ' + command);
    });
    commandRegistry.register('control.extended.washInterval', (adapter, ctx, state) => {
        const interval = state.val;
        ctx.vacbot.run('SetWashInterval', interval);
        ctx.adapter.log.info('Set wash interval: ' + interval + ' min.');
    });
    commandRegistry.register('control.extended.airDryingDuration', (adapter, ctx, state) => {
        const duration = state.val;
        ctx.vacbot.run('SetDryingDuration', duration);
        ctx.adapter.log.info('Set air drying duration: ' + duration + ' min.');
    });
    commandRegistry.register('control.extended.cleaningMode', (adapter, ctx, state) => {
        const mode = state.val;
        ctx.vacbot.run('SetWorkMode', mode);
        ctx.adapter.log.info('Set cleaning mode: ' + mode);
    });
    commandRegistry.register('control.extended.carpetCleaningStrategy', (adapter, ctx, state) => {
        const mode = state.val;
        ctx.vacbot.run('SetCarpetInfo', mode);
        ctx.adapter.log.info('Set Carpet cleaning strategy: ' + mode);
    });
    commandRegistry.register('control.extended.cleaningClothReminder', (adapter, ctx, state) => {
        const enabled = state.val;
        ctx.vacbot.run('SetDusterRemind', Number(enabled), ctx.cleaningClothReminder.period);
        ctx.adapter.log.info('Set cleaningClothReminder: ' + enabled.toString());
    });
    commandRegistry.register('control.extended.cleaningClothReminder_period', (adapter, ctx, state) => {
        const period = state.val;
        ctx.vacbot.run('SetDusterRemind', Number(ctx.cleaningClothReminder.enabled), period);
        ctx.adapter.log.info('Set cleaningClothReminder_period: ' + period + ' min.');
    });
    commandRegistry.register('control.extended.trueDetect', (adapter, ctx, state) => {
        const command = state.val === true ? 'EnableTrueDetect' : 'DisableTrueDetect';
        ctx.vacbot.run(command);
        ctx.adapter.log.info('Change true detect: ' + command);
    });
    commandRegistry.register('control.extended.autoEmpty', (adapter, ctx, state) => {
        const command = state.val === true ? 'EnableAutoEmpty' : 'DisableAutoEmpty';
        ctx.vacbot.run(command);
        ctx.adapter.log.info('Change autoEmpty: ' + command);
        ctx.vacbot.run('GetAutoEmpty');
    });
    commandRegistry.register('control.extended.emptyDustBin', (adapter, ctx, state) => {
        ctx.vacbot.run('EmptyDustBin');
        ctx.adapterProxy.setStateConditional('control.extended.emptyDustBin', false, true);
        ctx.adapter.log.info('Empty dust bin');
    });
    commandRegistry.register('control.extended.cleanMarkedSpotAreas', async (adapter, ctx, state) => {
        const listOfMarkedSpotAreas = await getListOfMarkedSpotAreas(adapter, ctx);
        if (listOfMarkedSpotAreas.length) {
            const spotAreas = listOfMarkedSpotAreas.toString();
            startSpotAreaCleaning(adapter, ctx, spotAreas);
            ctx.adapter.log.info(`Start cleaning marked spot areas: '${spotAreas}'`);
        } else {
            ctx.adapter.log.warn('No marked spot areas found ...');
        }
        ctx.adapterProxy.setStateConditional('control.extended.cleanMarkedSpotAreas', false, true);
    });
    commandRegistry.register('control.extended.doNotDisturb', (adapter, ctx, state) => {
        const command = state.val === true ? 'EnableDoNotDisturb' : 'DisableDoNotDisturb';
        ctx.vacbot.run(command);
        ctx.adapter.log.info('Set doNotDisturb: ' + state.val);
    });
    commandRegistry.register('control.extended.continuousCleaning', (adapter, ctx, state) => {
        const command = state.val === true ? 'EnableContinuousCleaning' : 'DisableContinuousCleaning';
        ctx.vacbot.run(command);
        ctx.adapter.log.info('Set continuousCleaning: ' + state.val);
    });
    commandRegistry.register('control.extended.goToPosition', (adapter, ctx, state) => {
        goToPosition(adapter, ctx, state.val);
    });
    commandRegistry.register('control.extended.cleanCount', (adapter, ctx, state) => {
        const cleanCount = parseInt(state.val);
        if ((cleanCount >= 1) && (cleanCount <= 2)) {
            ctx.vacbot.run('setCleanCount', cleanCount);
            ctx.adapter.log.info('Set clean count: ' + state.val);
        }
    });
    commandRegistry.register('control.extended.moppingMode', (adapter, ctx, state) => {
        ctx.vacbot.run('SetSweepMode', state.val);
        ctx.adapter.log.info(`Set sweep mode (mopping mode): ${state.val}`);
    });
    commandRegistry.register('control.extended.scrubbingPattern', (adapter, ctx, state) => {
        ctx.vacbot.run('SetWaterLevel', ctx.waterLevel, state.val);
        ctx.adapter.log.info(`Set scrubbing pattern: ${state.val}`);
        setTimeout(() => {
            ctx.vacbot.run('GetWaterInfo');
        }, C.POST_SETTING_DELAY_MS);
    });
    commandRegistry.register('control.extended.goToPosition_saveCurrentDeebotPosition', async (adapter, ctx, state) => {
        const deebotPositionState = await ctx.adapterProxy.getStateAsync('map.deebotPosition');
        if (deebotPositionState && deebotPositionState.val) {
            const deebotPosition = deebotPositionState.val.split(',')[0] + ',' + deebotPositionState.val.split(',')[1];
            await mapHelper.saveGoToPositionValues(adapter, ctx, deebotPosition);
        }
    });
    commandRegistry.register('control.extended.airDrying', (adapter, ctx, state) => {
        const action = state.val === true ? 'start' : 'stop';
        ctx.vacbot.run('Drying', action);
        ctx.adapter.log.info(`Run air-drying ${action}`);
        ctx.intervalQueue.add('GetStationState');
    });
    commandRegistry.register('control.extended.selfCleaning', (adapter, ctx, state) => {
        const action = state.val === true ? 'start' : 'stop';
        ctx.vacbot.run('Washing', action);
        ctx.adapter.log.info(`Run self cleaning ${action}`);
        ctx.intervalQueue.add('GetStationState');
    });
    commandRegistry.register('control.extended.washMode', (adapter, ctx, state) => {
        if (!ctx.vacbot.hasHotWaterWashing()) {
            ctx.adapter.log.warn('Device does not support hot water washing. Ignoring command.');
            return;
        }
        ctx.vacbot.run('SetWashInfo', state.val);
        ctx.adapter.log.info('Set wash mode: ' + state.val);
    });
    commandRegistry.register('control.extended.childLock', (adapter, ctx, state) => {
        ctx.vacbot.run('SetChildLock', state.val ? 1 : 0);
        ctx.adapter.log.info('Set child lock: ' + state.val);
    });
    commandRegistry.register('control.extended.hostedCleanMode', (adapter, ctx, state) => {
        ctx.vacbot.run('HostedCleanMode');
        ctx.adapterProxy.setStateConditional('control.extended.hostedCleanMode', false, true);
        ctx.adapter.log.info('Run HostedCleanMode');
    });
    commandRegistry.register('control.extended.voiceAssistant', (adapter, ctx, state) => {
        ctx.vacbot.run('SetVoiceAssistantState', Number(state.val));
    });

    // consumable reset commands
    commandRegistry.register('consumable.main_brush_reset', (adapter, ctx, state) => {
        ctx.adapter.log.debug('Reset main brush to 100%');
        ctx.commandQueue.add('ResetLifeSpan', 'main_brush');
        ctx.commandQueue.addGetLifespan();
        ctx.commandQueue.runAll();
    });
    commandRegistry.register('consumable.side_brush_reset', (adapter, ctx, state) => {
        ctx.adapter.log.debug('Reset side brush to 100%');
        ctx.commandQueue.add('ResetLifeSpan', 'side_brush');
        ctx.commandQueue.addGetLifespan();
        ctx.commandQueue.runAll();
    });
    commandRegistry.register('consumable.filter_reset', (adapter, ctx, state) => {
        ctx.adapter.log.debug('Reset filter to 100%');
        ctx.commandQueue.add('ResetLifeSpan', 'filter');
        ctx.commandQueue.addGetLifespan();
        ctx.commandQueue.runAll();
    });
    commandRegistry.register('consumable.unit_care_reset', (adapter, ctx, state) => {
        ctx.adapter.log.debug('Reset unit care to 100%');
        ctx.commandQueue.add('ResetLifeSpan', 'unit_care');
        ctx.commandQueue.addGetLifespan();
        ctx.commandQueue.runAll();
    });
    commandRegistry.register('consumable.round_mop_reset', (adapter, ctx, state) => {
        ctx.adapter.log.debug('Reset round mops to 100%');
        ctx.commandQueue.add('ResetLifeSpan', 'round_mop');
        ctx.commandQueue.addGetLifespan();
        ctx.commandQueue.runAll();
    });
    commandRegistry.register('consumable.airFreshener_reset', (adapter, ctx, state) => {
        ctx.adapter.log.debug('Reset air freshener to 100%');
        ctx.commandQueue.add('ResetLifeSpan', 'air_freshener');
        ctx.commandQueue.addGetLifespan();
        ctx.commandQueue.runAll();
    });

    // control simple button commands
    commandRegistry.register('control.reconnect', (adapter, ctx, state) => {
        adapter.reconnect();
    });
    commandRegistry.register('control.cleanSpeed', (adapter, ctx, state) => {
        runSetCleanSpeed(adapter, ctx, state.val);
    });
    commandRegistry.register('control.cleanSpeed_reset', async (adapter, ctx, state) => {
        await resetCleanSpeedOrWaterLevel(adapter, ctx, 'cleanSpeed');
    });
    commandRegistry.register('control.waterLevel', (adapter, ctx, state) => {
        runSetWaterLevel(adapter, ctx, state.val);
    });
    commandRegistry.register('control.waterLevel_reset', async (adapter, ctx, state) => {
        await resetCleanSpeedOrWaterLevel(adapter, ctx, 'waterLevel');
    });
    commandRegistry.register('control.stop', (adapter, ctx, state) => {
        ctx.commandQueue.resetQueue();
        ctx.cleaningQueue.resetQueue();
        ctx.adapter.log.info('Run: stop');
        ctx.vacbot.run('stop');
        adapter.clearGoToPosition(ctx);
    });
    commandRegistry.register('control.charge', (adapter, ctx, state) => {
        ctx.commandQueue.resetQueue();
        ctx.cleaningQueue.resetQueue();
        ctx.adapter.log.info('Run: charge');
        ctx.vacbot.run('charge');
        adapter.clearGoToPosition(ctx);
    });
    commandRegistry.register('control.clean', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: clean');
        ctx.vacbot.run(handleV2commands(adapter, ctx, 'clean'));
        adapter.clearGoToPosition(ctx);
    });
    commandRegistry.register('control.edge', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: edge');
        ctx.vacbot.run('edge');
        adapter.clearGoToPosition(ctx);
    });
    commandRegistry.register('control.spot', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: spot');
        ctx.vacbot.run('spot');
        adapter.clearGoToPosition(ctx);
    });
    commandRegistry.register('control.relocate', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: relocate');
        ctx.vacbot.run('relocate');
        adapter.clearGoToPosition(ctx);
    });
    commandRegistry.register('control.pause', (adapter, ctx, state) => {
        if (ctx.getDevice().isPaused()) {
            ctx.adapter.log.info('Resuming cleaning');
            ctx.vacbot.run('resume');
        } else {
            ctx.adapter.log.info('Cleaning paused');
            ctx.vacbot.run('pause');
        }
    });
    commandRegistry.register('control.resume', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: resume');
        ctx.vacbot.run('resume');
    });
    commandRegistry.register('control.playSound', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: playSound');
        ctx.vacbot.run('playSound');
    });
    commandRegistry.register('control.playSoundId', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: playSoundId ' + state.val);
        ctx.vacbot.run('playSound', state.val);
    });
    commandRegistry.register('control.playIamHere', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: playIamHere');
        ctx.vacbot.run('playSound', 30);
    });
    commandRegistry.register('control.basicPurification', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: basicPurification');
        ctx.vacbot.run('basicPurification');
        adapter.clearGoToPosition(ctx);
    });
    commandRegistry.register('control.mobilePurification', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: mobilePurification');
        ctx.vacbot.run('mobilePurification');
        adapter.clearGoToPosition(ctx);
    });
    commandRegistry.register('control.spotPurification', (adapter, ctx, state) => {
        ctx.adapter.log.info('Run: spotPurification ' + state.val);
        ctx.vacbot.run('spotPurification', state.val);
    });
}
registerAllCommands();

/**
 * Handle the given state by onStateChange to execute a command
 * @param {Object} adapter - The adapter object
 * @param {string} id - The id of the state
 * @param {Object} state - The state object
 * @returns {Promise<void>}
 */
async function handleStateChange(adapter, ctx, id, state) {
    let stateName = helper.getStateNameById(id);
    if (!ctx.enabled) return;
    if (!state.ack) {
        if (stateName === 'clean_home') {
            switch (ctx.getDevice().status) {
                case 'error':
                    ctx.adapter.log.warn('Please check bot for errors');
                    return;
                case 'paused':
                    stateName = 'resume';
                    ctx.adapterProxy.setStateConditional(id, true, true);
                    break;
                case 'cleaning':
                    stateName = 'charge';
                    ctx.adapterProxy.setStateConditional(id, false, true);
                    break;
                default:
                    stateName = 'clean';
                    ctx.adapterProxy.setStateConditional(id, true, true);
            }
            ctx.adapter.log.debug('clean_home => ' + stateName);
        } else {
            adapter.getObject(ctx.statePath(id), (err, obj) => {
                if ((!err) && (obj) && (obj.common.role === 'button')) {
                    ctx.adapterProxy.setStateConditional(id, false, true);
                }
            });
        }
    }

    const timestamp = helper.getUnixTimestamp();
    const date = adapter.getCurrentDateAndTimeFormatted();

    // id cropped by namespace
    const stateId = id.replace(adapter.namespace + '.', '');

    const _subPathParts = id.split('.');
    const channelName = _subPathParts[0];
    const subChannelName = _subPathParts.length > 2 ? _subPathParts[_subPathParts.length - 2] : undefined;

    if (channelName !== 'history') {
        ctx.adapter.log.debug('state change ' + stateId + ' => ' + state.val);
        ctx.adapterProxy.setStateConditional('history.timestampOfLastStateChange', timestamp, true);
        ctx.adapterProxy.setStateConditional('history.dateOfLastStateChange', date, true);
    }

    if (!ctx.connected) {
        if (channelName === 'control') {
            adapter.getState(ctx.statePath(id), (err, state) => {
                if ((!err) && (state) && (state.val)) {
                    ctx.adapter.log.info('Not connected yet... Skip control cmd: ' + stateName);
                }
            });
        }
        return;
    }

    if (channelName === 'control') {
        if (stateName === 'customArea_cleanings') {
            ctx.customAreaCleanings = state.val;
            ctx.adapter.log.info('Set customArea_cleanings to ' + state.val);
            return;
        }
        if (stateName === 'spotArea_cleanings') {
            ctx.spotAreaCleanings = state.val;
            ctx.adapter.log.info('Set spotArea_cleanings to ' + state.val);
            return;
        }
    }

    if ((channelName === 'control') && (subChannelName === 'extended')) {
        switch (stateName) {
            case 'pauseWhenEnteringSpotArea': {
                if (helper.isSingleSpotAreaValue(state.val)) {
                    ctx.pauseWhenEnteringSpotArea = state.val;
                    if (ctx.pauseWhenEnteringSpotArea) {
                        ctx.adapter.log.info('Pause when entering spotArea: ' + ctx.pauseWhenEnteringSpotArea);
                    }
                }
                break;
            }
            case 'pauseWhenLeavingSpotArea': {
                if (helper.isSingleSpotAreaValue(state.val)) {
                    ctx.pauseWhenLeavingSpotArea = state.val;
                    if (ctx.pauseWhenLeavingSpotArea) {
                        ctx.adapter.log.info('Pause when leaving spotArea: ' + ctx.pauseWhenLeavingSpotArea);
                    }
                }
                break;
            }
            case 'pauseBeforeDockingChargingStation': {
                ctx.pauseBeforeDockingChargingStation = state.val;
                if (ctx.pauseBeforeDockingChargingStation) {
                    ctx.adapter.log.info('Pause before docking onto charging station');
                } else {
                    ctx.adapter.log.info('Do not pause before docking onto charging station');
                }
                break;
            }
            case 'pauseBeforeDockingIfWaterboxInstalled': {
                ctx.pauseBeforeDockingIfWaterboxInstalled = state.val;
                if (state.val) {
                    ctx.adapter.log.info('Always pause before docking onto charging station if waterbox installed');
                } else {
                    ctx.adapter.log.info('Do not pause before docking onto charging station if waterbox installed');
                }
                break;
            }
            case 'resetCleanSpeedToStandardOnReturn': {
                ctx.resetCleanSpeedToStandardOnReturn = state.val;
                if (state.val) {
                    ctx.adapter.log.info('Always reset clean speed on return');
                } else {
                    ctx.adapter.log.info('Do not reset clean speed on return');
                }
                break;
            }
        }
    }

    // -------------------------------------
    // From here on the commands are handled
    // -------------------------------------
    if (state.ack) {
        return;
    }

    const handler = commandRegistry.get(`${channelName}.${stateName}`) ||
        commandRegistry.get(`${channelName}.${subChannelName}.${stateName}`);
    if (handler) {
        await handler(adapter, ctx, state);
        return;
    }

    if (channelName === 'map') {
        if (subChannelName === 'savedCustomAreas') {
            cleanSavedCustomArea(adapter, ctx, id);
            return;
        }
        if (subChannelName === 'savedSpotAreas') {
            cleanSavedSpotArea(adapter, ctx, id);
            return;
        }

        if (stateId.includes('map.savedBoundaries.virtualBoundary_')) {
            await mapHelper.createVirtualBoundary(adapter, ctx, stateId);
            return;
        }
        if (stateId.includes('map.savedBoundarySets.virtualBoundarySet_')) {
            await mapHelper.createVirtualBoundarySet(adapter, ctx, stateId);
            return;
        }

        const path = id.split('.');
        const mapID = path[3];
        const mapSpotAreaID = path[5];

        if (stateName === 'saveVirtualBoundarySet') {
            mapHelper.saveVirtualBoundarySet(adapter, ctx, mapID);
            return;
        }
        const mapSpotAreaPattern = /cleanSpotArea/;
        if (mapSpotAreaPattern.test(id)) {
            let silentApproach = (stateName === 'cleanSpotArea_silentApproach');
            if ((Number(mapID) === Number(ctx.currentMapID)) &&
                (Number(mapSpotAreaID) === Number(ctx.currentSpotAreaID))) {
                silentApproach = false;
            }
            if (silentApproach) {
                ctx.silentApproach = {
                    'mapID': mapID,
                    'mapSpotAreaID': mapSpotAreaID
                };
                goToSavedPosition(adapter, ctx, stateId);
            } else {
                cleanSpotArea(adapter, ctx, mapID, mapSpotAreaID);
            }
            return;
        }

        if (stateName === 'goToCalculatedCenterPosition') {
            goToSavedPosition(adapter, ctx, stateId);
            return;
        }
        if (stateName === 'saveVirtualBoundary') {
            await mapHelper.saveVirtualBoundary(adapter, ctx, mapID, mapSpotAreaID);
            return;
        }
        if (stateName === 'deleteVirtualBoundary') {
            await mapHelper.deleteVirtualBoundary(adapter, ctx, mapID, mapSpotAreaID);
            return;
        }
        if (stateName === 'loadMapImage') {
            ctx.adapter.log.info('Loading map image');
            ctx.vacbot.run('GetMapImage', mapID, 'outline');
            return;
        }
        if ((parseInt(state.val) > 0) && (ctx.currentMapID === mapID) && (ctx.currentSpotAreaID === mapSpotAreaID)) {
            if (stateName === 'waterLevel') {
                runSetWaterLevel(adapter, ctx, state.val);
                return;
            }
            if (stateName === 'cleanSpeed') {
                runSetCleanSpeed(adapter, ctx, state.val);
                return;
            }
        }
    }

    if (subChannelName === 'move') {
        ctx.adapter.log.warn('Unhandled move cmd: ' + stateName + ' - ' + id);
        return;
    }

    if ((channelName === 'control') && (subChannelName === 'savedGoToPositionValues')) {
        if (stateId.includes('control.extended.savedGoToPositionValues.goToPosition_')) {
            goToSavedPosition(adapter, ctx, stateId);
            return;
        }
    }

    if (channelName === 'control') {
        const pattern = /spotArea_[0-9]{1,2}$/;
        if (pattern.test(id)) {
            const areaNumber = id.split('_')[1];
            startSpotAreaCleaning(adapter, ctx, areaNumber);
            adapter.clearGoToPosition(ctx);
            return;
        }
        if (state.val !== '') {
            if (stateName === 'spotArea_silentApproach') {
                const mapSpotAreas = await ctx.adapterProxy.getStateAsync('control.spotArea_silentApproach');
                const spotAreaString = await getSortedSpotAreasBySequenceNumbers(adapter, ctx, mapSpotAreas.val);
                await ctx.adapterProxy.setStateConditionalAsync('control.spotArea_silentApproach', spotAreaString, true);
                if (spotAreaString !== '') {
                    const firstSpotArea = Number(spotAreaString.split(',')[0]);
                    if (firstSpotArea === Number(ctx.currentSpotAreaID)) {
                        ctx.adapter.log.info('Bot already located in the first spot area. Start directly with the cleaning');
                        startSpotAreaCleaning(adapter, ctx, spotAreaString);
                    } else if (firstSpotArea >= 0) {
                        ctx.silentApproach = {
                            'mapID': ctx.currentMapID,
                            'mapSpotAreaID': firstSpotArea,
                            'mapSpotAreas': spotAreaString
                        };
                        const sId = `map.${ctx.currentMapID}.spotAreas.${firstSpotArea}.goToCalculatedCenterPosition`;
                        ctx.adapter.log.info(`Going to the first area (${firstSpotArea}) before starting the cleaning`);
                        goToSavedPosition(adapter, ctx, sId);
                    }
                }
            } else if (stateName === 'spotArea') {
                if (ctx.vacbot.is950type() && (ctx.spotAreaCleanings === 2)) {
                    startSpotAreaCleaning(adapter, ctx, state.val, ctx.spotAreaCleanings);
                    ctx.adapter.log.debug('Using API for running multiple spot area cleanings');
                } else {
                    startSpotAreaCleaning(adapter, ctx, state.val);
                    if (ctx.spotAreaCleanings > 1) {
                        ctx.adapter.log.debug('Using workaround for running multiple spot area cleanings');
                        ctx.cleaningQueue.createMultipleCleaningsForSpotArea(channelName, stateName, state.val);
                    }
                }
                adapter.clearGoToPosition(ctx);
            } else if (stateName === 'customArea') {
                let customAreaValues = state.val.replace(/ /g, '');
                if (helper.areaValueStringWithCleaningsIsValid(customAreaValues)) {
                    const customAreaCleanings = Number(customAreaValues.split(',')[4]);
                    customAreaValues = customAreaValues.split(',', 4).toString();
                    startCustomAreaCleaning(adapter, ctx, customAreaValues, customAreaCleanings);
                    ctx.adapterProxy.setStateConditional('control.customArea_cleanings', customAreaCleanings, true);
                } else if (helper.areaValueStringIsValid(customAreaValues)) {
                    startCustomAreaCleaning(adapter, ctx, customAreaValues, ctx.customAreaCleanings);
                } else {
                    ctx.adapter.log.warn('Invalid input for custom area: ' + state.val);
                }
                adapter.clearGoToPosition(ctx);
            }
        }
    }
}

/**
 * Checks if the device is set to use V2 commands
 * @param {Object} adapter - The adapter object
 * @param {string} command - The command to send to the device
 * @returns {string} the command name in the appropriate case with the "_V2" suffix
 */
function handleV2commands(adapter, ctx, command) {
    if (ctx.getDevice().useV2commands()) {
        ctx.adapter.log.debug('Using V2 variant for ' + command + ' command');
        command = command + '_V2';
    }
    return command;
}

/**
 * It sets the clean speed (vacuum power) of the vacuum
 * @param {Object} adapter - The adapter object
 * @param {number} value - The clean speed to set
 */
function runSetCleanSpeed(adapter, ctx, value) {
    ctx.cleanSpeed = Math.round(value);
    if (ctx.getModel().isModelTypeAirbot()) {
        ctx.vacbot.run('SetFanSpeed', ctx.cleanSpeed);
    } else {
        ctx.vacbot.run('SetCleanSpeed', ctx.cleanSpeed);
    }
    ctx.adapter.log.info('Set Clean Speed: ' + ctx.cleanSpeed);
    setTimeout(() => {
        ctx.vacbot.run('GetCleanSpeed');
    }, C.POST_SETTING_DELAY_MS);
}

/**
 * It sets the water level (water amount) of the vacuum
 * @param {Object} adapter - The adapter object
 * @param {number} value - The water level to set
 */
function runSetWaterLevel(adapter, ctx, value) {
    ctx.waterLevel = Math.round(value);
    ctx.vacbot.run('SetWaterLevel', ctx.waterLevel);
    ctx.adapter.log.info('Set water level: ' + ctx.waterLevel);
    setTimeout(() => {
        ctx.vacbot.run('GetWaterInfo');
    }, C.POST_SETTING_DELAY_MS);
}

/**
 * Start a spot area cleaning
 * Check the adapter configuration if we should use a V2 command
 * @param {Object} adapter - The adapter object
 * @param {string} areaValues - The area to clean
 * @param {number} [cleanings=1] - The number of times to run the cleaning cycle
 */
function startSpotAreaCleaning(adapter, ctx, areaValues, cleanings = 1) {
    if (ctx.getDevice().useV2commands()) {
        ctx.adapter.log.info('Start spot area cleaning (V2): ' + areaValues + ' (' + cleanings + 'x)');
        ctx.vacbot.run('spotArea_V2', areaValues, cleanings);
    } else {
        ctx.adapter.log.info('Start spot area cleaning: ' + areaValues + ' (' + cleanings + 'x)');
        ctx.vacbot.run('spotArea', 'start', areaValues, cleanings);
    }
    ctx.adapterProxy.setStateConditional('map.currentUsedSpotAreas', areaValues, true);
}

/**
 * Start a custom area cleaning
 * Check the adapter configuration if we should use a V2 command
 * @param {Object} adapter - The adapter object
 * @param {string} areaValues - The area to clean
 * @param {number} [cleanings=1] - The number of times to run the cleaning cycle
 */
function startCustomAreaCleaning(adapter, ctx, areaValues, cleanings = 1) {
    if (ctx.getDevice().useV2commands()) {
        ctx.adapter.log.info('Start custom area cleaning (V2): ' + areaValues + ' (' + cleanings + 'x)');
        ctx.vacbot.run('customArea_V2', areaValues, cleanings);
    } else {
        ctx.adapter.log.info('Start custom area cleaning: ' + areaValues + ' (' + cleanings + 'x)');
        ctx.vacbot.run('customArea', 'start', areaValues, cleanings);
    }
    if (!ctx.goToPositionArea) {
        ctx.adapterProxy.setStateConditional('map.currentUsedCustomAreaValues', areaValues, true);
    }
}

/**
 * If the vacuum is on the correct map, start cleaning the given spot area
 * @param adapter {Object} - the adapter object
 * @param {String} mapID - The ID of the map that the spot area is on
 * @param {String} mapSpotAreaID - The ID of the spot area
 */
function cleanSpotArea(adapter, ctx, mapID, mapSpotAreaID) {
    if (ctx.getModel().isSupportedFeature('map.deebotPositionIsInvalid') && ctx.deebotPositionIsInvalid) {
        ctx.adapter.log.error('failed start cleaning spot area: ' + mapSpotAreaID + ' - position invalid');
    } else if (Number(mapID) === Number(ctx.currentMapID)) {
        ctx.adapter.log.info('Start cleaning spot area: ' + mapSpotAreaID + ' on map ' + mapID);
        ctx.vacbot.run('spotArea', 'start', mapSpotAreaID);
        if (ctx.spotAreaCleanings > 1) {
            ctx.cleaningQueue.createMultipleCleaningsForSpotArea('control', 'spotArea', mapSpotAreaID);
        }
    } else {
        ctx.adapter.log.error('failed start cleaning spot area: ' + mapSpotAreaID + ' - bot not on map ' + mapID + ' (current mapID: ' + ctx.currentMapID + ')');
    }
    //TODO: relocate if not correct map, queueing until relocate finished (async)
}

/**
 * Start the cleaning process for the saved spot areas
 * @param {Object} adapter - The adapter object
 * @param {String} id - The id of the object to be cleaned
 */
function cleanSavedSpotArea(adapter, ctx, id) {
    const pattern = /map\.savedSpotAreas\.spotArea_[0-9]{10}$/;
    if (pattern.test(id)) {
        ctx.adapterProxy.getObjectAsync(id).then(obj => {
            if (obj && obj.native && obj.native.area) {
                ctx.cleaningQueue.run('spotArea', 'start', obj.native.area);
            }
        });
    }
}

/**
 * Reset the clean speed or water level of all the spot areas
 * @param {Object} adapter - The adapter object
 * @param {String} type - The type of the channel to reset
 */
async function resetCleanSpeedOrWaterLevel(adapter, ctx, type) {
    const channels = await ctx.adapterProxy.getChannelsOfAsync('map');
    for (const r in channels) {
        const spotAreaObj = channels[r];
        if (mapHelper.isSpotAreasChannel(spotAreaObj._id)) {
            ctx.adapterProxy.setStateConditional(spotAreaObj._id + '.' + type, 0, true);
        }
    }
}

/**
 * Rerun the last used custom area values that are stored in map.lastUsedCustomAreaValues
 * @param {Object} adapter - The adapter object
 */
function rerunLastUsedCustomAreaValues(adapter, ctx) {
    ctx.adapterProxy.getStateAsync('map.lastUsedCustomAreaValues').then(state => {
        if (state && state.val) {
            startCustomAreaCleaning(adapter, ctx, state.val, ctx.customAreaCleanings);
        }
    }).catch(e => {
        ctx.adapter.log.error('Error rerunLastUsedCustomAreaValues: ' + e.message);
    });
}

/**
 * Go to a saved position
 * @param {Object} adapter - The adapter object
 * @param {String} id - The id of the saved position
 */
function goToSavedPosition(adapter, ctx, id) {
    ctx.adapterProxy.getObjectAsync(id).then(obj => {
        if (obj && obj.native && obj.native.goToPositionValues) {
            goToPosition(adapter, ctx, obj.native.goToPositionValues, true);
        }
    }).catch(e => {
        ctx.adapter.log.error('Error goToSavedPosition: ' + e.message);
    });
}

/**
 * Start the cleaning process for a saved custom area
 * @param {Object} adapter - The adapter object
 * @param {String} id - The id of the saved custom area
 */
function cleanSavedCustomArea(adapter, ctx, id) {
    const pattern = /map\.savedCustomAreas\.customArea_[0-9]{10}$/;
    if (pattern.test(id)) {
        ctx.adapterProxy.getObjectAsync(id).then(obj => {
            if (obj && obj.native && obj.native.area) {
                startCustomAreaCleaning(adapter, ctx, obj.native.area, ctx.customAreaCleanings);
            }
        }).catch(e => {
            ctx.adapter.log.error('Error cleanSavedCustomArea: ' + e.message);
        });
    }
}

/**
 * Move the bot to a given position
 * @param {Object} adapter - The adapter object
 * @param goToPositionValues
 * @param doNotSave
 */
function goToPosition(adapter, ctx, goToPositionValues, doNotSave = false) {
    goToPositionValues = goToPositionValues.replace(/ /g, '');
    if (helper.positionValueStringIsValid(goToPositionValues)) {
        if (ctx.getModel().isModelTypeAirbot()) {
            ctx.adapter.log.info(`Go to position: ` + goToPositionValues);
            ctx.vacbot.run('SinglePoint_V2', goToPositionValues);
        } else if (ctx.getDevice().useNativeGoToPosition()) {
            ctx.adapter.log.info(`Go to position: ` + goToPositionValues);
            ctx.vacbot.run('GoToPosition', goToPositionValues);
        } else {
            // Start custom area cleaning for a given position with a size of 30 x 30 cm
            const accuracy = 150;
            const goToAreaValues = mapHelper.getPositionValuesForExtendedArea(goToPositionValues, accuracy);
            ctx.goToPositionArea = goToAreaValues;
            ctx.adapter.log.info('Go to position: ' + goToPositionValues);
            startCustomAreaCleaning(adapter, ctx, goToAreaValues, 1);
        }
        if (doNotSave === false) {
            ctx.adapterProxy.getStateAsync('control.extended.goToPosition_saveNextUsedValues').then(state => {
                if (state && (state.val === true)) {
                    (async () => {
                        await mapHelper.saveGoToPositionValues(adapter, ctx, goToPositionValues);
                    })();
                }
            });
        }
    } else if (goToPositionValues !== '') {
        ctx.adapter.log.warn('Invalid input for go to position: ' + goToPositionValues);
    }
}

async function getListOfMarkedSpotAreas(adapter, ctx) {
    const listOfMarkedSpotAreas = [];
    try {
        const spotAreasChannels = await ctx.adapterProxy.getChannelsOfAsync('map');
        for (const r in spotAreasChannels) {
            if (Object.prototype.hasOwnProperty.call(spotAreasChannels, r)) {
                const spotAreaObj = spotAreasChannels[r];
                if (mapHelper.isSpotAreasChannel(spotAreaObj._id) && spotAreaObj._id.includes(`.${ctx.currentMapID}.`)) {
                    const spotAreaID = spotAreaObj._id.split('.').pop();
                    const stateID = `${spotAreaObj._id}.markForNextSpotAreaCleaning`;
                    ctx.adapter.log.debug(`found id for spot area ${spotAreaID}: ${stateID}`);
                    const state = await ctx.adapterProxy.getStateAsync(stateID);
                    if (state && state.val) {
                        listOfMarkedSpotAreas.push(spotAreaID);
                    }
                }
            }
        }
    } catch (e) {
        // @ts-ignore
        ctx.adapter.log.error(`Error iterating over spot areas for mapID ${ctx.currentMapID}: ${e.message}`);
    }
    return listOfMarkedSpotAreas;
}

async function getSortedSpotAreasBySequenceNumbers(adapter, ctx, unsortedSpotAreaString) {
    const mapSpotAreaArray = [];
    const mapSpotAreasArray = unsortedSpotAreaString.split(',');
    for (const spotAreaId of mapSpotAreasArray) {
        const spotAreaChannel = 'map.' + ctx.currentMapID + '.spotAreas.' + spotAreaId;
        const state = await ctx.adapterProxy.getStateAsync(spotAreaChannel + '.spotAreaSequenceNumber');
        if (state && state.val) {
            const sequenceNumber = state.val;
            const mapSpotAreaObj = {
                spotAreaId: spotAreaId,
                sequenceNumber: sequenceNumber
            };
            mapSpotAreaArray.push(mapSpotAreaObj);
        }
    }
    mapSpotAreaArray.sort((a, b) => {
        return a.sequenceNumber - b.sequenceNumber;
    });
    let sortedSpotAreaArray = [];
    mapSpotAreaArray.forEach((mapSpotAreaObj) => {
        const spotAreaId = mapSpotAreaObj.spotAreaId;
        if (mapSpotAreasArray.includes(spotAreaId.toString())) {
            sortedSpotAreaArray.push(mapSpotAreaObj.spotAreaId);
        }
    });
    sortedSpotAreaArray = sortedSpotAreaArray.filter((e, i, a) => a.indexOf(e) === i);
    return sortedSpotAreaArray.toString();
}

module.exports = {
    cleanSpotArea,
    handleStateChange,
    runSetCleanSpeed,
    handleV2commands,
    startSpotAreaCleaning
};
