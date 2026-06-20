'use strict';

/**
 * eventHandlers.test.js
 *
 * Each vacbot event has its own `it` block so that a single failing
 * assertion pinpoints exactly which event handler is broken.
 *
 * Module-level stubs (sinon.stub on a require()'d module) are set up in
 * inner `beforeEach` blocks and cleaned up via the outer `afterEach`
 * which calls sinon.restore(). This guarantees cleanup even when a test
 * throws before reaching a manual `.restore()` call.
 */

const { expect } = require('chai');
const { describe, it, beforeEach, afterEach } = require('mocha');
const sinon = require('sinon');
const eventHandlers = require('../lib/eventHandlers');

describe('eventHandlers.js - functionality', () => {
    let main;
    let vacbot;
    let ctx;
    let vacuum;
    let events;

    beforeEach(() => {
        events = {};
        vacbot = {
            on: sinon.stub().callsFake((event, handler) => {
                events[event] = handler;
            }),
            hasMoppingSystem: sinon.stub().returns(true)
        };
        main = {
            log: {
                debug: sinon.stub(),
                info: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub(),
                silly: sinon.stub()
            },
            updateDeviceConnectionState: sinon.stub(),
            clearUnreachableRetry: sinon.stub(),
            updateConnectionState: sinon.stub(),
            setDeviceStatusByTrigger: sinon.stub(),
            resetErrorStates: sinon.stub(),
            _flushPendingPosition: sinon.stub(),
            resetCurrentStats: sinon.stub(),
            setPauseBeforeDockingIfWaterboxInstalled: sinon.stub().resolves(),
            handleSilentApproach: sinon.stub(),
            createInfoExtendedChannelNotExists: sinon.stub().resolves(),
            handleAirDryingActive: sinon.stub(),
            handlePositionObj: sinon.stub().resolves(),
            handleWaterBoxMoppingType: sinon.stub().resolves(),
            handleWaterBoxScrubbingType: sinon.stub().resolves(),
            handleSweepMode: sinon.stub().resolves(),
            getCurrentDateAndTimeFormatted: sinon.stub().returns('2026-05-30 12:00:00'),
            version: '2.0.4',
            formatDate: sinon.stub().returns('30.05.2026 12:00:00'),
            writeFileAsync: sinon.stub().resolves(),
            namespace: 'test.0',
            getConfigValue: sinon.stub().returns(1),
            getHoursUntilDustBagEmptyReminderFlagIsSet: sinon.stub().returns(0),
            setConnection: sinon.stub(),
            debouncedSetError: sinon.stub(),
            incrementCommandFailedCount: sinon.stub(),
            scheduleUnreachableRetry: sinon.stub(),
            createAirDryingStates: sinon.stub().resolves(),
            downloadLastCleaningMapImage: sinon.stub(),
            setHistoryValuesForDustboxRemoval: sinon.stub(),
            addToLast20Errors: sinon.stub(),
            setGlobalMqttUnreachable: sinon.stub(),
            clearGlobalMqttUnreachable: sinon.stub(),
            startPolling: sinon.stub(),
            handleDeviceDataReceived: sinon.stub(),
        };
        vacuum = { nick: 'MyDeebot' };
        ctx = {
            deviceId: 'testDevice',
            connected: false,
            unreachableWarningSent: false,
            unreachableRetryCount: 0,
            vacuum: vacuum,
            adapter: main,
            cleaningQueue: {
                notEmpty: sinon.stub().returns(false),
                startNextItemFromQueue: sinon.stub()
            },
            intervalQueue: {
                add: sinon.stub(),
                addGetLifespan: sinon.stub(),
                addGetCleanLogs: sinon.stub()
            },
            adapterProxy: {
                setStateConditional: sinon.stub(),
                setStateConditionalAsync: sinon.stub().resolves(),
                createObjectNotExists: sinon.stub().resolves(),
                createChannelNotExists: sinon.stub().resolves(),
                setObjectNotExistsAsync: sinon.stub().resolves(),
                getStateAsync: sinon.stub().resolves(null),
                createChannel: sinon.stub().resolves(),
                extendObjectAsync: sinon.stub().resolves(),
                getObjectAsync: sinon.stub().resolves(null)
            },
            api: {
                getVersion: sinon.stub().returns('1.2.3')
            },
            getModel: sinon.stub().returns({
                getDeviceClass: () => 'testClass',
                getProductName: () => 'Test Deebot',
                getDeviceCategory: () => 'Vacuum Cleaner',
                getDeviceCapabilities: () => ({ type: 'Vacuum Cleaner', hasMapping: true }),
                getProductImageURL: () => 'http://example.com/image.png',
                getProtocol: () => 'MQTT',
                is950type: () => true,
                isMappingSupported: () => true,
                isSupportedFeature: sinon.stub().returns(true),
                isModelTypeAirbot: () => false,
                isModelTypeT20: () => false,
                isModelTypeX2: () => false,
                isModelTypeX1: () => false,
                isModelTypeT9Based: () => false,
                isModelTypeT8: () => false,
                isModelTypeN8: () => false,
                isModelTypeT9: () => false,
                isModelTypeT10: () => false,
                isModelTypeAqMonitor: () => false,
                getSmartType: () => '950'
            }),
            getPlatformType: sinon.stub().returns('950'),
            getSmartType: sinon.stub().returns('950'),
            getDevice: sinon.stub().returns({
                isNotStopped: () => true,
                isNotCharging: sinon.stub().returns(true),
                setBatteryLevel: sinon.stub()
            }),
            cleaningClothReminder: { enabled: false, period: 30 }
        };
    });

    // sinon.restore() handles both ordinary stubs and module-level stubs
    // (e.g. sinon.stub(require('../lib/adapterObjects'), 'createControlWaterLevelIfNotExists'))
    // so every inner beforeEach that stubs a module is automatically cleaned up.
    afterEach(() => {
        sinon.restore();
    });

    // -------------------------------------------------------------------------
    // registerChargeStateEvent
    // -------------------------------------------------------------------------

    describe('registerChargeStateEvent', () => {
        beforeEach(() => {
            eventHandlers.registerChargeStateEvent(main, vacbot, ctx);
        });

        it('should set chargestatus on "charging" event', () => {
            events.ChargeState('charging');
            expect(ctx.chargestatus).to.equal('charging');
        });

        it('should call setDeviceStatusByTrigger on ChargeState event', () => {
            events.ChargeState('charging');
            expect(main.setDeviceStatusByTrigger.calledWith(ctx, 'chargestatus')).to.be.true;
        });

        it('should update info.chargestatus state on ChargeState event', () => {
            events.ChargeState('charging');
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.chargestatus', 'charging', true)).to.be.true;
        });
    });

    // -------------------------------------------------------------------------
    // registerCleanReportEvent
    // -------------------------------------------------------------------------

    describe('registerCleanReportEvent', () => {
        beforeEach(() => {
            eventHandlers.registerCleanReportEvent(main, vacbot, ctx);
        });

        it('should set cleanstatus on "stop" event', () => {
            events.CleanReport('stop');
            expect(ctx.cleanstatus).to.equal('stop');
        });

        it('should flush pending position on CleanReport event', () => {
            events.CleanReport('stop');
            expect(main._flushPendingPosition.calledOnce).to.be.true;
        });
    });

    // -------------------------------------------------------------------------
    // registerWaterCleaningEvents
    // -------------------------------------------------------------------------

    describe('registerWaterCleaningEvents', () => {
        beforeEach(() => {
            const adapterObjects = require('../lib/adapterObjects');
            sinon.stub(adapterObjects, 'createControlWaterLevelIfNotExists').resolves();
            eventHandlers.registerWaterCleaningEvents(main, vacbot, ctx);
        });

        it('WaterInfo - should update states, context, and call helper methods', async () => {
            await events.WaterInfo({
                waterLevel: 3,
                waterboxInfo: 1,
                moppingType: 1,
                scrubbingType: 2
            });
            expect(ctx.waterLevel).to.equal(3);
            expect(ctx.waterboxInstalled).to.be.true;
            expect(main.handleWaterBoxMoppingType.calledWith(ctx, 1)).to.be.true;
            expect(main.handleWaterBoxScrubbingType.calledWith(ctx, 2)).to.be.true;
        });

        it('CarpetPressure - should set autoBoostSuction state', async () => {
            await events.CarpetPressure('1');
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.extended.autoBoostSuction', true, true
            )).to.be.true;
        });

        it('CleanPreference - should set ctx.cleanPreference = true for "1"', async () => {
            await events.CleanPreference('1');
            expect(ctx.cleanPreference).to.be.true;
        });

        it('VoiceAssistantState - should set voiceAssistant state', async () => {
            await events.VoiceAssistantState(true);
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.extended.voiceAssistant', true, true
            )).to.be.true;
        });

        it('BorderSpin - should set edgeDeepCleaning state', async () => {
            await events.BorderSpin('1');
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.extended.edgeDeepCleaning', true, true
            )).to.be.true;
        });

        it('MopOnlyMode - should set mopOnlyMode state', async () => {
            await events.MopOnlyMode('1');
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.extended.mopOnlyMode', true, true
            )).to.be.true;
        });

        it('SweepMode - should call handleSweepMode', () => {
            events.SweepMode(1);
            expect(main.handleSweepMode.calledOnce).to.be.true;
        });
    });

    // -------------------------------------------------------------------------
    // registerConnectionEvents
    // -------------------------------------------------------------------------

    describe('registerConnectionEvents', () => {
        beforeEach(() => {
            eventHandlers.registerConnectionEvents(main, vacbot, ctx);
        });

        it('Evt - should call handleDeviceDataReceived', () => {
            events.Evt({});
            expect(main.handleDeviceDataReceived.calledOnce).to.be.true;
        });

        it('LastError code 0 - should mark device connected', () => {
            events.LastError({ code: '0', error: 'No error' });
            expect(ctx.connected).to.be.true;
        });

        it('LastError code 0 - recomputes the global indicator without force-setting it', () => {
            ctx.connected = false;
            events.LastError({ code: '0', error: 'No error' });
            expect(main.updateDeviceConnectionState.calledWith(ctx, true)).to.be.true;
            expect(main.updateConnectionState.called, 'global derived from device states').to.be.true;
            expect(main.setConnection.called, 'must not force the global indicator').to.be.false;
        });

        it('LastError code 404 - marks only this device offline, not all devices', () => {
            ctx.connected = true;
            events.LastError({ code: '404', error: 'Device not reachable' });
            expect(ctx.connected, 'this device marked disconnected').to.be.false;
            expect(main.updateDeviceConnectionState.calledWith(ctx, false), 'per-device state set false').to.be.true;
            expect(main.updateConnectionState.called, 'global indicator recomputed').to.be.true;
            expect(main.setConnection.called, 'must NOT force every device offline').to.be.false;
            expect(ctx.connectionFailed, 'device flagged as failed').to.be.true;
            expect(main.scheduleUnreachableRetry.calledWith(ctx)).to.be.true;
        });

        it('LastError code 110 - should record dustbox removal', () => {
            events.LastError({ code: '110', error: 'Dustbox removed' });
            expect(main.addToLast20Errors.calledWith(ctx, '110', 'Dustbox removed')).to.be.true;
            expect(main.setHistoryValuesForDustboxRemoval.calledOnce).to.be.true;
        });

        it('LastError code 500 - should call setGlobalMqttUnreachable', () => {
            events.LastError({ code: '500', error: 'MQTT server is offline or not reachable' });
            expect(main.setGlobalMqttUnreachable.calledOnce).to.be.true;
        });

        it('LastError when disconnecting - should ignore the event', () => {
            ctx.disconnecting = true;
            events.LastError({ code: '500', error: 'MQTT server is offline or not reachable' });
            expect(main.setGlobalMqttUnreachable.called).to.be.false;
        });

        it('Debug - should update library debugMessage state', () => {
            events.Debug('debug message');
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'info.library.debugMessage', 'debug message', true
            )).to.be.true;
        });

        it('messageReceived - should update last message timestamp state', () => {
            events.messageReceived('message');
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'history.timestampOfLastMessageReceived'
            )).to.be.true;
        });

        it('genericCommandPayload - should serialise payload into state', () => {
            events.genericCommandPayload({ foo: 'bar' });
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.extended.genericCommand.responsePayload',
                JSON.stringify({ foo: 'bar' }),
                true
            )).to.be.true;
        });

        it('disconnect - should mark device disconnected and schedule retry', () => {
            ctx.connected = true;
            events.disconnect('some error');
            expect(ctx.connected).to.be.false;
            expect(main.scheduleUnreachableRetry.calledOnce).to.be.true;
        });

        it('disconnect when disconnecting - should ignore the event', () => {
            ctx.connected = true;
            ctx.disconnecting = true;
            events.disconnect('some error');
            expect(ctx.connected).to.be.true;
            expect(main.scheduleUnreachableRetry.called).to.be.false;
        });
    });

    // -------------------------------------------------------------------------
    // registerReadyEvent
    // -------------------------------------------------------------------------

    describe('registerReadyEvent', () => {
        beforeEach(() => {
            const adapterObjects = require('../lib/adapterObjects');
            sinon.stub(adapterObjects, 'createAdditionalObjects').resolves();
            sinon.stub(adapterObjects, 'createDeviceCapabilityObjects').resolves();
            sinon.stub(adapterObjects, 'createStationObjects').resolves();
            main.setInitialStateValues = sinon.stub().resolves();
            main.vacbotInitialGetStates = sinon.stub();
        });

        it('should mark ctx connected on the ready event (light path)', () => {
            eventHandlers.registerReadyEvent(main, vacbot, ctx, vacuum);
            events.ready();

            expect(ctx.connected).to.be.true;
            expect(main.updateDeviceConnectionState.calledWith(ctx, true)).to.be.true;
        });

        it('should perform heavy init and resolve on the initialized event', async () => {
            const readyPromise = eventHandlers.registerReadyEvent(main, vacbot, ctx, vacuum);
            events.initialized();
            await readyPromise;

            expect(main.setInitialStateValues.calledWith(ctx)).to.be.true;
        });

        it('should clear global MQTT unreachable state on ready event if set', () => {
            main.globalMqttUnreachable = true;
            eventHandlers.registerReadyEvent(main, vacbot, ctx, vacuum);
            events.ready();
            expect(main.clearGlobalMqttUnreachable.calledOnce).to.be.true;
        });

        it('should start polling on every ready event when enabled (light path)', () => {
            ctx.enabled = true;
            eventHandlers.registerReadyEvent(main, vacbot, ctx, vacuum);
            events.ready();
            expect(main.startPolling.calledWith(ctx)).to.be.true;
        });
    });

    // -------------------------------------------------------------------------
    // registerStationEvents
    // -------------------------------------------------------------------------

    describe('registerStationEvents', () => {
        beforeEach(() => {
            eventHandlers.registerStationEvents(main, vacbot, ctx);
        });

        it('AirDryingState - should update airDryingState state', async () => {
            await events.AirDryingState('drying');
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'info.extended.airDryingState', 'drying', true
            )).to.be.true;
        });

        it('WashInterval - should update washInterval state', async () => {
            events.WashInterval(15);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(ctx.adapterProxy.setStateConditionalAsync.calledWith(
                'info.extended.washInterval', 15, true
            )).to.be.true;
        });

        it('WorkMode - should update cleaningMode state', async () => {
            events.WorkMode(1);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(ctx.adapterProxy.setStateConditionalAsync.calledWith(
                'control.extended.cleaningMode', 1, true
            )).to.be.true;
        });

        it('CarpetInfo - should update carpetCleaningStrategy state', async () => {
            await events.CarpetInfo(1);
            expect(ctx.adapterProxy.setStateConditionalAsync.calledWith(
                'control.extended.carpetCleaningStrategy', 1, true
            )).to.be.true;
        });

        it('StationState(isAirDrying=true) - should set cleanstatus to "drying"', async () => {
            await events.StationState({ isAirDrying: true, isSelfCleaning: false, isActive: true });
            expect(ctx.cleanstatus).to.equal('drying');
        });

        it('DryingDuration - should update airDryingDuration state', async () => {
            await events.DryingDuration(120);
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.extended.airDryingDuration', 120, true
            )).to.be.true;
        });

        it('AICleanItemState - should update particleRemoval state', async () => {
            await events.AICleanItemState({ particleRemoval: true, petPoopPrevention: true });
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'info.extended.particleRemoval', true, true
            )).to.be.true;
        });

        it('StationInfo - should update cleaningStation.state', async () => {
            await events.StationInfo({ state: 1, name: 'Station', model: 'M1', sn: '123', wkVer: '1.0' });
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'info.extended.cleaningStation.state', 1, true
            )).to.be.true;
        });

        it('DusterRemind - should enable cleaningClothReminder', async () => {
            events.DusterRemind({ enabled: '1', period: '30' });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(ctx.cleaningClothReminder.enabled).to.be.true;
        });
    });

    // -------------------------------------------------------------------------
    // registerAirbotEvents
    // -------------------------------------------------------------------------

    describe('registerAirbotEvents', () => {
        beforeEach(() => {
            eventHandlers.registerAirbotEvents(main, vacbot, ctx);
        });

        it('BlueSpeaker - should set bluetoothSpeaker state', async () => {
            await events.BlueSpeaker({ enable: 1 });
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.extended.bluetoothSpeaker', true, true
            )).to.be.true;
        });

        it('Mic - should set microphone state', async () => {
            await events.Mic(1);
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.extended.microphone', true, true
            )).to.be.true;
        });

        it('VoiceSimple - should set voiceReport state', async () => {
            await events.VoiceSimple(1);
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.extended.voiceReport', true, true
            )).to.be.true;
        });

        it('ThreeModuleStatus(uvLight active) - should set uvSanitization to "active"', async () => {
            await events.ThreeModuleStatus([{ type: 'uvLight', state: 1, work: 1 }]);
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'info.airPurifierModules.uvSanitization', 'active', true
            )).to.be.true;
        });

        it('AirQuality - should set airQualityIndex state', async () => {
            await events.AirQuality({
                particulateMatter10: 10, particulateMatter25: 5, airQualityIndex: 1,
                volatileOrganicCompounds: 0.1, temperature: 22, humidity: 50,
                volatileOrganicCompounds_parts: 100
            });
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'info.airQuality.airQualityIndex', 1, true
            )).to.be.true;
        });

        it('AtmoLight - should set atmoLight state', async () => {
            events.AtmoLight(2);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(ctx.adapterProxy.setStateConditionalAsync.calledWith(
                'control.extended.atmoLight', 2, true
            )).to.be.true;
        });

        it('AtmoVolume - should set atmoVolume state', async () => {
            events.AtmoVolume(10);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(ctx.adapterProxy.setStateConditionalAsync.calledWith(
                'control.extended.atmoVolume', 10, true
            )).to.be.true;
        });

        it('AutonomousClean - should set selfLinkedPurification state', async () => {
            await events.AutonomousClean(1);
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.linkedPurification.selfLinkedPurification', true, true
            )).to.be.true;
        });

        it('AirbotAutoModel - should set linkedPurificationAQ state', async () => {
            events.AirbotAutoModel({ enable: 1, aq: { aqEnd: 1, aqStart: 2 } });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(ctx.adapterProxy.setStateConditionalAsync.calledWith(
                'control.linkedPurification.linkedPurificationAQ', '1,2,1', true
            )).to.be.true;
        });

        it('ThreeModule(uvLight enabled) - should set uvSanitization control state', async () => {
            await events.ThreeModule([
                { type: 'uvLight', enable: 1 },
                { type: 'smell', enable: 1, level: 2 },
                { type: 'humidify', enable: 0, level: 45 }
            ]);
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.airPurifierModules.uvSanitization', true, true
            )).to.be.true;
        });

        it('CleanSum - should set totalSquareMeters state', () => {
            events.CleanSum({ totalSquareMeters: 100, totalSeconds: 3600, totalNumber: 10 });
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'cleaninglog.totalSquareMeters', 100, true
            )).to.be.true;
        });

        it('LastCleanLogs - should set lastTotalSeconds state', () => {
            events.LastCleanLogs({
                timestamp: 1234567890, totalTime: 3600, totalTimeFormatted: '1h',
                squareMeters: 20, imageUrl: 'http://img'
            });
            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'cleaninglog.lastTotalSeconds', 3600, true
            )).to.be.true;
        });

        it('CurrentStats - should update ctx.currentCleanedArea', async () => {
            await events.CurrentStats({ cleanedArea: 5, cleanedSeconds: 600, cleanType: 'auto' });
            expect(ctx.currentCleanedArea).to.equal(5);
        });
    });

    // -------------------------------------------------------------------------
    // registerMiscEventHandlers
    // -------------------------------------------------------------------------

    describe('registerMiscEventHandlers', () => {
        beforeEach(() => {
            eventHandlers.registerMiscEventHandlers(main, vacbot, ctx);
        });

        it('Ota - should update ota.status state', async () => {
            await events.Ota({ status: 'idle', progress: 0, ver: '1.0', result: 0, supportAuto: 1, isForce: 0, autoSwitch: 1 });
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.ota.status', 'idle', true)).to.be.true;
        });

        it('Schedule - should serialise schedule into state', async () => {
            events.Schedule([{ id: 1 }]);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(ctx.adapterProxy.setStateConditionalAsync.calledWith(
                'info.extended.currentSchedule', JSON.stringify([{ id: 1 }]), true
            )).to.be.true;
        });

        it('NetworkInfo - should set info.network.ip state', () => {
            events.NetworkInfo({ ip: '1.2.3.4', wifiSSID: 'SSID', wifiSignal: -50, mac: 'AA:BB' });
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.network.ip', '1.2.3.4', true)).to.be.true;
        });

        it('RelocationState - should update ctx.relocationState', () => {
            events.RelocationState('required');
            expect(ctx.relocationState).to.equal('required');
        });

        it('HeaderInfo - should update firmwareVersion state', async () => {
            await events.HeaderInfo({ fwVer: '1.2.3' });
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.firmwareVersion', '1.2.3', true)).to.be.true;
        });

        it('WashInfo - should set info.extended.washInfo state', async () => {
            await events.WashInfo(1);
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.extended.washInfo', 1, true)).to.be.true;
        });

        it('SleepStatus("1") - should set sleepStatus to true', () => {
            events.SleepStatus('1');
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.sleepStatus', true, true)).to.be.true;
        });

        it('DoNotDisturbEnabled("1") - should set doNotDisturb to true', () => {
            events.DoNotDisturbEnabled('1');
            expect(ctx.adapterProxy.setStateConditional.calledWith('control.extended.doNotDisturb', true, true)).to.be.true;
        });

        it('AutoEmptyStatus - should set control.extended.autoEmpty state', () => {
            events.AutoEmptyStatus({ autoEmptyEnabled: true, stationActive: true, dustBagFull: false });
            expect(ctx.adapterProxy.setStateConditional.calledWith('control.extended.autoEmpty', true, true)).to.be.true;
        });

        it('ChargeMode - should update info.chargemode state', async () => {
            await events.ChargeMode('mode');
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.chargemode', 'mode', true)).to.be.true;
        });

        it('Volume("5") - should set volume state as number 5', () => {
            events.Volume('5');
            expect(ctx.adapterProxy.setStateConditional.calledWith('control.extended.volume', 5, true)).to.be.true;
        });

        it('CleanCount("2") - should set cleanCount state as number 2', () => {
            events.CleanCount('2');
            expect(ctx.adapterProxy.setStateConditional.calledWith('control.extended.cleanCount', 2, true)).to.be.true;
        });

        it('CleanSpeed("strong") - should update ctx.cleanSpeed', async () => {
            await events.CleanSpeed('strong');
            expect(ctx.cleanSpeed).to.equal('strong');
        });
    });
});
