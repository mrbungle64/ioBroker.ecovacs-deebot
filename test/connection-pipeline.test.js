'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach, afterEach } = require('mocha');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');

describe('connection-pipeline.test.js - Connection Flow and Protections', () => {
    let clock;
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
                this.namespace = 'ecovacs-deebot.0';
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
                this._connecting = false;
                this._lastConnectTime = 0;
                this._lastReconnectTime = 0;
                this.globalMqttUnreachable = false;

                this.on = sinon.stub();
                this.setStateConditional = sinon.stub();
                this.setStateConditionalAsync = sinon.stub().resolves();
                this.getStateAsync = sinon.stub().resolves({ val: null });
                this.getObject = sinon.stub();
                this.getObjectAsync = sinon.stub().resolves({ common: {} });
                this.getForeignObjectAsync = sinon.stub().resolves(null);
                this.setForeignObjectAsync = sinon.stub().resolves();
                this.setObjectNotExistsAsync = sinon.stub().resolves();
                this.error = sinon.stub();
                this.setConnection = sinon.stub();
                this.updateConnectionState = sinon.stub();
                this.updateDeviceConnectionState = sinon.stub();
                this.startPolling = sinon.stub();
                this.stopPolling = sinon.stub();
                this.clearGoToPosition = sinon.stub();
                this.clearUnreachableRetry = sinon.stub();
                this.getDeviceTypeFromDevice = sinon.stub().returns('Vacuum Cleaner');
                this.getConfigValue = sinon.stub().returns('');
                this.isAuthError = sinon.stub().returns(false);
            }
        }
    };

    const mockNodeMachineId = {
        machineIdSync: sinon.stub().returns('test-machine-id')
    };

    const mockAdapterObjects = {
        createInitialInfoObjects: sinon.stub().resolves(),
        createInitialObjects: sinon.stub().resolves()
    };

    const mockConstants = {
        CONNECT_COOLDOWN_MS: 30000,
        RECONNECT_COOLDOWN_MS: 60000,
        MIN_POLLING_INTERVAL_MS: 60000,
        STARTUP_GRACE_PERIOD_MS: 5000,
        DEVICE_CONNECTION_DELAY_MS: 30000
    };

    const mockDeebotModel = class {
        constructor() {
            this.usesMqtt = sinon.stub().returns(true);
            this.usesXmpp = sinon.stub().returns(false);
            this.isSupportedFeature = sinon.stub().returns(true);
            this.getProductName = sinon.stub().returns('Test Bot');
            this.getDeviceClass = sinon.stub().returns('test_class');
            this.getDeviceCategory = sinon.stub().returns('Vacuum Cleaner');
            this.getDeviceCapabilities = sinon.stub().returns({});
            this.getProductImageURL = sinon.stub().returns('');
            this.getProtocol = sinon.stub().returns('MQTT');
            this.is950type = sinon.stub().returns(true);
            this.getModelType = sinon.stub().returns('950');
        }
    };

    const mockDevice = class {
        constructor() {
            this.status = 'idle';
        }
        isCleaning = sinon.stub().returns(false);
        isReturning = sinon.stub().returns(false);
        isNotCleaning = sinon.stub().returns(true);
    };

    const mockDeviceContext = class {
        constructor(adapter, deviceId, vacbot, vacuum) {
            this.adapter = adapter;
            this.deviceId = deviceId;
            this.vacbot = vacbot;
            this.vacuum = vacuum;
            this.connected = false;
            this.enabled = true;
            this.statePath = (path) => `${deviceId}.${path}`;
            this.getModel = sinon.stub().returns(new mockDeebotModel());
            this.getDevice = sinon.stub().returns(new mockDevice());
        }
    };

    const mockEventHandlers = {
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
    };

    let EcovacsDeebotFactory;
    let instance;

    beforeEach(() => {
        clock = sinon.useFakeTimers(1000000);
        sinon.resetHistory();

        mockEcoVacsAPI.prototype.connect = sinon.stub().resolves();
        mockEcoVacsAPI.prototype.devices = sinon.stub().resolves([]);
        mockEcoVacsAPI.prototype.getDevice = sinon.stub().callsFake(() => ({
            connect: sinon.stub(),
            connectShared: sinon.stub(),
            getMqttClient: sinon.stub().returns({ connected: true }),
            disconnect: sinon.stub(),
            removeAllListeners: sinon.stub(),
            on: sinon.stub()
        }));

        EcovacsDeebotFactory = proxyquire('../main', {
            '@iobroker/adapter-core': mockAdapterCore,
            'ecovacs-deebot': mockEcovacsDeebot,
            'node-machine-id': mockNodeMachineId,
            './lib/adapterObjects': mockAdapterObjects,
            './lib/constants': mockConstants,
            './lib/models': mockDeebotModel,
            './lib/device': mockDevice,
            './lib/deviceContext': mockDeviceContext,
            './lib/eventHandlers': mockEventHandlers,
            'axios': { default: { get: sinon.stub().resolves({ data: Buffer.from([]) }) } },
            'crypto': require('crypto')
        });

        instance = EcovacsDeebotFactory({});
    });

    afterEach(() => {
        clock.restore();
    });

    it('1. connect() calls should be ignored when _connecting is true', async () => {
        instance._connecting = true;
        await instance.connect();

        expect(instance.log.debug.calledWithMatch(/Connection already in progress/)).to.be.true;
        expect(mockEcoVacsAPI.prototype.connect.called).to.be.false;
    });

    it('2. connect() calls should be ignored when CONNECT_COOLDOWN_MS has not elapsed', async () => {
        instance._lastConnectTime = Date.now();
        clock.tick(mockConstants.CONNECT_COOLDOWN_MS - 1000);

        await instance.connect();

        expect(instance.log.debug.calledWithMatch(/Connect skipped - cooldown active/)).to.be.true;
        expect(mockEcoVacsAPI.prototype.connect.called).to.be.false;
    });

    it('3. Multiple devices discovered are connected sequentially with a 30s delay between them', async () => {
        const devices = [
            { did: 'device1', deviceName: 'Bot1' },
            { did: 'device2', deviceName: 'Bot2' }
        ];
        mockEcoVacsAPI.prototype.devices.resolves(devices);

        const connectPromise = instance.connect();

        // Wait for first device to be processed
        await clock.tickAsync(0);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(mockEcoVacsAPI.prototype.getDevice.calledOnce).to.be.true;

        // Advance clock by 30s
        await clock.tickAsync(30000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(mockEcoVacsAPI.prototype.getDevice.calledTwice).to.be.true;

        await connectPromise;
    });

    it('4. removeAllListeners() is called on existing vacbot instances before they are reconnected or during cleanup', () => {
        const mockVacbot = {
            disconnect: sinon.stub(),
            removeAllListeners: sinon.stub(),
            on: sinon.stub()
        };
        const mockCtx = {
            vacbot: mockVacbot,
            deviceId: 'test_device',
            vacuum: { did: 'test_did' },
            connected: true,
            enabled: true,
            getModel: () => ({ usesMqtt: () => true }),
            getDevice: () => ({ isCleaning: () => false, isReturning: () => false })
        };
        instance.deviceContexts.set('test_device', mockCtx);

        // Advance clock past startup grace period
        clock.tick(mockConstants.STARTUP_GRACE_PERIOD_MS + 1000);
        // Test reconnect cleanup
        instance.reconnect();
        expect(mockVacbot.removeAllListeners.calledOnce).to.be.true;

        // Re-add context for unload cleanup test
        instance.deviceContexts.set('test_device', mockCtx);

        // Test unload cleanup
        mockVacbot.removeAllListeners.resetHistory();
        instance.onUnload(() => { });
        expect(mockVacbot.removeAllListeners.calledOnce).to.be.true;
    });

    it('5. A device already in the connection queue or already connected is not added to the queue again', async () => {
        const devices = [
            { did: 'device1', deviceName: 'Bot1' }
        ];
        mockEcoVacsAPI.prototype.devices.resolves(devices);

        // Pre-fill deviceContexts
        const mockCtx = {
            deviceId: 'device1',
            vacuum: { did: 'device1' }
        };
        instance.deviceContexts.set('device1', mockCtx);

        await instance.connect();

        // Should NOT have called getDevice for device1 because it already exists
        expect(mockEcoVacsAPI.prototype.getDevice.called).to.be.false;
    });

    it('6. getDevice throwing XML based model identified (unsupported) error is caught, logged, and device skipped', async () => {
        const devices = [
            { did: 'device1', deviceName: 'Bot1' },
            { did: 'device2', deviceName: 'Bot2' }
        ];
        mockEcoVacsAPI.prototype.devices.resolves(devices);

        // Make getDevice fail for device1 but succeed for device2
        mockEcoVacsAPI.prototype.getDevice.onFirstCall().throws(new Error("'XML' based model identified (unsupported)"));
        mockEcoVacsAPI.prototype.getDevice.onSecondCall().returns({
            connect: sinon.stub(),
            disconnect: sinon.stub(),
            removeAllListeners: sinon.stub(),
            on: sinon.stub()
        });

        const connectPromise = instance.connect();

        await clock.tickAsync(0);
        expect(instance.log.error.calledWithMatch(/'XML' based model identified/)).to.be.true;

        // Skip device1, advance clock to handle device2 staggered connect delay
        await clock.tickAsync(30000);
        await connectPromise;

        // Device contexts should only contain device2
        expect(instance.deviceContexts.has('device1')).to.be.false;
        expect(instance.deviceContexts.has('device2')).to.be.true;
    });
});
