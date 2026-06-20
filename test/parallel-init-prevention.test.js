'use strict';

/**
 * Tests that protect against the "parallel instantiations causing high load"
 * problem observed after several days of uptime, where a single device's
 * heavy initialization pipeline could run repeatedly, flooding the device with
 * command bursts and the log with "successfully initialized" lines.
 *
 * Since ecovacs-deebot alpha.21 the library closes leaked MQTT clients on
 * reconnect and exposes a one-shot 'initialized' event (alongside the
 * edge-triggered 'ready'), so the adapter drives heavy init from 'initialized'
 * and no longer needs its own debounce / idempotency guards:
 *
 *   A. Heavy init via 'initialized' - the one-shot event runs heavy init once;
 *                                     'ready' is the light reconnect path only
 *   B. Disconnect-before-reconnect  - retry paths must not leak MQTT clients
 *   D. Tracked init-get-states      - the post-init setTimeout cannot accumulate
 */

const { expect } = require('chai');
const { describe, it, beforeEach, afterEach } = require('mocha');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');

const C = require('../lib/constants');

// ---------------------------------------------------------------------------
// Shared fixtures for the eventHandlers tests (Fix A, C, D)
// ---------------------------------------------------------------------------

function buildEventHandlerFixtures() {
    const main = {
        log: {
            info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(),
            debug: sinon.stub(), silly: sinon.stub()
        },
        version: '2.0.0',
        updateDeviceConnectionState: sinon.stub(),
        clearUnreachableRetry: sinon.stub(),
        updateConnectionState: sinon.stub(),
        setConnection: sinon.stub(),
        setInitialStateValues: sinon.stub().resolves(),
        vacbotInitialGetStates: sinon.stub(),
        handleDeviceDataReceived: sinon.stub()
    };

    const ctx = {
        deviceId: 'test_device',
        connected: false,
        connectionFailed: false,
        unreachableRetryCount: 0,
        unreachableWarningSent: false,
        retries: 0,
        api: { getVersion: sinon.stub().returns('0.9.6-beta.12') },
        getModel: sinon.stub().returns({
            getDeviceClass: sinon.stub().returns('p1jij8'),
            getProductName: sinon.stub().returns('Test Bot'),
            getDeviceCategory: sinon.stub().returns('Vacuum Cleaner'),
            getProtocol: sinon.stub().returns('MQTT'),
            is950type: sinon.stub().returns(true),
            getDeviceCapabilities: sinon.stub().returns({
                type: 'Vacuum Cleaner', hasMapping: false, hasWaterBox: false,
                hasAirDrying: false, hasAutoEmpty: false, hasSpotAreas: false,
                hasVirtualBoundaries: false, hasContinuousCleaning: false,
                hasDoNotDisturb: false, hasVoiceAssistant: false,
                hasCleaningStation: false, hasFloorWashing: false
            }),
            getProductImageURL: sinon.stub().returns(''),
            getSmartType: sinon.stub().returns('T20')
        }),
        getModelType: sinon.stub().returns('T20'),
        getPlatformType: sinon.stub().returns('T20'),
        getSmartType: sinon.stub().returns('T20'),
        adapterProxy: {
            setStateConditional: sinon.stub(),
            createObjectNotExists: sinon.stub().resolves()
        }
    };

    // Capture the listeners that registerReadyEvent registers so we can emit
    // 'ready' (light path) and 'initialized' (one-shot heavy init) on demand.
    let readyHandler = null;
    let initializedHandler = null;
    const vacbot = {
        on: sinon.stub().callsFake((eventName, handler) => {
            if (eventName === 'ready') readyHandler = handler;
            if (eventName === 'initialized') initializedHandler = handler;
        })
    };

    const vacuum = { nick: 'TestBot', did: 'test-did' };

    const adapterObjects = {
        createAdditionalObjects: sinon.stub().resolves(),
        createDeviceCapabilityObjects: sinon.stub().resolves(),
        createStationObjects: sinon.stub().resolves()
    };

    const eventHandlers = proxyquire('../lib/eventHandlers', {
        './adapterObjects': adapterObjects
    });

    return {
        main, ctx, vacbot, vacuum, adapterObjects, eventHandlers,
        emitReady: () => readyHandler && readyHandler(),
        emitInitialized: () => initializedHandler && initializedHandler()
    };
}

describe('parallel-init-prevention.test.js', () => {

    // -----------------------------------------------------------------------
    // Fix A: heavy init runs once, driven by the one-shot 'initialized' event
    // -----------------------------------------------------------------------
    describe("Fix A - heavy init is driven by the one-shot 'initialized' event", () => {
        let f;
        let clock;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            f = buildEventHandlerFixtures();
            f.eventHandlers.registerReadyEvent(f.main, f.vacbot, f.ctx, f.vacuum);
        });

        afterEach(() => {
            clock.restore();
        });

        it('runs the heavy init pipeline on the initialized event', async () => {
            f.emitInitialized();
            await Promise.resolve(); await Promise.resolve();
            await clock.tickAsync(0); await clock.tickAsync(0);

            expect(f.adapterObjects.createAdditionalObjects.callCount,
                'createAdditionalObjects should run once').to.equal(1);
            expect(f.adapterObjects.createDeviceCapabilityObjects.callCount,
                'createDeviceCapabilityObjects should run once').to.equal(1);
            expect(f.adapterObjects.createStationObjects.callCount,
                'createStationObjects should run once').to.equal(1);
            expect(f.main.setInitialStateValues.callCount,
                'setInitialStateValues should run once').to.equal(1);
        });

        it('never runs the heavy init pipeline from a ready event', async () => {
            // 'ready' is the light path only; the library emits 'initialized'
            // exactly once for the heavy work, so spurious ready emissions
            // (auto-reconnects, token refreshes) must not rebuild anything.
            for (let i = 0; i < 5; i++) {
                await clock.tickAsync(30000);
                f.emitReady();
                await Promise.resolve(); await Promise.resolve();
            }
            await clock.tickAsync(0);

            expect(f.adapterObjects.createAdditionalObjects.callCount,
                'createAdditionalObjects must not run from ready').to.equal(0);
            expect(f.main.setInitialStateValues.callCount,
                'setInitialStateValues must not run from ready').to.equal(0);
        });

        it('logs "successfully initialized", "Library version" and "Product name" once', async () => {
            f.emitInitialized();
            await Promise.resolve(); await Promise.resolve();
            await clock.tickAsync(0);

            // Further ready emissions (light path) must not re-log init lines.
            for (let i = 0; i < 5; i++) {
                await clock.tickAsync(30000);
                f.emitReady();
                await Promise.resolve(); await Promise.resolve();
            }

            const initLogCalls = f.main.log.info.getCalls()
                .filter(c => /successfully initialized/.test(String(c.args[0] || '')));
            expect(initLogCalls.length, 'expected exactly one "successfully initialized" log').to.equal(1);

            const libLogCalls = f.main.log.info.getCalls()
                .filter(c => /^Library version:/.test(String(c.args[0] || '')));
            expect(libLogCalls.length, 'expected exactly one "Library version" log').to.equal(1);

            const productLogCalls = f.main.log.info.getCalls()
                .filter(c => /^Product name:/.test(String(c.args[0] || '')));
            expect(productLogCalls.length, 'expected exactly one "Product name" log').to.equal(1);
        });

        it('restores connection state on every ready emission (light path)', async () => {
            f.emitInitialized();
            await Promise.resolve(); await Promise.resolve();
            await clock.tickAsync(0);

            // Simulate transient disconnect: ctx.connected goes false.
            f.ctx.connected = false;
            f.main.updateDeviceConnectionState.resetHistory();
            f.main.clearUnreachableRetry.resetHistory();

            // A ready arrives on reconnect - should re-mark the device connected
            // without redoing any heavy init.
            f.emitReady();
            await Promise.resolve(); await Promise.resolve();
            await clock.tickAsync(0);

            expect(f.ctx.connected, 'ctx should be marked connected').to.equal(true);
            expect(f.main.updateDeviceConnectionState.calledWith(f.ctx, true),
                'updateDeviceConnectionState(true) should be called').to.equal(true);
            expect(f.main.clearUnreachableRetry.calledWith(f.ctx),
                'clearUnreachableRetry should be called').to.equal(true);

            // ... but the heavy pieces still ran only once.
            expect(f.adapterObjects.createAdditionalObjects.callCount).to.equal(1);
            expect(f.main.setInitialStateValues.callCount).to.equal(1);
        });
    });

    // -----------------------------------------------------------------------
    // Fix D: tracked initial-get-states timeout
    // -----------------------------------------------------------------------
    describe('Fix D - vacbotInitialGetStates timer is tracked and cannot accumulate', () => {
        let f;
        let clock;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            f = buildEventHandlerFixtures();
            f.eventHandlers.registerReadyEvent(f.main, f.vacbot, f.ctx, f.vacuum);
        });

        afterEach(() => {
            clock.restore();
        });

        it('stores the pending setTimeout id on the ctx so it can be cleared on unload', async () => {
            f.emitInitialized();
            await Promise.resolve(); await Promise.resolve();
            await clock.tickAsync(0);

            expect(f.ctx._initialGetStatesTimeout,
                'expected ctx._initialGetStatesTimeout to be set').to.exist;
        });

        it('calls vacbotInitialGetStates once, and ready emissions do not schedule extra runs', async () => {
            f.emitInitialized();
            await Promise.resolve(); await Promise.resolve();

            // Spurious ready events (light path) must not schedule the timer.
            for (let i = 0; i < 5; i++) {
                await clock.tickAsync(1000);
                f.emitReady();
                await Promise.resolve(); await Promise.resolve();
            }

            // Now let the post-init timer fire.
            await clock.tickAsync(C.INITIAL_GET_COMMANDS_DELAY_MS + 100);

            expect(f.main.vacbotInitialGetStates.callCount,
                'vacbotInitialGetStates should fire only once').to.equal(1);
        });
    });

    // -----------------------------------------------------------------------
    // Fix B: main.js retry paths reconnect via connect() (library self-cleans)
    // -----------------------------------------------------------------------
    describe('Fix B - retry paths in main.js reconnect via connect()', () => {
        let clock;
        let instance;

        const mockEcoVacsAPI = sinon.stub();
        mockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
        mockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
        mockEcoVacsAPI.REALM = 'mocked-realm';

        const mockEcovacsDeebot = {
            EcoVacsAPI: mockEcoVacsAPI,
            countries: { DE: { continent: 'EU' } }
        };

        const mockAdapterCore = {
            Adapter: class {
                constructor(options) {
                    Object.assign(this, options || {});
                    this.name = 'ecovacs-deebot';
                    this.namespace = 'ecovacs-deebot.0';
                    this.log = {
                        info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(),
                        debug: sinon.stub(), silly: sinon.stub()
                    };
                    this.config = {
                        pollingInterval: 120000, countrycode: 'DE',
                        email: 'a@b', password: 'pw', singleDeviceMode: false
                    };
                    this.password = 'pw';
                    this.deviceContexts = new Map();
                    this.connected = false;
                    this.authFailed = false;
                    this._connecting = false;
                    this._lastConnectTime = 0;
                    this._lastReconnectTime = 0;
                    this._startupTime = 0;
                    this.globalMqttUnreachable = false;
                    this.globalMqttUnreachableTimeout = null;
                    this.globalMqttUnreachableCount = 0;
                    this.globalMqttOfflineWarningSent = false;

                    this.on = sinon.stub();
                    this.setStateConditional = sinon.stub();
                    this.setStateConditionalAsync = sinon.stub().resolves();
                    this.error = sinon.stub();
                    this.setConnection = sinon.stub();
                    this.updateConnectionState = sinon.stub();
                    this.updateDeviceConnectionState = sinon.stub();
                    this.startPolling = sinon.stub();
                    this.stopPolling = sinon.stub();
                    this.clearGoToPosition = sinon.stub();
                    this.isAuthError = sinon.stub().returns(false);
                }
            }
        };

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            sinon.resetHistory();

            const EcovacsDeebotFactory = proxyquire('../main', {
                '@iobroker/adapter-core': mockAdapterCore,
                'ecovacs-deebot': mockEcovacsDeebot,
                'node-machine-id': { machineIdSync: sinon.stub().returns('mid') },
                './lib/adapterObjects': {
                    createInitialInfoObjects: sinon.stub().resolves(),
                    createInitialObjects: sinon.stub().resolves()
                },
                './lib/eventHandlers': {
                    registerReadyEvent: sinon.stub().resolves(),
                    registerChargeStateEvent: sinon.stub(),
                    registerCleanReportEvent: sinon.stub(),
                    registerWaterCleaningEvents: sinon.stub(),
                    registerStationEvents: sinon.stub(),
                    registerMiscEventHandlers: sinon.stub(),
                    registerConsumableEvents: sinon.stub(),
                    registerConnectionEvents: sinon.stub(),
                    registerMapEvents: sinon.stub(),
                    registerAirbotEvents: sinon.stub()
                }
            });
            instance = EcovacsDeebotFactory({});
            // Move past startup grace period so retry/reconnect paths run.
            instance._startupTime = Date.now() - (C.STARTUP_GRACE_PERIOD_MS + 1000);
        });

        afterEach(() => {
            clock.restore();
        });

        function makeCtx(deviceId = 'dev1') {
            const vacbot = {
                connect: sinon.stub(),
                disconnect: sinon.stub().resolves(),
                removeAllListeners: sinon.stub(),
                on: sinon.stub()
            };
            const ctx = {
                deviceId,
                vacbot,
                vacuum: { did: deviceId, nick: 'Bot' },
                connected: false,
                connectionFailed: true,
                unreachableRetryCount: 0,
                unreachableRetryTimeout: null,
                commandFailedCount: 0,
                commandFailedResetTimeout: null,
                getModel: () => ({ getProductName: () => 'Test', isSupportedFeature: () => false, isMappingSupported: () => false })
            };
            instance.deviceContexts.set(deviceId, ctx);
            return ctx;
        }

        it('scheduleUnreachableRetry: reconnects via connect() (which self-cleans the old client)', async () => {
            const ctx = makeCtx('dev1');

            instance.scheduleUnreachableRetry(ctx);

            // Run scheduled timer (first backoff slot = 30s).
            await clock.tickAsync(C.BACKOFF_SCHEDULE[0] + 100);
            await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

            expect(ctx.vacbot.connect.callCount,
                'connect() must be called once on retry').to.equal(1);
            // The library's connect() handles closing the previous client; the
            // adapter no longer issues a separate disconnect() first.
            expect(ctx.vacbot.disconnect.callCount,
                'no separate disconnect() before reconnect').to.equal(0);
        });

        it('scheduleGlobalMqttRetry: reconnects each existing vacbot via connect()', async () => {
            const ctxA = makeCtx('devA');
            const ctxB = makeCtx('devB');

            instance.globalMqttUnreachable = true;
            instance.scheduleGlobalMqttRetry();

            await clock.tickAsync(C.BACKOFF_SCHEDULE[0] + 100);
            await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

            for (const ctx of [ctxA, ctxB]) {
                expect(ctx.vacbot.connect.callCount,
                    `connect should be called once for ${ctx.deviceId}`).to.equal(1);
                expect(ctx.vacbot.disconnect.callCount,
                    `no separate disconnect() for ${ctx.deviceId}`).to.equal(0);
            }
        });

        it('scheduleGlobalMqttRetry: one device throwing on connect() must not abort the loop for the rest', async () => {
            // Review finding #1: the original loop wrapped each device in
            // its own try/catch so a single sync failure could not skip the
            // remaining devices. The refactored loop must preserve that
            // per-device error containment.
            const ctxA = makeCtx('devA');
            const ctxB = makeCtx('devB');
            const ctxC = makeCtx('devC');
            ctxB.vacbot.connect = sinon.stub().throws(new Error('connect blew up for B'));

            instance.globalMqttUnreachable = true;
            instance.scheduleGlobalMqttRetry();

            await clock.tickAsync(C.BACKOFF_SCHEDULE[0] + 100);
            await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

            expect(ctxA.vacbot.connect.callCount,
                'devA connect() should run').to.equal(1);
            expect(ctxB.vacbot.connect.callCount,
                'devB connect() was attempted (before throwing)').to.equal(1);
            expect(ctxC.vacbot.connect.callCount,
                'devC connect() must still run after devB threw').to.equal(1);
        });
    });

    // -----------------------------------------------------------------------
    // Fix D (cleanup side): main.js cleanup paths must clear the timer.
    // -----------------------------------------------------------------------
    describe('Fix D - main.js cleanup clears ctx._initialGetStatesTimeout', () => {
        let clock;
        let instance;

        const mockEcoVacsAPI = sinon.stub();
        mockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
        mockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
        mockEcoVacsAPI.REALM = 'mocked-realm';

        const mockEcovacsDeebot = {
            EcoVacsAPI: mockEcoVacsAPI,
            countries: { DE: { continent: 'EU' } }
        };

        const mockAdapterCore = {
            Adapter: class {
                constructor(options) {
                    Object.assign(this, options || {});
                    this.name = 'ecovacs-deebot';
                    this.namespace = 'ecovacs-deebot.0';
                    this.log = {
                        info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(),
                        debug: sinon.stub(), silly: sinon.stub()
                    };
                    this.config = { pollingInterval: 120000, countrycode: 'DE', email: 'a@b', password: 'pw' };
                    this.password = 'pw';
                    this.deviceContexts = new Map();
                    this._connecting = false;
                    this._lastConnectTime = 0;
                    this._lastReconnectTime = 0;
                    this._startupTime = 0;
                    this.globalMqttUnreachable = false;
                    this.globalMqttUnreachableTimeout = null;

                    this.on = sinon.stub();
                    this.setStateConditional = sinon.stub();
                    this.setConnection = sinon.stub();
                    this.updateConnectionState = sinon.stub();
                    this.updateDeviceConnectionState = sinon.stub();
                    this.stopPolling = sinon.stub();
                    this.startPolling = sinon.stub();
                    this.clearGoToPosition = sinon.stub();
                    this.isAuthError = sinon.stub().returns(false);
                    this.error = sinon.stub();
                }
            }
        };

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            sinon.resetHistory();

            const EcovacsDeebotFactory = proxyquire('../main', {
                '@iobroker/adapter-core': mockAdapterCore,
                'ecovacs-deebot': mockEcovacsDeebot,
                'node-machine-id': { machineIdSync: sinon.stub().returns('mid') },
                './lib/adapterObjects': {
                    createInitialInfoObjects: sinon.stub().resolves(),
                    createInitialObjects: sinon.stub().resolves()
                },
                './lib/eventHandlers': {
                    registerReadyEvent: sinon.stub().resolves(),
                    registerChargeStateEvent: sinon.stub(),
                    registerCleanReportEvent: sinon.stub(),
                    registerWaterCleaningEvents: sinon.stub(),
                    registerStationEvents: sinon.stub(),
                    registerMiscEventHandlers: sinon.stub(),
                    registerConsumableEvents: sinon.stub(),
                    registerConnectionEvents: sinon.stub(),
                    registerMapEvents: sinon.stub(),
                    registerAirbotEvents: sinon.stub()
                }
            });
            instance = EcovacsDeebotFactory({});
        });

        afterEach(() => {
            clock.restore();
        });

        it('onUnload clears ctx._initialGetStatesTimeout if set', () => {
            const fakeTimer = setTimeout(() => { }, 60000);
            const ctx = {
                vacbot: { disconnect: sinon.stub(), removeAllListeners: sinon.stub() },
                _initialGetStatesTimeout: fakeTimer
            };
            instance.deviceContexts.set('dev', ctx);
            instance.onUnload(() => { });

            expect(ctx._initialGetStatesTimeout,
                'unload should null out the tracked timer').to.equal(null);
        });

        it('reconnect() clears ctx._initialGetStatesTimeout if set', () => {
            const fakeTimer = setTimeout(() => { }, 60000);
            const ctx = {
                vacbot: { disconnect: sinon.stub(), removeAllListeners: sinon.stub() },
                _initialGetStatesTimeout: fakeTimer,
                retries: 0
            };
            instance.deviceContexts.set('dev', ctx);
            // reconnect() clears deviceContexts; we just need the timer to be cleared first.
            instance._startupTime = Date.now() - (C.STARTUP_GRACE_PERIOD_MS + 1000);
            instance.reconnect();

            // After reconnect the ctx is removed from the map, but we kept a
            // reference; the timer must have been cleared on it.
            expect(ctx._initialGetStatesTimeout,
                'reconnect should null out the tracked timer').to.equal(null);
        });
    });
});
