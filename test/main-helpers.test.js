'use strict';

const { expect } = require('chai');
const { describe, it, before, beforeEach, afterEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

// Loads the REAL main.js (with mocked dependencies) and exercises the actual
// helper methods on the adapter instance. Earlier versions of this file
// redefined each method inline and tested the copy, which let the assertions
// drift away from production behaviour (e.g. isAuthError). Everything here runs
// against the shipped implementation.
describe('main.js - helper methods', () => {
    let EcovacsDeebotFactory;
    let instance;

    const mockNodeMachineId = { machineIdSync: sinon.stub().returns('test-machine-id') };

    function MockEcoVacsAPI() {}
    MockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
    MockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
    MockEcoVacsAPI.REALM = 'mocked-realm';

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

    // Deterministic timestamp / date so addToLast20Errors assertions are stable.
    const mockAdapterHelper = {
        getUnixTimestamp: sinon.stub().returns(1000),
        getCurrentDateAndTimeFormatted: sinon.stub().returns('2026-06-19 12:00:00')
    };

    const mockConstants = {
        MIN_POLLING_INTERVAL_MS: 10000,
        STARTUP_GRACE_PERIOD_MS: 30000,
        BACKOFF_SCHEDULE: [30000, 60000, 300000]
    };

    before(() => {
        EcovacsDeebotFactory = proxyquire('../main', {
            '@iobroker/adapter-core': mockAdapterCore,
            'ecovacs-deebot': mockEcovacsDeebot,
            'node-machine-id': mockNodeMachineId,
            './lib/adapterObjects': mockAdapterObjects,
            './lib/adapterCommands': { handleStateChange: sinon.stub().resolves() },
            './lib/constants': mockConstants,
            './lib/adapterHelper': mockAdapterHelper,
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
        sinon.resetHistory();
        instance = EcovacsDeebotFactory({});
    });

    /** Build a minimal DeviceContext-like object for the helper methods. */
    function makeCtx(overrides = {}) {
        return Object.assign({
            deviceId: 'dev1',
            vacuum: { nick: 'Bot', did: 'dev1' },
            connected: false,
            connectionFailed: false,
            connectedTimestamp: 0,
            _lastUptimeValue: 99,
            unreachableRetryCount: 0,
            unreachableRetryTimeout: null,
            commandFailedCount: 0,
            commandFailedResetTimeout: null,
            retrypauseTimeout: null,
            _autoUpdateInterval: null,
            getGetPosInterval: null,
            airDryingActiveInterval: null,
            last20Errors: [],
            adapterProxy: { setStateConditional: sinon.stub() },
            getModel: () => ({ getProductName: () => 'Test Model' })
        }, overrides);
    }

    describe('isAuthError', () => {
        it('returns true for genuine authentication error messages', () => {
            expect(instance.isAuthError('authentication failed')).to.be.true;
            expect(instance.isAuthError('Incorrect account or password')).to.be.true;
            expect(instance.isAuthError('error code 1010')).to.be.true;
            expect(instance.isAuthError('invalid credentials provided')).to.be.true;
            expect(instance.isAuthError('Request was unauthorized')).to.be.true;
        });

        it('returns false for non-auth error messages', () => {
            // NOTE: the real implementation matches on specific phrases, so a bare
            // "token" or "401" does NOT count as an auth error (the previous fake
            // test wrongly asserted these were true).
            expect(instance.isAuthError('invalid token')).to.be.false;
            expect(instance.isAuthError('HTTP error 401')).to.be.false;
            expect(instance.isAuthError('connection timeout')).to.be.false;
            expect(instance.isAuthError('network error')).to.be.false;
            expect(instance.isAuthError('')).to.be.false;
        });

        it('returns false for non-string input', () => {
            expect(instance.isAuthError(null)).to.be.false;
            expect(instance.isAuthError(undefined)).to.be.false;
            expect(instance.isAuthError(401)).to.be.false;
            expect(instance.isAuthError({})).to.be.false;
        });
    });

    describe('addToLast20Errors', () => {
        it('prepends the newest error and records timestamp/date/code/error', () => {
            const ctx = makeCtx();
            instance.addToLast20Errors(ctx, '404', 'Not reachable');

            expect(ctx.last20Errors).to.have.lengthOf(1);
            expect(ctx.last20Errors[0]).to.deep.equal({
                timestamp: 1000,
                date: '2026-06-19 12:00:00',
                code: '404',
                error: 'Not reachable'
            });
        });

        it('keeps the newest entry first (unshift order)', () => {
            const ctx = makeCtx();
            instance.addToLast20Errors(ctx, 'A', 'first');
            instance.addToLast20Errors(ctx, 'B', 'second');

            expect(ctx.last20Errors[0].code).to.equal('B'); // newest
            expect(ctx.last20Errors[1].code).to.equal('A');
        });

        it('caps the list at 20 entries, dropping the oldest', () => {
            const ctx = makeCtx();
            for (let i = 0; i < 25; i++) {
                instance.addToLast20Errors(ctx, String(i), 'error ' + i);
            }
            expect(ctx.last20Errors).to.have.lengthOf(20);
            expect(ctx.last20Errors[0].code).to.equal('24');  // newest kept
            expect(ctx.last20Errors[19].code).to.equal('5');  // oldest kept (0-4 dropped)
        });

        it('persists the serialized list to history.last20Errors', () => {
            const ctx = makeCtx();
            instance.addToLast20Errors(ctx, '404', 'Not reachable');

            expect(ctx.adapterProxy.setStateConditional.calledOnce).to.be.true;
            const [stateId, value, ack] = ctx.adapterProxy.setStateConditional.firstCall.args;
            expect(stateId).to.equal('history.last20Errors');
            expect(JSON.parse(value)).to.deep.equal(ctx.last20Errors);
            expect(ack).to.be.true;
        });
    });

    describe('updateDeviceConnectionState', () => {
        it('marks the device connected and resets its uptime', () => {
            const ctx = makeCtx({ connectedTimestamp: 0, _lastUptimeValue: 5 });
            instance.updateDeviceConnectionState(ctx, true);

            expect(ctx.connectedTimestamp).to.equal(1000); // from mocked getUnixTimestamp
            expect(ctx._lastUptimeValue).to.equal(0);
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.connection', true, true)).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.connectionUptime', 0, true)).to.be.true;
        });

        it('marks the device disconnected and clears its timestamp', () => {
            const ctx = makeCtx({ connectedTimestamp: 12345, _lastUptimeValue: 5 });
            instance.updateDeviceConnectionState(ctx, false);

            expect(ctx.connectedTimestamp).to.equal(0);
            expect(ctx._lastUptimeValue).to.equal(0);
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.connection', false, true)).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.connectionUptime', 0, true)).to.be.true;
        });
    });

    describe('setConnection', () => {
        it('sets the global indicator true and stamps the connect time', () => {
            instance.setStateConditional = sinon.stub();
            instance.setConnection(true);

            expect(instance.connected).to.be.true;
            expect(instance.connectedTimestamp).to.equal(1000);
            expect(instance.setStateConditional.calledWith('info.connection', true, true)).to.be.true;
            expect(instance.setStateConditional.calledWith('info.connectionUptime', 0, true)).to.be.true;
        });

        it('on false: clears per-device state, intervals and stops polling for every device', () => {
            instance.setStateConditional = sinon.stub();
            const ctx = makeCtx({
                connected: true,
                retrypauseTimeout: setTimeout(() => {}, 100000),
                _autoUpdateInterval: setInterval(() => {}, 100000),
                getGetPosInterval: setInterval(() => {}, 100000),
                airDryingActiveInterval: setInterval(() => {}, 100000)
            });
            instance.deviceContexts.set('dev1', ctx);

            instance.setConnection(false);

            expect(instance.connected).to.be.false;
            expect(instance.setStateConditional.calledWith('info.connection', false, true)).to.be.true;
            // per-device connection forced offline
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.connection', false, true)).to.be.true;
            // all the per-device timers were cleared and nulled
            expect(ctx.retrypauseTimeout).to.be.null;
            expect(ctx._autoUpdateInterval).to.be.null;
            expect(ctx.getGetPosInterval).to.be.null;
            expect(ctx.airDryingActiveInterval).to.be.null;
        });
    });

    describe('updateConnectionState', () => {
        it('global connection is true when at least one device is connected', () => {
            instance.setStateConditional = sinon.stub();
            instance.deviceContexts.set('a', makeCtx({ connected: false }));
            instance.deviceContexts.set('b', makeCtx({ connected: true }));

            instance.updateConnectionState();

            expect(instance.connected).to.be.true;
            expect(instance.setStateConditional.calledWith('info.connection', true, true)).to.be.true;
        });

        it('global connection is false when no device is connected', () => {
            instance.setStateConditional = sinon.stub();
            instance.deviceContexts.set('a', makeCtx({ connected: false }));
            instance.deviceContexts.set('b', makeCtx({ connected: false }));

            instance.updateConnectionState();

            expect(instance.connected).to.be.false;
            expect(instance.setStateConditional.calledWith('info.connection', false, true)).to.be.true;
        });
    });

    describe('scheduleUnreachableRetry and clearUnreachableRetry', () => {
        let clock;
        beforeEach(() => { clock = sinon.useFakeTimers(); });
        afterEach(() => { clock.restore(); });

        it('schedules a retry using the backoff schedule and increments the counter', () => {
            const ctx = makeCtx();
            instance._reconnectVacbotSafely = sinon.stub();

            instance.scheduleUnreachableRetry(ctx);
            expect(ctx.unreachableRetryTimeout).to.not.be.null;
            expect(ctx.unreachableRetryCount).to.equal(1);

            // First retry fires after 30s (BACKOFF_SCHEDULE[0]).
            clock.tick(29999);
            expect(instance._reconnectVacbotSafely.called).to.be.false;
            clock.tick(1);
            expect(instance._reconnectVacbotSafely.calledOnce).to.be.true;
        });

        it('uses the next backoff step on the second scheduling', () => {
            const ctx = makeCtx();
            instance._reconnectVacbotSafely = sinon.stub();

            instance.scheduleUnreachableRetry(ctx); // count 0 -> delay 30000, count becomes 1
            clock.tick(30000);                       // fire, clears timeout
            instance.scheduleUnreachableRetry(ctx); // count 1 -> delay 60000, count becomes 2

            expect(ctx.unreachableRetryCount).to.equal(2);
            clock.tick(59999);
            expect(instance._reconnectVacbotSafely.calledOnce).to.be.true; // only the first fired
            clock.tick(1);
            expect(instance._reconnectVacbotSafely.calledTwice).to.be.true;
        });

        it('caps the backoff at the last schedule entry', () => {
            const ctx = makeCtx({ unreachableRetryCount: 10 });
            instance._reconnectVacbotSafely = sinon.stub();

            instance.scheduleUnreachableRetry(ctx); // index clamped to last -> 300000
            clock.tick(299999);
            expect(instance._reconnectVacbotSafely.called).to.be.false;
            clock.tick(1);
            expect(instance._reconnectVacbotSafely.calledOnce).to.be.true;
        });

        it('does not schedule a retry when authentication has failed', () => {
            const ctx = makeCtx();
            instance.authFailed = true;

            instance.scheduleUnreachableRetry(ctx);

            expect(ctx.unreachableRetryTimeout).to.be.null;
            expect(ctx.unreachableRetryCount).to.equal(0);
        });

        it('does not schedule a retry while global MQTT is unreachable', () => {
            const ctx = makeCtx();
            instance.globalMqttUnreachable = true;

            instance.scheduleUnreachableRetry(ctx);

            expect(ctx.unreachableRetryTimeout).to.be.null;
            expect(ctx.unreachableRetryCount).to.equal(0);
        });

        it('does not schedule a second retry while one is already pending', () => {
            const ctx = makeCtx();
            instance._reconnectVacbotSafely = sinon.stub();

            instance.scheduleUnreachableRetry(ctx);
            const firstTimeout = ctx.unreachableRetryTimeout;
            instance.scheduleUnreachableRetry(ctx); // guarded out

            expect(ctx.unreachableRetryTimeout).to.equal(firstTimeout);
            expect(ctx.unreachableRetryCount).to.equal(1);
        });

        it('clearUnreachableRetry cancels the pending retry and resets failure state', () => {
            const ctx = makeCtx();
            instance._reconnectVacbotSafely = sinon.stub();
            instance.scheduleUnreachableRetry(ctx);
            ctx.commandFailedCount = 3;
            ctx.commandFailedResetTimeout = setTimeout(() => {}, 100000);

            instance.clearUnreachableRetry(ctx);

            expect(ctx.unreachableRetryTimeout).to.be.null;
            expect(ctx.unreachableRetryCount).to.equal(0);
            expect(ctx.connectionFailed).to.be.false;
            expect(ctx.commandFailedCount).to.equal(0);
            expect(ctx.commandFailedResetTimeout).to.be.null;

            // The cancelled retry must never fire.
            clock.tick(300000);
            expect(instance._reconnectVacbotSafely.called).to.be.false;
        });
    });
});
