'use strict';

const sinon = require('sinon');

/**
 * Create a comprehensive mock model object with all methods used across the codebase.
 * @param {Object} [overrides] - Properties/methods to override on the default model
 * @returns {Object} A mock model object with sinon stubs
 */
function createMockModel(overrides = {}) {
    const model = {
        // Type checks
        is950type: sinon.stub().returns(true),
        is950type_V2: sinon.stub().returns(false),
        isNot950type: sinon.stub().returns(false),
        isNot950type_V2: sinon.stub().returns(true),
        isModelTypeAirbot: sinon.stub().returns(false),
        isModelTypeT20: sinon.stub().returns(false),
        isModelTypeX1: sinon.stub().returns(false),
        isModelTypeX2: sinon.stub().returns(false),
        isModelTypeT9Based: sinon.stub().returns(false),
        getModelType: sinon.stub().returns('950'),
        getPlatformType: sinon.stub().returns('950'),
        getSmartType: sinon.stub().returns('950'),

        // Feature checks
        isSupportedFeature: sinon.stub().returns(true),
        hasMappingCapabilities: sinon.stub().returns(true),
        isMappingSupported: sinon.stub().returns(true),
        hasMoppingSystem: sinon.stub().returns(true),
        hasSpotAreaCleaningMode: sinon.stub().returns(true),
        hasCustomAreaCleaningMode: sinon.stub().returns(true),
        hasAdvancedMode: sinon.stub().returns(true),
        hasAirDrying: sinon.stub().returns(false),
        hasCleaningStation: sinon.stub().returns(false),
        hasFloorWashing: sinon.stub().returns(false),
        hasRoundMopInfo: sinon.stub().returns(false),
        hasOtaSupport: sinon.stub().returns(true),

        // Device info getters
        getDeviceCategory: sinon.stub().returns('Vacuum Cleaner'),
        getDeviceCapabilities: sinon.stub().returns({ type: 'Vacuum Cleaner', hasMapping: true }),

        // Nested vacbot for model-level device property checks
        vacbot: {
            getDeviceProperty: sinon.stub().returns(false)
        }
    };

    return Object.assign(model, overrides);
}

/**
 * Create a mock device object (as returned by Device class / ctx.getDevice()).
 * @param {Object} [overrides] - Properties/methods to override on the default device
 * @returns {Object} A mock device object with sinon stubs
 */
function createMockDevice(overrides = {}) {
    const device = {
        status: 'idle',
        cleanStatus: null,
        chargeStatus: null,
        batteryLevel: null,
        setStatus: sinon.stub(),
        setBatteryLevel: sinon.stub(),
        setStatusByTrigger: sinon.stub(),
        isCleaning: sinon.stub().returns(false),
        isNotCleaning: sinon.stub().returns(true),
        isCharging: sinon.stub().returns(false),
        isNotCharging: sinon.stub().returns(true),
        isPaused: sinon.stub().returns(false),
        isReturning: sinon.stub().returns(false),
        isError: sinon.stub().returns(false),
        useV2commands: sinon.stub().returns(false),
        useNativeGoToPosition: sinon.stub().returns(false)
    };

    return Object.assign(device, overrides);
}

/**
 * Create a mock adapter object with all methods/properties used by the adapter modules.
 * @param {Object} [overrides] - Properties/methods to override on the default adapter
 * @returns {Object} A mock adapter object with sinon stubs
 */
function createMockAdapter(overrides = {}) {
    const adapter = {
        namespace: 'ecovacs-deebot.0',
        authFailed: false,

        // Logging
        log: {
            silly: sinon.stub(),
            debug: sinon.stub(),
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub()
        },

        // State operations (sync)
        getState: sinon.stub().callsFake((_id, cb) => {
            if (cb) cb(null, { val: null });
        }),
        setState: sinon.stub(),
        setStateConditional: sinon.stub(),

        // State operations (async)
        getStateAsync: sinon.stub().resolves({ val: null }),
        setStateConditionalAsync: sinon.stub().resolves(),

        // Object operations (sync)
        getObject: sinon.stub().callsFake((_id, cb) => {
            if (cb) cb(null, { common: { name: 'Test Object', role: 'state' } });
        }),
        setObjectNotExists: sinon.stub().callsFake((_id, _obj, cb) => {
            if (cb) cb(null);
        }),
        extendObject: sinon.stub().resolves(),

        // Object operations (async)
        getObjectAsync: sinon.stub().resolves({ common: { name: 'Test Object' } }),
        setObjectNotExistsAsync: sinon.stub().resolves(),
        extendObjectAsync: sinon.stub().resolves(),

        // Channel/object lifecycle
        createChannelNotExists: sinon.stub().resolves(),
        createObjectNotExists: sinon.stub().resolves(),
        objectExists: sinon.stub().resolves(false),
        deleteObjectIfExists: sinon.stub().resolves(),
        deleteChannelIfExists: sinon.stub().resolves(),
        getChannelsOfAsync: sinon.stub().resolves([]),

        // Utility
        clearGoToPosition: sinon.stub(),
        getCurrentDateAndTimeFormatted: sinon.stub().returns('2023.01.01 12:00:00'),
        getHoursUntilDustBagEmptyReminderFlagIsSet: sinon.stub().returns(0),
        getConfigValue: sinon.stub().returns(true),
        reconnect: sinon.stub()
    };

    return Object.assign(adapter, overrides);
}

/**
 * Create a mock DeviceContext-like object with all properties, methods, and
 * an adapterProxy that mirrors the real DeviceContext interface.
 *
 * @param {Object} [overrides] - Properties/methods to override or merge into the ctx.
 *   Nested objects like `adapterProxy`, `vacbot`, etc. are shallow-merged.
 *   Use `_model` to supply a custom model and `_device` to supply a custom device.
 * @returns {Object} A mock ctx object suitable for passing to adapter module functions
 */
function createMockCtx(overrides = {}) {
    const adapter = (overrides && overrides.adapter) || createMockAdapter();
    const model = (overrides && overrides._model) || createMockModel();
    const device = (overrides && overrides._device) || createMockDevice();

    // Build the adapterProxy with all prefixable methods as stubs
    const adapterProxy = Object.assign({
        createChannelNotExists: sinon.stub().resolves(),
        createObjectNotExists: sinon.stub().resolves(),
        setStateConditional: sinon.stub(),
        setStateConditionalAsync: sinon.stub().resolves(),
        getStateAsync: sinon.stub().resolves({ val: null }),
        objectExists: sinon.stub().resolves(false),
        deleteObjectIfExists: sinon.stub().resolves(),
        setObjectNotExistsAsync: sinon.stub().resolves(),
        getObjectAsync: sinon.stub().resolves({ common: { name: 'Test Object' } }),
        extendObjectAsync: sinon.stub().resolves(),
        deleteChannelIfExists: sinon.stub().resolves(),
        getChannelsOfAsync: sinon.stub().resolves([])
    }, overrides.adapterProxy || {});

    // Build the vacbot mock
    const vacbot = Object.assign({
        run: sinon.stub(),
        getPlatformType: sinon.stub().returns('950'),
        getSmartType: sinon.stub().returns('950'),
        getDeviceCategory: sinon.stub().returns('Vacuum Cleaner'),
        hasMoppingSystem: sinon.stub().returns(true),
        hasMainBrush: sinon.stub().returns(true),
        hasSpotAreaCleaningMode: sinon.stub().returns(true),
        hasRoundMopInfo: sinon.stub().returns(false),
        hasUnitCareInfo: sinon.stub().returns(false),
        hasVacuumPowerAdjustment: sinon.stub().returns(false),
        hasHotWaterWashing: sinon.stub().returns(false),
        getDeviceProperty: sinon.stub().returns(false)
    }, overrides.vacbot || {});

    const ctx = {
        // Core references
        adapter: adapter,
        adapterProxy: adapterProxy,
        vacbot: vacbot,
        vacuum: Object.assign({ did: 'test_did' }, overrides.vacuum || {}),

        // Identity
        deviceId: 'test_device',
        did: 'test_did',

        // Model / device accessors
        model: model,
        device: device,
        getModel: sinon.stub().returns(model),
        getModelType: sinon.stub().returns('950'),
        getPlatformType: sinon.stub().returns('950'),
        getSmartType: sinon.stub().returns('950'),
        getDevice: sinon.stub().returns(device),

        // Queues (lightweight stubs - tests that need real Queue behaviour should
        // instantiate real Queue objects or provide their own overrides)
        commandQueue: { add: sinon.stub(), resetQueue: sinon.stub(), entries: [] },
        intervalQueue: { add: sinon.stub(), resetQueue: sinon.stub(), entries: [] },
        cleaningQueue: {
            add: sinon.stub(),
            resetQueue: sinon.stub(),
            entries: [],
            createMultipleCleaningsForSpotArea: sinon.stub()
        },

        // Connection state
        connected: false,
        connectionFailed: false,
        connectedTimestamp: 0,
        enabled: true,
        retries: 0,
        retrypauseTimeout: null,
        unreachableWarningSent: false,
        unreachableRetryTimeout: null,
        unreachableRetryCount: 0,

        // Device status properties
        chargestatus: '',
        cleanstatus: '',
        lastChargeStatus: '',
        waterLevel: null,
        moppingType: null,
        cleanSpeed: null,
        cleanPreference: null,
        waterboxInstalled: null,
        errorCode: null,
        last20Errors: [],

        // Map / position properties
        currentMapID: '',
        deebotPositionIsInvalid: true,
        currentCleanedArea: 0,
        currentCleanedSeconds: 0,
        currentSpotAreaID: 'unknown',
        currentSpotAreaName: 'unknown',
        currentSpotAreaData: {
            spotAreaID: 'unknown',
            lastTimeEnteredTimestamp: 0
        },
        relocationState: 'unknown',
        goToPositionArea: null,
        deebotPosition: null,
        chargePosition: null,

        // Behaviour flags
        pauseBeforeDockingChargingStation: false,
        pauseBeforeDockingIfWaterboxInstalled: false,
        resetCleanSpeedToStandardOnReturn: false,
        pauseWhenEnteringSpotArea: '',
        pauseWhenLeavingSpotArea: '',
        customAreaCleanings: 1,
        spotAreaCleanings: 1,
        cleaningLogAcknowledged: false,
        cleaningClothReminder: {
            enabled: false,
            period: 30
        },
        silentApproach: {},

        // Intervals / timers
        getStatesInterval: null,
        getGetPosInterval: null,
        airDryingActiveInterval: null,
        airDryingStartTimestamp: 0,

        // Helper method
        statePath: sinon.stub().callsFake(function (path) {
            return 'test_device.' + path;
        })
    };

    // Merge remaining overrides (skip keys already handled above)
    const handledKeys = new Set([
        'adapter', 'adapterProxy', 'vacbot', 'vacuum', '_model', '_device'
    ]);
    for (const key of Object.keys(overrides)) {
        if (!handledKeys.has(key)) {
            ctx[key] = overrides[key];
        }
    }

    return ctx;
}

module.exports = {
    createMockAdapter,
    createMockCtx,
    createMockModel,
    createMockDevice
};
