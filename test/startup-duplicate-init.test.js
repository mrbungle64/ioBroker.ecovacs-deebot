'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');

describe('startup-duplicate-init.test.js - Protections Against Duplicate Initialization', () => {

    const mockEcoVacsAPI = sinon.stub();
    mockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
    mockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
    mockEcoVacsAPI.REALM = 'mocked-realm';
    mockEcoVacsAPI.isCanvasModuleAvailable = sinon.stub().returns(false);

    const mockEcovacsDeebot = {
        EcoVacsAPI: mockEcoVacsAPI,
        countries: { DE: { continent: 'EU' } }
    };

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
                    pollingInterval: 120000,
                    countrycode: 'DE',
                    email: 'test@example.com',
                    password: 'testpassword',
                    singleDeviceMode: false
                };
                this.password = 'testpassword';
                this.deviceContexts = new Map();
                this.connected = false;
                this.connectedTimestamp = 0;
                this.authFailed = false;
                this.connectionFailed = false;
                this.globalMqttUnreachable = false;
                this.globalMqttUnreachableTimeout = null;
                this.globalMqttUnreachableCount = 0;
                this.globalMqttOfflineWarningSent = false;
                this.lastMqttOfflineLogTimestamp = 0;
                this._connecting = false;
                this._lastConnectTime = 0;
                this._startupTime = 0;
                this._lastReconnectTime = 0;
                this.canvasModuleIsInstalled = false;
                this.version = '1.0.0';

                this.on = sinon.stub();
                this.setStateConditional = sinon.stub();
                this.setStateConditionalAsync = sinon.stub().resolves();
                this.getStateAsync = sinon.stub().resolves({ val: null });
                this.getObject = sinon.stub();
                this.getObjectAsync = sinon.stub().resolves(null);
                this.getForeignObjectAsync = sinon.stub().resolves(null);
                this.setForeignObjectAsync = sinon.stub().resolves();
                this.setObjectNotExistsAsync = sinon.stub().resolves();
                this.subscribeStates = sinon.stub();
                this.error = sinon.stub();
                this.setConnection = sinon.stub();
                this.updateDeviceConnectionState = sinon.stub();
                this.updateConnectionState = sinon.stub();
                this.clearUnreachableRetry = sinon.stub();
                this.handleAirDryingActive = sinon.stub();
                this.handleDeviceDataReceived = sinon.stub();
                this.setInitialStateValues = sinon.stub().resolves();
                this.vacbotInitialGetStates = sinon.stub();
                this.startPolling = sinon.stub();
                this.stopPolling = sinon.stub();
            }
        }
    };



    const mockNodeMachineId = {
        machineIdSync: sinon.stub().returns('test-machine-id')
    };

    const mockAdapterObjects = {
        createInitialInfoObjects: sinon.stub().resolves(),
        createInitialObjects: sinon.stub().resolves(),
        createAdditionalObjects: sinon.stub().resolves(),
        createDeviceCapabilityObjects: sinon.stub().resolves(),
        createStationObjects: sinon.stub().resolves(),
        createControlSweepModeIfNotExists: sinon.stub().resolves(),
        createControlScrubbingPatternIfNotExists: sinon.stub().resolves()
    };

    const mockAdapterCommands = {
        handleStateChange: sinon.stub().resolves()
    };

    const mockConstants = {
        CONNECT_COOLDOWN_MS: 30000,
        STARTUP_GRACE_PERIOD_MS: 5000,
        MIN_POLLING_INTERVAL_MS: 10000,
        RECOVERY_DEBOUNCE_MS: 5000,
        RECONNECT_COOLDOWN_MS: 60000,
        AIR_DRYING_INTERVAL_MS: 60000,
        AIR_DRYING_RESET_DELAY_MS: 60000,
        INITIAL_GET_COMMANDS_DELAY_MS: 6000,
        BACKOFF_SCHEDULE: [30000, 60000, 300000],
        FORMATTED_DATE_THROTTLE_S: 60,
        COMMAND_FAILURE_RESET_TIMEOUT_MS: 60000
    };

    const mockAdapterHelper = {
        getUnixTimestamp: sinon.stub().returns(Math.floor(Date.now() / 1000)),
        getCurrentDateAndTimeFormatted: sinon.stub().returns('2026-05-04 00:00:00'),
        getTimeStringFormatted: sinon.stub().returns('0h 00m 00s'),
        isIdValid: sinon.stub().returns(true),
        getAreaName_i18n: sinon.stub().returns(''),
        positionIsInAreaValueString: sinon.stub().returns(false),
        positionIsInRectangleForPosition: sinon.stub().returns(false),
        decrypt: sinon.stub().returns(''),
        isValidChargeStatus: sinon.stub().returns(true),
        isValidCleanStatus: sinon.stub().returns(true),
        getDeviceStatusByStatus: sinon.stub().returns('idle')
    };

    const mockDeebotModel = class {
        constructor() {
            this.is950type = sinon.stub().returns(true);
            this.getProtocol = sinon.stub().returns('MQTT/JSON');
            this.getProductName = sinon.stub().returns('Test Model');
            this.getDeviceClass = sinon.stub().returns('p1jij8');
            this.getDeviceCapabilities = sinon.stub().returns({});
            this.getProductImageURL = sinon.stub().returns('');
            this.isSupportedFeature = sinon.stub().returns(false);
            this.usesMqtt = sinon.stub().returns(true);
            this.usesXmpp = sinon.stub().returns(false);
            this.isModelTypeT9Based = sinon.stub().returns(false);
            this.isModelTypeT20 = sinon.stub().returns(false);
            this.isModelTypeX2 = sinon.stub().returns(false);
            this.isModelTypeX1 = sinon.stub().returns(false);
            this.isModelTypeAirbot = sinon.stub().returns(false);
            this.getModelType = sinon.stub().returns('950');
            this.getPlatformType = sinon.stub().returns('950');
            this.getSmartType = sinon.stub().returns('950');
            this.getDeviceCategory = sinon.stub().returns('Vacuum Cleaner');
        }
    };

    const mockDevice = class {
        constructor() {
            this.status = 'charging';
        }
        isCleaning = sinon.stub().returns(false);
        isReturning = sinon.stub().returns(false);
        isNotCleaning = sinon.stub().returns(true);
        isNotPaused = sinon.stub().returns(true);
        isNotStopped = sinon.stub().returns(true);
        setStatusByTrigger = sinon.stub();
    };

    const mockDeviceContext = class {
        constructor(adapter, deviceId, vacbot, vacuum) {
            this.adapter = adapter;
            this.deviceId = deviceId;
            this.did = vacuum ? vacuum.did : 'test-did';
            this.vacbot = vacbot;
            this.vacuum = vacuum || { did: 'test-did', nick: 'TestBot', deviceName: 'Test Model', class: 'p1jij8' };
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
            this.enabled = true;
            this._autoUpdateTimeout = null;
            this._autoUpdateInterval = null;
            this._stateValues = new Map();
            this.last20Errors = [];
            this.currentCleanedSeconds = 0;
            this.currentCleanedArea = 0;
            this.silentApproach = {};
            this.cleaningClothReminder = { enabled: false, period: 0 };
            this.commandQueue = {
                addInitialGetCommands: sinon.stub(),
                addStandardGetCommands: sinon.stub(),
                addAdditionalGetCommands: sinon.stub(),
                runAll: sinon.stub(),
                run: sinon.stub()
            };
            this.intervalQueue = {
                addInitialGetCommands: sinon.stub(),
                addStandardGetCommands: sinon.stub(),
                addAdditionalGetCommands: sinon.stub(),
                runAll: sinon.stub(),
                run: sinon.stub()
            };
            this.getModel = sinon.stub().returns(new mockDeebotModel());
            this.getDevice = sinon.stub().returns(new mockDevice());
            this.getModelType = sinon.stub().returns('950');
            this.getPlatformType = sinon.stub().returns('950');
            this.getSmartType = sinon.stub().returns('950');
            this.statePath = sinon.stub().returnsArg(0);
            this.adapterProxy = {
                setStateConditional: sinon.stub(),
                setStateConditionalAsync: sinon.stub().resolves(),
                createObjectNotExists: sinon.stub().resolves(),
                getStateAsync: sinon.stub().resolves({ val: null }),
                createChannelNotExists: sinon.stub().resolves(),
                deleteObjectIfExists: sinon.stub().resolves(),
                objectExists: sinon.stub().resolves(false),
                setObjectNotExistsAsync: sinon.stub().resolves(),
                getObjectAsync: sinon.stub().resolves(null),
                extendObjectAsync: sinon.stub().resolves(),
                deleteChannelIfExists: sinon.stub().resolves(),
                getChannelsOfAsync: sinon.stub().resolves([])
            };
        }
    };

    const mockRequestThrottle = class {
        constructor() {}
    };

    const mockMapObjects = {
        processMaps: sinon.stub().resolves(),
        createOrUpdateLastTimePresenceAndLastCleanedSpotArea: sinon.stub().resolves()
    };

    const mockMapHelper = {
        getAreaName_i18n: sinon.stub().returns(''),
        positionIsInAreaValueString: sinon.stub().returns(false),
        positionIsInRectangleForPosition: sinon.stub().returns(false)
    };

    // For connect tests, mock registerReadyEvent to resolve immediately
    // (so connect() completes without waiting for real 'ready' event)
    const mockEventHandlersForConnect = proxyquire('../lib/eventHandlers', {
        './adapterObjects': mockAdapterObjects,
        './adapterHelper': mockAdapterHelper,
        './constants': mockConstants,
        './mapObjects': mockMapObjects,
        './mapHelper': mockMapHelper
    });
    // Separate real mock for D tests (without registerReadyEvent override)
    const mockEventHandlers = proxyquire('../lib/eventHandlers', {
        './adapterObjects': mockAdapterObjects,
        './adapterHelper': mockAdapterHelper,
        './constants': mockConstants,
        './mapObjects': mockMapObjects,
        './mapHelper': mockMapHelper
    });

    // Override registerReadyEvent to resolve immediately (prevents hang in connect tests)
    mockEventHandlersForConnect.registerReadyEvent = function(main, vacbot, ctx, vacuum) {
        return Promise.resolve();
    };

    let EcovacsDeebotFactory;
    let instance;

    beforeEach(() => {
        sinon.resetHistory();

        mockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5-hash');
        mockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
        mockEcoVacsAPI.isCanvasModuleAvailable = sinon.stub().returns(false);

        mockEcoVacsAPI.prototype.connect = sinon.stub().resolves();
        mockEcoVacsAPI.prototype.devices = sinon.stub().resolves([{
            did: 'test_did',
            nick: 'TestBot',
            deviceName: 'Test Model',
            class: 'p1jij8',
            name: 'Test Model',
            company: 'eco-ng'
        }]);
        mockEcoVacsAPI.prototype.getDevice = sinon.stub().returns({
            on: sinon.stub(),
            connect: sinon.stub(),
            disconnect: sinon.stub(),
            removeAllListeners: sinon.stub(),
            run: sinon.stub(),
            user_access_token: 'mock-token',
            uid: 'mock-uid',
            getCryptoHashStringForSecuredContent: sinon.stub().returns('mock-hash'),
            country: 'de'
        });
        mockEcoVacsAPI.prototype.getVersion = sinon.stub().returns('0.9.6-beta.12');

        EcovacsDeebotFactory = proxyquire('../main', {
            '@iobroker/adapter-core': mockAdapterCore,
            'ecovacs-deebot': mockEcovacsDeebot,
            'node-machine-id': mockNodeMachineId,
            './lib/adapterObjects': mockAdapterObjects,
            './lib/adapterCommands': mockAdapterCommands,
            './lib/constants': mockConstants,
            './lib/adapterHelper': mockAdapterHelper,
            './lib/models': mockDeebotModel,
            './lib/device': mockDevice,
            './lib/deviceContext': mockDeviceContext,
            './lib/requestThrottle': mockRequestThrottle,
            './lib/mapObjects': mockMapObjects,
            './lib/eventHandlers': mockEventHandlersForConnect,
            './lib/mapHelper': mockMapHelper,
            'axios': { default: { get: sinon.stub().resolves({ data: Buffer.from([]) }) } },
            'crypto': require('crypto')
        });

        instance = EcovacsDeebotFactory({});
    });

    describe('A: connect() post-completion cooldown', () => {

        it('should proceed on first connect (no cooldown set)', async () => {
            instance._connecting = false;
            instance._lastConnectTime = 0;
            instance.password = 'testpassword';

            await instance.connect();

            const cooldownCalls = instance.log.debug.getCalls().filter(
                c => c.args[0] && c.args[0].includes('Connect skipped - cooldown')
            );
            expect(cooldownCalls).to.be.empty;
        });

        it('should skip connect when called within cooldown period', async () => {
            instance._connecting = false;
            instance._lastConnectTime = Date.now() - 5000;
            instance.password = 'testpassword';

            await instance.connect();

            const cooldownCalls = instance.log.debug.getCalls().filter(
                c => c.args[0] && c.args[0].includes('Connect skipped - cooldown')
            );
            expect(cooldownCalls).to.not.be.empty;
        });

        it('should proceed when cooldown has expired', async () => {
            instance._connecting = false;
            instance._lastConnectTime = Date.now() - 35000;
            instance.password = 'testpassword';

            await instance.connect();

            const cooldownCalls = instance.log.debug.getCalls().filter(
                c => c.args[0] && c.args[0].includes('Connect skipped - cooldown')
            );
            expect(cooldownCalls).to.be.empty;
        });

        it('should set _lastConnectTime after successful connect', async () => {
            instance._connecting = false;
            instance._lastConnectTime = 0;
            instance.password = 'testpassword';

            const beforeConnect = Date.now();
            await instance.connect();

            expect(instance._lastConnectTime).to.be.at.least(beforeConnect);
        });
    });

    describe('C: reconnect() startup grace period', () => {

        it('should skip reconnect during startup grace period', () => {
            instance._startupTime = Date.now() - 1000;
            instance._lastReconnectTime = 0;
            instance.authFailed = false;

            instance.reconnect();

            const graceCalls = instance.log.debug.getCalls().filter(
                c => c.args[0] && c.args[0].includes('startup grace period')
            );
            expect(graceCalls).to.not.be.empty;
        });

        it('should allow reconnect after startup grace period expires', () => {
            instance._startupTime = Date.now() - 6000;
            instance._lastReconnectTime = 0;
            instance.authFailed = false;
            const mockCtx = {
                vacbot: { disconnect: sinon.stub(), removeAllListeners: sinon.stub() },
                connected: false,
                adapterProxy: { setStateConditional: sinon.stub() },
                goToPositionArea: null
            };
            instance.deviceContexts.set('test', mockCtx);

            instance.reconnect();

            const graceCalls = instance.log.debug.getCalls().filter(
                c => c.args[0] && c.args[0].includes('startup grace period')
            );
            expect(graceCalls).to.be.empty;
        });

        it('should not skip reconnect if no _startupTime set', () => {
            instance._startupTime = 0;
            instance._lastReconnectTime = 0;
            instance.authFailed = false;
            const mockCtx = {
                vacbot: { disconnect: sinon.stub(), removeAllListeners: sinon.stub() },
                connected: false,
                adapterProxy: { setStateConditional: sinon.stub() },
                goToPositionArea: null
            };
            instance.deviceContexts.set('test', mockCtx);

            instance.reconnect();

            const graceCalls = instance.log.debug.getCalls().filter(
                c => c.args[0] && c.args[0].includes('startup grace period')
            );
            expect(graceCalls).to.be.empty;
        });
    });

    describe('D: registerReadyEvent returns a Promise', () => {

        it('should return a Promise from registerReadyEvent', () => {
            const vacbot = { on: sinon.stub() };
            const vacuum = { did: 'test_did', nick: 'TestBot' };
            const main = {
                log: { info: sinon.stub(), debug: sinon.stub(), error: sinon.stub() },
                updateDeviceConnectionState: sinon.stub(),
                clearUnreachableRetry: sinon.stub(),
                updateConnectionState: sinon.stub(),
                version: '1.0.0',
                canvasModuleIsInstalled: false,
                setInitialStateValues: sinon.stub().resolves(),
                vacbotInitialGetStates: sinon.stub()
            };
            const ctx = {
                deviceId: 'test_device',
                unreachableRetryCount: 0,
                retries: 0,
                connected: false,
                unreachableWarningSent: false,
                adapterProxy: {
                    setStateConditional: sinon.stub(),
                    createObjectNotExists: sinon.stub().resolves()
                },
                getModel: () => ({
                    getProductName: () => 'Test Model',
                    getDeviceClass: () => 'test_class',
                    getDeviceCategory: () => 'Test Type',
                    getDeviceCapabilities: () => ({}),
                    getProductImageURL: () => '',
                    getProtocol: () => 'MQTT',
                    is950type: () => true,
                    getModelType: () => '950',
                    getSmartType: () => '950'
                }),
                getModelType: () => '950',
                getPlatformType: () => '950',
                getSmartType: () => '950',
                api: { getVersion: () => '0.9.6' }
            };

            const result = mockEventHandlers.registerReadyEvent(main, vacbot, ctx, vacuum);
            expect(result).to.be.a('Promise');
        });

        it('should resolve after the initialized event fires and init completes', (done) => {
            let initializedCallback;
            const vacbot = {
                on: (event, cb) => {
                    if (event === 'initialized') {
                        initializedCallback = cb;
                    }
                }
            };
            const vacuum = { did: 'test_did', nick: 'TestBot' };
            const main = {
                log: { info: sinon.stub(), debug: sinon.stub(), error: sinon.stub() },
                updateDeviceConnectionState: sinon.stub(),
                clearUnreachableRetry: sinon.stub(),
                updateConnectionState: sinon.stub(),
                version: '1.0.0',
                canvasModuleIsInstalled: false,
                setInitialStateValues: sinon.stub().resolves(),
                vacbotInitialGetStates: sinon.stub()
            };
            const ctx = {
                deviceId: 'test_device',
                unreachableRetryCount: 0,
                retries: 0,
                connected: false,
                unreachableWarningSent: false,
                adapterProxy: {
                    setStateConditional: sinon.stub(),
                    createObjectNotExists: sinon.stub().resolves()
                },
                getModel: () => ({
                    getProductName: () => 'Test Model',
                    getDeviceClass: () => 'test_class',
                    getDeviceCategory: () => 'Test Type',
                    getDeviceCapabilities: () => ({}),
                    getProductImageURL: () => '',
                    getProtocol: () => 'MQTT',
                    is950type: () => true,
                    getModelType: () => '950',
                    getSmartType: () => '950'
                }),
                getModelType: () => '950',
                getPlatformType: () => '950',
                getSmartType: () => '950',
                api: { getVersion: () => '0.9.6' }
            };

            const promise = mockEventHandlers.registerReadyEvent(main, vacbot, ctx, vacuum);
            expect(initializedCallback).to.exist;

            let resolved = false;
            promise.then(() => {
                resolved = true;
                done();
            });

            initializedCallback();

            setTimeout(() => {
                if (!resolved) {
                    done(new Error('Promise did not resolve'));
                }
            }, 200);
        });
    });
});