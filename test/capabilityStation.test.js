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

const Model = require('../lib/deebotModel');

describe('Capability and Station States', () => {
    let adapter;
    let ctx;

    beforeEach(() => {
        adapter = createMockAdapter();
        ctx = createMockCtx({ adapter });
    });

    // ============================================================
    // deebotModel.js
    // ============================================================
    describe('deebotModel.js', () => {
        describe('hasCleaningStation()', () => {
            it('should return true when vacbot has air drying', () => {
                const vacbot = {
                    deviceClass: 'test',
                    hasAirDrying: sinon.stub().returns(true),
                    hasMoppingSystem: sinon.stub().returns(true)
                };
                const model = new Model(vacbot, {});

                expect(model.hasCleaningStation()).to.be.true;
            });

            it('should return false when vacbot does not have air drying', () => {
                const vacbot = {
                    deviceClass: 'test',
                    hasAirDrying: sinon.stub().returns(false),
                    hasMoppingSystem: sinon.stub().returns(true)
                };
                const model = new Model(vacbot, {});

                expect(model.hasCleaningStation()).to.be.false;
            });
        });

        describe('hasFloorWashing()', () => {
            it('should return true when device has mopping system and cleaning station', () => {
                const vacbot = {
                    deviceClass: 'test',
                    hasAirDrying: sinon.stub().returns(true),
                    hasMoppingSystem: sinon.stub().returns(true)
                };
                const model = new Model(vacbot, {});

                expect(model.hasFloorWashing()).to.be.true;
            });

            it('should return false when device has no mopping system', () => {
                const vacbot = {
                    deviceClass: 'test',
                    hasAirDrying: sinon.stub().returns(true),
                    hasMoppingSystem: sinon.stub().returns(false)
                };
                const model = new Model(vacbot, {});

                expect(model.hasFloorWashing()).to.be.false;
            });

            it('should return false when device has no cleaning station', () => {
                const vacbot = {
                    deviceClass: 'test',
                    hasAirDrying: sinon.stub().returns(false),
                    hasMoppingSystem: sinon.stub().returns(true)
                };
                const model = new Model(vacbot, {});

                expect(model.hasFloorWashing()).to.be.false;
            });
        });

        describe('getDeviceCapabilities()', () => {
            it('should include hasCleaningStation and hasFloorWashing', () => {
                const vacbot = {
                    deviceClass: 'test',
                    getModelType: sinon.stub().returns('950'),
                    hasMappingCapabilities: sinon.stub().returns(true),
                    isSupportedFeature: sinon.stub().returns(true),
                    hasAirDrying: sinon.stub().returns(true),
                    hasMoppingSystem: sinon.stub().returns(true),
                    getDeviceProperty: sinon.stub().returns(false)
                };
                const model = new Model(vacbot, {});

                const caps = model.getDeviceCapabilities();

                expect(caps).to.have.property('hasCleaningStation', true);
                expect(caps).to.have.property('hasFloorWashing', true);
            });

            it('should return correct values for non-station device', () => {
                const vacbot = {
                    deviceClass: 'test',
                    getModelType: sinon.stub().returns('legacy'),
                    hasMappingCapabilities: sinon.stub().returns(false),
                    isSupportedFeature: sinon.stub().returns(false),
                    hasAirDrying: sinon.stub().returns(false),
                    hasMoppingSystem: sinon.stub().returns(false),
                    getDeviceProperty: sinon.stub().returns(false)
                };
                const model = new Model(vacbot, {});

                const caps = model.getDeviceCapabilities();

                expect(caps).to.have.property('hasCleaningStation', false);
                expect(caps).to.have.property('hasFloorWashing', false);
            });
        });
    });

    // ============================================================
    // adapterObjects.js - createDeviceCapabilityObjects
    // ============================================================
    describe('createDeviceCapabilityObjects', () => {
        it('should create info.deviceCapabilities channel', async () => {
            await adapterObjects.createDeviceCapabilityObjects(adapter, ctx);

            expect(ctx.adapterProxy.createChannelNotExists.calledWith('info.deviceCapabilities', 'Device capabilities')).to.be.true;
        });

        it('should create boolean states for each capability', async () => {
            await adapterObjects.createDeviceCapabilityObjects(adapter, ctx);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasMapping')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasWaterBox')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasAirDrying')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasAutoEmpty')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasSpotAreas')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasVirtualBoundaries')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasContinuousCleaning')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasDoNotDisturb')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasVoiceAssistant')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasCleaningStation')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.deviceCapabilities.hasFloorWashing')).to.be.true;
        });

        it('should create type state as string', async () => {
            await adapterObjects.createDeviceCapabilityObjects(adapter, ctx);

            const typeCall = ctx.adapterProxy.createObjectNotExists.getCalls().find(c => c.args[0] === 'info.deviceCapabilities.type');
            expect(typeCall).to.exist;
            expect(typeCall.args[2]).to.equal('string');
        });

        it('should create capability states with correct properties', async () => {
            await adapterObjects.createDeviceCapabilityObjects(adapter, ctx);

            const mappingCall = ctx.adapterProxy.createObjectNotExists.getCalls().find(c => c.args[0] === 'info.deviceCapabilities.hasMapping');
            expect(mappingCall).to.exist;
            expect(mappingCall.args[1]).to.equal('Capability: hasMapping');
            expect(mappingCall.args[2]).to.equal('boolean');
            expect(mappingCall.args[3]).to.equal('indicator');
            expect(mappingCall.args[4]).to.equal(false);
            expect(mappingCall.args[5]).to.equal(true);
        });
    });

    // ============================================================
    // adapterObjects.js - createStationObjects
    // ============================================================
    describe('createStationObjects', () => {
        it('should create cleaningStation channel when model has cleaning station', async () => {
            ctx.getModel().hasCleaningStation = sinon.stub().returns(true);

            await adapterObjects.createStationObjects(adapter, ctx);

            expect(ctx.adapterProxy.createChannelNotExists.calledWith('info.extended.cleaningStation', 'Information about the cleaning station')).to.be.true;
        });

        it('should create cleaningStation info states', async () => {
            ctx.getModel().hasCleaningStation = sinon.stub().returns(true);

            await adapterObjects.createStationObjects(adapter, ctx);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.cleaningStation.state')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.cleaningStation.name')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.cleaningStation.model')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.cleaningStation.serialNumber')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.cleaningStation.firmwareVersion')).to.be.true;
        });

        it('should create station control and status states', async () => {
            ctx.getModel().hasCleaningStation = sinon.stub().returns(true);

            await adapterObjects.createStationObjects(adapter, ctx);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith('control.extended.airDrying')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('control.extended.selfCleaning')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.selfCleaningActive')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.cleaningStationActive')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.airDryingState')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.washInterval')).to.be.true;
            expect(ctx.adapterProxy.setObjectNotExistsAsync.calledWith('control.extended.washInterval')).to.be.true;
        });

        it('should create air drying time states', async () => {
            ctx.getModel().hasCleaningStation = sinon.stub().returns(true);

            await adapterObjects.createStationObjects(adapter, ctx);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.airDryingActive')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.airDryingActiveTime')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.airDryingRemainingTime')).to.be.true;
            expect(ctx.adapterProxy.setObjectNotExistsAsync.calledWith('control.extended.airDryingDuration')).to.be.true;
        });

        it('should create air drying datetime channel and states', async () => {
            ctx.getModel().hasCleaningStation = sinon.stub().returns(true);

            await adapterObjects.createStationObjects(adapter, ctx);

            expect(ctx.adapterProxy.createChannelNotExists.calledWith('info.extended.airDryingDateTime', 'Air drying process related timestamps')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.airDryingDateTime.startTimestamp')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.airDryingDateTime.endTimestamp')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.airDryingDateTime.startDateTime')).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith('info.extended.airDryingDateTime.endDateTime')).to.be.true;
        });

        it('should delete station objects when model has no cleaning station', async () => {
            ctx.getModel().hasCleaningStation = sinon.stub().returns(false);

            await adapterObjects.createStationObjects(adapter, ctx);

            expect(ctx.adapterProxy.deleteChannelIfExists.calledWith('info.extended.cleaningStation')).to.be.true;
            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith('info.extended.cleaningStation.state')).to.be.true;
            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith('control.extended.airDrying')).to.be.true;
            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith('info.extended.airDryingActive')).to.be.true;
            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith('info.extended.airDryingDateTime.startTimestamp')).to.be.true;
        });
    });
});
