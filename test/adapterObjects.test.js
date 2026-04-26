'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

const { createMockAdapter, createMockCtx } = require('./mockHelper');

// Mock helper module
const mockHelper = {
    getStateNameById: sinon.stub(),
    getUnixTimestamp: sinon.stub().returns(0)
};

// Load the module with mocked dependencies
const adapterObjects = proxyquire('../lib/adapterObjects', {
    './adapterHelper': mockHelper
});

describe('adapterObjects.js', () => {
    let adapter;
    let ctx;

    beforeEach(() => {
        adapter = createMockAdapter();
        ctx = createMockCtx({ adapter });
    });

    describe('createInitialInfoObjects', () => {
        it('should create basic info objects', async () => {
            await adapterObjects.createInitialInfoObjects(adapter, ctx);

            expect(ctx.adapterProxy.createChannelNotExists.calledWith('info', 'Information')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.version')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceName')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceType')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceDiscovery')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.connection')).to.be.true;
        });

        it('should delete deprecated objects', async () => {
            await adapterObjects.createInitialInfoObjects(adapter, ctx);

            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith('info.canvasModuleIsInstalled')).to.be.true;
            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith('info.communicationProtocol')).to.be.true;
            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith('info.deviceIs950type')).to.be.true;
            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith('info.debugMessage')).to.be.true;
        });

        it('should create library info objects', async () => {
            await adapterObjects.createInitialInfoObjects(adapter, ctx);

            expect(ctx.adapterProxy.createChannelNotExists.calledWith('info.library', 'Library information')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.library.version')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.library.canvasModuleIsInstalled')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.library.communicationProtocol')).to.be.true;
        });
    });

    describe('createInitialObjects', () => {
        it('should skip creation for aqMonitor model type', async () => {
            ctx.getModelType.returns('aqMonitor');

            await adapterObjects.createInitialObjects(adapter, ctx);

            expect(ctx.adapterProxy.createObjectNotExists.called).to.be.false;
        });

        it('should create basic objects for standard model', async () => {
            await adapterObjects.createInitialObjects(adapter, ctx);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.battery')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceStatus')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.cleanstatus')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.chargestatus')).to.be.true;
            expect(ctx.adapterProxy.createChannelNotExists.calledWith('status')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('status.device')).to.be.true;
        });

        it('should create cleaning log objects when supported', async () => {
            // isSupportedFeature already returns true by default from createMockModel
            await adapterObjects.createInitialObjects(adapter, ctx);

            expect(ctx.adapterProxy.createChannelNotExists.calledWith('cleaninglog.current')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('cleaninglog.current.cleanedArea')).to.be.true;
        });

        it('should create control objects when supported', async () => {
            await adapterObjects.createInitialObjects(adapter, ctx);

            expect(ctx.adapterProxy.createChannelNotExists.calledWith('control')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('control.clean')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('control.charge')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('control.stop')).to.be.true;
        });
    });

    describe('createAdditionalObjects', () => {
        it('should create additional objects based on model capabilities', async () => {
            await adapterObjects.createAdditionalObjects(adapter, ctx);

            // Should create objects based on model capabilities
            expect(ctx.getModel.called).to.be.true;
        });
    });

    describe('Error Handling', () => {
        it('should handle adapter method failures gracefully', async () => {
            ctx.adapterProxy.createObjectNotExists.rejects(new Error('Database error'));

            try {
                await adapterObjects.createInitialInfoObjects(adapter, ctx);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.equal('Database error');
            }
        });

        it('should handle null ctx', async () => {
            try {
                await adapterObjects.createInitialInfoObjects(adapter, null);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.be.an('error');
            }
        });

        it('should handle undefined adapterProxy methods', async () => {
            const brokenCtx = createMockCtx({ adapter });
            delete brokenCtx.adapterProxy.createObjectNotExists;

            try {
                await adapterObjects.createInitialInfoObjects(adapter, brokenCtx);
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
                ctx.getModelType.returns(modelType);
                ctx.adapterProxy.createObjectNotExists.reset();

                await adapterObjects.createInitialObjects(adapter, ctx);

                if (modelType === 'aqMonitor') {
                    expect(ctx.adapterProxy.createObjectNotExists.called).to.be.false;
                } else {
                    expect(ctx.adapterProxy.createObjectNotExists.called).to.be.true;
                }
            }
        });

        it('should handle model with no supported features', async () => {
            ctx.model.isSupportedFeature.returns(false);

            await adapterObjects.createInitialObjects(adapter, ctx);

            // Should still create basic objects
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.battery')).to.be.true;
        });

        it('should handle complex nested object creation', async () => {
            await adapterObjects.createInitialObjects(adapter, ctx);

            // Check that nested channels are created
            const calls = ctx.adapterProxy.createChannelNotExists.getCalls();
            const channelNames = calls.map(call => call.args[0]);

            expect(channelNames).to.include('status');
            expect(channelNames).to.include('control');
            expect(channelNames).to.include('cleaninglog.current');
        });
    });

    describe('State Object Properties', () => {
        it('should create objects with correct properties', async () => {
            await adapterObjects.createInitialInfoObjects(adapter, ctx);

            // Check that objects are created with correct parameters
            const deviceNameCall = ctx.adapterProxy.createObjectNotExists.getCalls().find(call =>
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
            await adapterObjects.createInitialInfoObjects(adapter, ctx);

            const connectionCall = ctx.adapterProxy.createObjectNotExists.getCalls().find(call =>
                call.args[0] === 'info.connection'
            );

            expect(connectionCall).to.exist;
            expect(connectionCall.args[2]).to.equal('boolean');
            expect(connectionCall.args[3]).to.equal('indicator.connected');
            expect(connectionCall.args[4]).to.equal(false);
            expect(connectionCall.args[5]).to.equal(false);
        });

        it('should create number objects correctly', async () => {
            await adapterObjects.createInitialInfoObjects(adapter, ctx);

            const uptimeCall = ctx.adapterProxy.createObjectNotExists.getCalls().find(call =>
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
            await adapterObjects.changeObjName(adapter, ctx, 'test.object', 'New Name');

            expect(ctx.adapterProxy.getObjectAsync.calledWith('test.object')).to.be.true;
            expect(ctx.adapterProxy.extendObjectAsync.calledOnce).to.be.true;
            const obj = ctx.adapterProxy.extendObjectAsync.getCall(0).args[1];
            expect(obj.common.name).to.equal('New Name');
        });

        it('should not change name when object does not exist', async () => {
            ctx.adapterProxy.getObjectAsync.resolves(null);

            await adapterObjects.changeObjName(adapter, ctx, 'test.object', 'New Name');

            expect(ctx.adapterProxy.extendObjectAsync.called).to.be.false;
        });
    });

    describe('createControlWaterLevelIfNotExists', () => {
        it('should create water level control', async () => {
            await adapterObjects.createControlWaterLevelIfNotExists(adapter, ctx);

            expect(ctx.adapterProxy.setObjectNotExistsAsync.calledWith('control.waterLevel')).to.be.true;
        });

        it('should skip when no mopping system', async () => {
            ctx.vacbot.hasMoppingSystem.returns(false);

            await adapterObjects.createControlWaterLevelIfNotExists(adapter, ctx);

            expect(ctx.adapterProxy.setObjectNotExistsAsync.called).to.be.false;
        });

        it('should create spot area water level when supported', async () => {
            ctx.adapter.canvasModuleIsInstalled = true;
            ctx.model.isSupportedFeature.returns(true);
            ctx.vacbot.hasMoppingSystem.returns(true);

            await adapterObjects.createControlWaterLevelIfNotExists(adapter, ctx, 0, 'map.0.spotAreas.0.waterLevel', 'Spot Area Water Level');

            expect(ctx.adapterProxy.setObjectNotExistsAsync.called).to.be.true;
        });

        it('should skip spot area water level when not supported', async () => {
            ctx.adapter.canvasModuleIsInstalled = true;
            ctx.model.isSupportedFeature.returns(false);
            ctx.vacbot.hasMoppingSystem.returns(true);

            await adapterObjects.createControlWaterLevelIfNotExists(adapter, ctx, 0, 'map.0.spotAreas.0.waterLevel', 'Spot Area Water Level');

            expect(ctx.adapterProxy.setObjectNotExistsAsync.called).to.be.false;
        });

        it('should create reset button for standard water level', async () => {
            ctx.adapter.canvasModuleIsInstalled = true;
            await adapterObjects.createControlWaterLevelIfNotExists(adapter, ctx, 2, 'control.waterLevel_standard', 'Standard Water Level');

            expect(ctx.adapterProxy.createObjectNotExists.calledWith('control.waterLevel_reset')).to.be.true;
        });
    });

    describe('createControlSweepModeIfNotExists', () => {
        it('should create sweep mode control', async () => {
            await adapterObjects.createControlSweepModeIfNotExists(adapter, ctx, { 0: 'standard', 1: 'deep' });

            expect(ctx.adapterProxy.setObjectNotExistsAsync.calledWith('control.extended.moppingMode')).to.be.true;
        });

        it('should skip when no mopping system', async () => {
            ctx.vacbot.hasMoppingSystem.returns(false);

            await adapterObjects.createControlSweepModeIfNotExists(adapter, ctx, { 0: 'standard' });

            expect(ctx.adapterProxy.setObjectNotExistsAsync.called).to.be.false;
        });
    });

    describe('createControlScrubbingPatternIfNotExists', () => {
        it('should create scrubbing pattern control', async () => {
            ctx.vacbot.hasRoundMopInfo.returns(true);

            await adapterObjects.createControlScrubbingPatternIfNotExists(adapter, ctx, { 0: 'standard', 1: 'deep' });

            expect(ctx.adapterProxy.setObjectNotExistsAsync.calledWith('control.extended.scrubbingPattern')).to.be.true;
        });

        it('should skip when no mopping system', async () => {
            ctx.vacbot.hasMoppingSystem.returns(false);

            await adapterObjects.createControlScrubbingPatternIfNotExists(adapter, ctx, { 0: 'standard' });

            expect(ctx.adapterProxy.setObjectNotExistsAsync.called).to.be.false;
        });

        it('should skip when no round mop info', async () => {
            ctx.vacbot.hasRoundMopInfo.returns(false);

            await adapterObjects.createControlScrubbingPatternIfNotExists(adapter, ctx, { 0: 'standard' });

            expect(ctx.adapterProxy.setObjectNotExistsAsync.called).to.be.false;
        });
    });

    describe('createControlWashIntervalIfNotExists', () => {
        it('should create wash interval control', async () => {
            await adapterObjects.createControlWashIntervalIfNotExists(adapter, ctx);

            expect(ctx.adapterProxy.setObjectNotExistsAsync.calledWith('control.extended.washInterval')).to.be.true;
        });
    });

    describe('createControlCleanSpeedIfNotExists', () => {
        it('should create clean speed control for standard model', async () => {
            await adapterObjects.createControlCleanSpeedIfNotExists(adapter, ctx);

            expect(ctx.adapterProxy.setObjectNotExistsAsync.calledWith('control.cleanSpeed')).to.be.true;
        });

        it('should create fan speed control for airbot', async () => {
            ctx.model.isModelTypeAirbot.returns(true);

            await adapterObjects.createControlCleanSpeedIfNotExists(adapter, ctx);

            const call = ctx.adapterProxy.setObjectNotExistsAsync.getCalls().find(c => c.args[0] === 'control.cleanSpeed');
            expect(call).to.exist;
        });
    });

    describe('createAdditionalObjects branches', () => {
        it('should handle no mopping system', async () => {
            ctx.vacbot.hasMoppingSystem.returns(false);

            await adapterObjects.createAdditionalObjects(adapter, ctx);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.waterbox')).to.be.false;
        });

        it('should handle no dustbox feature', async () => {
            ctx.model.isSupportedFeature.callsFake((f) => f !== 'info.dustbox');

            await adapterObjects.createAdditionalObjects(adapter, ctx);

            // Should call deleteObjectIfExists for dustbox
            const calls = ctx.adapterProxy.deleteObjectIfExists.getCalls();
            const dustboxCall = calls.find(c => c.args[0] === 'info.dustbox');
            expect(dustboxCall).to.exist;
        });

        it('should handle no network info feature', async () => {
            ctx.model.isSupportedFeature.callsFake((f) => f !== 'info.network.ip');

            await adapterObjects.createAdditionalObjects(adapter, ctx);

            // Should call deleteObjectIfExists for network objects
            const calls = ctx.adapterProxy.deleteObjectIfExists.getCalls();
            expect(calls.some(c => c.args[0] === 'info.network.ip')).to.be.true;
        });

        it('should handle no cleaning log feature', async () => {
            ctx.model.isSupportedFeature.callsFake((f) => f !== 'cleaninglog.channel');

            await adapterObjects.createAdditionalObjects(adapter, ctx);

            // Should call deleteObjectIfExists for cleaning log objects
            const calls = ctx.adapterProxy.deleteObjectIfExists.getCalls();
            expect(calls.some(c => c.args[0] === 'cleaninglog.totalNumber')).to.be.true;
        });

        it('should handle no map feature', async () => {
            ctx.model.isSupportedFeature.callsFake((f) => f !== 'map');

            await adapterObjects.createAdditionalObjects(adapter, ctx);

            // Should not create map objects
            const calls = ctx.adapterProxy.createObjectNotExists.getCalls();
            expect(calls.some(c => c.args[0] === 'map.currentMapName')).to.be.false;
        });

        it('should handle no map lastUsedAreaValues feature', async () => {
            ctx.model.isSupportedFeature.callsFake((f) => f !== 'map.lastUsedAreaValues');

            await adapterObjects.createAdditionalObjects(adapter, ctx);

            // Should call deleteObjectIfExists
            const calls = ctx.adapterProxy.deleteObjectIfExists.getCalls();
            expect(calls.some(c => c.args[0] === 'map.currentUsedCustomAreaValues')).to.be.true;
        });
    });
});
