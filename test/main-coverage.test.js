'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach, afterEach } = require('mocha');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');

describe('main.js - comprehensive coverage', () => {
    let EcovacsDeebotFactory;
    let instance;
    let clock;

    const mockEcoVacsAPI = sinon.stub();
    mockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
    mockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
    mockEcoVacsAPI.REALM = 'mocked-realm';
    mockEcoVacsAPI.isCanvasModuleAvailable = sinon.stub().returns(false);

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
                this._startupTime = 0;

                this.on = sinon.stub();
                this.getStateAsync = sinon.stub().resolves({ val: null });
                this.getObject = sinon.stub();
                this.getObjectAsync = sinon.stub().resolves(null);
                this.getForeignObjectAsync = sinon.stub().resolves(null);
                this.setForeignObjectAsync = sinon.stub().resolves();
                this.setObjectNotExistsAsync = sinon.stub().resolves();
                this.delObjectAsync = sinon.stub().resolves();
                this.extendObject = sinon.stub();
                this.subscribeStates = sinon.stub();
                this.sendTo = sinon.stub();
                this.setState = sinon.stub();
                this.formatDate = sinon.stub().returns('2026-05-30 12:00:00');
                this.fileExistsAsync = sinon.stub().resolves(false);
                this.writeFileAsync = sinon.stub().resolves();
            }
        }
    };

    const mockNodeMachineId = {
        machineIdSync: sinon.stub().returns('test-machine-id')
    };

    const mockAdapterObjects = {
        createInitialInfoObjects: sinon.stub().resolves(),
        createInitialObjects: sinon.stub().resolves(),
        createControlSweepModeIfNotExists: sinon.stub().resolves(),
        createControlScrubbingPatternIfNotExists: sinon.stub().resolves()
    };

    const mockAdapterCommands = {
        handleStateChange: sinon.stub().resolves(),
        runSetCleanSpeed: sinon.stub().resolves(),
        startSpotAreaCleaning: sinon.stub().resolves(),
        cleanSpotArea: sinon.stub().resolves()
    };

    const mockConstants = {
        MIN_POLLING_INTERVAL_MS: 10000,
        RECOVERY_DEBOUNCE_MS: 5000,
        RECONNECT_COOLDOWN_MS: 60000,
        AIR_DRYING_INTERVAL_MS: 60000,
        AIR_DRYING_RESET_DELAY_MS: 60000,
        STARTUP_GRACE_PERIOD_MS: 30000,
        DEVICE_CONNECTION_DELAY_MS: 1000,
        COMMAND_FAILURE_RESET_TIMEOUT_MS: 60000,
        BACKOFF_SCHEDULE: [30000, 60000, 300000],
        CONNECT_COOLDOWN_MS: 60000
    };

    const mockAdapterHelper = {
        getUnixTimestamp: sinon.stub().returns(1748592000),
        getCurrentDateAndTimeFormatted: sinon.stub().returns('2026-05-30 12:00:00'),
        getTimeStringFormatted: sinon.stub().returns('0h 00m 00s'),
        isIdValid: sinon.stub().returns(true),
        positionIsInRectangleForPosition: sinon.stub().returns(false),
        positionIsInAreaValueString: sinon.stub().returns(false)
    };

    const mockDeebotModel = class {
        constructor() {
            this.is950type = sinon.stub().returns(true);
            this.getProtocol = sinon.stub().returns('MQTT/JSON');
            this.getProductName = sinon.stub().returns('Test Model');
            this.getDeviceClass = sinon.stub().returns('p1jij8');
            this.getDeviceCategory = sinon.stub().returns('Vacuum Cleaner');
            this.isSupportedFeature = sinon.stub().returns(true);
            this.usesMqtt = sinon.stub().returns(true);
            this.usesXmpp = sinon.stub().returns(false);
            this.isModelTypeT9Based = sinon.stub().returns(false);
            this.isModelTypeT20 = sinon.stub().returns(false);
            this.isModelTypeX2 = sinon.stub().returns(false);
            this.isModelTypeX1 = sinon.stub().returns(false);
            this.isModelTypeAirbot = sinon.stub().returns(false);
            this.getPlatformType = sinon.stub().returns('950');
        }
    };

    const mockDevice = class {
        constructor() {
            this.status = 'stopped';
        }
        isCleaning = sinon.stub().returns(false);
        isReturning = sinon.stub().returns(false);
        isNotCleaning = sinon.stub().returns(true);
        isNotPaused = sinon.stub().returns(true);
        isNotStopped = sinon.stub().returns(false);
        setStatusByTrigger = sinon.stub();
    };

    const mockDeviceContext = class {
        constructor(adapter, deviceId, vacbot, vacuum) {
            this.adapter = adapter;
            this.deviceId = deviceId;
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
            this.commandFailedCount = 0;
            this.commandFailedResetTimeout = null;
            this.retries = 0;
            this.enabled = true;
            this._autoUpdateTimeout = null;
            this._stateValues = new Map();
            this.last20Errors = [];
            this.currentCleanedSeconds = 0;
            this.currentCleanedArea = 0;
            this.silentApproach = {};
            this.cleaningClothReminder = { enabled: false, period: 0 };
            this.currentSpotAreaData = { spotAreaID: 'unknown', lastTimeEnteredTimestamp: 0 };
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
            this.statePath = sinon.stub().callsFake((p) => this.deviceId + '.' + p);
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

    const mockMapHelper = {
        getAreaName_i18n: sinon.stub().returns('Area'),
        positionIsInAreaValueString: sinon.stub().returns(false),
        positionIsInRectangleForPosition: sinon.stub().returns(false)
    };

    beforeEach(() => {
        clock = sinon.useFakeTimers();
        sinon.resetHistory();

        mockEcoVacsAPI.prototype.connect = sinon.stub().resolves();
        mockEcoVacsAPI.prototype.devices = sinon.stub().resolves([
            { did: 'device1', deviceName: 'Deebot X1', nick: 'Living Room', class: 'p1jij8' }
        ]);
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

        instance = EcovacsDeebotFactory({});
    });

    afterEach(() => {
        clock.restore();
        sinon.restore();
    });


    describe('onMessage', () => {
        it('should handle loginAndFetchDevices', async () => {
            const message = { email: 'test@test.com', password: 'pass', countrycode: 'DE' };
            await instance.onMessage({ command: 'loginAndFetchDevices', message, from: 'admin', callback: 'cb' });
            expect(instance.sendTo.calledOnce).to.be.true;
        });

        it('should handle getDeviceList', async () => {
            await instance.onMessage({ command: 'getDeviceList', from: 'admin', callback: 'cb' });
            expect(instance.sendTo.calledOnce).to.be.true;
        });
    });

    describe('reconnect', () => {
        it('should skip reconnect during startup grace period', () => {
            instance._startupTime = 1000;
            clock.tick(5000);
            instance.reconnect();
            expect(instance.log.debug.calledWith('Reconnect skipped - startup grace period active')).to.be.true;
        });

        it('should perform reconnect after grace period', () => {
            instance._startupTime = 100;
            clock.tick(60000);
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            instance.deviceContexts.set('dev1', ctx);
            instance.reconnect();
            expect(instance.log.info.calledWith('Reconnecting ...')).to.be.true;
        });
    });

    describe('MQTT Unreachable', () => {
        it('setGlobalMqttUnreachable should mark all devices failed', () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            instance.deviceContexts.set('dev1', ctx);
            instance.setGlobalMqttUnreachable(ctx);
            expect(instance.globalMqttUnreachable).to.be.true;
        });
        
        it('clearGlobalMqttUnreachable should reset state', () => {
            instance.globalMqttUnreachable = true;
            instance.clearGlobalMqttUnreachable();
            expect(instance.globalMqttUnreachable).to.be.false;
        });
    });

    describe('State Management', () => {
        it('setStateConditional should update if value different', () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            instance.deviceContexts.set('dev1', ctx);
            instance.getObject = sinon.stub().yields(null, { type: 'state' });
            instance.getState = sinon.stub().yields(null, { val: 0 });
            instance.setStateConditional('dev1.info.battery', 100);
            expect(instance.setState.called).to.be.true;
        });

        it('setStateConditionalAsync should update if value different', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            instance.deviceContexts.set('dev1', ctx);
            instance.getObjectAsync = sinon.stub().resolves({ type: 'state' });
            instance.getStateAsync = sinon.stub().resolves({ val: 0 });
            await instance.setStateConditionalAsync('dev1.info.battery', 100);
            expect(instance.setState.called).to.be.true;
        });
    });

    describe('Polling', () => {
        it('startPolling should set interval', () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            instance.startPolling(ctx);
            expect(ctx._autoUpdateInterval).to.not.be.null;
            instance.stopPolling(ctx);
        });

        it('vacbotGetStatesInterval should run queue', () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.connected = true;
            instance.vacbotGetStatesInterval(ctx);
            expect(ctx.intervalQueue.runAll.called).to.be.true;
        });
    });

    describe('Config Migration', () => {
        it('migrateNativeConfig should rename keys', async () => {
            const adapterObj = { native: { 'feature.map.virtualBoundaries': 'val' } };
            instance.getForeignObjectAsync = sinon.stub().resolves(adapterObj);
            await instance.migrateNativeConfig();
            expect(adapterObj.native['feature.map.virtualBoundariesRead']).to.equal('val');
        });
    });

    describe('Handlers', () => {
        it('handleSweepMode should set mopping mode', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            await instance.handleSweepMode(ctx, 1);
            expect(ctx.adapterProxy.setStateConditionalAsync.calledWith('info.extended.moppingMode', 'deep')).to.be.true;
        });

        it('handleAirDryingActive should update process state', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.adapterProxy.getStateAsync.resolves({ val: false });
            instance.handleAirDryingActive(ctx, true);
            await clock.tickAsync(100);
            expect(instance.log.info.calledWith('Air drying process started')).to.be.true;
        });

        it('handleWaterBoxScrubbingType should update states', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.moppingType = 'scrubbing';
            ctx.adapterProxy.objectExists.resolves(true);
            await instance.handleWaterBoxScrubbingType(ctx, 1);
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.waterbox_scrubbingPattern', 'quick scrubbing')).to.be.true;
        });
    });

    describe('Device Status and Info', () => {
        it('setInitialStateValues should fetch and set states', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.adapterProxy.getStateAsync.callsFake((id) => {
                if (id === 'history.last20Errors') return Promise.resolve({ val: '[]' });
                return Promise.resolve({ val: 'test' });
            });
            await instance.setInitialStateValues(ctx);
            expect(ctx.cleanstatus).to.equal('test');
        });

        it('setDeviceStatusByTrigger should update status', () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.getDevice().status = 'cleaning';
            instance.setDeviceStatusByTrigger(ctx, 'clean');
            expect(ctx.adapterProxy.setStateConditional.calledWith('info.deviceStatus', 'cleaning')).to.be.true;
        });
        
        it('setHistoryValuesForDustboxRemoval should reset stats', () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            instance.setHistoryValuesForDustboxRemoval(ctx);
            expect(ctx.adapterProxy.setStateConditional.calledWith('history.cleaningTimeSinceLastDustboxRemoved', 0)).to.be.true;
        });
    });

    describe('Position and Area Handlers', () => {
        it('handlePositionObj should update position states', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            const obj = { coords: '10,20', x: 10, y: 20, spotAreaID: '1', distanceToChargingStation: 50 };
            await instance.handlePositionObj(ctx, obj);
            expect(ctx.deebotPosition).to.equal('10,20');
            expect(ctx.adapterProxy.setStateConditional.calledWith('map.deebotPositionCurrentSpotAreaID', '1')).to.be.true;
        });

        it('isCurrentSpotAreaPartOfCleaningProcess should return boolean', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.getDevice().isNotCleaning.returns(false);
            ctx.cleanstatus = 'spot_area';
            ctx.currentSpotAreaID = '1';
            ctx.adapterProxy.getStateAsync.resolves({ val: '1,2,3' });
            const result = await instance.isCurrentSpotAreaPartOfCleaningProcess(ctx);
            expect(result).to.be.true;
        });

        it('handleChangedCurrentSpotAreaID should update spot area data', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.getDevice().isCleaning.returns(true);
            await instance.handleChangedCurrentSpotAreaID(ctx, '2');
            expect(ctx.currentSpotAreaData.spotAreaID).to.equal('2');
        });
        
        it('setCurrentSpotAreaName should update name state', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.adapterProxy.getStateAsync.resolves({ val: 'Kitchen' });
            await instance.setCurrentSpotAreaName(ctx, '1');
            expect(ctx.adapterProxy.setStateConditional.calledWith('map.deebotPositionCurrentSpotAreaName')).to.be.true;
        });

        it('handleCleanSpeedForSpotArea should update clean speed', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.adapterProxy.getStateAsync.resolves({ val: 3 });
            await instance.handleCleanSpeedForSpotArea(ctx, '1');
            expect(ctx.cleanSpeed).to.equal(3);
        });

        it('handleWaterLevelForSpotArea should update water level', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.waterboxInstalled = true;
            ctx.adapterProxy.getStateAsync.resolves({ val: 2 });
            await instance.handleWaterLevelForSpotArea(ctx, '1');
            expect(ctx.waterLevel).to.equal(2);
        });

        it('handleDurationForLastTimePresence should call mapObjects', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            ctx.currentSpotAreaData.lastTimeEnteredTimestamp = clock.now - 30;
            await instance.handleDurationForLastTimePresence(ctx);
            expect(mockMapObjects.createOrUpdateLastTimePresenceAndLastCleanedSpotArea.called).to.be.true;
        });
    });

    describe('Map Image', () => {
        it('downloadLastCleaningMapImage should call axios', async () => {
            const ctx = new mockDeviceContext(instance, 'dev1', {}, { did: 'dev1' });
            instance.downloadLastCleaningMapImage(ctx, 'http://example.com/map.png', 0);
            await clock.tickAsync(100);
            expect(instance.writeFileAsync.called).to.be.true;
        });
    });
});
