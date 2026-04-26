'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach, afterEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Mock dependencies
const mockAdapterHelper = {
    getStateNameById: sinon.stub(),
    getUnixTimestamp: sinon.stub().returns(1234567890),
    isValidChargeStatus: sinon.stub(),
    isValidCleanStatus: sinon.stub(),
    getDeviceStatusByStatus: sinon.stub()
};

const mockMapHelper = {
    getAreaValue: sinon.stub(),
    getSpotAreaName: sinon.stub()
};

// Mock adapter
const createMockAdapter = () => ({
    namespace: 'ecovacs-deebot.0',
    connected: true,
    log: {
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
    },
    getDevice: sinon.stub().returns({
        status: 'idle',
        isCleaning: sinon.stub().returns(false),
        isNotCleaning: sinon.stub().returns(true),
        isCharging: sinon.stub().returns(false),
        isNotCharging: sinon.stub().returns(true),
        isPaused: sinon.stub().returns(false),
        useV2commands: sinon.stub().returns(false)
    }),
    commandQueue: { resetQueue: sinon.stub() },
    cleaningQueue: { resetQueue: sinon.stub() },
    clearGoToPosition: sinon.stub(),
    getCurrentDateAndTimeFormatted: sinon.stub().returns('2023-01-01 12:00:00'),
    setStateConditional: sinon.stub(),
    getObject: sinon.stub(),
    getState: sinon.stub().resolves({ val: null }),
    getModel: sinon.stub().returns({
        isSupportedFeature: sinon.stub().returns(true),
        getCleanSpeed: sinon.stub().returns(3),
        getWaterLevel: sinon.stub().returns(3),
        getVolume: sinon.stub().returns(4),
        getWashInterval: sinon.stub().returns(10),
        getDustBagReminder: sinon.stub().returns(420),
        getCleanCount: sinon.stub().returns(3),
        getRelocationState: sinon.stub().returns('standard'),
        getGoToPosition: sinon.stub().returns('native'),
        getAreaCleaningMode: sinon.stub().returns('custom'),
        getSpotAreaCleaningMode: sinon.stub().returns('advanced'),
        getAutoEmptyStation: sinon.stub().returns('standard'),
        getAirDrying: sinon.stub().returns('standard'),
        getTrueDetect: sinon.stub().returns('standard'),
        getCleanPreference: sinon.stub().returns('standard'),
        getAdvancedMode: sinon.stub().returns('standard'),
        getWorkMode: sinon.stub().returns('none'),
        getCarpetPressure: sinon.stub().returns('standard'),
        getCleanCount: sinon.stub().returns('standard'),
        getWashInterval: sinon.stub().returns('none'),
        getVolume: sinon.stub().returns('standard'),
        getDoNotDisturb: sinon.stub().returns('standard'),
        getContinuousCleaning: sinon.stub().returns('standard'),
        getAutoEmpty: sinon.stub().returns('standard'),
        getAirDrying: sinon.stub().returns('standard'),
        getLifeSpan: sinon.stub().returns('standard'),
        getNetworkInfo: sinon.stub().returns('standard'),
        getSleepStatus: sinon.stub().returns('standard'),
        getErrorCode: sinon.stub().returns('standard'),
        getChargeState: sinon.stub().returns('standard'),
        getCleanState: sinon.stub().returns('standard'),
        getBatteryInfo: sinon.stub().returns('standard'),
        getSoundControl: sinon.stub().returns('standard'),
        getMovementControl: sinon.stub().returns('none'),
        getVoiceAssistant: sinon.stub().returns('none'),
        getHostedMode: sinon.stub().returns('none'),
        getAirFreshener: sinon.stub().returns('none'),
        getDustBox: sinon.stub().returns('none'),
        getThreeModuleStatus: sinon.stub().returns('none'),
        getJCYAirQuality: sinon.stub().returns('none'),
        getAirQuality: sinon.stub().returns('none'),
        getThreeModule: sinon.stub().returns('none'),
        getGoatInfo: sinon.stub().returns('none'),
        getGoatBlade: sinon.stub().returns('none'),
        getGoatMotor: sinon.stub().returns('none'),
        getGoatBattery: sinon.stub().returns('none'),
        getGoatChargeState: sinon.stub().returns('none'),
        getGoatErrorCode: sinon.stub().returns('none'),
        getGoatWorkMode: sinon.stub().returns('none'),
        getGoatWorkState: sinon.stub().returns('none'),
        getGoatPosition: sinon.stub().returns('none'),
        getGoatMowingInfo: sinon.stub().returns('none'),
        getGoatMowingState: sinon.stub().returns('none'),
        getGoatMowingPattern: sinon.stub().returns('none'),
        getGoatMowingArea: sinon.stub().returns('none'),
        getGoatMowingTime: sinon.stub().returns('none'),
        getGoatMowingDistance: sinon.stub().returns('none'),
        getGoatMowingSpeed: sinon.stub().returns('none'),
        getGoatMowingHeight: sinon.stub().returns('none'),
        getGoatMowingWidth: sinon.stub().returns('none'),
        getGoatMowingLength: sinon.stub().returns('none'),
        getGoatMowingVolume: sinon.stub().returns('none'),
        getGoatMowingWeight: sinon.stub().returns('none'),
        getGoatMowingTemperature: sinon.stub().returns('none'),
        getGoatMowingHumidity: sinon.stub().returns('none'),
        getGoatMowingPressure: sinon.stub().returns('none'),
        getGoatMowingAltitude: sinon.stub().returns('none'),
        getGoatMowingLatitude: sinon.stub().returns('none'),
        getGoatMowingLongitude: sinon.stub().returns('none'),
        getGoatMowingAccuracy: sinon.stub().returns('none'),
        getGoatMowingSatellites: sinon.stub().returns('none'),
        getGoatMowingFix: sinon.stub().returns('none'),
        getGoatMowingHdop: sinon.stub().returns('none'),
        getGoatMowingVdop: sinon.stub().returns('none'),
        getGoatMowingPdop: sinon.stub().returns('none'),
        getGoatMowingGdop: sinon.stub().returns('none'),
        getGoatMowingTdop: sinon.stub().returns('none'),
        getGoatMowingXdop: sinon.stub().returns('none'),
        getGoatMowingYdop: sinon.stub().returns('none'),
        getGoatMowingZdop: sinon.stub().returns('none'),
        getGoatMowingEcefX: sinon.stub().returns('none'),
        getGoatMowingEcefY: sinon.stub().returns('none'),
        getGoatMowingEcefZ: sinon.stub().returns('none'),
        getGoatMowingEcefVX: sinon.stub().returns('none'),
        getGoatMowingEcefVY: sinon.stub().returns('none'),
        getGoatMowingEcefVZ: sinon.stub().returns('none'),
        getGoatMowingEcefAX: sinon.stub().returns('none'),
        getGoatMowingEcefAY: sinon.stub().returns('none'),
        getGoatMowingEcefAZ: sinon.stub().returns('none'),
        getGoatMowingGeoidHeight: sinon.stub().returns('none'),
        getGoatMowingSep: sinon.stub().returns('none'),
        getGoatMowingDgpsAge: sinon.stub().returns('none'),
        getGoatMowingDgpsId: sinon.stub().returns('none'),
        getGoatMowingUtc: sinon.stub().returns('none'),
        getGoatMowingCourse: sinon.stub().returns('none'),
        getGoatMowingSpeed: sinon.stub().returns('none'),
        getGoatMowingClimb: sinon.stub().returns('none'),
        getGoatMowingTrack: sinon.stub().returns('none'),
        getGoatMowingStatus: sinon.stub().returns('none'),
        getGoatMowingMode: sinon.stub().returns('none'),
        getGoatMowingPattern: sinon.stub().returns('none'),
        getGoatMowingArea: sinon.stub().returns('none'),
        getGoatMowingTime: sinon.stub().returns('none'),
        getGoatMowingDistance: sinon.stub().returns('none'),
        getGoatMowingSpeed: sinon.stub().returns('none'),
        getGoatMowingHeight: sinon.stub().returns('none'),
        getGoatMowingWidth: sinon.stub().returns('none'),
        getGoatMowingLength: sinon.stub().returns('none'),
        getGoatMowingVolume: sinon.stub().returns('none'),
        getGoatMowingWeight: sinon.stub().returns('none'),
        getGoatMowingTemperature: sinon.stub().returns('none'),
        getGoatMowingHumidity: sinon.stub().returns('none'),
        getGoatMowingPressure: sinon.stub().returns('none'),
        getGoatMowingAltitude: sinon.stub().returns('none'),
        getGoatMowingLatitude: sinon.stub().returns('none'),
        getGoatMowingLongitude: sinon.stub().returns('none'),
        getGoatMowingAccuracy: sinon.stub().returns('none'),
        getGoatMowingSatellites: sinon.stub().returns('none'),
        getGoatMowingFix: sinon.stub().returns('none'),
        getGoatMowingHdop: sinon.stub().returns('none'),
        getGoatMowingVdop: sinon.stub().returns('none'),
        getGoatMowingPdop: sinon.stub().returns('none'),
        getGoatMowingGdop: sinon.stub().returns('none'),
        getGoatMowingTdop: sinon.stub().returns('none'),
        getGoatMowingXdop: sinon.stub().returns('none'),
        getGoatMowingYdop: sinon.stub().returns('none'),
        getGoatMowingZdop: sinon.stub().returns('none'),
        getGoatMowingEcefX: sinon.stub().returns('none'),
        getGoatMowingEcefY: sinon.stub().returns('none'),
        getGoatMowingEcefZ: sinon.stub().returns('none'),
        getGoatMowingEcefVX: sinon.stub().returns('none'),
        getGoatMowingEcefVY: sinon.stub().returns('none'),
        getGoatMowingEcefVZ: sinon.stub().returns('none'),
        getGoatMowingEcefAX: sinon.stub().returns('none'),
        getGoatMowingEcefAY: sinon.stub().returns('none'),
        getGoatMowingEcefAZ: sinon.stub().returns('none'),
        getGoatMowingGeoidHeight: sinon.stub().returns('none'),
        getGoatMowingSep: sinon.stub().returns('none'),
        getGoatMowingDgpsAge: sinon.stub().returns('none'),
        getGoatMowingDgpsId: sinon.stub().returns('none'),
        getGoatMowingUtc: sinon.stub().returns('none'),
        getGoatMowingCourse: sinon.stub().returns('none'),
        getGoatMowingSpeed: sinon.stub().returns('none'),
        getGoatMowingClimb: sinon.stub().returns('none'),
        getGoatMowingTrack: sinon.stub().returns('none'),
        getGoatMowingStatus: sinon.stub().returns('none'),
        getGoatMowingMode: sinon.stub().returns('none'),
        getGoatMowingPattern: sinon.stub().returns('none'),
        getGoatMowingArea: sinon.stub().returns('none'),
        getGoatMowingTime: sinon.stub().returns('none'),
        getGoatMowingDistance: sinon.stub().returns('none'),
        getGoatMowingSpeed: sinon.stub().returns('none'),
        getGoatMowingHeight: sinon.stub().returns('none'),
        getGoatMowingWidth: sinon.stub().returns('none'),
        getGoatMowingLength: sinon.stub().returns('none'),
        getGoatMowingVolume: sinon.stub().returns('none'),
        getGoatMowingWeight: sinon.stub().returns('none'),
        getGoatMowingTemperature: sinon.stub().returns('none'),
        getGoatMowingHumidity: sinon.stub().returns('none'),
        getGoatMowingPressure: sinon.stub().returns('none'),
        getGoatMowingAltitude: sinon.stub().returns('none'),
        getGoatMowingLatitude: sinon.stub().returns('none'),
        getGoatMowingLongitude: sinon.stub().returns('none'),
        getGoatMowingAccuracy: sinon.stub().returns('none'),
        getGoatMowingSatellites: sinon.stub().returns('none'),
        getGoatMowingFix: sinon.stub().returns('none'),
        getGoatMowingHdop: sinon.stub().returns('none'),
        getGoatMowingVdop: sinon.stub().returns('none'),
        getGoatMowingPdop: sinon.stub().returns('none'),
        getGoatMowingGdop: sinon.stub().returns('none'),
        getGoatMowingTdop: sinon.stub().returns('none'),
        getGoatMowingXdop: sinon.stub().returns('none'),
        getGoatMowingYdop: sinon.stub().returns('none'),
        getGoatMowingZdop: sinon.stub().returns('none'),
        getGoatMowingEcefX: sinon.stub().returns('none'),
        getGoatMowingEcefY: sinon.stub().returns('none'),
        getGoatMowingEcefZ: sinon.stub().returns('none'),
        getGoatMowingEcefVX: sinon.stub().returns('none'),
        getGoatMowingEcefVY: sinon.stub().returns('none'),
        getGoatMowingEcefVZ: sinon.stub().returns('none'),
        getGoatMowingEcefAX: sinon.stub().returns('none'),
        getGoatMowingEcefAY: sinon.stub().returns('none'),
        getGoatMowingEcefAZ: sinon.stub().returns('none'),
        getGoatMowingGeoidHeight: sinon.stub().returns('none'),
        getGoatMowingSep: sinon.stub().returns('none'),
        getGoatMowingDgpsAge: sinon.stub().returns('none'),
        getGoatMowingDgpsId: sinon.stub().returns('none'),
        getGoatMowingUtc: sinon.stub().returns('none'),
        getGoatMowingCourse: sinon.stub().returns('none'),
        getGoatMowingSpeed: sinon.stub().returns('none'),
        getGoatMowingClimb: sinon.stub().returns('none'),
        getGoatMowingTrack: sinon.stub().returns('none')
    }),
    vacbot: {
        run: sinon.stub(),
        getCleanSpeed: sinon.stub().returns(2),
        getWaterLevel: sinon.stub().returns(2),
        getVolume: sinon.stub().returns(2),
        getWashInterval: sinon.stub().returns(5),
        getDustBagReminder: sinon.stub().returns(200),
        getCleanCount: sinon.stub().returns(2),
        getRelocationState: sinon.stub().returns('idle'),
        getGoToPosition: sinon.stub().returns('none'),
        getAreaCleaningMode: sinon.stub().returns('none'),
        getSpotAreaCleaningMode: sinon.stub().returns('basic'),
        getAutoEmptyStation: sinon.stub().returns('none'),
        getAirDrying: sinon.stub().returns('none'),
        getTrueDetect: sinon.stub().returns('none'),
        getCleanPreference: sinon.stub().returns('none'),
        getAdvancedMode: sinon.stub().returns('none'),
        getWorkMode: sinon.stub().returns('none'),
        getCarpetPressure: sinon.stub().returns('none'),
        getCleanCount: sinon.stub().returns('none'),
        getWashInterval: sinon.stub().returns('none'),
        getVolume: sinon.stub().returns('none'),
        getDoNotDisturb: sinon.stub().returns('none'),
        getContinuousCleaning: sinon.stub().returns('none'),
        getAutoEmpty: sinon.stub().returns('none'),
        getAirDrying: sinon.stub().returns('none'),
        getLifeSpan: sinon.stub().returns('none'),
        getNetworkInfo: sinon.stub().returns('basic'),
        getSleepStatus: sinon.stub().returns('none'),
        getErrorCode: sinon.stub().returns('basic'),
        getChargeState: sinon.stub().returns('basic'),
        getCleanState: sinon.stub().returns('basic'),
        getBatteryInfo: sinon.stub().returns('basic'),
        getSoundControl: sinon.stub().returns('basic'),
        getMovementControl: sinon.stub().returns('none'),
        getVoiceAssistant: sinon.stub().returns('none'),
        getHostedMode: sinon.stub().returns('none'),
        getAirFreshener: sinon.stub().returns('none'),
        getDustBox: sinon.stub().returns('none'),
        getThreeModuleStatus: sinon.stub().returns('none'),
        getJCYAirQuality: sinon.stub().returns('none'),
        getAirQuality: sinon.stub().returns('none'),
        getThreeModule: sinon.stub().returns('none'),
        getGoatInfo: sinon.stub().returns('none'),
        getGoatBlade: sinon.stub().returns('none'),
        getGoatMotor: sinon.stub().returns('none'),
        getGoatBattery: sinon.stub().returns('none'),
        getGoatChargeState: sinon.stub().returns('none'),
        getGoatErrorCode: sinon.stub().returns('none'),
        getGoatWorkMode: sinon.stub().returns('none'),
        getGoatWorkState: sinon.stub().returns('none'),
        getGoatPosition: sinon.stub().returns('none'),
        getGoatMowingInfo: sinon.stub().returns('none'),
        getGoatMowingState: sinon.stub().returns('none'),
        getGoatMowingPattern: sinon.stub().returns('none'),
        getGoatMowingArea: sinon.stub().returns('none'),
        getGoatMowingTime: sinon.stub().returns('none'),
        getGoatMowingDistance: sinon.stub().returns('none'),
        getGoatMowingSpeed: sinon.stub().returns('none'),
        getGoatMowingHeight: sinon.stub().returns('none'),
        getGoatMowingWidth: sinon.stub().returns('none'),
        getGoatMowingLength: sinon.stub().returns('none'),
        getGoatMowingVolume: sinon.stub().returns('none'),
        getGoatMowingWeight: sinon.stub().returns('none'),
        getGoatMowingTemperature: sinon.stub().returns('none'),
        getGoatMowingHumidity: sinon.stub().returns('none'),
        getGoatMowingPressure: sinon.stub().returns('none'),
        getGoatMowingAltitude: sinon.stub().returns('none'),
        getGoatMowingLatitude: sinon.stub().returns('none'),
        getGoatMowingLongitude: sinon.stub().returns('none'),
        getGoatMowingAccuracy: sinon.stub().returns('none'),
        getGoatMowingSatellites: sinon.stub().returns('none'),
        getGoatMowingFix: sinon.stub().returns('none'),
        getGoatMowingHdop: sinon.stub().returns('none'),
        getGoatMowingVdop: sinon.stub().returns('none'),
        getGoatMowingPdop: sinon.stub().returns('none'),
        getGoatMowingGdop: sinon.stub().returns('none'),
        getGoatMowingTdop: sinon.stub().returns('none'),
        getGoatMowingXdop: sinon.stub().returns('none'),
        getGoatMowingYdop: sinon.stub().returns('none'),
        getGoatMowingZdop: sinon.stub().returns('none'),
        getGoatMowingEcefX: sinon.stub().returns('none'),
        getGoatMowingEcefY: sinon.stub().returns('none'),
        getGoatMowingEcefZ: sinon.stub().returns('none'),
        getGoatMowingEcefVX: sinon.stub().returns('none'),
        getGoatMowingEcefVY: sinon.stub().returns('none'),
        getGoatMowingEcefVZ: sinon.stub().returns('none'),
        getGoatMowingEcefAX: sinon.stub().returns('none'),
        getGoatMowingEcefAY: sinon.stub().returns('none'),
        getGoatMowingEcefAZ: sinon.stub().returns('none'),
        getGoatMowingGeoidHeight: sinon.stub().returns('none'),
        getGoatMowingSep: sinon.stub().returns('none'),
        getGoatMowingDgpsAge: sinon.stub().returns('none'),
        getGoatMowingDgpsId: sinon.stub().returns('none'),
        getGoatMowingUtc: sinon.stub().returns('none'),
        getGoatMowingCourse: sinon.stub().returns('none'),
        getGoatMowingSpeed: sinon.stub().returns('none'),
        getGoatMowingClimb: sinon.stub().returns('none'),
        getGoatMowingTrack: sinon.stub().returns('none')
    }
});

// Load the module with mocked dependencies
const adapterCommands = proxyquire('../lib/adapterCommands', {
    './adapterHelper': mockAdapterHelper,
    './mapHelper': mockMapHelper
});

describe('adapterCommands.js', () => {
    let adapter;

    beforeEach(() => {
        adapter = createMockAdapter();
        // Reset only the proxyquire module mocks
        Object.values(mockAdapterHelper).forEach(stub => {
            if (stub.resetHistory) stub.resetHistory();
        });
        Object.values(mockMapHelper).forEach(stub => {
            if (stub.resetHistory) stub.resetHistory();
        });
    });

    describe('Module Structure', () => {
        it('should export the expected functions', () => {
            expect(adapterCommands).to.be.an('object');
            expect(adapterCommands).to.have.property('handleStateChange');
            expect(adapterCommands).to.have.property('cleanSpotArea');
            expect(adapterCommands).to.have.property('runSetCleanSpeed');
            expect(adapterCommands).to.have.property('handleV2commands');
            expect(adapterCommands).to.have.property('startSpotAreaCleaning');
        });
    });

    describe('handleStateChange', () => {
        it('should handle clean_home state when device is in error state', async () => {
            const mockDevice = {
                status: 'error',
                isCleaning: sinon.stub().returns(false),
                isNotCleaning: sinon.stub().returns(true),
                isCharging: sinon.stub().returns(false),
                isNotCharging: sinon.stub().returns(true),
                isPaused: sinon.stub().returns(false),
                useV2commands: sinon.stub().returns(false)
            };
            adapter.getDevice.returns(mockDevice);
            mockAdapterHelper.getStateNameById.returns('clean_home');

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.clean_home', state);

            expect(adapter.log.warn.calledWith('Please check bot for errors')).to.be.true;
            expect(adapter.setStateConditional.called).to.be.false;
        });

        it('should handle clean_home state when device is paused', async () => {
            const mockDevice = {
                status: 'paused',
                isCleaning: sinon.stub().returns(false),
                isNotCleaning: sinon.stub().returns(true),
                isCharging: sinon.stub().returns(false),
                isNotCharging: sinon.stub().returns(true),
                isPaused: sinon.stub().returns(false),
                useV2commands: sinon.stub().returns(false)
            };
            adapter.getDevice.returns(mockDevice);
            mockAdapterHelper.getStateNameById.returns('clean_home');

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.clean_home', state);

            expect(adapter.vacbot.run.calledWith('resume')).to.be.true;
            expect(adapter.setStateConditional.calledWith('ecovacs-deebot.0.control.clean_home', true, true)).to.be.true;
        });

        it('should handle clean_home state when device is cleaning', async () => {
            const mockDevice = {
                status: 'cleaning',
                isCleaning: sinon.stub().returns(true),
                isNotCleaning: sinon.stub().returns(false),
                isCharging: sinon.stub().returns(false),
                isNotCharging: sinon.stub().returns(true),
                isPaused: sinon.stub().returns(false),
                useV2commands: sinon.stub().returns(false)
            };
            adapter.getDevice.returns(mockDevice);
            mockAdapterHelper.getStateNameById.returns('clean_home');

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.clean_home', state);

            expect(adapter.vacbot.run.calledWith('charge')).to.be.true;
            expect(adapter.setStateConditional.calledWith('ecovacs-deebot.0.control.clean_home', false, true)).to.be.true;
        });

        it('should handle clean_home state when device is idle', async () => {
            const mockDevice = {
                status: 'idle',
                isCleaning: sinon.stub().returns(false),
                isNotCleaning: sinon.stub().returns(true),
                isCharging: sinon.stub().returns(false),
                isNotCharging: sinon.stub().returns(true),
                isPaused: sinon.stub().returns(false),
                useV2commands: sinon.stub().returns(false)
            };
            adapter.getDevice.returns(mockDevice);
            mockAdapterHelper.getStateNameById.returns('clean_home');

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.clean_home', state);

            expect(adapter.vacbot.run.calledWith('clean')).to.be.true;
            expect(adapter.setStateConditional.calledWith('ecovacs-deebot.0.control.clean_home', true, true)).to.be.true;
        });

        it('should reset button states after execution', async () => {
            mockAdapterHelper.getStateNameById.returns('playSound');
            const mockObject = { common: { role: 'button' } };
            adapter.getObject.callsArgWith(1, null, mockObject);

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.playSound', state);

            expect(adapter.setStateConditional.calledWith('ecovacs-deebot.0.control.playSound', false, true)).to.be.true;
        });
    });

    describe('Error Handling', () => {
        it('should propagate vacbot.run errors', async () => {
            adapter.vacbot.run.throws(new Error('Vacbot error'));
            mockAdapterHelper.getStateNameById.returns('clean');
            const state = { ack: false, val: true };
            let thrown = false;
            try {
                await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.clean', state);
            } catch (e) {
                thrown = true;
                expect(e.message).to.equal('Vacbot error');
            }
            expect(thrown).to.be.true;
        });

        it('should handle invalid state values', async () => {
            mockAdapterHelper.getStateNameById.returns('invalidState');
            
            const state = { ack: false, val: 'invalid' };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.invalid', state);
            expect(adapter.vacbot.run.called).to.be.false;
        });
    });

    describe('Edge Cases', () => {
        it('should handle acknowledged states', async () => {
            mockAdapterHelper.getStateNameById.returns('clean');
            
            const state = { ack: true, val: true }; // acknowledged state
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.clean', state);

            expect(adapter.vacbot.run.called).to.be.false; // Should not process acknowledged states
        });

        it('should handle null/undefined state values', async () => {
            mockAdapterHelper.getStateNameById.returns('stop');
            
            const state = { ack: false, val: null };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.stop', state);

            expect(adapter.vacbot.run.calledWith('stop')).to.be.true;
        });

        it('should handle device object errors', async () => {
            adapter.getObject.callsArgWith(1, new Error('Object not found'), null);
            mockAdapterHelper.getStateNameById.returns('playSound');

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.playSound', state);

            expect(adapter.log.info.calledWith('Run: playSound')).to.be.true;
        });
    });
});