'use strict';

const { expect } = require('chai');
const { describe, it, before, beforeEach, afterEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

// Loads the REAL main.js and exercises the actual debouncedSetError /
// resetErrorStates implementations. Previously this file redefined both methods
// inline and tested the copies, so a regression in the shipped debounce logic
// would have gone unnoticed.
describe('main.js - debounced error write', () => {
    let EcovacsDeebotFactory;
    let instance;
    let clock;

    const mockNodeMachineId = { machineIdSync: sinon.stub().returns('test-machine-id') };

    function MockEcoVacsAPI() {}
    MockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
    MockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
    MockEcoVacsAPI.REALM = 'mocked-realm';
    MockEcoVacsAPI.isCanvasModuleAvailable = sinon.stub().returns(false);

    const mockEcovacsDeebot = {
        EcoVacsAPI: MockEcoVacsAPI,
        countries: { DE: { continent: 'EU' } }
    };

    const mockAdapterCore = {
        Adapter: class {
            constructor(options) {
                Object.assign(this, options || {});
                this.name = 'ecovacs-deebot';
                this.namespace = 'ecovacs-deebot.0';
                this.log = {
                    info: sinon.stub(),
                    warn: sinon.stub(),
                    error: sinon.stub(),
                    debug: sinon.stub(),
                    silly: sinon.stub()
                };
                this.config = {};
                this.on = sinon.stub();
                this.setStateConditional = sinon.stub();
            }
        }
    };

    const mockAdapterObjects = {
        createInitialInfoObjects: sinon.stub().resolves(),
        createInitialObjects: sinon.stub().resolves(),
        createAdditionalObjects: sinon.stub().resolves(),
        createDeviceCapabilityObjects: sinon.stub().resolves(),
        createStationObjects: sinon.stub().resolves()
    };

    before(() => {
        EcovacsDeebotFactory = proxyquire('../main', {
            '@iobroker/adapter-core': mockAdapterCore,
            'ecovacs-deebot': mockEcovacsDeebot,
            'node-machine-id': mockNodeMachineId,
            './lib/adapterObjects': mockAdapterObjects,
            './lib/adapterCommands': { handleStateChange: sinon.stub().resolves() },
            './lib/constants': { MIN_POLLING_INTERVAL_MS: 10000 },
            './lib/adapterHelper': { getUnixTimestamp: sinon.stub().returns(1000) },
            './lib/models': class {},
            './lib/device': class {},
            './lib/deviceContext': class {},
            './lib/requestThrottle': class {},
            './lib/mapObjects': {},
            './lib/eventHandlers': {},
            './lib/mapHelper': {},
            'axios': { default: { get: sinon.stub() } },
            'crypto': require('crypto')
        });
    });

    beforeEach(() => {
        clock = sinon.useFakeTimers();
        sinon.resetHistory();
        instance = EcovacsDeebotFactory({});
    });

    afterEach(() => {
        clock.restore();
    });

    function makeCtx() {
        return {
            errorCode: null,
            _pendingErrorWriteTimeout: null,
            adapterProxy: { setStateConditional: sinon.stub() }
        };
    }

    describe('debouncedSetError', () => {
        it('does NOT write the error to state immediately', () => {
            const ctx = makeCtx();

            instance.debouncedSetError(ctx, '500', 'Test error message');

            expect(ctx.adapterProxy.setStateConditional.called).to.be.false;
            expect(ctx.errorCode).to.equal('500');
            expect(ctx._pendingErrorWriteTimeout).to.not.be.null;
        });

        it('writes the error to state after the 5 second debounce', () => {
            const ctx = makeCtx();

            instance.debouncedSetError(ctx, '500', 'Test error message');
            clock.tick(5000);

            expect(ctx.adapterProxy.setStateConditional.calledWith('info.errorCode', '500', true)).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.error', 'Test error message', true)).to.be.true;
            expect(ctx._pendingErrorWriteTimeout).to.be.null;
        });

        it('writes only the latest error when called repeatedly within the window', () => {
            const ctx = makeCtx();

            instance.debouncedSetError(ctx, '500', 'First error');
            instance.debouncedSetError(ctx, '501', 'Second error');
            clock.tick(5000);

            expect(ctx.adapterProxy.setStateConditional.calledWith('info.errorCode', '501', true)).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.error', 'Second error', true)).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.errorCode', '500', true)).to.be.false;
        });

        it('still writes the error when resetErrorStates is NOT called within the window', () => {
            const ctx = makeCtx();

            instance.debouncedSetError(ctx, '500', 'MQTT server is offline or not reachable');
            clock.tick(3000);
            clock.tick(2000);

            expect(ctx.adapterProxy.setStateConditional.calledWith('info.errorCode', '500', true)).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.error', 'MQTT server is offline or not reachable', true)).to.be.true;
        });
    });

    describe('resetErrorStates', () => {
        it('cancels a pending error write, so only the "NoError" state is written', () => {
            const ctx = makeCtx();

            instance.debouncedSetError(ctx, '500', 'MQTT server is offline or not reachable');
            instance.resetErrorStates(ctx);
            clock.tick(5000);

            const errorStateCalls = ctx.adapterProxy.setStateConditional.getCalls()
                .filter(c => c.args[0] === 'info.error');
            expect(errorStateCalls).to.have.lengthOf(1);
            expect(errorStateCalls[0].args[1]).to.equal('NoError: Robot is operational');
            expect(ctx._pendingErrorWriteTimeout).to.be.null;
        });

        it('immediately writes errorCode "0" and the NoError message', () => {
            const ctx = makeCtx();

            instance.resetErrorStates(ctx);

            expect(ctx.errorCode).to.equal('0');
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.errorCode', '0', true)).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.error', 'NoError: Robot is operational', true)).to.be.true;
        });
    });
});
