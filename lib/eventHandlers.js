'use strict';

const adapterObjects = require('./adapterObjects');
const helper = require('./adapterHelper');
const C = require('./constants');
const mapObjects = require('./mapObjects');

module.exports = {
    registerReadyEvent(main, vacbot, ctx, vacuum) {
        return new Promise((resolve) => {
            // The library exposes two complementary MQTT lifecycle events
            // (ecovacs-deebot alpha.21+):
            //
            //   'ready'       - edge-triggered: fires on *every* successful MQTT
            //                   (re)subscribe — initial connect, auto-reconnect
            //                   and token refresh. Treated here as a lightweight
            //                   "channel is live" signal: restore connection
            //                   markers and resume polling.
            //   'initialized' - one-shot: fires exactly once per session, on the
            //                   first successful subscribe. The heavy init
            //                   pipeline (object creation, initial state values,
            //                   first command burst) runs here.
            //
            // Because the library guarantees 'initialized' is delivered once per
            // session, the adapter no longer needs its own ready-debounce or
            // _readyInit* idempotency guards to stop the heavy pipeline from
            // re-running on reconnects. A full main.reconnect() discards the
            // contexts and builds fresh vacbots, so a new session legitimately
            // re-emits 'initialized'; per-device/global retries reuse the same
            // vacbot, so only 'ready' fires (the light path).
            vacbot.on('ready', () => {
                if (main.globalMqttUnreachable) {
                    main.clearGlobalMqttUnreachable();
                }
                const nick = vacuum.nick || ctx.deviceId;
                main.log.debug('[' + ctx.deviceId + '] ready event - ' + nick);
                ctx.connected = true;
                main.updateDeviceConnectionState(ctx, true);
                main.clearUnreachableRetry(ctx);
                ctx.unreachableWarningSent = false;
                main.updateConnectionState();
                if (ctx.enabled) {
                    main.startPolling(ctx);
                }
            });

            vacbot.on('initialized', () => {
                (async () => {
                    try {
                        await adapterObjects.createAdditionalObjects(main, ctx);
                        await adapterObjects.createDeviceCapabilityObjects(main, ctx);
                        await adapterObjects.createStationObjects(main, ctx);
                    } catch (e) {
                        main.log.error('Error creating additional objects for ' + ctx.deviceId + ': ' + e.message);
                    }

                    const nick = vacuum.nick ? vacuum.nick : 'New Device ' + ctx.deviceId;
                    main.log.info('Instance for ' + nick + ' successfully initialized');

                    ctx.adapterProxy.setStateConditional('info.version', main.version, true);
                    ctx.adapterProxy.setStateConditional('info.library.version', ctx.api.getVersion(), true);
                    ctx.adapterProxy.setStateConditional('info.deviceName', nick, true);
                    ctx.adapterProxy.setStateConditional('info.deviceClass', ctx.getModel().getDeviceClass(), true);
                    ctx.adapterProxy.setStateConditional('info.deviceModel', ctx.getModel().getProductName(), true);
                    ctx.adapterProxy.setStateConditional('info.platformType', ctx.getPlatformType(), true);
                    ctx.adapterProxy.setStateConditional('info.deviceCategory', ctx.getModel().getDeviceCategory(), true);
                    ctx.adapterProxy.setStateConditional('info.smartType', ctx.getSmartType(), true);
                    await ctx.adapterProxy.createObjectNotExists(
                        'info.deviceCapabilities', 'Device capabilities (JSON)',
                        'json', 'json', false, '{}', '');
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities', JSON.stringify(ctx.getModel().getDeviceCapabilities()), true);
                    const deviceCapabilities = ctx.getModel().getDeviceCapabilities();
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.type', deviceCapabilities.type, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasMapping', deviceCapabilities.hasMapping, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasWaterBox', deviceCapabilities.hasWaterBox, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasAirDrying', deviceCapabilities.hasAirDrying, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasAutoEmpty', deviceCapabilities.hasAutoEmpty, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasSpotAreas', deviceCapabilities.hasSpotAreas, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasVirtualBoundaries', deviceCapabilities.hasVirtualBoundaries, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasContinuousCleaning', deviceCapabilities.hasContinuousCleaning, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasDoNotDisturb', deviceCapabilities.hasDoNotDisturb, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasVoiceAssistant', deviceCapabilities.hasVoiceAssistant, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasCleaningStation', deviceCapabilities.hasCleaningStation, true);
                    ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasFloorWashing', deviceCapabilities.hasFloorWashing, true);
                    ctx.adapterProxy.setStateConditional('info.deviceImageURL', ctx.getModel().getProductImageURL(), true);
                    ctx.adapterProxy.setStateConditional('info.library.communicationProtocol', ctx.getModel().getProtocol(), true);
                    ctx.adapterProxy.setStateConditional('info.library.deviceIs950type', ctx.getModel().is950type(), true);
                    main.log.info('Library version: ' + ctx.api.getVersion());
                    main.log.info('Product name: ' + ctx.getModel().getProductName());
                    ctx.retries = 0;

                    try {
                        await main.setInitialStateValues(ctx);
                    } catch (e) {
                        main.log.error('Error setting initial state values for ' + ctx.deviceId + ': ' + e.message);
                    }

                    resolve();

                    // Track the post-init setTimeout so it cannot accumulate and
                    // can be cleared on unload / reconnect. Defensive: clear any
                    // previous one (should be null here because 'initialized'
                    // fires once per session, but harmless).
                    if (ctx._initialGetStatesTimeout) {
                        clearTimeout(ctx._initialGetStatesTimeout);
                    }
                    ctx._initialGetStatesTimeout = setTimeout(() => {
                        ctx._initialGetStatesTimeout = null;
                        main.vacbotInitialGetStates(ctx);
                    }, C.INITIAL_GET_COMMANDS_DELAY_MS);
                })().catch((e) => {
                    // Defensive: nothing inside the IIFE is expected to throw
                    // because every await is wrapped in try/catch above.
                    main.log.error('Unexpected error during initialized-handler heavy init for ' + ctx.deviceId + ': ' + (e && e.message));
                });
            });
        });
    },

    registerChargeStateEvent(main, vacbot, ctx) {
        vacbot.on('ChargeState', (status) => {
            main.log.debug(`[queue] Received ChargeState event: ${status}`);
            if (helper.isValidChargeStatus(status)) {
                if ((status === 'returning') && (ctx.cleaningQueue.notEmpty()) && (ctx.lastChargeStatus !== status)) {
                    ctx.cleaningQueue.startNextItemFromQueue();
                    setTimeout(() => {
                        ctx.lastChargeStatus = '';
                        main.log.debug('[queue] Reset lastChargingStatus');
                    }, C.LAST_CHARGE_STATUS_RESET_DELAY_MS);
                } else if (ctx.chargestatus !== status) {
                    ctx.chargestatus = status;
                    main.setDeviceStatusByTrigger(ctx, 'chargestatus');
                    ctx.adapterProxy.setStateConditional('info.chargestatus', ctx.chargestatus, true);
                    if (ctx.chargestatus === 'charging') {
                        main._flushPendingPosition(ctx);
                        ctx.adapterProxy.setStateConditional('history.timestampOfLastStartCharging', helper.getUnixTimestamp(), true);
                        ctx.adapterProxy.setStateConditional('history.dateOfLastStartCharging', main.getCurrentDateAndTimeFormatted(), true);
                        ctx.currentSpotAreaData = { 'spotAreaID': 'unknown', 'lastTimeEnteredTimestamp': 0 };
                        main.resetErrorStates(ctx);
                        ctx.intervalQueue.addGetLifespan();
                        ctx.cleaningLogAcknowledged = false;
                        ctx.intervalQueue.addGetCleanLogs();
                        if (ctx.getModel().isMappingSupported()) { ctx.intervalQueue.add('GetMaps'); }
                        if (ctx.getModel().isSupportedFeature('map.deebotPosition')) { ctx.intervalQueue.add('GetPosition'); }
                    }
                }
            } else {
                main.log.warn('Unhandled chargestatus: ' + status);
            }
            ctx.lastChargeStatus = status;
        });
    },

    registerCleanReportEvent(main, vacbot, ctx) {
        vacbot.on('CleanReport', (status) => {
            main.log.debug(`[queue] Received CleanReport event: ${status}`);
            if (helper.isValidCleanStatus(status)) {
                if ((ctx.cleanstatus === 'setLocation') && (status !== 'setLocation')) {
                    if (status === 'idle') { main.log.info('Bot arrived at destination'); }
                    else { main.log.info(`The operation was interrupted before arriving at destination (status: ${status})`); }
                    main.handleSilentApproach(ctx);
                }
                if (ctx.getDevice().isNotStopped() && (ctx.cleanstatus !== status)) {
                    if ((status === 'stop') || (status === 'idle')) {
                        main._flushPendingPosition(ctx);
                        main.resetCurrentStats(ctx);
                        ctx.cleaningLogAcknowledged = false;
                        ctx.intervalQueue.addGetCleanLogs();
                    }
                    main.setPauseBeforeDockingIfWaterboxInstalled(ctx).catch(e => main.log.warn('setPauseBeforeDocking: ' + e.message));
                }
                if ((ctx.cleanstatus !== 'drying') && (ctx.cleanstatus !== 'washing')) {
                    ctx.cleanstatus = status;
                    main.setDeviceStatusByTrigger(ctx, 'cleanstatus');
                    ctx.adapterProxy.setStateConditional('info.cleanstatus', status, true);
                }
            } else if (status !== undefined) {
                main.log.warn('Unhandled cleanstatus: ' + status);
            }
        });
    },

    /**
     * Register water cleaning event handlers.
     * @param {object} main The main adapter instance.
     * @param {object} vacbot The vacbot client instance.
     * @param {object} ctx The adapter context object.
     */
    registerWaterCleaningEvents(main, vacbot, ctx) {
        vacbot.on('WaterInfo', async (data) => {
            if (!vacbot.hasMoppingSystem()) return;
            if (!data) return;

            // The library emits the raw device payload for WaterInfo:
            // { amount, enable, type?, sweepType? }
            // Normalized names (waterLevel, waterboxInfo, moppingType, scrubbingType)
            // are kept as fallback for forward compatibility.

            // 1. Water Level (raw: 'amount', normalized fallback: 'waterLevel')
            const waterLevel = data.amount !== undefined ? data.amount : data.waterLevel;
            if (waterLevel !== undefined && waterLevel !== null) {
                ctx.waterLevel = waterLevel;
                await adapterObjects.createControlWaterLevelIfNotExists(main, ctx, ctx.waterLevel);
                ctx.adapterProxy.setStateConditional('control.waterLevel', ctx.waterLevel, true);
            }

            // 2. Waterbox Installed Status (raw: 'enable', normalized fallback: 'waterboxInfo')
            const waterboxInfo = data.enable !== undefined ? data.enable : data.waterboxInfo;
            if (waterboxInfo !== undefined && waterboxInfo !== null) {
                ctx.waterboxInstalled = Boolean(Number(waterboxInfo));
                ctx.adapterProxy.setStateConditional('info.waterbox', ctx.waterboxInstalled, true);
            }

            // 3. Mopping Type (raw: 'type', normalized fallback: 'moppingType')
            const moppingType = data.type !== undefined ? data.type : data.moppingType;
            if (moppingType !== undefined && moppingType !== null) {
                await main.handleWaterBoxMoppingType(ctx, moppingType);
            }

            // 4. Scrubbing Type (raw: 'sweepType', normalized fallback: 'scrubbingType')
            const scrubbingType = data.sweepType !== undefined ? data.sweepType : data.scrubbingType;
            if (scrubbingType !== undefined && scrubbingType !== null) {
                await main.handleWaterBoxScrubbingType(ctx, scrubbingType);
            }
        });

        vacbot.on('CarpetPressure', async (value) => {
            if (ctx.getModel().isSupportedFeature('control.autoBoostSuction')) {
                await ctx.adapterProxy.createObjectNotExists('control.extended.autoBoostSuction', 'Auto boost suction', 'boolean', 'value', true, false, '');
                const carpetPressure = Boolean(Number(value));
                ctx.adapterProxy.setStateConditional('control.extended.autoBoostSuction', carpetPressure, true);
            }
        });
        vacbot.on('CleanPreference', async (value) => {
            if (ctx.getModel().isModelTypeAirbot()) return;
            await ctx.adapterProxy.createObjectNotExists('control.extended.cleanPreference', 'Clean preference', 'boolean', 'value', true, false, '');
            const cleanPreference = Boolean(Number(value));
            ctx.cleanPreference = cleanPreference;
            ctx.adapterProxy.setStateConditional('control.extended.cleanPreference', cleanPreference, true);
        });
        vacbot.on('VoiceAssistantState', async (value) => {
            await ctx.adapterProxy.createObjectNotExists('control.extended.voiceAssistant', 'YIKO voice assistant', 'boolean', 'value', true, Boolean(value), '');
            ctx.adapterProxy.setStateConditional('control.extended.voiceAssistant', Boolean(value), true);
        });
        vacbot.on('BorderSpin', async (value) => {
            await main.createInfoExtendedChannelNotExists(ctx);
            await ctx.adapterProxy.createObjectNotExists('control.extended.edgeDeepCleaning', 'Edge deep cleaning', 'boolean', 'value', true, false, '');
            const edgeDeepCleaning = Boolean(Number(value));
            ctx.adapterProxy.setStateConditional('control.extended.edgeDeepCleaning', edgeDeepCleaning, true);
        });
        vacbot.on('MopOnlyMode', async (value) => {
            await main.createInfoExtendedChannelNotExists(ctx);
            await ctx.adapterProxy.createObjectNotExists('control.extended.mopOnlyMode', 'Mop only mode', 'boolean', 'value', true, false, '');
            const mopOnlyMode = Boolean(Number(value));
            ctx.adapterProxy.setStateConditional('control.extended.mopOnlyMode', mopOnlyMode, true);
        });
        vacbot.on('SweepMode', (value) => { (async () => { await main.handleSweepMode(ctx, value); })(); });
    },
    registerStationEvents(main, vacbot, ctx) {
        vacbot.on('AirDryingState', async (value) => {
            await main.createInfoExtendedChannelNotExists(ctx);
            await ctx.adapterProxy.createObjectNotExists('info.extended.airDryingState', 'Air drying state', 'string', 'value', false, '', '');
            ctx.adapterProxy.setStateConditional('info.extended.airDryingState', value, true);
        });
        vacbot.on('WashInterval', (value) => {
            (async () => {
                await main.createInfoExtendedChannelNotExists(ctx);
                await ctx.adapterProxy.createObjectNotExists('info.extended.washInterval', 'Wash interval', 'number', 'value', false, 0, 'min');
                await ctx.adapterProxy.setStateConditionalAsync('info.extended.washInterval', value, true);
                await adapterObjects.createControlWashIntervalIfNotExists(main, ctx);
                await ctx.adapterProxy.setStateConditionalAsync('control.extended.washInterval', value, true);
            })();
        });
        vacbot.on('WorkMode', (value) => {
            (async () => {
                await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.cleaningMode', {
                    type: 'state', common: { name: 'Cleaning Mode', type: 'number', role: 'level', read: true, write: true, min: 0, max: 3, def: value, unit: '', states: { 0: 'vacuum and mop', 1: 'vacuum only', 2: 'mop only', 3: 'mop after vacuum' } }, native: {}
                });
                await ctx.adapterProxy.setStateConditionalAsync('control.extended.cleaningMode', value, true);
            })();
        });
        vacbot.on('CarpetInfo', async (value) => {
            if (value === undefined || value === null) return;
            await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.carpetCleaningStrategy', {
                type: 'state', common: { name: 'Carpet cleaning strategy', type: 'number', role: 'level', read: true, write: true, min: 0, max: 2, def: value, unit: '', states: { 0: 'auto', 1: 'bypass', 2: 'include' } }, native: {}
            });
            await ctx.adapterProxy.setStateConditionalAsync('control.extended.carpetCleaningStrategy', value, true);
        });
        vacbot.on('StationState', async (object) => {
            await ctx.adapterProxy.createObjectNotExists('control.extended.airDrying', 'Start/stop air-drying', 'boolean', 'button', true, false, '');
            ctx.adapterProxy.setStateConditional('control.extended.airDrying', object.isAirDrying, true);
            await ctx.adapterProxy.createObjectNotExists('control.extended.selfCleaning', 'Start/stop cleaning pads', 'boolean', 'button', true, false, '');
            ctx.adapterProxy.setStateConditional('control.extended.selfCleaning', object.isSelfCleaning, true);
            await ctx.adapterProxy.createObjectNotExists('info.extended.selfCleaningActive', 'Self-cleaning active', 'boolean', 'value', false, false, '');
            ctx.adapterProxy.setStateConditional('info.extended.selfCleaningActive', object.isSelfCleaning, true);
            await ctx.adapterProxy.createObjectNotExists('info.extended.cleaningStationActive', 'Station active', 'boolean', 'value', false, false, '');
            ctx.adapterProxy.setStateConditional('info.extended.cleaningStationActive', object.isActive, true);
            main.handleAirDryingActive(ctx, object.isAirDrying);
            if (object.isAirDrying) {
                ctx.cleanstatus = 'drying'; main.setDeviceStatusByTrigger(ctx, 'cleanstatus');
                ctx.adapterProxy.setStateConditional('info.cleanstatus', 'drying', true);
            } else if (object.isSelfCleaning) {
                ctx.cleanstatus = 'washing'; main.setDeviceStatusByTrigger(ctx, 'cleanstatus');
                ctx.adapterProxy.setStateConditional('info.cleanstatus', 'washing', true);
            } else if ((ctx.cleanstatus === 'drying') || (ctx.cleanstatus === 'washing')) {
                ctx.cleanstatus = 'idle'; main.setDeviceStatusByTrigger(ctx, 'cleanstatus');
                ctx.adapterProxy.setStateConditional('info.cleanstatus', 'idle', true);
            }
        });
        vacbot.on('DryingDuration', async (value) => {
            await main.createAirDryingStates(ctx);
            ctx.adapterProxy.setStateConditional('control.extended.airDryingDuration', value, true);
        });
        vacbot.on('AICleanItemState', async (object) => {
            await main.createInfoExtendedChannelNotExists(ctx);
            await ctx.adapterProxy.createObjectNotExists('info.extended.particleRemoval', 'Particle removal mode', 'boolean', 'value', false, false, '');
            ctx.adapterProxy.setStateConditional('info.extended.particleRemoval', object.particleRemoval, true);
            await ctx.adapterProxy.createObjectNotExists('info.extended.petPoopAvoidance', 'Pet poop avoidance', 'boolean', 'value', false, false, '');
            ctx.adapterProxy.setStateConditional('info.extended.petPoopAvoidance', object.petPoopPrevention, true);
        });
        vacbot.on('StationInfo', async (object) => {
            await main.createInfoExtendedChannelNotExists(ctx);
            await ctx.adapterProxy.createChannelNotExists('info.extended.cleaningStation', 'Cleaning station info');
            await ctx.adapterProxy.createObjectNotExists('info.extended.cleaningStation.state', 'Station state', 'number', 'value', false, object.state, '');
            ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.state', object.state, true);
            await ctx.adapterProxy.createObjectNotExists('info.extended.cleaningStation.name', 'Station name', 'string', 'value', false, object.name, '');
            ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.name', object.name, true);
            await ctx.adapterProxy.createObjectNotExists('info.extended.cleaningStation.model', 'Station model', 'string', 'value', false, object.model, '');
            ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.model', object.model, true);
            await ctx.adapterProxy.createObjectNotExists('info.extended.cleaningStation.serialNumber', 'Serial number', 'string', 'value', false, object.sn, '');
            ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.serialNumber', object.sn, true);
            await ctx.adapterProxy.createObjectNotExists('info.extended.cleaningStation.firmwareVersion', 'FW version', 'string', 'value', false, object.wkVer, '');
            ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.firmwareVersion', object.wkVer, true);
        });
        vacbot.on('DusterRemind', (object) => {
            (async () => {
                await ctx.adapterProxy.createObjectNotExists('control.extended.cleaningClothReminder', 'Cleaning cloth reminder', 'boolean', 'value', true, false, '');
                ctx.adapterProxy.setStateConditional('control.extended.cleaningClothReminder', Boolean(Number(object.enabled)), true);
                ctx.cleaningClothReminder.enabled = Boolean(Number(object.enabled));
                await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.cleaningClothReminder_period', {
                    'type': 'state',
                    'common': {
                        'name': 'Cleaning cloth reminder period',
                        'type': 'number',
                        'role': 'value',
                        'read': true,
                        'write': true,
                        'min': 15,
                        'max': 60,
                        'def': 30,
                        'unit': 'min',
                        'states': { 15: '15', 30: '30', 45: '45', 60: '60' }
                    },
                    'native': {}
                });
                await ctx.adapterProxy.setStateConditionalAsync('control.extended.cleaningClothReminder_period', Number(object.period), true);
                ctx.cleaningClothReminder.period = Number(object.period);
            })();
        });
    },

    registerConsumableEvents(main, vacbot, ctx) {

        vacbot.on('LifeSpan_filter', (level) => {

            ctx.adapterProxy.setStateConditional('consumable.filter', Math.round(level), true);
        });

        vacbot.on('LifeSpan_main_brush', (level) => {

            ctx.adapterProxy.setStateConditional('consumable.main_brush', Math.round(level), true);
        });

        vacbot.on('LifeSpan_side_brush', (level) => {

            ctx.adapterProxy.setStateConditional('consumable.side_brush', Math.round(level), true);
        });

        vacbot.on('LifeSpan_unit_care', (level) => {

            ctx.adapterProxy.setStateConditional('consumable.unit_care', Math.round(level), true);
        });

        vacbot.on('LifeSpan_round_mop', (level) => {

            ctx.adapterProxy.setStateConditional('consumable.round_mop', Math.round(level), true);
        });

        vacbot.on('LifeSpan_air_freshener', (level) => {

            ctx.adapterProxy.setStateConditional('consumable.airFreshener', Math.round(level), true);
        });

        vacbot.on('LifeSpan', async (object) => {

            await ctx.adapterProxy.createObjectNotExists(
                'consumable.filter', 'Filter life span',
                'number', 'level', false, Math.round(object.filter), '%');
            ctx.adapterProxy.setStateConditional('consumable.filter', Math.round(object.filter), true);
            await ctx.adapterProxy.createObjectNotExists(
                'consumable.uv_sanitizer_module', 'Filter UV Sanitizer Module',
                'number', 'level', false, Math.round(object.uv_sanitizer_module), '%');
            ctx.adapterProxy.setStateConditional('consumable.uv_sanitizer_module', Math.round(object.uv_sanitizer_module), true);
            await ctx.adapterProxy.createObjectNotExists(
                'consumable.air_freshener', 'Filter Air Freshener',
                'number', 'level', false, Math.round(object.air_freshener), '%');
            ctx.adapterProxy.setStateConditional('consumable.air_freshener', Math.round(object.air_freshener), true);
            await ctx.adapterProxy.createObjectNotExists(
                'consumable.unit_care', 'Filter Unit Care',
                'number', 'level', false, Math.round(object.unit_care), '%');
            ctx.adapterProxy.setStateConditional('consumable.unit_care', Math.round(object.unit_care), true);
            await ctx.adapterProxy.createObjectNotExists(
                'consumable.humidification_filter', 'Filter Humidification Filter',
                'number', 'level', false, Math.round(object.humidification_filter), '%');
            ctx.adapterProxy.setStateConditional('consumable.humidification_filter', Math.round(object.humidification_filter), true);
            await ctx.adapterProxy.createObjectNotExists(
                'consumable.humidification_maintenance', 'Filter Humidification Module Maintenance',
                'number', 'level', false, Math.round(object.humidification_maintenance), '%');
            ctx.adapterProxy.setStateConditional('consumable.humidification_maintenance', Math.round(object.humidification_maintenance), true);
        });

    },

    registerMapEvents(main, vacbot, ctx) {

        vacbot.on('Maps', (maps) => {

            main.log.debug('Maps received');
            (async () => {
                await mapObjects.processMaps(main, ctx, maps);
            })();
        });

        vacbot.on('MapSpotAreas', (areas) => {

            main.log.debug('SpotAreas received');
            (async () => {
                await mapObjects.processSpotAreas(main, ctx, areas);
            })();
        });

        vacbot.on('MapSpotAreaInfo', (area) => {

            main.log.debug('SpotAreaInfo received');
            (async () => {
                await mapObjects.processSpotAreaInfo(main, ctx, area);
            })();
        });

        vacbot.on('MapVirtualBoundaries', (boundaries) => {

            main.log.debug('VirtualBoundaries received');
            (async () => {
                await mapObjects.processVirtualBoundaries(main, ctx, boundaries);
            })();
        });

        vacbot.on('MapVirtualBoundaryInfo', (boundary) => {

            main.log.debug('VirtualBoundaryInfo received');
            (async () => {
                await mapObjects.processVirtualBoundaryInfo(main, ctx, boundary);
            })();
        });

        vacbot.on('MapImage', (object) => {

            ctx.adapterProxy.setStateConditional('map.' + object['mapID'] + '.map64', object['mapBase64PNG'], true);
            ctx.adapterProxy.setStateConditional('history.timestampOfLastMapImageReceived', helper.getUnixTimestamp(), true);
            ctx.adapterProxy.setStateConditional('history.dateOfLastMapImageReceived', main.getCurrentDateAndTimeFormatted(), true);
            const base64Data = object['mapBase64PNG'].replace(/^data:image\/png;base64,/, '');
            (async () => {
                const buf = Buffer.from(base64Data, 'base64');
                const filename = 'currentCleaningMapImage_' + object['mapID'] + '.png';
                await main.writeFileAsync(main.namespace, filename, buf);
            })();
        });

        vacbot.on('CurrentMapName', (value) => {

            ctx.adapterProxy.setStateConditional('map.currentMapName', value, true);
        });

        vacbot.on('CurrentMapIndex', (value) => {

            ctx.adapterProxy.setStateConditional('map.currentMapIndex', value, true);
        });

        vacbot.on('CurrentMapMID', (value) => {

            ctx.currentMapID = value.toString();
            ctx.adapterProxy.setStateConditional('map.currentMapMID', ctx.currentMapID, true);
        });

        vacbot.on('Position', (obj) => {

            // Throttle: process position updates at most once every 2 seconds
            // to avoid excessive state writes and area checks during active cleaning
            const now = Date.now();
            if (ctx._lastPositionTime && (now - ctx._lastPositionTime < C.POSITION_THROTTLE_MS)) {
                // Still update the cached raw position values (cheap, no DB writes)
                // so they're available when the throttled update fires
                ctx._pendingPosition = obj;
                return;
            }
            ctx._lastPositionTime = now;
            const posObj = ctx._pendingPosition || obj;
            ctx._pendingPosition = null;
            (async () => {
                await main.handlePositionObj(ctx, posObj);
            })();
        });

        vacbot.on('ChargingPosition', (obj) => {

            ctx.chargePosition = obj.coords;
            ctx.adapterProxy.setStateConditional('map.chargePosition', ctx.chargePosition, true);
        });

        vacbot.on('CurrentCustomAreaValues', (values) => {

            if (((ctx.cleanstatus === 'custom_area') && (values !== '')) || (ctx.cleanstatus !== 'custom_area')) {
                ctx.adapterProxy.setStateConditional('map.currentUsedCustomAreaValues', values, true);
            }
        });

        vacbot.on('CurrentSpotAreas', (values) => {

            if (((ctx.cleanstatus === 'spot_area') && (values !== '')) || (ctx.cleanstatus !== 'spot_area')) {
                ctx.adapterProxy.setStateConditional('map.currentUsedSpotAreas', values, true);
            }
        });

        vacbot.on('LastUsedAreaValues', (values) => {

            const dateTime = main.getCurrentDateAndTimeFormatted();
            let customAreaValues = values;
            if (customAreaValues.endsWith(';')) {
                customAreaValues = customAreaValues.slice(0, -1);
            }
            if (helper.singleAreaValueStringIsValid(values)) {
                customAreaValues = values.split(',', 4).map(
                    function (element) {
                        return Number(parseInt(element).toFixed(0));
                    }
                ).toString();
            }
            ctx.adapterProxy.setStateConditional(
                'map.lastUsedCustomAreaValues',
                customAreaValues, true, {
                    dateTime: dateTime,
                    currentMapID: ctx.currentMapID
                });
        });

    },

    registerConnectionEvents(main, vacbot, ctx) {

        vacbot.on('Evt', (obj) => {

            main.log.debug('Evt message received');
            // Any event from the device means it's reachable
            main.handleDeviceDataReceived(ctx);
        });

        vacbot.on('LastError', (obj) => {
            if (ctx.disconnecting) {
                main.log.debug(`[${ctx.vacuum.nick || ctx.deviceId}] Ignoring LastError event during intentional disconnect: ${obj.error}`);
                return;
            }

            if (ctx.errorCode !== obj.code) {
                const nick = ctx.vacuum.nick || ctx.deviceId;
                const model = ctx.getModel().getProductName();
                if (obj.code === '110') {
                    main.addToLast20Errors(ctx, obj.code, obj.error);
                    if (ctx.getModel().isSupportedFeature('info.dustbox')) {
                        main.setHistoryValuesForDustboxRemoval(ctx);
                    }
                } else if (obj.code === '0') {
                    if (ctx.unreachableWarningSent) {
                        main.log.info(`[${nick} (${model})] Robot is reachable again`);
                        ctx.unreachableWarningSent = false;
                    }
                    main.clearUnreachableRetry(ctx);
                    if (ctx.connected === false) {
                        ctx.connected = true;
                        main.updateDeviceConnectionState(ctx, true);
                        // Derive the global indicator from device states instead of
                        // force-setting it, so it reflects this single device coming back.
                        main.updateConnectionState();
                    }
                    main.resetErrorStates(ctx);
                } else {
                    main.addToLast20Errors(ctx, obj.code, obj.error);

                    // Global MQTT server offline detection
                    // When the MQTT server itself is unreachable, ALL devices are affected.
                    // Mark all devices unreachable globally with a single log message.
                    if (obj.error && obj.error.includes('MQTT server is offline or not reachable')) {
                        main.setGlobalMqttUnreachable(ctx);
                        main.debouncedSetError(ctx, obj.code, obj.error);
                        return; // handled globally, skip per-device processing below
                    }

                    if (!ctx.unreachableWarningSent) {
                        main.log.warn(`[${nick} (${model})] ${obj.error}`);
                    } else {
                        main.log.debug(`[${nick} (${model})] ${obj.error}`);
                    }

                    if (obj.code === '4200' || obj.code === '404') {
                        ctx.unreachableWarningSent = true;
                        if (obj.code === '404') {
                            // Only THIS device dropped its connection — mark it
                            // disconnected and recompute the global indicator
                            // (is any device still connected?), instead of forcing
                            // every device offline via setConnection(false).
                            ctx.connected = false;
                            main.updateDeviceConnectionState(ctx, false);
                            main.updateConnectionState();
                        }
                        ctx.connectionFailed = true;
                        main.scheduleUnreachableRetry(ctx);
                    } else {
                        // Track consecutive command failures for non-connection errors.
                        // If 2+ consecutive failures, the counter method will mark the device unreachable.
                        main.incrementCommandFailedCount(ctx);
                    }
                }
                main.debouncedSetError(ctx, obj.code, obj.error);
            }
        });

        vacbot.on('Debug', (value) => {

            ctx.adapterProxy.setStateConditional('info.library.debugMessage', value, true);
        });

        vacbot.on('messageReceived', (value) => {

            main.log.silly('Received message: ' + value);
            const timestamp = helper.getUnixTimestamp();
            ctx.adapterProxy.setStateConditional('history.timestampOfLastMessageReceived', timestamp, true);
            // Throttle formatted date updates: only update every 60 seconds to reduce DB writes
            if (!ctx._lastFormattedDateUpdate || (timestamp - ctx._lastFormattedDateUpdate >= C.FORMATTED_DATE_THROTTLE_S)) {
                ctx._lastFormattedDateUpdate = timestamp;
                ctx.adapterProxy.setStateConditional('history.dateOfLastMessageReceived', main.getCurrentDateAndTimeFormatted(), true);
            }
            if (ctx.connectedTimestamp > 0) {
                const uptime = Math.floor((timestamp - ctx.connectedTimestamp) / 60);
                // Only write uptime when it changes (minute-level precision)
                if (uptime !== ctx._lastUptimeValue) {
                    ctx._lastUptimeValue = uptime;
                    ctx.adapterProxy.setStateConditional('info.connectionUptime', uptime, true);
                }
            }
            // If device was previously unreachable, receiving any message means it's back
            main.handleDeviceDataReceived(ctx);
        });

        vacbot.on('genericCommandPayload', (payload) => {

            const payloadString = JSON.stringify(payload);
            main.log.info('Received payload for Generic command: ' + payloadString);
            ctx.adapterProxy.setStateConditional('control.extended.genericCommand.responsePayload', payloadString, true);
        });

        vacbot.on('disconnect', (error) => {
            if (ctx.disconnecting) {
                main.log.debug(`[${ctx.vacuum.nick || ctx.deviceId}] Ignoring disconnect event during intentional disconnect`);
                return;
            }

            const nick = ctx.vacuum.nick || ctx.deviceId;
            const model = ctx.getModel().getProductName();
            if (ctx.connected && error) {
                ctx.connected = false;
                main.updateDeviceConnectionState(ctx, false);
                main.updateConnectionState();
                ctx.connectionFailed = true;
                if (!ctx.unreachableWarningSent) {
                    main.log.warn(`[${nick} (${model})] Disconnected: ${error.toString()}`);
                    ctx.unreachableWarningSent = true;
                } else {
                    main.log.debug(`[${nick} (${model})] Disconnected: ${error.toString()}`);
                }
                main.scheduleUnreachableRetry(ctx);
            }
        });

    },

    registerAirbotEvents(main, vacbot, ctx) {

        vacbot.on('BlueSpeaker', async (object) => {

            const enable = object['enable'];
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.bluetoothSpeaker', 'Bluetooth Speaker',
                'boolean', 'value', true, Boolean(enable), '');
            ctx.adapterProxy.setStateConditional('control.extended.bluetoothSpeaker', Boolean(enable), true);
        });

        vacbot.on('Mic', async (value) => {

            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.microphone', 'Microphone',
                'boolean', 'value', true, Boolean(value), '');
            ctx.adapterProxy.setStateConditional('control.extended.microphone', Boolean(value), true);
        });

        vacbot.on('VoiceSimple', async (value) => {

            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.voiceReport', 'Working Status Voice Report',
                'boolean', 'value', true, Boolean(value), '');
            ctx.adapterProxy.setStateConditional('control.extended.voiceReport', Boolean(value), true);
        });

        vacbot.on('ThreeModuleStatus', async (array) => {

            await ctx.adapterProxy.createChannelNotExists('info.airPurifierModules', 'Air Purifier Modules (Airbot models)');
            const modules = [];
            modules['uvLight'] = {
                id: 'uvSanitization',
                name: 'UV Sanitizing Filter'
            };
            modules['smell'] = {
                id: 'airFreshening',
                name: 'Air Freshener Module'
            };
            modules['humidify'] = {
                id: 'humidification',
                name: 'Fog-free Humidification Module'
            };
            for (const element of array) {
                await ctx.adapterProxy.createObjectNotExists(
                    'info.airPurifierModules.' + modules[element.type].id, modules[element.type].name,
                    'string', 'value', false, '', '');
                let status = 'not installed';
                if (element.state === 1) {
                    status = element.work ? 'active' : 'idle';
                }
                ctx.adapterProxy.setStateConditional('info.airPurifierModules.' + modules[element.type].id, status, true);
            }
        });

        vacbot.on('AirQuality', async (object) => {

            await ctx.adapterProxy.createChannelNotExists('info.airQuality', 'Air quality (Airbot models)');
            await ctx.adapterProxy.createObjectNotExists(
                'info.airQuality.particulateMatter10', 'Particulate Matter 10 (PM10)',
                'number', 'value', false, 0, '\u03bcg/m3');
            ctx.adapterProxy.setStateConditional('info.airQuality.particulateMatter10', object.particulateMatter10, true);
            await ctx.adapterProxy.createObjectNotExists(
                'info.airQuality.particulateMatter25', 'Particulate Matter 25 (PM25)',
                'number', 'value', false, 0, '\u03bcg/m3');
            ctx.adapterProxy.setStateConditional('info.airQuality.particulateMatter25', object.particulateMatter25, true);
            await ctx.adapterProxy.createObjectNotExists(
                'info.airQuality.airQualityIndex', 'Air Quality Index',
                'number', 'value', false, 0, '');
            ctx.adapterProxy.setStateConditional('info.airQuality.airQualityIndex', object.airQualityIndex, true);
            await ctx.adapterProxy.createObjectNotExists(
                'info.airQuality.volatileOrganicCompounds', 'Volatile Organic Compounds Index',
                'number', 'value', false, 0, '');
            ctx.adapterProxy.setStateConditional('info.airQuality.volatileOrganicCompounds', object.volatileOrganicCompounds, true);
            if (object['volatileOrganicCompounds_parts'] !== undefined) {
                await ctx.adapterProxy.createObjectNotExists(
                    'info.airQuality.volatileOrganicCompounds_parts', 'Volatile Organic Compounds (parts per billion)',
                    'number', 'value', false, 0, 'ppb');
                ctx.adapterProxy.setStateConditional('info.airQuality.volatileOrganicCompounds_parts', object['volatileOrganicCompounds_parts'], true);
            }
            let state;
            let temperatureOffset = 0;
            state = await ctx.adapterProxy.getStateAsync('info.airQuality.offset.temperature');
            if (state) {
                temperatureOffset = Number(Number(state.val).toFixed(1));
            }
            let humidityOffset = 0;
            state = await ctx.adapterProxy.getStateAsync('info.airQuality.offset.humidity');
            if (state) {
                humidityOffset = Number(Number(state.val).toFixed(0));
            }
            await ctx.adapterProxy.createChannelNotExists('info.airQuality.offset', 'Offset values');
            await ctx.adapterProxy.createObjectNotExists(
                'info.airQuality.offset.temperature', 'Temperature offset',
                'number', 'value', true, temperatureOffset);
            await ctx.adapterProxy.setStateConditionalAsync(
                'info.airQuality.offset.temperature', temperatureOffset, true);
            await ctx.adapterProxy.createObjectNotExists(
                'info.airQuality.offset.humidity', 'Humidity offset',
                'number', 'value', true, humidityOffset);
            await ctx.adapterProxy.setStateConditionalAsync(
                'info.airQuality.offset.humidity', humidityOffset, true);
            const temperature = object.temperature + temperatureOffset;
            const humidity = object.humidity + humidityOffset;
            await ctx.adapterProxy.createObjectNotExists(
                'info.airQuality.temperature', 'Temperature',
                'number', 'value', false, 0, '°C');
            await ctx.adapterProxy.setStateConditionalAsync(
                'info.airQuality.temperature', temperature, true);
            await ctx.adapterProxy.createObjectNotExists(
                'info.airQuality.humidity', 'Humidity',
                'number', 'value', false, 0, '%');
            await ctx.adapterProxy.setStateConditionalAsync(

                'info.airQuality.humidity', humidity, true);
        });

        vacbot.on('AtmoLight', (value) => {

            (async () => {
                await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.atmoLight', {
                    'type': 'state',
                    'common': {
                        'name': 'Light brightness',
                        'type': 'number',
                        'role': 'value',
                        'read': true,
                        'write': true,
                        'min': 0,
                        'max': 16,
                        'def': 2,
                        'unit': '',
                        'states': {
                            0: '0',
                            1: '1',
                            2: '2',
                            3: '3',
                            4: '4'
                        }
                    },
                    'native': {}
                });
                await ctx.adapterProxy.setStateConditionalAsync('control.extended.atmoLight', Number(value), true);
            })();
        });

        vacbot.on('AtmoVolume', (value) => {

            (async () => {
                await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.atmoVolume', {
                    'type': 'state',
                    'common': {
                        'name': 'Volume for voice and sounds (0-16)',
                        'type': 'number',
                        'role': 'value',
                        'read': true,
                        'write': true,
                        'min': 0,
                        'max': 16,
                        'def': 2,
                        'unit': '',
                        'states': {
                            0: '0',
                            1: '1',
                            2: '2',
                            3: '3',
                            4: '4',
                            5: '5',
                            6: '6',
                            7: '7',
                            8: '8',
                            9: '9',
                            10: '10',
                            11: '11',
                            12: '12',
                            13: '13',
                            14: '14',
                            15: '15',
                            16: '16'
                        }
                    },
                    'native': {}
                });
                await ctx.adapterProxy.setStateConditionalAsync('control.extended.atmoVolume', Number(value), true);
            })();
        });

        vacbot.on('AutonomousClean', async (value) => {

            await ctx.adapterProxy.createObjectNotExists(
                'control.linkedPurification.selfLinkedPurification', 'Self-linked Purification',
                'boolean', 'value', true, Boolean(value), '');
            ctx.adapterProxy.setStateConditional('control.linkedPurification.selfLinkedPurification', Boolean(value), true);
        });

        vacbot.on('AirbotAutoModel', (object) => {

            const enabled = object['enable'];
            const aqEnd = enabled ? object['aq']['aqEnd'] : 2;
            const aqStart = enabled ? object['aq']['aqStart'] : 3;
            const value = [enabled, aqStart, aqEnd].join(',');
            (async () => {
                await ctx.adapterProxy.setObjectNotExistsAsync('control.linkedPurification.linkedPurificationAQ', {
                    'type': 'state',
                    'common': {
                        'name': 'Linked Purification (linked to Air Quality Monitor)',
                        'type': 'mixed',
                        'role': 'level',
                        'read': true,
                        'write': true,
                        'def': value,
                        'unit': '',
                        'states': {
                            '0,3,2': 'disabled',
                            '1,4,3': 'very poor <> poor',
                            '1,4,2': 'very poor <> fair',
                            '1,4,1': 'very poor <> good',
                            '1,3,2': 'poor <> fair',
                            '1,3,1': 'poor <> good',
                            '1,2,1': 'fair <> good'
                        }
                    },
                    'native': {}
                });
                await ctx.adapterProxy.setStateConditionalAsync('control.linkedPurification.linkedPurificationAQ', value, true);
            })();
        });

        vacbot.on('ThreeModule', async (object) => {

            const modules = [];
            object.forEach((module) => {
                modules[module['type']] = module;
            });
            const uvSanitization = modules['uvLight']['enable'];
            await ctx.adapterProxy.createObjectNotExists(
                'control.airPurifierModules.uvSanitization', 'Sanitization (UV-Sanitizer)',
                'boolean', 'value', true, Boolean(uvSanitization), '');
            ctx.adapterProxy.setStateConditional('control.airPurifierModules.uvSanitization', Boolean(uvSanitization), true);
            let airFresheningLevel = modules['smell']['level'];
            if (modules['smell']['enable'] === 0) airFresheningLevel = 0;
            (async () => {
                await ctx.adapterProxy.setObjectNotExistsAsync('control.airPurifierModules.airFreshening', {
                    'type': 'state',
                    'common': {
                        'name': 'Air Freshening',
                        'type': 'number',
                        'role': 'level',
                        'read': true,
                        'write': true,
                        'def': airFresheningLevel,
                        'unit': '',
                        'states': {
                            0: 'disabled',
                            1: 'light',
                            2: 'standard',
                            3: 'strong'
                        }
                    },
                    'native': {}
                });
                await ctx.adapterProxy.setStateConditionalAsync('control.airPurifierModules.airFreshening', airFresheningLevel, true);
            })();
            let humidificationLevel = modules['humidify']['level'];
            if (modules['humidify']['enable'] === 0) humidificationLevel = 0;
            (async () => {
                await ctx.adapterProxy.setObjectNotExistsAsync('control.airPurifierModules.humidification', {
                    'type': 'state',
                    'common': {
                        'name': 'Humidification',
                        'type': 'number',
                        'role': 'level',
                        'read': true,
                        'write': true,
                        'def': humidificationLevel,
                        'unit': '',
                        'states': {
                            0: 'disabled',
                            45: 'lower humidity',
                            55: 'cozy',
                            65: 'higher humidity'
                        }
                    },
                    'native': {}
                });
                await ctx.adapterProxy.setStateConditionalAsync('control.airPurifierModules.humidification', humidificationLevel, true);
            })();
        });

        vacbot.on('CleanSum', (obj) => {

            ctx.adapterProxy.setStateConditional('cleaninglog.totalSquareMeters', Number(obj.totalSquareMeters), true);
            ctx.adapterProxy.setStateConditional('cleaninglog.totalSeconds', Number(obj.totalSeconds), true);
            ctx.adapterProxy.setStateConditional('cleaninglog.totalTime', helper.getTimeStringFormatted(obj.totalSeconds), true);
            ctx.adapterProxy.setStateConditional('cleaninglog.totalNumber', Number(obj.totalNumber), true);
        });

        vacbot.on('CleanLog', (json) => {

            main.log.debug('CleanLog received');
            (async () => {
                const state = await ctx.adapterProxy.getStateAsync('cleaninglog.last20Logs');
                if (state) {
                    ctx.cleaningLogAcknowledged = true;
                    if (state.val !== JSON.stringify(json)) {
                        await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.last20Logs', JSON.stringify(json), true);
                    }
                }
            })();
        });

        vacbot.on('LastCleanLogs', (obj) => {

            main.log.debug('LastCleanLogs: ' + JSON.stringify(obj));
            ctx.adapterProxy.setStateConditional('cleaninglog.lastCleaningTimestamp', Number(obj.timestamp), true);
            const lastCleaningDate = main.formatDate(new Date(obj.timestamp * 1000), 'TT.MM.JJJJ SS:mm:ss');
            ctx.adapterProxy.setStateConditional('cleaninglog.lastCleaningDate', lastCleaningDate, true);
            ctx.adapterProxy.setStateConditional('cleaninglog.lastTotalSeconds', obj.totalTime, true);
            ctx.adapterProxy.setStateConditional('cleaninglog.lastTotalTimeString', obj.totalTimeFormatted, true);
            ctx.adapterProxy.setStateConditional('cleaninglog.lastSquareMeters', Number(obj.squareMeters), true);
            if (obj.imageUrl) {
                ctx.adapterProxy.setStateConditional('cleaninglog.lastCleaningMapImageURL', obj.imageUrl, true);
                const configValue = Number(main.getConfigValue('feature.cleaninglog.downloadLastCleaningMapImage', ctx.deviceId));
                if (configValue >= 1) {
                    if (ctx.getModel().isSupportedFeature('cleaninglog.lastCleaningMap')) {
                        main.downloadLastCleaningMapImage(ctx, obj.imageUrl, configValue);
                    }
                }
            }
        });

        vacbot.on('CurrentStats', (obj) => {

            if ((obj.cleanedArea !== undefined) && (obj.cleanedSeconds !== undefined)) {
                if (ctx.getModel().isSupportedFeature('cleaninglog.channel')) {
                    if (ctx.getDevice().isNotCharging()) {
                        (async () => {
                            if (ctx.getModel().isSupportedFeature('info.dustbox') && (ctx.currentCleanedArea > 0)) {
                                let diff = obj.cleanedArea - ctx.currentCleanedArea;
                                if (diff > 0) {
                                    const squareMetersSinceLastDustboxRemoved = await ctx.adapterProxy.getStateAsync('history.squareMetersSinceLastDustboxRemoved');
                                    if (squareMetersSinceLastDustboxRemoved) {
                                        const squareMeters = Number(squareMetersSinceLastDustboxRemoved.val) + diff;
                                        await ctx.adapterProxy.setStateConditionalAsync('history.squareMetersSinceLastDustboxRemoved', squareMeters, true);
                                    }
                                }
                                diff = obj.cleanedSeconds - ctx.currentCleanedSeconds;
                                if (diff > 0) {
                                    const cleaningTimeSinceLastDustboxRemoved = await ctx.adapterProxy.getStateAsync('history.cleaningTimeSinceLastDustboxRemoved');
                                    if (cleaningTimeSinceLastDustboxRemoved) {
                                        const cleaningTime = Number(cleaningTimeSinceLastDustboxRemoved.val) + diff;
                                        await ctx.adapterProxy.setStateConditionalAsync('history.cleaningTimeSinceLastDustboxRemoved', cleaningTime, true);
                                        await ctx.adapterProxy.setStateConditionalAsync('history.cleaningTimeSinceLastDustboxRemovedString', helper.getTimeStringFormatted(cleaningTime), true);
                                        const hoursUntilDustBagEmptyReminder = main.getHoursUntilDustBagEmptyReminderFlagIsSet(ctx.deviceId);
                                        if (hoursUntilDustBagEmptyReminder > 0) {
                                            const hoursSinceLastDustboxRemoved = Math.floor(cleaningTime / 3600);
                                            const reminderValue = (hoursSinceLastDustboxRemoved >= hoursUntilDustBagEmptyReminder);
                                            await ctx.adapterProxy.setStateConditionalAsync('info.extended.dustBagEmptyReminder', reminderValue, true);
                                        }
                                    }
                                }
                            }
                            ctx.currentCleanedArea = obj.cleanedArea;
                            await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.current.cleanedArea', obj.cleanedArea, true);
                            ctx.currentCleanedSeconds = obj.cleanedSeconds;
                            await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.current.cleanedSeconds', obj.cleanedSeconds, true);
                            await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.current.cleanedTime', helper.getTimeStringFormatted(obj.cleanedSeconds), true);
                            if (obj.cleanType) {
                                await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.current.cleanType', obj.cleanType, true);
                            }
                        })();
                    }
                }
            }
        });

    },

    /**
     * Register miscellaneous event handlers.
     * @param {object} main The main adapter instance.
     * @param {object} vacbot The vacbot client instance.
     * @param {object} ctx The adapter context object.
     */
    registerMiscEventHandlers(main, vacbot, ctx) {

        vacbot.on('Ota', async (object) => {

            await ctx.adapterProxy.createChannelNotExists('info.ota', 'Firmware Update (OTA) Information');
            // OTA status
            if (Object.prototype.hasOwnProperty.call(object, 'status')) {
                await ctx.adapterProxy.createObjectNotExists(
                    'info.ota.status', 'Update status',
                    'string', 'value', false, '', '');
                ctx.adapterProxy.setStateConditional('info.ota.status', object.status, true);
            }
            // OTA progress
            if (Object.prototype.hasOwnProperty.call(object, 'progress')) {
                await ctx.adapterProxy.createObjectNotExists(
                    'info.ota.progress', 'Update progress',
                    'number', 'value', false, 0, '%');
                ctx.adapterProxy.setStateConditional('info.ota.progress', object.progress, true);
            }
            // OTA version (target firmware version)
            if (Object.prototype.hasOwnProperty.call(object, 'ver')) {
                await ctx.adapterProxy.createObjectNotExists(
                    'info.ota.version', 'Available firmware version',
                    'string', 'value', false, '', '');
                ctx.adapterProxy.setStateConditional('info.ota.version', object.ver, true);
            }
            // OTA result
            if (Object.prototype.hasOwnProperty.call(object, 'result')) {
                await ctx.adapterProxy.createObjectNotExists(
                    'info.ota.result', 'Update result',
                    'number', 'value', false, 0, '');
                ctx.adapterProxy.setStateConditional('info.ota.result', Number(object.result), true);
            }
            // OTA supportAuto
            if (Object.prototype.hasOwnProperty.call(object, 'supportAuto')) {
                await ctx.adapterProxy.createObjectNotExists(
                    'info.ota.supportsAutoUpdate', 'Device supports automatic updates',
                    'boolean', 'value', false, false, '');
                ctx.adapterProxy.setStateConditional('info.ota.supportsAutoUpdate', Boolean(object.supportAuto), true);
            }
            // OTA isForce (forced update)
            if (Object.prototype.hasOwnProperty.call(object, 'isForce')) {
                await ctx.adapterProxy.createObjectNotExists(
                    'info.ota.isForced', 'Update is mandatory',
                    'boolean', 'value', false, false, '');
                ctx.adapterProxy.setStateConditional('info.ota.isForced', Boolean(object.isForce), true);
            }
            // OTA autoSwitch (auto-update enabled) - control state
            if (Object.prototype.hasOwnProperty.call(object, 'autoSwitch')) {
                await ctx.adapterProxy.createObjectNotExists(
                    'control.ota.autoUpdate', 'Enable automatic firmware updates',
                    'boolean', 'switch', true, false, '');
                ctx.adapterProxy.setStateConditional('control.ota.autoUpdate', Boolean(object.autoSwitch), true);
            }
        });

        vacbot.on('Schedule', (obj) => {

            (async () => {
                await main.createInfoExtendedChannelNotExists(ctx);
                await ctx.adapterProxy.createObjectNotExists(
                    'info.extended.currentSchedule', 'Scheduling information (read-only)',
                    'json', 'json', false, '[]', '');
                await ctx.adapterProxy.setStateConditionalAsync('info.extended.currentSchedule', JSON.stringify(obj), true);
                await ctx.adapterProxy.createObjectNotExists(
                    'info.extended.currentSchedule_refresh', 'Refresh scheduling information',
                    'boolean', 'button', true, false, '');
            })();
        });

        vacbot.on('NetworkInfo', (obj) => {

            ctx.adapterProxy.setStateConditional('info.network.ip', obj.ip, true);
            ctx.adapterProxy.setStateConditional('info.network.wifiSSID', obj.wifiSSID, true);
            if (ctx.getModel().isSupportedFeature('info.network.wifiSignal')) {
                ctx.adapterProxy.setStateConditional('info.network.wifiSignal', Number(obj.wifiSignal), true);
            }
            if (ctx.getModel().isSupportedFeature('info.network.mac')) {
                ctx.adapterProxy.setStateConditional('info.network.mac', obj.mac, true);
            }
        });

        vacbot.on('RelocationState', (relocationState) => {

            if ((relocationState !== ctx.relocationState) && (relocationState === 'required')) {
                ctx.currentSpotAreaData = {
                    'spotAreaID': 'unknown',
                    'lastTimeEnteredTimestamp': 0
                };
            }
            ctx.adapterProxy.setStateConditional('map.relocationState', relocationState, true);
            ctx.relocationState = relocationState;
        });

        vacbot.on('HeaderInfo', async (obj) => {

            await ctx.adapterProxy.createObjectNotExists(
                'info.firmwareVersion', 'Firmware version',
                'string', 'value', false, '', '');
            ctx.adapterProxy.setStateConditional('info.firmwareVersion', obj.fwVer, true);
        });

        vacbot.on('WashInfo', async (value) => {

            if (value === undefined || value === null) return;
            await ctx.adapterProxy.createObjectNotExists(
                'info.extended.washInfo', 'Wash mode of the cleaning station',
                'number', 'value', false, 0, '');
            ctx.adapterProxy.setStateConditional('info.extended.washInfo', value, true);
        });

        vacbot.on('DustCaseInfo', (value) => {

            const dustCaseInfo = Boolean(Number(value));
            (async () => {
                const state = await ctx.adapterProxy.getStateAsync('info.dustbox');
                if (state) {
                    if ((state.val !== dustCaseInfo) && (dustCaseInfo === false)) {
                        main.setHistoryValuesForDustboxRemoval(ctx);
                    }
                    ctx.adapterProxy.setStateConditional('info.dustbox', dustCaseInfo, true);
                }
            })();
        });

        vacbot.on('SleepStatus', (value) => {

            const sleepStatus = Boolean(Number(value));
            ctx.adapterProxy.setStateConditional('info.sleepStatus', sleepStatus, true);
        });

        vacbot.on('DoNotDisturbEnabled', (value) => {

            const doNotDisturb = Boolean(Number(value));
            ctx.adapterProxy.setStateConditional('control.extended.doNotDisturb', doNotDisturb, true);
        });

        vacbot.on('ContinuousCleaningEnabled', (value) => {

            const continuousCleaning = Boolean(Number(value));
            ctx.adapterProxy.setStateConditional('control.extended.continuousCleaning', continuousCleaning, true);
        });

        vacbot.on('AdvancedMode', (value) => {

            const advancedMode = Boolean(Number(value));
            ctx.adapterProxy.setStateConditional('control.extended.advancedMode', advancedMode, true);
        });

        vacbot.on('TrueDetect', (value) => {

            const trueDetect = Boolean(Number(value));
            ctx.adapterProxy.setStateConditional('control.extended.trueDetect', trueDetect, true);
        });

        vacbot.on('AutoEmptyStatus', (autoEmptyStatus) => {

            const autoEmptyEnabled = autoEmptyStatus.autoEmptyEnabled;
            ctx.adapterProxy.setStateConditional('control.extended.autoEmpty', autoEmptyEnabled, true);
            ctx.adapterProxy.setStateConditional('info.autoEmptyStation.autoEmptyEnabled', autoEmptyEnabled, true);
            const stationActive = autoEmptyStatus.stationActive;
            ctx.adapterProxy.setStateConditional('info.autoEmptyStation.stationActive', stationActive, true);
            const dustBagFull = autoEmptyStatus.dustBagFull;
            ctx.adapterProxy.setStateConditional('info.autoEmptyStation.dustBagFull', dustBagFull, true);
            if (stationActive) {
                main.setHistoryValuesForDustboxRemoval(ctx);
            }
        });

        vacbot.on('ChargeMode', async (value) => {

            await ctx.adapterProxy.createObjectNotExists(
                'info.chargemode', 'Charge mode',
                'string', 'value', false, '', '');
            ctx.adapterProxy.setStateConditional('info.chargemode', value, true);
        });

        vacbot.on('Volume', (value) => {

            ctx.adapterProxy.setStateConditional('control.extended.volume', Number(value), true);
        });

        vacbot.on('CleanCount', (value) => {

            ctx.adapterProxy.setStateConditional('control.extended.cleanCount', Number(value), true);
        });

        vacbot.on('BatteryInfo', (value) => {

            ctx.getDevice().setBatteryLevel(Number(value));
            ctx.adapterProxy.setStateConditional('info.battery', ctx.getDevice().batteryLevel, true);
        });

        vacbot.on('CleanSpeed', async (level) => {

            ctx.cleanSpeed = level;
            await adapterObjects.createControlCleanSpeedIfNotExists(main, ctx, 0, 'control.cleanSpeed_standard', 'Clean speed if no other value is set');
            await adapterObjects.createControlCleanSpeedIfNotExists(main, ctx, ctx.cleanSpeed);
            ctx.adapterProxy.setStateConditional('control.cleanSpeed', ctx.cleanSpeed, true);
        });

    },

};