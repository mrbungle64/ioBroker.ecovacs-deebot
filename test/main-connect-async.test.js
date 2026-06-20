'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');

describe('main.js - connect() method is async', () => {
    let EcovacsDeebotFactory;
    let instance;

    // =====================================================
    // Mocks for all dependencies required by main.js
    // =====================================================

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
                    password: 'testpassword'
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
                this._lastReconnectTime = 0;

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
            }
        }
    };

    mockEcoVacsAPI.prototype = {};

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
        MIN_POLLING_INTERVAL_MS: 10000,
        RECOVERY_DEBOUNCE_MS: 5000,
        RECONNECT_COOLDOWN_MS: 60000,
        AIR_DRYING_INTERVAL_MS: 60000,
        AIR_DRYING_RESET_DELAY_MS: 60000
    };

    const mockAdapterHelper = {
        getUnixTimestamp: sinon.stub().returns(Date.now),
        getCurrentDateAndTimeFormatted: sinon.stub().returns('2026-05-04 00:00:00'),
        getTimeStringFormatted: sinon.stub().returns('0h 00m 00s'),
        isIdValid: sinon.stub().returns(true),
        getAreaName_i18n: sinon.stub().returns(''),
        positionIsInAreaValueString: sinon.stub().returns(false),
        positionIsInRectangleForPosition: sinon.stub().returns(false),
        decrypt: sinon.stub().returns('')
    };

    const mockDeebotModel = class {
        constructor() {
            this.is950type = sinon.stub().returns(true);
            this.getProtocol = sinon.stub().returns('MQTT/JSON');
            this.getProductName = sinon.stub().returns('Test Model');
            this.getDeviceClass = sinon.stub().returns('p1jij8');
            this.getDeviceCategory = sinon.stub().returns('Vacuum Cleaner');
            this.isSupportedFeature = sinon.stub().returns(false);
            this.usesMqtt = sinon.stub().returns(true);
            this.usesXmpp = sinon.stub().returns(false);
            this.isModelTypeT9Based = sinon.stub().returns(false);
            this.isModelTypeT20 = sinon.stub().returns(false);
            this.isModelTypeX2 = sinon.stub().returns(false);
            this.isModelTypeX1 = sinon.stub().returns(false);
            this.isModelTypeAirbot = sinon.stub().returns(false);
            this.getModelType = sinon.stub().returns('950');
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
            this._autoUpdateTimeout = null;
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
            this.adapterProxy = {
                setStateConditional: sinon.stub(),
                setStateConditionalAsync: sinon.stub().resolves(),
                createObjectNotExists: sinon.stub().resolves(),
                getStateAsync: sinon.stub().resolves({ val: null }),
                createChannelNotExists: sinon.stub().resolves(),
                deleteObjectIfExists: sinon.stub().resolves(),
                objectExists: sinon.stub().resolves(false),
                setObjectNotExistsAsync: sinon.stub().resolves()
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

    const mockEventHandlers = {
        registerReadyEvent: sinon.stub(),
        registerChargeStateEvent: sinon.stub(),
        registerCleanReportEvent: sinon.stub(),
        registerWaterCleaningEvents: sinon.stub(),
        registerStationEvents: sinon.stub(),
        registerMiscEventHandlers: sinon.stub(),
        registerConsumableEvents: sinon.stub(),
        registerConnectionEvents: sinon.stub(),
        registerMapEvents: sinon.stub(),
        registerAirbotEvents: sinon.stub()
    };

    const mockMapHelper = {
        getAreaName_i18n: sinon.stub().returns(''),
        positionIsInAreaValueString: sinon.stub().returns(false),
        positionIsInRectangleForPosition: sinon.stub().returns(false)
    };

    beforeEach(() => {
        // Reset all mocks
        sinon.resetHistory();

        // Re-setup mocks that proxyquire uses at module-load time
        mockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5-hash');
        mockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');

        // Mock api.connect and api.devices for the instance created inside connect()
        mockEcoVacsAPI.prototype.connect = sinon.stub().resolves();
        mockEcoVacsAPI.prototype.devices = sinon.stub().resolves([]);
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

        // Use proxyquire to load main.js with all mocks
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
            './lib/eventHandlers': mockEventHandlers,
            './lib/mapHelper': mockMapHelper,
            'axios': { default: { get: sinon.stub().resolves({ data: Buffer.from([]) }) } },
            'crypto': require('crypto')
        });

        // Create an instance
        instance = EcovacsDeebotFactory({});
    });

    describe('connect method type detection', () => {
        it('connect should be defined as an async function on the instance', () => {
            expect(instance.connect).to.be.a('function');
            // An async function always returns a Promise
            const result = instance.connect();
            expect(result).to.be.a('Promise');
        });

        it('connect should return a Promise even with missing config (early return)', () => {
            instance.config.email = '';
            const result = instance.connect();
            expect(result).to.be.a('Promise');
        });

        it('connect should return a Promise when called multiple times (concurrent guard)', () => {
            instance._connecting = true;
            const result = instance.connect();
            expect(result).to.be.a('Promise');
        });
    });

    describe('constructor does not crash on load', () => {
        it('should create an instance successfully', () => {
            expect(instance).to.be.an('object');
            expect(instance.name).to.equal('ecovacs-deebot');
        });

        it('should have deviceContexts initialized as a Map', () => {
            expect(instance.deviceContexts).to.be.an.instanceOf(Map);
        });
    });
});