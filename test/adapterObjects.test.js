'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach, afterEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Mock helper module
const mockHelper = {
    getStateNameById: sinon.stub()
};

// Create mock adapter
const createMockAdapter = () => ({
    createChannelNotExists: sinon.stub().resolves(),
    createObjectNotExists: sinon.stub().resolves(),
    setObjectNotExists: sinon.stub().resolves(),
    deleteObjectIfExists: sinon.stub().resolves(),
    deleteChannelIfExists: sinon.stub().resolves(),
    getObjectAsync: sinon.stub().resolves({ common: { name: 'Test Object' } }),
    extendObjectAsync: sinon.stub().resolves(),
    getCurrentDateAndTimeFormatted: sinon.stub().returns('2023.01.01 12:00:00'),
    getHoursUntilDustBagEmptyReminderFlagIsSet: sinon.stub().returns(0),
    getDevice: sinon.stub().returns({
        setStatus: sinon.stub(),
        setBatteryLevel: sinon.stub(),
        setStatusByTrigger: sinon.stub(),
        isCharging: sinon.stub().returns(false),
        isCleaning: sinon.stub().returns(false),
        isPaused: sinon.stub().returns(false),
        isReturning: sinon.stub().returns(false),
        isError: sinon.stub().returns(false),
        useV2commands: sinon.stub().returns(false),
        useNativeGoToPosition: sinon.stub().returns(false)
    }),
    getModelType: sinon.stub().returns('950'),
    getModel: sinon.stub().returns({
        isSupportedFeature: sinon.stub().returns(true),
        hasMappingCapabilities: sinon.stub().returns(true),
        is950type: sinon.stub().returns(true),
        is950type_V2: sinon.stub().returns(false),
        isNot950type_V2: sinon.stub().returns(true),
        isModelTypeAirbot: sinon.stub().returns(false),
        isModelTypeT20: sinon.stub().returns(false),
        isModelTypeX2: sinon.stub().returns(false),
        getDeviceType: sinon.stub().returns('Vacuum Cleaner'),
        getDeviceCapabilities: sinon.stub().returns({ type: 'Vacuum Cleaner', hasMapping: true }),
        getCleanSpeed: sinon.stub().returns(4),
        getWaterLevel: sinon.stub().returns(4),
        getVolume: sinon.stub().returns(10),
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
        isSupportedFeature: sinon.stub().returns(true),
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
        hasMoppingSystem: sinon.stub().returns(true),
        hasSpotAreaCleaningMode: sinon.stub().returns(true),
        hasCustomAreaCleaningMode: sinon.stub().returns(true),
        hasAdvancedMode: sinon.stub().returns(true),
        isModelTypeAirbot: sinon.stub().returns(false),
        isModelTypeT20: sinon.stub().returns(false),
        isModelTypeX2: sinon.stub().returns(false),
        hasRoundMopInfo: sinon.stub().returns(false),
        vacbot: {
            getDeviceProperty: sinon.stub().returns(false)
        }
    }),
    vacbot: {
        hasMoppingSystem: sinon.stub().returns(true),
        hasSpotAreaCleaningMode: sinon.stub().returns(true),
        hasRoundMopInfo: sinon.stub().returns(false),
        hasMainBrush: sinon.stub().returns(true),
        hasUnitCareInfo: sinon.stub().returns(false)
    },
    log: {
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
    }
});

// Load the module with mocked dependencies
const adapterObjects = proxyquire('../lib/adapterObjects', {
    './adapterHelper': mockHelper
});

describe('adapterObjects.js', () => {
    let adapter;

    beforeEach(() => {
        adapter = createMockAdapter();
    });

    describe('createInitialInfoObjects', () => {
        it('should create basic info objects', async () => {
            await adapterObjects.createInitialInfoObjects(adapter);

            expect(adapter.createChannelNotExists.calledWith('info', 'Information')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.version')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.deviceName')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.deviceType')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.deviceDiscovery')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.connection')).to.be.true;
        });

        it('should delete deprecated objects', async () => {
            await adapterObjects.createInitialInfoObjects(adapter);

            expect(adapter.deleteObjectIfExists.calledWith('info.canvasModuleIsInstalled')).to.be.true;
            expect(adapter.deleteObjectIfExists.calledWith('info.communicationProtocol')).to.be.true;
            expect(adapter.deleteObjectIfExists.calledWith('info.deviceIs950type')).to.be.true;
            expect(adapter.deleteObjectIfExists.calledWith('info.debugMessage')).to.be.true;
        });

        it('should create library info objects', async () => {
            await adapterObjects.createInitialInfoObjects(adapter);

            expect(adapter.createChannelNotExists.calledWith('info.library', 'Library information')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.library.version')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.library.canvasModuleIsInstalled')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.library.communicationProtocol')).to.be.true;
        });
    });

    describe('createInitialObjects', () => {
        it('should skip creation for aqMonitor model type', async () => {
            adapter.getModelType.returns('aqMonitor');
            
            await adapterObjects.createInitialObjects(adapter);

            expect(adapter.createObjectNotExists.called).to.be.false;
        });

        it('should create basic objects for standard model', async () => {
            await adapterObjects.createInitialObjects(adapter);

            expect(adapter.createObjectNotExists.calledWith('info.battery')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.deviceStatus')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.cleanstatus')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('info.chargestatus')).to.be.true;
            expect(adapter.createChannelNotExists.calledWith('status')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('status.device')).to.be.true;
        });

        it('should create cleaning log objects when supported', async () => {
            // Set up the model to support cleaning log
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((feature) => feature === 'cleaninglog.channel'),
                hasMappingCapabilities: sinon.stub().returns(true),
                is950type: sinon.stub().returns(true),
                is950type_V2: sinon.stub().returns(false),
                isNot950type_V2: sinon.stub().returns(true),
                isModelTypeAirbot: sinon.stub().returns(false),
                isModelTypeT20: sinon.stub().returns(false),
                isModelTypeX2: sinon.stub().returns(false),
                getDeviceType: sinon.stub().returns('Vacuum Cleaner'),
                getDeviceCapabilities: sinon.stub().returns({ type: 'Vacuum Cleaner', hasMapping: true }),
                getCleanSpeed: sinon.stub().returns(4),
                getWaterLevel: sinon.stub().returns(4),
                getVolume: sinon.stub().returns(10),
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
                hasMoppingSystem: sinon.stub().returns(true),
                hasSpotAreaCleaningMode: sinon.stub().returns(true),
                hasCustomAreaCleaningMode: sinon.stub().returns(true),
                hasAdvancedMode: sinon.stub().returns(true),
                isModelTypeAirbot: sinon.stub().returns(false),
                isModelTypeT20: sinon.stub().returns(false),
                isModelTypeX2: sinon.stub().returns(false),
                hasRoundMopInfo: sinon.stub().returns(false),
                vacbot: {
                    getDeviceProperty: sinon.stub().returns(false),
                    hasMoppingSystem: sinon.stub().returns(true),
                    hasSpotAreaCleaningMode: sinon.stub().returns(true),
                    hasRoundMopInfo: sinon.stub().returns(false),
                    hasMainBrush: sinon.stub().returns(true),
                    hasUnitCareInfo: sinon.stub().returns(false)
                }
            });

            await adapterObjects.createInitialObjects(adapter);

            expect(adapter.createChannelNotExists.calledWith('cleaninglog.current')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('cleaninglog.current.cleanedArea')).to.be.true;
        });

        it('should create control objects when supported', async () => {
            await adapterObjects.createInitialObjects(adapter);

            expect(adapter.createChannelNotExists.calledWith('control')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('control.clean')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('control.charge')).to.be.true;
            expect(adapter.createObjectNotExists.calledWith('control.stop')).to.be.true;
        });
    });

    describe('createAdditionalObjects', () => {
        it('should create additional objects based on model capabilities', async () => {
            await adapterObjects.createAdditionalObjects(adapter);

            // Should create objects based on model capabilities
            expect(adapter.getModel.called).to.be.true;
        });
    });

    describe('Error Handling', () => {
        it('should handle adapter method failures gracefully', async () => {
            adapter.createObjectNotExists.rejects(new Error('Database error'));
            
            try {
                await adapterObjects.createInitialInfoObjects(adapter);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.equal('Database error');
            }
        });

        it('should handle null adapter', async () => {
            try {
                await adapterObjects.createInitialInfoObjects(null);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.an('error');
            }
        });

        it('should handle undefined adapter methods', async () => {
            const invalidAdapter = { ...adapter };
            delete invalidAdapter.createObjectNotExists;
            
            try {
                await adapterObjects.createInitialInfoObjects(invalidAdapter);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.an('error');
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle different model types', async () => {
            const modelTypes = ['950', 'airbot', 'goat', 'aqMonitor', 'yeedi', 'legacy'];
            
            for (const modelType of modelTypes) {
                adapter.getModelType.returns(modelType);
                adapter.createObjectNotExists.reset();
                
                await adapterObjects.createInitialObjects(adapter);
                
                if (modelType === 'aqMonitor') {
                    expect(adapter.createObjectNotExists.called).to.be.false;
                } else {
                    expect(adapter.createObjectNotExists.called).to.be.true;
                }
            }
        });

        it('should handle model with no supported features', async () => {
            const model = adapter.getModel();
            model.isSupportedFeature.returns(false);
            
            await adapterObjects.createInitialObjects(adapter);
            
            // Should still create basic objects
            expect(adapter.createObjectNotExists.calledWith('info.battery')).to.be.true;
        });

        it('should handle complex nested object creation', async () => {
            await adapterObjects.createInitialObjects(adapter);
            
            // Check that nested channels are created
            const calls = adapter.createChannelNotExists.getCalls();
            const channelNames = calls.map(call => call.args[0]);
            
            expect(channelNames).to.include('status');
            expect(channelNames).to.include('control');
            expect(channelNames).to.include('cleaninglog.current');
        });
    });

    describe('State Object Properties', () => {
        it('should create objects with correct properties', async () => {
            await adapterObjects.createInitialInfoObjects(adapter);
            
            // Check that objects are created with correct parameters
            const deviceNameCall = adapter.createObjectNotExists.getCalls().find(call => 
                call.args[0] === 'info.deviceName'
            );
            
            expect(deviceNameCall).to.exist;
            expect(deviceNameCall.args[1]).to.equal('Name of the device');
            expect(deviceNameCall.args[2]).to.equal('string');
            expect(deviceNameCall.args[3]).to.equal('text');
            expect(deviceNameCall.args[4]).to.equal(false);
            expect(deviceNameCall.args[5]).to.equal('');
            expect(deviceNameCall.args[6]).to.equal('');
        });

        it('should create boolean objects correctly', async () => {
            await adapterObjects.createInitialInfoObjects(adapter);
            
            const connectionCall = adapter.createObjectNotExists.getCalls().find(call => 
                call.args[0] === 'info.connection'
            );
            
            expect(connectionCall).to.exist;
            expect(connectionCall.args[2]).to.equal('boolean');
            expect(connectionCall.args[3]).to.equal('indicator.connected');
            expect(connectionCall.args[4]).to.equal(false);
            expect(connectionCall.args[5]).to.equal(false);
        });

        it('should create number objects correctly', async () => {
            await adapterObjects.createInitialInfoObjects(adapter);
            
            const uptimeCall = adapter.createObjectNotExists.getCalls().find(call => 
                call.args[0] === 'info.connectionUptime'
            );
            
            expect(uptimeCall).to.exist;
            expect(uptimeCall.args[2]).to.equal('number');
            expect(uptimeCall.args[3]).to.equal('value');
            expect(uptimeCall.args[5]).to.equal(0);
        });
    });

    describe('changeObjName', () => {
        it('should change object name when object exists', async () => {
            await adapterObjects.changeObjName(adapter, 'test.object', 'New Name');
            
            expect(adapter.getObjectAsync.calledWith('test.object')).to.be.true;
            expect(adapter.extendObjectAsync.calledOnce).to.be.true;
            const obj = adapter.extendObjectAsync.getCall(0).args[1];
            expect(obj.common.name).to.equal('New Name');
        });

        it('should not change name when object does not exist', async () => {
            adapter.getObjectAsync.resolves(null);
            
            await adapterObjects.changeObjName(adapter, 'test.object', 'New Name');
            
            expect(adapter.extendObjectAsync.called).to.be.false;
        });
    });

    describe('createControlWaterLevelIfNotExists', () => {
        it('should create water level control', async () => {
            await adapterObjects.createControlWaterLevelIfNotExists(adapter);
            
            expect(adapter.setObjectNotExists.calledWith('control.waterLevel')).to.be.true;
        });

        it('should skip when no mopping system', async () => {
            adapter.vacbot.hasMoppingSystem.returns(false);
            
            await adapterObjects.createControlWaterLevelIfNotExists(adapter);
            
            expect(adapter.setObjectNotExists.called).to.be.false;
        });

        it('should create spot area water level when supported', async () => {
            adapter.canvasModuleIsInstalled = true;
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().returns(true),
                hasMoppingSystem: sinon.stub().returns(true)
            });
            adapter.vacbot.hasMoppingSystem.returns(true);
            
            await adapterObjects.createControlWaterLevelIfNotExists(adapter, 0, 'map.0.spotAreas.0.waterLevel', 'Spot Area Water Level');
            
            expect(adapter.setObjectNotExists.called).to.be.true;
        });

        it('should skip spot area water level when not supported', async () => {
            adapter.canvasModuleIsInstalled = true;
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().returns(false),
                hasMoppingSystem: sinon.stub().returns(true)
            });
            adapter.vacbot.hasMoppingSystem.returns(true);
            
            await adapterObjects.createControlWaterLevelIfNotExists(adapter, 0, 'map.0.spotAreas.0.waterLevel', 'Spot Area Water Level');
            
            expect(adapter.setObjectNotExists.called).to.be.false;
        });

        it('should create reset button for standard water level', async () => {
            adapter.canvasModuleIsInstalled = true;
            await adapterObjects.createControlWaterLevelIfNotExists(adapter, 2, 'control.waterLevel_standard', 'Standard Water Level');
            
            expect(adapter.createObjectNotExists.calledWith('control.waterLevel_reset')).to.be.true;
        });
    });

    describe('createControlSweepModeIfNotExists', () => {
        it('should create sweep mode control', async () => {
            await adapterObjects.createControlSweepModeIfNotExists(adapter, { 0: 'standard', 1: 'deep' });
            
            expect(adapter.setObjectNotExists.calledWith('control.extended.moppingMode')).to.be.true;
        });

        it('should skip when no mopping system', async () => {
            adapter.vacbot.hasMoppingSystem.returns(false);
            
            await adapterObjects.createControlSweepModeIfNotExists(adapter, { 0: 'standard' });
            
            expect(adapter.setObjectNotExists.called).to.be.false;
        });
    });

    describe('createControlScrubbingPatternIfNotExists', () => {
        it('should create scrubbing pattern control', async () => {
            adapter.vacbot.hasRoundMopInfo.returns(true);
            
            await adapterObjects.createControlScrubbingPatternIfNotExists(adapter, { 0: 'standard', 1: 'deep' });
            
            expect(adapter.setObjectNotExists.calledWith('control.extended.scrubbingPattern')).to.be.true;
        });

        it('should skip when no mopping system', async () => {
            adapter.vacbot.hasMoppingSystem.returns(false);
            
            await adapterObjects.createControlScrubbingPatternIfNotExists(adapter, { 0: 'standard' });
            
            expect(adapter.setObjectNotExists.called).to.be.false;
        });

        it('should skip when no round mop info', async () => {
            adapter.vacbot.hasRoundMopInfo.returns(false);
            
            await adapterObjects.createControlScrubbingPatternIfNotExists(adapter, { 0: 'standard' });
            
            expect(adapter.setObjectNotExists.called).to.be.false;
        });
    });

    describe('createControlWashIntervalIfNotExists', () => {
        it('should create wash interval control', async () => {
            await adapterObjects.createControlWashIntervalIfNotExists(adapter);
            
            expect(adapter.setObjectNotExists.calledWith('control.extended.washInterval')).to.be.true;
        });
    });

    describe('createControlCleanSpeedIfNotExists', () => {
        it('should create clean speed control for standard model', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().returns(true),
                isModelTypeAirbot: sinon.stub().returns(false),
                isModelTypeT20: sinon.stub().returns(false),
                isModelTypeX2: sinon.stub().returns(false),
                hasMoppingSystem: sinon.stub().returns(true)
            });
            
            await adapterObjects.createControlCleanSpeedIfNotExists(adapter);
            
            expect(adapter.setObjectNotExists.calledWith('control.cleanSpeed')).to.be.true;
        });

        it('should create fan speed control for airbot', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().returns(true),
                isModelTypeAirbot: sinon.stub().returns(true),
                isModelTypeT20: sinon.stub().returns(false),
                isModelTypeX2: sinon.stub().returns(false),
                hasMoppingSystem: sinon.stub().returns(true)
            });
            
            await adapterObjects.createControlCleanSpeedIfNotExists(adapter);
            
            const call = adapter.setObjectNotExists.getCalls().find(c => c.args[0] === 'control.cleanSpeed');
            expect(call).to.exist;
        });
    });

    describe('createAdditionalObjects branches', () => {
        it('should handle no mopping system', async () => {
            adapter.vacbot.hasMoppingSystem.returns(false);
            
            await adapterObjects.createAdditionalObjects(adapter);
            
            expect(adapter.createObjectNotExists.calledWith('info.waterbox')).to.be.false;
        });

        it('should handle no dustbox feature', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((f) => f !== 'info.dustbox')
            });
            
            await adapterObjects.createAdditionalObjects(adapter);
            
            // Should call deleteObjectIfExists for dustbox
            const calls = adapter.deleteObjectIfExists.getCalls();
            const dustboxCall = calls.find(c => c.args[0] === 'info.dustbox');
            expect(dustboxCall).to.exist;
        });

        it('should handle no network info feature', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((f) => f !== 'info.network.ip')
            });
            
            await adapterObjects.createAdditionalObjects(adapter);
            
            // Should call deleteObjectIfExists for network objects
            const calls = adapter.deleteObjectIfExists.getCalls();
            expect(calls.some(c => c.args[0] === 'info.network.ip')).to.be.true;
        });

        it('should handle no cleaning log feature', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((f) => f !== 'cleaninglog.channel')
            });
            
            await adapterObjects.createAdditionalObjects(adapter);
            
            // Should call deleteObjectIfExists for cleaning log objects
            const calls = adapter.deleteObjectIfExists.getCalls();
            expect(calls.some(c => c.args[0] === 'cleaninglog.totalNumber')).to.be.true;
        });

        it('should handle no map feature', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((f) => f !== 'map')
            });
            
            await adapterObjects.createAdditionalObjects(adapter);
            
            // Should not create map objects
            const calls = adapter.createObjectNotExists.getCalls();
            expect(calls.some(c => c.args[0] === 'map.currentMapName')).to.be.false;
        });

        it('should handle no map lastUsedAreaValues feature', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((f) => f !== 'map.lastUsedAreaValues')
            });
            
            await adapterObjects.createAdditionalObjects(adapter);
            
            // Should call deleteObjectIfExists
            const calls = adapter.deleteObjectIfExists.getCalls();
            expect(calls.some(c => c.args[0] === 'map.currentUsedCustomAreaValues')).to.be.true;
        });
    });
});