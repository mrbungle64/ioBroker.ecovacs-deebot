'use strict';

const helper = require('./adapterHelper');
const mapHelper = require('./mapHelper');

/**
 * Handle the given state by onStateChange to execute a command
 * @param {Object} adapter - The adapter object
 * @param {string} id - The id of the state
 * @param {Object} state - The state object
 * @returns {Promise<void>}
 */
async function handleStateChange(adapter, ctx, id, state) {
    let stateName = helper.getStateNameById(id);
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

    if ((channelName === 'control') && (subChannelName === 'genericCommand')) {
        if (stateName === 'run') {
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
            return;
        }
    }

    if (channelName === 'history') {
        if (stateName === 'triggerDustboxRemoved') {
            ctx.adapter.log.info('Dustbox was removed (manually triggered)');
            adapter.setHistoryValuesForDustboxRemoval();
            return;
        }
    }

    if (channelName === 'cleaninglog') {
        if (stateName === 'requestCleaningLog') {
            ctx.adapter.log.info('Cleaning log was requested (manually triggered)');
            ctx.vacbot.run('GetCleanLogs');
            return;
        }
    }

    if (channelName === 'info') {
        if (stateName === 'currentSchedule_refresh') {
            ctx.vacbot.run(handleV2commands(adapter, ctx, 'GetSchedule'));
            ctx.adapter.log.info('Refresh schedule data');
            return;
        }
    }

    if (channelName === 'map') {

        if (stateName === 'lastUsedCustomAreaValues_save') {
            await mapHelper.saveLastUsedCustomAreaValues(adapter, ctx);
            return;
        }
        if (stateName === 'currentSpotAreaValues_save') {
            await mapHelper.saveCurrentSpotAreaValues(adapter, ctx);
            return;
        }
        if (stateName === 'lastUsedCustomAreaValues_rerun') {
            rerunLastUsedCustomAreaValues(adapter, ctx);
            return;
        }
        if (subChannelName === 'savedCustomAreas') {
            cleanSavedCustomArea(adapter, ctx, id);
            return;
        }
        if (subChannelName === 'savedSpotAreas') {
            cleanSavedSpotArea(adapter, ctx, id);
            return;
        }
        if (stateName === 'loadCurrentMapImage') {
            ctx.adapter.log.info('Loading current map image');
            ctx.vacbot.run('GetMapImage', ctx.currentMapID, 'outline');
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
        switch (stateName) {
            case 'forward':
            case 'left':
            case 'right':
            case 'backward':
            case 'turnAround':
                ctx.adapter.log.info('move: ' + stateName);
                ctx.vacbot.run('move' + stateName);
                break;
            default:
                ctx.adapter.log.warn('Unhandled move cmd: ' + stateName + ' - ' + id);
        }
        return;
    }

    if ((channelName === 'control') && (subChannelName === 'savedGoToPositionValues')) {
        if (stateId.includes('control.extended.savedGoToPositionValues.goToPosition_')) {
            goToSavedPosition(adapter, ctx, stateId);
            return;
        }
    }

    if ((channelName === 'control') && (subChannelName === 'linkedPurification')) {
        switch (stateName) {
            case 'selfLinkedPurification': {
                const value = Number(state.val);
                ctx.vacbot.run('SetAutonomousClean', value);
                ctx.adapter.log.info('Set linkedPurification: ' + state.val);
                break;
            }
            case 'linkedPurificationAQ': {
                const enable = Number(state.val.split(',')[0]);
                const aqStart = Number(state.val.split(',')[1]);
                const aqEnd = Number(state.val.split(',')[2]);
                ctx.vacbot.run('SetAirbotAutoModel', enable, aqEnd, aqStart);
                ctx.adapter.log.info('Set linkedPurificationAQ: ' + state.val);
                break;
            }
            default:
                ctx.adapter.log.warn('Unhandled control.linkedPurification state: ' + stateName + ' - ' + id);
                return;
        }
    }

    if ((channelName === 'control') && (subChannelName === 'airPurifierModules')) {
        switch (stateName) {
            case 'uvSanitization': {
                const enable = Number(state.val);
                ctx.vacbot.run('SetUVCleaner', enable);
                ctx.adapter.log.info('Set uvSanitization: ' + enable);
                break;
            }
            case 'airFreshening': {
                let level = Number(state.val);
                const enable = Number(level > 0);
                level = (level > 0) ? level : 1; // If disabled set a value greater than 0
                ctx.vacbot.run('SetFreshenerLevel', level, enable);
                ctx.adapter.log.info('Set airFreshening: ' + state.val);
                break;
            }
            case 'humidification': {
                let level = Number(state.val);
                const enable = Number(level > 0);
                level = (level > 0) ? level : 45; // If disabled set a value greater than 0
                ctx.vacbot.run('SetHumidifierLevel', level, enable);
                ctx.adapter.log.info('Set humidification: ' + state.val);
                break;
            }
            default:
                ctx.adapter.log.warn('Unhandled control.airRefreshingSystem state: ' + stateName + ' - ' + id);
                return;
        }
    }


    if ((channelName === 'control') && (subChannelName === 'ota')) {
        switch (stateName) {
            case 'autoUpdate': {
                const enable = Boolean(state.val);
                ctx.vacbot.run('SetOta', enable);
                ctx.adapter.log.info('Set OTA auto-update: ' + enable);
                break;
            }
            default:
                ctx.adapter.log.warn('Unhandled control.ota state: ' + stateName + ' - ' + id);
                return;
        }
    }
    if ((channelName === 'control') && (subChannelName === 'extended')) {
        switch (stateName) {
            case 'volume': {
                const volume = parseInt(state.val);
                if ((volume >= 0) && (volume <= 10)) {
                    ctx.vacbot.run('SetVolume', volume);
                    ctx.adapter.log.info('Set volume: ' + state.val);
                }
                break;
            }
            case 'atmoVolume': {
                const volume = parseInt(state.val);
                if ((volume >= 0) && (volume <= 16)) {
                    ctx.vacbot.run('SetAtmoVolume', volume);
                    ctx.adapter.log.info('Set atmo volume: ' + volume);
                }
                break;
            }
            case 'atmoLight': {
                const brightness = parseInt(state.val);
                if ((brightness >= 0) && (brightness <= 4)) {
                    ctx.vacbot.run('SetAtmoLight', brightness);
                    ctx.adapter.log.info('Set atmo light/brightness: ' + brightness);
                }
                break;
            }
            case 'bluetoothSpeaker': {
                const enable = Number(state.val);
                ctx.vacbot.run('SetBlueSpeaker', enable);
                ctx.adapter.log.info('Set bluetoothSpeaker: ' + state.val);
                break;
            }
            case 'microphone': {
                const enable = Number(state.val);
                ctx.vacbot.run('SetMic', enable);
                ctx.adapter.log.info('Set microphone: ' + state.val);
                break;
            }
            case 'voiceReport': {
                const enable = Number(state.val);
                ctx.vacbot.run('SetVoiceSimple', enable);
                ctx.adapter.log.info('Set voiceReport: ' + state.val);
                break;
            }
            case 'advancedMode': {
                const command = state.val === true ? 'EnableAdvancedMode' : 'DisableAdvancedMode';
                ctx.vacbot.run(command);
                ctx.adapter.log.info('Change advancedMode: ' + command);
                break;
            }
            case 'autoBoostSuction': {
                const command = state.val === true ? 'EnableCarpetPressure' : 'DisableCarpetPressure';
                ctx.vacbot.run(command);
                ctx.adapter.log.info('Change autoBoostSuction: ' + command);
                break;
            }
            case 'cleanPreference': {
                this.cleanPreference = state.val;
                const command = state.val === true ? 'EnableCleanPreference' : 'DisableCleanPreference';
                ctx.vacbot.run(command);
                ctx.adapter.log.info('Change cleanPreference: ' + command);
                break;
            }
            case 'edgeDeepCleaning': {
                const command = state.val === true ? 'EnableBorderSpin' : 'DisableBorderSpin';
                ctx.vacbot.run(command);
                ctx.adapter.log.info('Change edgeDeepCleaning: ' + command);
                break;
            }
            case 'mopOnlyMode': {
                const command = state.val === true ? 'EnableMopOnlyMode' : 'DisableMopOnlyMode';
                ctx.vacbot.run(command);
                ctx.adapter.log.info('Change mopOnlyMode: ' + command);
                break;
            }
            case 'washInterval': {
                const interval = state.val;
                ctx.vacbot.run('SetWashInterval', interval);
                ctx.adapter.log.info('Set wash interval: ' + interval + ' min.');
                break;
            }
            case 'airDryingDuration': {
                const duration = state.val;
                ctx.vacbot.run('SetDryingDuration', duration);
                ctx.adapter.log.info('Set air drying duration: ' + duration + ' min.');
                break;
            }
            case 'cleaningMode': {
                const mode = state.val;
                ctx.vacbot.run('SetWorkMode', mode);
                ctx.adapter.log.info('Set cleaning mode: ' + mode);
                break;
            }
            case 'carpetCleaningStrategy': {
                const mode = state.val;
                ctx.vacbot.run('SetCarpetInfo', mode);
                ctx.adapter.log.info('Set Carpet cleaning strategy: ' + mode);
                break;
            }
            case 'cleaningClothReminder': {
                const enabled = state.val;
                ctx.vacbot.run('SetDusterRemind', Number(enabled), ctx.cleaningClothReminder.period);
                ctx.adapter.log.info('Set cleaningClothReminder: ' + enabled.toString());
                break;
            }
            case 'cleaningClothReminder_period': {
                const period = state.val;
                ctx.vacbot.run('SetDusterRemind', Number(ctx.cleaningClothReminder.enabled), period);
                ctx.adapter.log.info('Set cleaningClothReminder_period: ' + period + ' min.');
                break;
            }
            case 'trueDetect': {
                const command = state.val === true ? 'EnableTrueDetect' : 'DisableTrueDetect';
                ctx.vacbot.run(command);
                ctx.adapter.log.info('Change true detect: ' + command);
                break;
            }
            case 'autoEmpty': {
                const command = state.val === true ? 'EnableAutoEmpty' : 'DisableAutoEmpty';
                ctx.vacbot.run(command);
                ctx.adapter.log.info('Change autoEmpty: ' + command);
                ctx.vacbot.run('GetAutoEmpty');
                break;
            }
            case 'emptyDustBin': {
                ctx.vacbot.run('EmptyDustBin');
                ctx.adapterProxy.setStateConditional('control.extended.emptyDustBin', false, true);
                ctx.adapter.log.info('Empty dust bin');
                break;
            }
            case 'cleanMarkedSpotAreas': {
                const listOfMarkedSpotAreas = await getListOfMarkedSpotAreas(adapter, ctx);
                if (listOfMarkedSpotAreas.length) {
                    const spotAreas = listOfMarkedSpotAreas.toString();
                    startSpotAreaCleaning(adapter, ctx, spotAreas);
                    ctx.adapter.log.info(`Start cleaning marked spot areas: '${spotAreas}'`);
                } else {
                    ctx.adapter.log.warn('No marked spot areas found ...');
                }
                ctx.adapterProxy.setStateConditional('control.extended.cleanMarkedSpotAreas', false, true);
                break;
            }
            case 'doNotDisturb': {
                const command = state.val === true ? 'EnableDoNotDisturb' : 'DisableDoNotDisturb';
                ctx.vacbot.run(command);
                ctx.adapter.log.info('Set doNotDisturb: ' + state.val);
                break;
            }
            case 'continuousCleaning': {
                const command = state.val === true ? 'EnableContinuousCleaning' : 'DisableContinuousCleaning';
                ctx.vacbot.run(command);
                ctx.adapter.log.info('Set continuousCleaning: ' + state.val);
                break;
            }
            case 'goToPosition': {
                goToPosition(adapter, ctx, state.val);
                break;
            }
            case 'cleanCount': {
                const cleanCount = parseInt(state.val);
                if ((cleanCount >= 1) && (cleanCount <= 2)) {
                    ctx.vacbot.run('setCleanCount', cleanCount);
                    ctx.adapter.log.info('Set clean count: ' + state.val);
                }
                break;
            }
            case 'moppingMode': {
                ctx.vacbot.run('SetSweepMode', state.val);
                ctx.adapter.log.info(`Set sweep mode (mopping mode): ${state.val}`);
                break;
            }
            case 'scrubbingPattern': {
                ctx.vacbot.run('SetWaterLevel', ctx.waterLevel, state.val);
                ctx.adapter.log.info(`Set scrubbing pattern: ${state.val}`);
                setTimeout(() => {
                    ctx.vacbot.run('GetWaterLevel');
                }, 100);
                break;
            }
            case 'goToPosition_saveCurrentDeebotPosition': {
                const deebotPositionState = await ctx.adapterProxy.getStateAsync('map.deebotPosition');
                if (deebotPositionState && deebotPositionState.val) {
                    const deebotPosition = deebotPositionState.val.split(',')[0] + ',' + deebotPositionState.val.split(',')[1];
                    await mapHelper.saveGoToPositionValues(adapter, ctx, deebotPosition);
                }
                break;
            }
            case 'airDrying': {
                const action = state.val === true ? 'start' : 'stop';
                ctx.vacbot.run('Drying', action);
                ctx.adapter.log.info(`Run air-drying ${action}`);
                ctx.intervalQueue.add('GetStationState');
                break;
            }
            case 'selfCleaning': {
                const action = state.val === true ? 'start' : 'stop';
                ctx.vacbot.run('Washing', action);
                ctx.adapter.log.info(`Run self cleaning ${action}`);
                ctx.intervalQueue.add('GetStationState');
                break;
            }
            case 'washMode': {
                ctx.vacbot.run('SetWashInfo', state.val);
                ctx.adapter.log.info('Set wash mode: ' + state.val);
                break;
            }
            case 'childLock': {
                ctx.vacbot.run('SetChildLock', state.val ? 1 : 0);
                ctx.adapter.log.info('Set child lock: ' + state.val);
                break;
            }
            case 'hostedCleanMode': {
                ctx.vacbot.run('HostedCleanMode');
                ctx.adapterProxy.setStateConditional('control.extended.hostedCleanMode', false, true);
                ctx.adapter.log.info(`Run HostedCleanMode`);
                break;
            }
            case 'voiceAssistant': {
                // TODO: Use Enable and Disable function when implemented
                //  and also add log entry then
                ctx.vacbot.run('SetVoiceAssistantState', Number(state.val));
                break;
            }
            default:
                ctx.adapter.log.warn('Unhandled control.extended state: ' + stateName + ' - ' + id);
                return;
        }
    }

    if (channelName === 'consumable') {
        // control buttons
        switch (stateName) {
            case 'main_brush_reset':
                ctx.adapter.log.debug('Reset main brush to 100%');
                ctx.commandQueue.add('ResetLifeSpan', 'main_brush');
                break;
            case 'side_brush_reset':
                ctx.adapter.log.debug('Reset side brush to 100%');
                ctx.commandQueue.add('ResetLifeSpan', 'side_brush');
                break;
            case 'filter_reset':
                ctx.adapter.log.debug('Reset filter to 100%');
                ctx.commandQueue.add('ResetLifeSpan', 'filter');
                break;
            case 'unit_care_reset':
                ctx.adapter.log.debug('Reset unit care to 100%');
                ctx.commandQueue.add('ResetLifeSpan', 'unit_care');
                break;
            case 'round_mop_reset':
                ctx.adapter.log.debug('Reset round mops to 100%');
                ctx.commandQueue.add('ResetLifeSpan', 'round_mop');
                break;
            case 'airFreshener_reset':
                ctx.adapter.log.debug('Reset air freshener to 100%');
                ctx.commandQueue.add('ResetLifeSpan', 'air_freshener');
                break;
            default:
                ctx.adapter.log.warn('Unhandled consumable state: ' + stateName + ' - ' + id);
        }
        ctx.commandQueue.addGetLifespan();
        ctx.commandQueue.runAll();
    }

    if (channelName === 'control') {
        if (stateName === 'reconnect') {
            adapter.reconnect();
            return;
        }
        if (stateName === 'cleanSpeed') {
            runSetCleanSpeed(adapter, ctx, state.val);
            return;
        }
        if (stateName === 'cleanSpeed_reset') {
            await resetCleanSpeedOrWaterLevel(adapter, ctx, 'cleanSpeed');
            return;
        }
        if (stateName === 'waterLevel') {
            runSetWaterLevel(adapter, ctx, state.val);
            return;
        }
        if (stateName === 'waterLevel_reset') {
            await resetCleanSpeedOrWaterLevel(adapter, ctx, 'waterLevel');
            return;
        }

        // spotarea cleaning (generic)
        const pattern = /spotArea_[0-9]{1,2}$/;
        if (pattern.test(id)) {
            // spotArea buttons
            const areaNumber = id.split('_')[1];
            startSpotAreaCleaning(adapter, ctx, areaNumber);
            adapter.clearGoToPosition();
            return;
        }
        if (state.val !== '') {
            switch (stateName) {
                case 'spotArea_silentApproach': {
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
                            const stateId = `map.${ctx.currentMapID}.spotAreas.${firstSpotArea}.goToCalculatedCenterPosition`;
                            ctx.adapter.log.info(`Going to the first area (${firstSpotArea}) before starting the cleaning`);
                            goToSavedPosition(adapter, ctx, stateId);
                        }
                    }
                    break;
                }
                case 'spotArea': {
                    // 950 type models have native support for up to 2 spot area cleanings
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
                    adapter.clearGoToPosition();
                    break;
                }
                case 'customArea': {
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
                    adapter.clearGoToPosition();
                    break;
                }
            }
        }

        if ((stateName === 'stop') || (stateName === 'charge')) {
            ctx.commandQueue.resetQueue();
            ctx.cleaningQueue.resetQueue();
        }

        // control buttons
        switch (stateName) {
            case 'clean':
                ctx.adapter.log.info('Run: ' + stateName);
                ctx.vacbot.run(handleV2commands(adapter, ctx, stateName));
                adapter.clearGoToPosition();
                break;
            case 'edge':
            case 'spot':
            case 'stop':
            case 'charge':
            case 'relocate':
            case 'basicPurification':
            case 'mobilePurification':
                ctx.adapter.log.info('Run: ' + stateName);
                ctx.vacbot.run(stateName);
                adapter.clearGoToPosition();
                break;
            case 'spotPurification':
                ctx.adapter.log.info('Run: ' + stateName + ' ' + state.val);
                ctx.vacbot.run('spotPurification', state.val);
                break;
            case 'resume':
            case 'playSound':
                ctx.adapter.log.info('Run: ' + stateName);
                ctx.vacbot.run(stateName);
                break;
            case 'playSoundId':
                ctx.adapter.log.info('Run: ' + stateName + ' ' + state.val);
                ctx.vacbot.run('playSound', state.val);
                break;
            case 'playIamHere':
                ctx.adapter.log.info('Run: ' + stateName);
                ctx.vacbot.run('playSound', 30);
                break;
            case 'pause':
                if (ctx.getDevice().isPaused()) {
                    ctx.adapter.log.info('Resuming cleaning');
                    ctx.vacbot.run('resume');
                } else {
                    ctx.adapter.log.info('Cleaning paused');
                    ctx.vacbot.run('pause');
                }
                break;
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
    }, 100);
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
        ctx.vacbot.run('GetWaterLevel');
    }, 100);
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
