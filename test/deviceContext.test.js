'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');

const DeviceContext = require('../lib/deviceContext');
const Queue = require('../lib/adapterQueue');

describe('deviceContext.js - DeviceContext class', () => {
    let adapter;

    beforeEach(() => {
        adapter = {
            namespace: 'ecovacs-deebot.0',
            log: {
                silly: sinon.stub(),
                debug: sinon.stub(),
                info: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            },
            getStateAsync: sinon.stub().resolves({ val: null }),
            setStateConditional: sinon.stub(),
            setStateConditionalAsync: sinon.stub().resolves(),
            getState: sinon.stub().callsFake((_id, cb) => { if (cb) cb(null, { val: null }); }),
            setState: sinon.stub(),
            getObject: sinon.stub().callsFake((_id, cb) => { if (cb) cb(null, { common: { name: 'Test' } }); }),
            setObjectNotExists: sinon.stub().callsFake((_id, _obj, cb) => { if (cb) cb(null); }),
            getObjectAsync: sinon.stub().resolves({ common: { name: 'Test' } }),
            setObjectNotExistsAsync: sinon.stub().resolves(),
            extendObjectAsync: sinon.stub().resolves(),
            createChannelNotExists: sinon.stub().resolves(),
            createObjectNotExists: sinon.stub().resolves(),
            objectExists: sinon.stub().resolves(false),
            deleteObjectIfExists: sinon.stub().resolves(),
            deleteChannelIfExists: sinon.stub().resolves(),
            getChannelsOfAsync: sinon.stub().resolves([]),
            extendObject: sinon.stub().resolves(),
            getCurrentDateAndTimeFormatted: sinon.stub().returns('2023.01.01 12:00:00'),
            getHoursUntilDustBagEmptyReminderFlagIsSet: sinon.stub().returns(0),
            getConfigValue: sinon.stub().returns(true),
            reconnect: sinon.stub()
        };
    });

    function createCtx(extra) {
        const vacbot = { run: sinon.stub(), on: sinon.stub() };
        const vacuum = { did: 'test_did', nick: 'TestBot', name: 'TestBot' };
        const ctx = new DeviceContext(adapter, 'test_device', vacbot, vacuum, extra);
        return ctx;
    }

    describe('constructor', () => {
        it('should initialize with correct references', () => {
            const ctx = createCtx();
            expect(ctx.adapter).to.equal(adapter);
            expect(ctx.deviceId).to.equal('test_device');
            expect(ctx.did).to.equal('test_did');
            expect(ctx.model).to.be.null;
            expect(ctx.device).to.be.null;
        });

        it('should create queues with correct parameters', () => {
            const ctx = createCtx();
            expect(ctx.commandQueue).to.be.instanceOf(Queue);
            expect(ctx.commandQueue.name).to.equal('commandQueue');
            expect(ctx.commandQueue.timeoutValue).to.equal(500);
            expect(ctx.commandQueue.duplicateCheck).to.be.true;

            expect(ctx.intervalQueue).to.be.instanceOf(Queue);
            expect(ctx.intervalQueue.name).to.equal('intervalQueue');
            expect(ctx.intervalQueue.timeoutValue).to.equal(1000);
            expect(ctx.intervalQueue.duplicateCheck).to.be.true;

            expect(ctx.cleaningQueue).to.be.instanceOf(Queue);
            expect(ctx.cleaningQueue.name).to.equal('cleaningQueue');
            expect(ctx.cleaningQueue.timeoutValue).to.equal(0);
            expect(ctx.cleaningQueue.duplicateCheck).to.be.false;
        });

        it('should initialize in-memory caches', () => {
            const ctx = createCtx();
            expect(ctx._stateValues).to.be.instanceOf(Map);
            expect(ctx._createdObjects).to.be.instanceOf(Set);
            expect(ctx._createdChannels).to.be.instanceOf(Set);
        });

        it('should set default connection state', () => {
            const ctx = createCtx();
            expect(ctx.connected).to.be.false;
            expect(ctx.connectionFailed).to.be.false;
            expect(ctx.connectedTimestamp).to.equal(0);
        });

        it('should set default device status properties', () => {
            const ctx = createCtx();
            expect(ctx.chargestatus).to.equal('');
            expect(ctx.cleanstatus).to.equal('');
            expect(ctx.lastChargeStatus).to.equal('');
            expect(ctx.waterLevel).to.be.null;
            expect(ctx.moppingType).to.be.null;
            expect(ctx.cleanSpeed).to.be.null;
            expect(ctx.errorCode).to.be.null;
        });

        it('should set default map/position properties', () => {
            const ctx = createCtx();
            expect(ctx.currentMapID).to.equal('');
            expect(ctx.deebotPositionIsInvalid).to.be.true;
            expect(ctx.currentCleanedArea).to.equal(0);
            expect(ctx.currentCleanedSeconds).to.equal(0);
            expect(ctx.currentSpotAreaID).to.equal('unknown');
            expect(ctx.currentSpotAreaName).to.equal('unknown');
            expect(ctx.relocationState).to.equal('unknown');
            expect(ctx.deebotPosition).to.be.null;
            expect(ctx.chargePosition).to.be.null;
        });

        it('should set default behavior flags', () => {
            const ctx = createCtx();
            expect(ctx.pauseBeforeDockingChargingStation).to.be.false;
            expect(ctx.resetCleanSpeedToStandardOnReturn).to.be.false;
            expect(ctx.waterboxInstalled).to.be.null;
            expect(ctx.customAreaCleanings).to.equal(1);
            expect(ctx.spotAreaCleanings).to.equal(1);
            expect(ctx.cleaningLogAcknowledged).to.be.false;
        });

        it('should set default error tracking properties', () => {
            const ctx = createCtx();
            expect(ctx.last20Errors).to.deep.equal([]);
            expect(ctx.retries).to.equal(0);
            expect(ctx.commandFailedCount).to.equal(0);
            expect(ctx.commandFailedResetTimeout).to.be.null;
            expect(ctx._pendingErrorWriteTimeout).to.be.null;
        });

        it('should set default cleaning cloth reminder', () => {
            const ctx = createCtx();
            expect(ctx.cleaningClothReminder).to.deep.equal({
                enabled: false,
                period: 30
            });
        });

        it('should set default spot area data', () => {
            const ctx = createCtx();
            expect(ctx.currentSpotAreaData).to.deep.equal({
                spotAreaID: 'unknown',
                lastTimeEnteredTimestamp: 0
            });
        });

        it('should accept optional throttle and pass to queues', () => {
            const throttle = { canProceed: sinon.stub().returns(true) };
            const vacbot = { run: sinon.stub(), on: sinon.stub() };
            const ctx = new DeviceContext(adapter, 'throttle_dev', vacbot, { did: 'td' }, throttle);
            expect(ctx.commandQueue.throttle).to.equal(throttle);
            expect(ctx.intervalQueue.throttle).to.equal(throttle);
        });
    });

    describe('adapterProxy', () => {
        it('should prefix state IDs with deviceId for setStateConditional', () => {
            const ctx = createCtx();
            ctx.adapterProxy.setStateConditional('info.battery', 85, true);
            expect(adapter.setStateConditional.calledOnce).to.be.true;
            expect(adapter.setStateConditional.firstCall.args[0]).to.equal('test_device.info.battery');
        });

        it('should not double-prefix IDs that already start with deviceId', () => {
            const ctx = createCtx();
            ctx.adapterProxy.setStateConditional('test_device.info.battery', 85, true);
            expect(adapter.setStateConditional.firstCall.args[0]).to.equal('test_device.info.battery');
        });

        it('should expose only the prefixed helper methods (no passthrough)', () => {
            const ctx = createCtx();
            // adapterProxy is an explicit wrapper, not a Proxy over the adapter,
            // so non-helper members like `log` are intentionally not exposed.
            expect(ctx.adapterProxy.setStateConditional).to.be.a('function');
            expect(ctx.adapterProxy.log).to.be.undefined;
        });

        it('should prefix for createObjectNotExists', () => {
            const ctx = createCtx();
            ctx.adapterProxy.createObjectNotExists('consumable.filter', 'Filter', 'number', 'level', false, 100, '%');
            expect(adapter.createObjectNotExists.firstCall.args[0]).to.equal('test_device.consumable.filter');
        });

        it('should prefix for getStateAsync', async () => {
            const ctx = createCtx();
            await ctx.adapterProxy.getStateAsync('info.battery');
            expect(adapter.getStateAsync.firstCall.args[0]).to.equal('test_device.info.battery');
        });

        it('should not prefix when first argument is not a string', () => {
            const ctx = createCtx();
            ctx.adapterProxy.setStateConditional(123, 'value', true);
            expect(adapter.setStateConditional.firstCall.args[0]).to.equal(123);
        });

        it('should prefix for setStateConditionalAsync', async () => {
            const ctx = createCtx();
            await ctx.adapterProxy.setStateConditionalAsync('info.test', 'value', true);
            expect(adapter.setStateConditionalAsync.firstCall.args[0]).to.equal('test_device.info.test');
        });

        it('should prefix for getObjectAsync and extendObjectAsync', async () => {
            const ctx = createCtx();
            await ctx.adapterProxy.getObjectAsync('info.test');
            expect(adapter.getObjectAsync.firstCall.args[0]).to.equal('test_device.info.test');
            await ctx.adapterProxy.extendObjectAsync('info.test', { common: {} });
            expect(adapter.extendObjectAsync.firstCall.args[0]).to.equal('test_device.info.test');
        });
    });

    describe('statePath()', () => {
        it('should return deviceId prefixed path', () => {
            const ctx = createCtx();
            expect(ctx.statePath('info.battery')).to.equal('test_device.info.battery');
        });
    });

    describe('getModel() / getDevice() / getPlatformType() / getModelType()', () => {
        it('getModel should return null when model is not set', () => {
            const ctx = createCtx();
            expect(ctx.getModel()).to.be.null;
        });

        it('getModel should return model after it is set', () => {
            const ctx = createCtx();
            const model = { getPlatformType: sinon.stub().returns('950'), getModelType: sinon.stub().returns('950') };
            ctx.model = model;
            expect(ctx.getModel()).to.equal(model);
        });

        it('getDevice should return null when device is not set', () => {
            const ctx = createCtx();
            expect(ctx.getDevice()).to.be.null;
        });

        it('getDevice should return device after it is set', () => {
            const ctx = createCtx();
            const device = { status: 'idle' };
            ctx.device = device;
            expect(ctx.getDevice()).to.equal(device);
        });

        it('getPlatformType should return empty string when model is null', () => {
            const ctx = createCtx();
            expect(ctx.getPlatformType()).to.equal('');
        });

        it('getPlatformType should return platform type when model is set', () => {
            const ctx = createCtx();
            const model = { getPlatformType: sinon.stub().returns('deebot') };
            ctx.model = model;
            expect(ctx.getPlatformType()).to.equal('deebot');
        });

        it('getSmartType should return empty string when model is null', () => {
            const ctx = createCtx();
            expect(ctx.getSmartType()).to.equal('');
        });

        it('getSmartType should return smart type when model is set', () => {
            const ctx = createCtx();
            const model = { getSmartType: sinon.stub().returns('deebot') };
            ctx.model = model;
            expect(ctx.getSmartType()).to.equal('deebot');
        });

        it('getModelType (deprecated) should delegate to getPlatformType', () => {
            const ctx = createCtx();
            const model = { getPlatformType: sinon.stub().returns('deebot') };
            ctx.model = model;
            expect(ctx.getModelType()).to.equal('deebot');
        });
    });
});
