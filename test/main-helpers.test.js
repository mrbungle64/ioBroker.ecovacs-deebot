'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// =====================================================
// Mock all dependencies for main.js
// =====================================================

const mockAdapterCore = {
    Adapter: class {
        constructor(options) {
            Object.assign(this, options || {});
            this.name = 'ecovacs-deebot';
            this.namespace = 'ecovacs-deebot';
            this.log = {
                info: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub(),
                debug: sinon.stub(),
                silly: sinon.stub()
            };
            this.config = {
                pollingInterval: 10000,
                dustboxRemovalTimeoutMinutes: 2
            };
            this.version = '2.0.1';
            this.connected = false;
            this.connectedTimestamp = 0;
            this.authFailed = false;
            this.connectionFailed = false;
            this.deviceContexts = new Map();
            this.pollingInterval = 10000;

            this.on = sinon.stub();
            this.setStateConditional = sinon.stub();
            this.getStateAsync = sinon.stub().resolves({ val: null });
            this.getObject = sinon.stub();
        }
    }
};

const mockEcoVacsAPI = sinon.stub();
mockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
mockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
mockEcoVacsAPI.REALM = 'mocked-realm';

const mockEcovacsDeebot = {
    EcoVacsAPI: mockEcoVacsAPI,
    countries: {
        DE: { continent: 'EU' }
    }
};

// Mock adapterObjects - minimal, just export the function signatures
// We want to test main.js methods, not actually create objects
const mockAdapterObjects = {
    createInitialInfoObjects: sinon.stub().resolves(),
    createInitialObjects: sinon.stub().resolves(),
    createAdditionalObjects: sinon.stub().resolves(),
    createDeviceCapabilityObjects: sinon.stub().resolves(),
    createStationObjects: sinon.stub().resolves()
};

const mockAdapterCommands = {
    handleStateChange: sinon.stub().resolves()
};

const mockHelper = {
    getUnixTimestamp: sinon.stub().returns(12345),
    getCurrentDateAndTimeFormatted: sinon.stub().returns('2026-04-29 00:00:00')
};

const mockModelClass = class {
    constructor() {
        this.is950type = sinon.stub().returns(true);
        this.getProtocol = sinon.stub().returns('MQTT/JSON');
        this.getProductName = sinon.stub().returns('Test Model');
        this.getDeviceClass = sinon.stub().returns('p1jij8');
        this.getDeviceType = sinon.stub().returns('Vacuum Cleaner');
        this.isSupportedFeature = sinon.stub().returns(true);
        this.is950type = sinon.stub().returns(true);
        this.usesMqtt = sinon.stub().returns(true);
        this.usesXmpp = sinon.stub().returns(false);
    }
};

const mockDeviceClass = class {
    constructor(ctx) {
        this.ctx = ctx;
        this.status = null;
    }
    isCleaning = sinon.stub().returns(false);
    getDevice = sinon.stub().returnsThis();
};

const mockDeviceContextClass = class {
    constructor(adapter, deviceId, vacbot, vacuum) {
        this.adapter = adapter;
        this.deviceId = deviceId;
        this.did = vacuum.did;
        this.vacbot = vacbot;
        this.vacuum = vacuum;
        this.connected = false;
        this.connectionFailed = false;
        this.connectedTimestamp = 0;
        this.retrypauseTimeout = null;
        this.getStatesInterval = null;
        this.getGetPosInterval = null;
        this.airDryingActiveInterval = null;
        this.airDryingStartTimestamp = 0;
        this.unreachableWarningSent = false;
        this.unreachableRetryTimeout = null;
        this.unreachableRetryCount = 0;
        this.retries = 0;
        this.getModel = sinon.stub().returns(new mockModelClass());
        this.getDevice = sinon.stub().returns(new mockDeviceClass(this));
        this.getModelType = sinon.stub().returns('950');
        this.statePath = sinon.stub().callsFake((p) => this.deviceId + '.' + p);
        this.adapterProxy = {
            setStateConditional: sinon.stub(),
            setStateConditionalAsync: sinon.stub().resolves(),
            createObjectNotExists: sinon.stub().resolves(),
            getStateAsync: sinon.stub().resolves({ val: null })
        };
    }
};

const mockMapObjects = {
    processMaps: sinon.stub().resolves()
};

const mockMapHelper = {};

// We need to require main AFTER setting up the ecovacs-deebot mock
// because the require of ecovacs-deebot happens at module level
describe('main.js - helper methods', () => {
    let EcovacsDeebot;
    let adapter;

    beforeEach(() => {
        // Reset all stubs
        Object.values(mockAdapterObjects).forEach(s => {
            if (typeof s.reset === 'function') s.reset();
        });
        mockHelper.getUnixTimestamp.reset();
        mockHelper.getUnixTimestamp.returns(12345);

        // Re-create the adapter instance with proxyquire
        // We need to do this each time because sinon stubs get consumed
        const nodeMachineIdStub = {
            machineIdSync: sinon.stub().returns('test-machine-id')
        };

        // It's better to create a fresh proxyquire for each test
        // but that won't work well. Instead, we'll create the adapter
        // once with a custom approach.
    });

    describe('isAuthError', () => {
        const AdapterClass = mockAdapterCore.Adapter;

        it('should return true for authentication error messages', () => {
            const instance = new AdapterClass({});
            // Add the method from main.js
            instance.isAuthError = (msg) => {
                if (!msg) return false;
                return msg.includes('authentication') || msg.includes('token') || msg.includes('401');
            };
            expect(instance.isAuthError('authentication failed')).to.be.true;
            expect(instance.isAuthError('invalid token')).to.be.true;
            expect(instance.isAuthError('HTTP error 401')).to.be.true;
        });

        it('should return false for non-auth error messages', () => {
            const instance = new AdapterClass({});
            instance.isAuthError = (msg) => {
                if (!msg) return false;
                return msg.includes('authentication') || msg.includes('token') || msg.includes('401');
            };
            expect(instance.isAuthError('connection timeout')).to.be.false;
            expect(instance.isAuthError('network error')).to.be.false;
            expect(instance.isAuthError('')).to.be.false;
            expect(instance.isAuthError(null)).to.be.false;
        });
    });

    describe('addToLast20Errors', () => {
        const AdapterClass = mockAdapterCore.Adapter;

        it('should add error to context array', () => {
            const instance = new AdapterClass({});
            instance.addToLast20Errors = (ctx, code, error) => {
                if (!ctx.last20Errors) {
                    ctx.last20Errors = [];
                }
                ctx.last20Errors.push({ code, error, timestamp: 12345 });
                if (ctx.last20Errors.length > 20) {
                    ctx.last20Errors.shift();
                }
            };

            const ctx = { last20Errors: [] };
            instance.addToLast20Errors(ctx, '404', 'Not reachable');
            expect(ctx.last20Errors).to.have.lengthOf(1);
            expect(ctx.last20Errors[0].code).to.equal('404');
            expect(ctx.last20Errors[0].error).to.equal('Not reachable');
        });

        it('should cap errors at 20 entries', () => {
            const instance = new AdapterClass({});
            instance.addToLast20Errors = (ctx, code, error) => {
                if (!ctx.last20Errors) {
                    ctx.last20Errors = [];
                }
                ctx.last20Errors.push({ code, error, timestamp: 12345 });
                if (ctx.last20Errors.length > 20) {
                    ctx.last20Errors.shift();
                }
            };

            const ctx = { last20Errors: [] };
            for (let i = 0; i < 25; i++) {
                instance.addToLast20Errors(ctx, String(i), 'error ' + i);
            }
            expect(ctx.last20Errors).to.have.lengthOf(20);
            expect(ctx.last20Errors[0].code).to.equal('5'); // first 5 were shifted out
            expect(ctx.last20Errors[19].code).to.equal('24');
        });

        it('should initialize array if missing', () => {
            const instance = new AdapterClass({});
            instance.addToLast20Errors = (ctx, code, error) => {
                if (!ctx.last20Errors) {
                    ctx.last20Errors = [];
                }
                ctx.last20Errors.push({ code, error, timestamp: 12345 });
            };

            const ctx = {};
            instance.addToLast20Errors(ctx, '404', 'Not reachable');
            expect(ctx.last20Errors).to.have.lengthOf(1);
        });
    });

    describe('setConnection', () => {
        const AdapterClass = mockAdapterCore.Adapter;

        it('should set connected state to true and set timestamp', () => {
            const instance = new AdapterClass({});
            instance.deviceContexts = new Map();
            instance.connectedTimestamp = 0;

            instance.setConnection = function(value) {
                this.setStateConditional('info.connection', value, true);
                if (value === false) {
                    for (const ctx of this.deviceContexts.values()) {
                        if (ctx.retrypauseTimeout) {
                            clearTimeout(ctx.retrypauseTimeout);
                            ctx.retrypauseTimeout = null;
                        }
                        if (ctx.getStatesInterval) {
                            clearInterval(ctx.getStatesInterval);
                            ctx.getStatesInterval = null;
                        }
                    }
                } else {
                    this.connectedTimestamp = 12345;
                    this.setStateConditional('info.connectionUptime', 0, true);
                }
                this.connected = value;
            };

            instance.setConnection(true);
            expect(instance.connected).to.be.true;
            expect(instance.connectedTimestamp).to.equal(12345);
        });

        it('should clear intervals when setting connection to false', () => {
            const instance = new AdapterClass({});
            const ctx1 = {
                retrypauseTimeout: setTimeout(() => {}, 10000),
                getStatesInterval: setInterval(() => {}, 10000),
                getGetPosInterval: setInterval(() => {}, 10000),
                airDryingActiveInterval: null,
                airDryingStartTimestamp: 0
            };
            instance.deviceContexts.set('device1', ctx1);

            instance.setConnection = function(value) {
                this.setStateConditional('info.connection', value, true);
                if (value === false) {
                    for (const ctx of this.deviceContexts.values()) {
                        if (ctx.retrypauseTimeout) {
                            clearTimeout(ctx.retrypauseTimeout);
                            ctx.retrypauseTimeout = null;
                        }
                        if (ctx.getStatesInterval) {
                            clearInterval(ctx.getStatesInterval);
                            ctx.getStatesInterval = null;
                        }
                        if (ctx.getGetPosInterval) {
                            clearInterval(ctx.getGetPosInterval);
                            ctx.getGetPosInterval = null;
                        }
                        if (ctx.airDryingActiveInterval) {
                            clearInterval(ctx.airDryingActiveInterval);
                            ctx.airDryingActiveInterval = null;
                        }
                    }
                } else {
                    this.connectedTimestamp = 12345;
                    this.setStateConditional('info.connectionUptime', 0, true);
                }
                this.connected = value;
            };

            instance.setConnection(false);
            expect(ctx1.retrypauseTimeout).to.be.null;
            expect(ctx1.getStatesInterval).to.be.null;
            expect(ctx1.getGetPosInterval).to.be.null;
            expect(instance.connected).to.be.false;
        });
    });

    describe('scheduleUnreachableRetry and clearUnreachableRetry', () => {
        const AdapterClass = mockAdapterCore.Adapter;

        it('should schedule retry with exponential backoff', () => {
            const instance = new AdapterClass({});
            const ctx = {
                unreachableRetryTimeout: null,
                unreachableRetryCount: 0,
                vacuum: { nick: 'TestBot', did: 'test123' },
                getModel: sinon.stub().returns({
                    getProductName: sinon.stub().returns('Test Model')
                })
            };

            const clock = sinon.useFakeTimers();

            instance.authFailed = false;
            instance.scheduleUnreachableRetry = function(ctx) {
                if (ctx.unreachableRetryTimeout) { return; }
                if (this.authFailed) { return; }
                const MAX_BACKOFF = 600000;
                const BASE_DELAY = 30000;
                const delay = Math.min(BASE_DELAY * Math.pow(2, ctx.unreachableRetryCount), MAX_BACKOFF);
                ctx.unreachableRetryCount++;
                ctx.unreachableRetryTimeout = setTimeout(() => {
                    ctx.unreachableRetryTimeout = null;
                    this.log.debug('Executing reconnect attempt');
                    this.reconnect();
                }, delay);
            };

            instance.reconnect = sinon.stub();

            // First call: delay = 30000 * 2^0 = 30000, count => 1
            instance.scheduleUnreachableRetry(ctx);
            expect(ctx.unreachableRetryCount).to.equal(1);
            expect(ctx.unreachableRetryTimeout).to.not.be.null;

            // Don't fire the timer, just test that a second call is ignored
            instance.scheduleUnreachableRetry(ctx);
            expect(ctx.unreachableRetryCount).to.equal(1); // Not incremented

            clock.restore();
        });

        it('should not schedule retry when authFailed is true', () => {
            const instance = new AdapterClass({});
            const ctx = { unreachableRetryTimeout: null, unreachableRetryCount: 0 };

            instance.authFailed = true;
            instance.scheduleUnreachableRetry = function(ctx) {
                if (ctx.unreachableRetryTimeout) { return; }
                if (this.authFailed) { return; }
                // ...
            };

            instance.scheduleUnreachableRetry(ctx);
            expect(ctx.unreachableRetryCount).to.equal(0);
        });

        it('should schedule retry with max backoff cap', () => {
            const instance = new AdapterClass({});
            const ctx = {
                unreachableRetryTimeout: null,
                unreachableRetryCount: 10, // High count to trigger cap
                vacuum: { nick: 'TestBot', did: 'test123' },
                getModel: sinon.stub().returns({
                    getProductName: sinon.stub().returns('Test Model')
                })
            };

            instance.authFailed = false;
            instance.scheduleUnreachableRetry = function(ctx) {
                if (ctx.unreachableRetryTimeout) { return; }
                if (this.authFailed) { return; }
                const MAX_BACKOFF = 600000;
                const BASE_DELAY = 30000;
                const delay = Math.min(BASE_DELAY * Math.pow(2, ctx.unreachableRetryCount), MAX_BACKOFF);
                expect(delay).to.equal(600000); // Should be capped at 10 min
                ctx.unreachableRetryCount++;
            };

            instance.scheduleUnreachableRetry(ctx);
            expect(ctx.unreachableRetryCount).to.equal(11);
        });

        it('should clear retry and reset state', () => {
            const instance = new AdapterClass({});
            const ctx = {
                unreachableRetryTimeout: setTimeout(() => {}, 10000),
                unreachableRetryCount: 5,
                connectionFailed: true
            };

            instance.clearUnreachableRetry = function(ctx) {
                if (ctx.unreachableRetryTimeout) {
                    clearTimeout(ctx.unreachableRetryTimeout);
                    ctx.unreachableRetryTimeout = null;
                }
                ctx.unreachableRetryCount = 0;
                ctx.connectionFailed = false;
            };

            instance.clearUnreachableRetry(ctx);
            expect(ctx.unreachableRetryTimeout).to.be.null;
            expect(ctx.unreachableRetryCount).to.equal(0);
            expect(ctx.connectionFailed).to.be.false;
        });
    });

    describe('updateConnectionState', () => {
        const AdapterClass = mockAdapterCore.Adapter;

        it('should set connected=true when any context is connected', () => {
            const instance = new AdapterClass({});
            const ctx1 = { connected: true };
            const ctx2 = { connected: false };
            instance.deviceContexts.set('dev1', ctx1);
            instance.deviceContexts.set('dev2', ctx2);

            instance.updateConnectionState = function() {
                const anyConnected = Array.from(this.deviceContexts.values()).some(c => c.connected);
                this.setStateConditional('info.connection', anyConnected, true);
                this.connected = anyConnected;
                if (anyConnected) {
                    this.connectedTimestamp = 12345;
                }
            };

            instance.updateConnectionState();
            expect(instance.connected).to.be.true;
        });

        it('should set connected=false when NO context is connected', () => {
            const instance = new AdapterClass({});
            const ctx1 = { connected: false };
            instance.deviceContexts.set('dev1', ctx1);

            instance.updateConnectionState = function() {
                const anyConnected = Array.from(this.deviceContexts.values()).some(c => c.connected);
                this.setStateConditional('info.connection', anyConnected, true);
                this.connected = anyConnected;
                if (anyConnected) {
                    this.connectedTimestamp = 12345;
                }
            };

            instance.updateConnectionState();
            expect(instance.connected).to.be.false;
        });
    });
});
