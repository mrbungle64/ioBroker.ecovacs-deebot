'use strict';

const { expect } = require('chai');
const { describe, it, before, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('main.js - getDeviceList (admin selectSendTo)', () => {
    let EcovacsDeebotFactory;
    let instance;
    let apiMock;

    // =====================================================
    // Mocks for all dependencies required by main.js
    // =====================================================

    const mockNodeMachineId = {
        machineIdSync: sinon.stub().returns('test-machine-id')
    };

    const mockEcovacsDeebot = {
        countries: {
            DE: { continent: 'EU' }
        }
    };

    // Create a mock EcoVacsAPI constructor function
    // We need a real function (not a sinon stub) so that new works properly
    function MockEcoVacsAPI(deviceId, countrycode, continent, authDomain) {
        const mock = apiMock || { connect: sinon.stub().resolves(), devices: sinon.stub().resolves([]) };
        this.connect = mock.connect || sinon.stub().resolves();
        this.devices = mock.devices || sinon.stub().resolves([]);
        this.uid = 'mock-uid';
        this.resource = 'mock-resource';
        this.user_access_token = 'mock-token';
    }
    MockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5-hash');
    MockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
    MockEcoVacsAPI.REALM = 'mocked-realm';
    MockEcoVacsAPI.isCanvasModuleAvailable = sinon.stub().returns(false);
    MockEcoVacsAPI.prototype.getDevice = sinon.stub().returns({
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

    mockEcovacsDeebot.EcoVacsAPI = MockEcoVacsAPI;

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
                this.pollingInterval = 10000;

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
                this.sendTo = sinon.stub();
            }
        }
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

    before(() => {
        // Load the module once with proxyquire
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
    });

    beforeEach(() => {
        // Reset mock state
        sinon.resetHistory();

        // Reset md5/getDeviceId (they are module-level on MockEcoVacsAPI)
        MockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5-hash');
        MockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
        MockEcoVacsAPI.isCanvasModuleAvailable = sinon.stub().returns(false);

        // Default apiMock: empty devices, connection succeeds
        apiMock = {
            connect: sinon.stub().resolves(),
            devices: sinon.stub().resolves([])
        };

        // Create fresh instance
        instance = EcovacsDeebotFactory({});
    });

    // =====================================================
    // getDeviceList method tests
    // =====================================================

    describe('getDeviceList method', () => {
        it('should return empty array when email is missing', async () => {
            instance.config.email = '';
            instance.password = 'test';
            const result = await instance.getDeviceList();
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });

        it('should return empty array when password is missing', async () => {
            instance.config.email = 'test@example.com';
            instance.password = '';
            const result = await instance.getDeviceList();
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });

        it('should return empty array when API returns no devices', async () => {
            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });

        it('should return correctly formatted devices with value/label/description', async () => {
            apiMock.devices = sinon.stub().resolves([
                {
                    did: 'ECO-DEVICE-001',
                    deviceName: 'DEEBOT T10',
                    nick: 'Living Room Bot',
                    name: 'DEEBOT T10',
                    class: 'p1jij8'
                }
            ]);

            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();

            expect(result).to.be.an('array');
            expect(result).to.have.lengthOf(1);
            expect(result[0]).to.have.property('value', 'ECO-DEVICE-001');
            expect(result[0]).to.have.property('label', 'DEEBOT T10 (Living Room Bot)');
            expect(result[0]).to.have.property('description');
            expect(result[0].description).to.include('ECO-DEVICE-001');
        });

        it('should format devices without nick correctly (no nick in label)', async () => {
            apiMock.devices = sinon.stub().resolves([
                {
                    did: 'ECO-DEVICE-002',
                    deviceName: 'DEEBOT X1',
                    nick: '',
                    name: 'DEEBOT X1',
                    class: 'p1jij8'
                }
            ]);

            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();

            expect(result).to.have.lengthOf(1);
            expect(result[0].label).to.equal('DEEBOT X1');
            expect(result[0].description).to.include('ECO-DEVICE-002');
        });

        it('should handle missing deviceName gracefully', async () => {
            apiMock.devices = sinon.stub().resolves([
                {
                    did: 'ECO-DEVICE-003',
                    nick: 'My Bot',
                    name: 'My Bot',
                    class: 'p1jij8'
                }
            ]);

            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();

            expect(result).to.have.lengthOf(1);
            expect(result[0].label).to.include('My Bot');
            expect(result[0].value).to.equal('ECO-DEVICE-003');
        });

        it('should handle completely missing device name info', async () => {
            apiMock.devices = sinon.stub().resolves([
                {
                    did: 'ECO-DEVICE-004',
                    class: 'p1jij8'
                }
            ]);

            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();

            expect(result).to.have.lengthOf(1);
            expect(result[0].label).to.equal('Unknown Device');
            expect(result[0].value).to.equal('ECO-DEVICE-004');
        });

        it('should return multiple devices sorted as received', async () => {
            apiMock.devices = sinon.stub().resolves([
                { did: 'DEV-001', deviceName: 'First Bot', name: 'First Bot', class: 'a' },
                { did: 'DEV-002', deviceName: 'Second Bot', nick: 'Upstairs', name: 'Second Bot', class: 'b' },
                { did: 'DEV-003', deviceName: 'Third Bot', name: 'Third Bot', class: 'c' }
            ]);

            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();

            expect(result).to.have.lengthOf(3);
            expect(result[0].value).to.equal('DEV-001');
            expect(result[1].value).to.equal('DEV-002');
            expect(result[1].label).to.equal('Second Bot (Upstairs)');
            expect(result[2].value).to.equal('DEV-003');
        });

        it('should return empty array on API connection error', async () => {
            apiMock.connect = sinon.stub().rejects(new Error('Connection refused'));

            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();

            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });

        it('should return empty array on authentication failure', async () => {
            apiMock.connect = sinon.stub().rejects(new Error('authentication failed'));

            instance.config.email = 'test@example.com';
            instance.password = 'wrongpass';
            const result = await instance.getDeviceList();

            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });

        it('should classify devices by type in description', async () => {
            apiMock.devices = sinon.stub().resolves([
                { did: 'DEV-VAC', deviceName: 'DEEBOT T20', name: 'DEEBOT T20', class: 'a' },
                { did: 'DEV-AIR', deviceName: 'Airbot Z1', name: 'Airbot Z1', class: 'b' }
            ]);

            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();

            expect(result).to.have.lengthOf(2);
            expect(result[0].description).to.include('Vacuum Cleaner');
            expect(result[1].description).to.include('Air Purifier');
        });
    });

    // =====================================================
    // onMessage handler tests
    // =====================================================

    describe('onMessage handler for getDeviceList', () => {
        it('should call getDeviceList and send result via sendTo', async () => {
            const mockDevices = [
                { value: 'DEV-001', label: 'Test Bot', description: 'Vacuum Cleaner [DEV-001]' }
            ];

            instance.getDeviceList = sinon.stub().resolves(mockDevices);

            await instance.onMessage({
                command: 'getDeviceList',
                message: {},
                from: 'admin',
                callback: {}
            });

            expect(instance.getDeviceList.calledOnce).to.be.true;
            expect(instance.sendTo.calledOnce).to.be.true;
            expect(instance.sendTo.firstCall.args[0]).to.equal('admin');
            expect(instance.sendTo.firstCall.args[1]).to.equal('getDeviceList');
            expect(instance.sendTo.firstCall.args[2]).to.deep.equal(mockDevices);
        });

        it('should send empty array via sendTo on error', async () => {
            instance.getDeviceList = sinon.stub().rejects(new Error('API Error'));

            await instance.onMessage({
                command: 'getDeviceList',
                message: {},
                from: 'admin',
                callback: {}
            });

            expect(instance.sendTo.calledOnce).to.be.true;
            expect(instance.sendTo.firstCall.args[0]).to.equal('admin');
            expect(instance.sendTo.firstCall.args[1]).to.equal('getDeviceList');
            expect(instance.sendTo.firstCall.args[2]).to.be.an('array');
            expect(instance.sendTo.firstCall.args[2]).to.be.empty;
        });
    });

    // =====================================================
    // selectSendTo response format contract
    // =====================================================

    describe('selectSendTo response format contract', () => {
        it('should return array of objects with value and label properties', async () => {
            apiMock.devices = sinon.stub().resolves([
                { did: 'ECO-001', deviceName: 'DEEBOT T10', nick: 'Main', name: 'DEEBOT T10', class: 'x' }
            ]);

            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();

            expect(result).to.be.an('array');
            result.forEach(item => {
                expect(item).to.have.property('value');
                expect(item).to.have.property('label');
                expect(item.value).to.be.a('string');
                expect(item.label).to.be.a('string');
            });
        });

        it('should include optional description field', async () => {
            apiMock.devices = sinon.stub().resolves([
                { did: 'ECO-001', deviceName: 'DEEBOT T10', name: 'DEEBOT T10', class: 'x' }
            ]);

            instance.config.email = 'test@example.com';
            instance.password = 'testpass';
            const result = await instance.getDeviceList();

            result.forEach(item => {
                expect(item).to.have.property('description');
                expect(item.description).to.be.a('string');
            });
        });
    });
});
