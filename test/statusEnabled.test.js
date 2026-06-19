'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach, afterEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockAdapter, createMockCtx } = require('./mockHelper');

const mockAdapterHelper = {
    getStateNameById: sinon.stub(),
    getChannelNameById: sinon.stub(),
    getSubChannelNameById: sinon.stub(),
    getUnixTimestamp: sinon.stub().returns(1234567890),
    isValidChargeStatus: sinon.stub(),
    isValidCleanStatus: sinon.stub(),
    getDeviceStatusByStatus: sinon.stub(),
    isSingleSpotAreaValue: sinon.stub().returns(false),
    areaValueStringWithCleaningsIsValid: sinon.stub().returns(false),
    areaValueStringIsValid: sinon.stub().returns(false),
    positionValueStringIsValid: sinon.stub().returns(false)
};

const mockMapHelper = {
    getAreaValue: sinon.stub(),
    getSpotAreaName: sinon.stub(),
    getPositionValuesForExtendedArea: sinon.stub(),
    saveLastUsedCustomAreaValues: sinon.stub().resolves(),
    saveCurrentSpotAreaValues: sinon.stub().resolves(),
    saveGoToPositionValues: sinon.stub().resolves(),
    saveVirtualBoundary: sinon.stub().resolves(),
    saveVirtualBoundarySet: sinon.stub().resolves(),
    deleteVirtualBoundary: sinon.stub().resolves(),
    createVirtualBoundary: sinon.stub().resolves(),
    createVirtualBoundarySet: sinon.stub().resolves(),
    isSpotAreasChannel: sinon.stub().returns(false)
};

const adapterCommands = proxyquire('../lib/adapterCommands', {
    './adapterHelper': mockAdapterHelper,
    './mapHelper': mockMapHelper
});

const mockObjectsAdapterHelper = {
    getStateNameById: sinon.stub(),
    getUnixTimestamp: sinon.stub().returns(0)
};

const adapterObjects = proxyquire('../lib/adapterObjects', {
    './adapterHelper': mockObjectsAdapterHelper
});

const DeviceContext = require('../lib/deviceContext');

function configureMockHelperForSubPath(subPath) {
    const parts = subPath.split('.');
    const stateName = parts[parts.length - 1];
    const channelName = parts[0] || undefined;
    const subChannelName = parts.length >= 2 ? parts[parts.length - 2] : undefined;
    mockAdapterHelper.getStateNameById.returns(stateName);
    mockAdapterHelper.getChannelNameById.returns(channelName);
    mockAdapterHelper.getSubChannelNameById.returns(subChannelName);
}

// Real main.js instance, used to exercise the shipped startPolling /
// stopPolling / vacbotGetStatesInterval / onStateChange implementations instead
// of inline copies. handleStateChange is mocked so routing can be asserted.
const mainHandleStateChange = sinon.stub().resolves();

function MockEcoVacsAPI() {}
MockEcoVacsAPI.isCanvasModuleAvailable = sinon.stub().returns(false);
MockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
MockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
MockEcoVacsAPI.REALM = 'mocked-realm';

const EcovacsDeebotFactory = proxyquire.noCallThru()('../main', {
    '@iobroker/adapter-core': {
        Adapter: class {
            constructor(options) {
                Object.assign(this, options || {});
                this.namespace = 'ecovacs-deebot.0';
                this.log = {
                    info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(),
                    debug: sinon.stub(), silly: sinon.stub()
                };
                this.config = { singleDeviceMode: false };
                this.on = sinon.stub();
                this.setStateConditional = sinon.stub();
            }
        }
    },
    'ecovacs-deebot': { EcoVacsAPI: MockEcoVacsAPI, countries: { DE: { continent: 'EU' } } },
    'node-machine-id': { machineIdSync: sinon.stub().returns('test-machine-id') },
    './lib/adapterObjects': {},
    './lib/adapterCommands': { handleStateChange: mainHandleStateChange },
    './lib/constants': { MIN_POLLING_INTERVAL_MS: 10000 },
    './lib/adapterHelper': { getUnixTimestamp: sinon.stub().returns(0) },
    './lib/models': class {},
    './lib/device': class {},
    './lib/deviceContext': DeviceContext, // real DeviceContext (real intervalQueue)
    './lib/requestThrottle': class {},
    './lib/mapObjects': {},
    './lib/eventHandlers': {},
    './lib/mapHelper': {}
});

/** Build a real main instance with one real DeviceContext registered as 'test_device'. */
function createRealMain() {
    const instance = EcovacsDeebotFactory({});
    const vacbot = { run: sinon.stub() };
    const vacuum = { did: 'test_did', nick: 'TestBot', deviceName: 'TestBot' };
    const ctx = new DeviceContext(instance, 'test_device', vacbot, vacuum);
    ctx.getModel = sinon.stub().returns({
        isSupportedFeature: sinon.stub().returns(true),
        getModelType: sinon.stub().returns('950'),
        getProductName: sinon.stub().returns('Test Model')
    });
    instance.deviceContexts.set('test_device', ctx);
    return { instance, ctx };
}

describe('status.enabled - Device Deactivation Feature', () => {

    describe('adapterObjects.js - status.enabled state creation', () => {
        let adapter;
        let ctx;

        beforeEach(() => {
            adapter = createMockAdapter();
            ctx = createMockCtx({ adapter });
        });

        it('should create status.enabled as writable boolean with default true', async () => {
            await adapterObjects.createInitialObjects(adapter, ctx);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith(
                'status.enabled', 'Enable or disable device control and updates',
                'boolean', 'switch.enable', true, true, ''
            )).to.be.true;
        });

        it('should create status.enabled after status.device', async () => {
            await adapterObjects.createInitialObjects(adapter, ctx);

            const calls = ctx.adapterProxy.createObjectNotExists.getCalls();
            const statusDeviceCallIdx = calls.findIndex(
                c => c.args[0] === 'status.device'
            );
            const statusEnabledCallIdx = calls.findIndex(
                c => c.args[0] === 'status.enabled'
            );

            expect(statusDeviceCallIdx).to.be.at.least(0);
            expect(statusEnabledCallIdx).to.be.at.least(0);
            expect(statusEnabledCallIdx).to.be.greaterThan(statusDeviceCallIdx);
        });

        it('should NOT create status.enabled for aqMonitor model type', async () => {
            ctx.getPlatformType.returns('aqMonitor');

            await adapterObjects.createInitialObjects(adapter, ctx);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith(
                'status.enabled'
            )).to.be.false;
        });
    });

    describe('deviceContext.js - enabled property', () => {
        it('should default enabled to true', () => {
            const adapter = createMockAdapter();
            const vacbot = { run: sinon.stub() };
            const vacuum = { did: 'test_did' };
            const ctx = new DeviceContext(adapter, 'test_device', vacbot, vacuum);

            expect(ctx.enabled).to.be.true;
        });
    });

    describe('adapterCommands.js - handleStateChange blocking when disabled', () => {
        let adapter;
        let ctx;

        beforeEach(() => {
            adapter = createMockAdapter();
            ctx = createMockCtx({ adapter });
            ctx.connected = true;
            adapter.getState.callsFake((_id, cb) => {
                if (cb) cb(null, { val: null });
            });
        });

        it('should NOT dispatch control commands when device is disabled', async () => {
            ctx.enabled = false;
            configureMockHelperForSubPath('control.clean');
            adapter.getObject.callsFake((_id, cb) => {
                if (cb) cb(null, { common: { name: 'Start cleaning', role: 'button' } });
            });

            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', {
                val: true,
                ack: false
            });

            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.clean', false, true
            )).to.be.false;
        });

        it('should NOT dispatch charge command when device is disabled', async () => {
            ctx.enabled = false;
            configureMockHelperForSubPath('control.charge');
            adapter.getObject.callsFake((_id, cb) => {
                if (cb) cb(null, { common: { name: 'Return to dock', role: 'button' } });
            });

            await adapterCommands.handleStateChange(adapter, ctx, 'control.charge', {
                val: true,
                ack: false
            });

            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.charge', false, true
            )).to.be.false;
        });

        it('should NOT dispatch stop command when device is disabled', async () => {
            ctx.enabled = false;
            configureMockHelperForSubPath('control.stop');
            adapter.getObject.callsFake((_id, cb) => {
                if (cb) cb(null, { common: { name: 'Stop', role: 'button' } });
            });

            await adapterCommands.handleStateChange(adapter, ctx, 'control.stop', {
                val: true,
                ack: false
            });

            expect(ctx.adapterProxy.setStateConditional.calledWith(
                'control.stop', false, true
            )).to.be.false;
        });

        it('should not log Not connected message when disabled (different path)', async () => {
            ctx.enabled = false;
            ctx.connected = false;
            configureMockHelperForSubPath('control.clean');

            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', {
                val: true,
                ack: false
            });

            expect(adapter.log.info.calledWithMatch(/Not connected/)).to.be.false;
        });

        it('should allow commands when device is enabled', async () => {
            ctx.enabled = true;
            configureMockHelperForSubPath('control.clean');
            adapter.getObject.callsFake((_id, cb) => {
                if (cb) cb(null, { common: { name: 'Start cleaning', role: 'button' } });
            });

            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', {
                val: true,
                ack: false
            });

            expect(ctx.adapterProxy.setStateConditional.called).to.be.true;
        });

        it('does not dispatch anything for a disabled device (early-return guard)', async () => {
            ctx.enabled = false;
            configureMockHelperForSubPath('history.timestampOfLastStateChange');

            await adapterCommands.handleStateChange(adapter, ctx, 'history.timestampOfLastStateChange', {
                val: 1234567890,
                ack: true
            });

            // handleStateChange returns immediately when ctx.enabled is false:
            // no state write and no command dispatch should occur.
            expect(ctx.adapterProxy.setStateConditional.called).to.be.false;
            expect(adapter.getObject.called).to.be.false;
        });
    });

    describe('main.js - polling guard when disabled', () => {
        let instance;
        let ctx;

        beforeEach(() => {
            ({ instance, ctx } = createRealMain());
            ctx.connected = true;
            ctx.connectionFailed = false;
        });

        afterEach(() => {
            instance.stopPolling(ctx); // ensure no real interval leaks
        });

        it('startPolling sets an interval and stopPolling clears it', () => {
            ctx.enabled = true;

            instance.startPolling(ctx);
            expect(ctx._autoUpdateInterval).to.not.be.null;

            instance.stopPolling(ctx);
            expect(ctx._autoUpdateInterval).to.be.null;
        });

        it('vacbotGetStatesInterval skips queue work when the device is disabled', () => {
            ctx.enabled = false;
            const addStandardSpy = sinon.stub();
            const runAllSpy = sinon.stub();
            ctx.intervalQueue.addStandardGetCommands = addStandardSpy;
            ctx.intervalQueue.addAdditionalGetCommands = sinon.stub();
            ctx.intervalQueue.runAll = runAllSpy;

            instance.vacbotGetStatesInterval(ctx);

            expect(addStandardSpy.called).to.be.false;
            expect(runAllSpy.called).to.be.false;
        });

        it('vacbotGetStatesInterval runs queue work when the device is enabled', () => {
            ctx.enabled = true;
            const addStandardSpy = sinon.stub();
            const runAllSpy = sinon.stub();
            ctx.intervalQueue.addStandardGetCommands = addStandardSpy;
            ctx.intervalQueue.addAdditionalGetCommands = sinon.stub();
            ctx.intervalQueue.runAll = runAllSpy;

            instance.vacbotGetStatesInterval(ctx);

            expect(addStandardSpy.called).to.be.true;
            expect(runAllSpy.called).to.be.true;
        });

        it('the startPolling interval callback skips polling when disabled', () => {
            ctx.enabled = false;
            instance.globalMqttUnreachable = false;
            instance.vacbotGetStatesInterval = sinon.stub();

            // Capture (don't fire) the interval callback the real startPolling registers.
            const originalSetInterval = global.setInterval;
            const captured = [];
            global.setInterval = (fn, ms) => {
                const id = originalSetInterval(fn, ms);
                captured.push(fn);
                return id;
            };
            try {
                instance.startPolling(ctx);
            } finally {
                global.setInterval = originalSetInterval;
            }

            captured.forEach((fn) => fn()); // fire the registered callback
            instance.stopPolling(ctx);

            expect(instance.vacbotGetStatesInterval.called).to.be.false;
        });
    });

    describe('main.js - onStateChange routing when disabled', () => {
        let instance;
        let ctx;

        beforeEach(() => {
            mainHandleStateChange.resetHistory();
            ({ instance, ctx } = createRealMain());
            ctx.enabled = true;
        });

        it('skips control state changes when the device is disabled', async () => {
            ctx.enabled = false;

            instance.onStateChange('ecovacs-deebot.0.test_device.control.clean', { val: true, ack: false });
            await ctx._stateChangePromise; // undefined when guarded out -> resolves immediately

            expect(mainHandleStateChange.called).to.be.false;
        });

        it('allows a status.enabled change through even while the device is disabled (re-enable)', async () => {
            ctx.enabled = false;

            instance.onStateChange('ecovacs-deebot.0.test_device.status.enabled', { val: true, ack: false });
            await ctx._stateChangePromise;

            expect(ctx.enabled).to.be.true;
            expect(mainHandleStateChange.calledOnce).to.be.true;
        });

        it('stops polling when status.enabled is set to false', () => {
            ctx.enabled = true;
            instance.stopPolling = sinon.stub();

            instance.onStateChange('ecovacs-deebot.0.test_device.status.enabled', { val: false, ack: false });

            expect(ctx.enabled).to.be.false;
            expect(instance.stopPolling.calledWith(ctx)).to.be.true;
        });

        it('restores polling when status.enabled is set back to true (and device is connected)', () => {
            ctx.enabled = false;
            ctx.connected = true;
            instance.startPolling = sinon.stub();

            instance.onStateChange('ecovacs-deebot.0.test_device.status.enabled', { val: true, ack: false });

            expect(ctx.enabled).to.be.true;
            expect(instance.startPolling.calledWith(ctx)).to.be.true;
        });

        it('routes normal control commands to handleStateChange when the device is enabled', async () => {
            ctx.enabled = true;

            instance.onStateChange('ecovacs-deebot.0.test_device.control.clean', { val: true, ack: false });
            await ctx._stateChangePromise;

            expect(mainHandleStateChange.calledOnce).to.be.true;
            // routed with the device sub-path, not the full id
            expect(mainHandleStateChange.firstCall.args[2]).to.equal('control.clean');
        });
    });
});