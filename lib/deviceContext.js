'use strict';

const Queue = require('./adapterQueue');

class DeviceContext {
    /**
     * @param {object} adapter
     * @param {string} deviceId
     * @param {object} vacbot
     * @param {object} vacuum
     * @param {object} [throttle] - Optional RequestThrottle instance for rate limiting
     * @param {boolean} [skipPrefix=false] - When true, adapterProxy does NOT prepend deviceId
     */
    constructor(adapter, deviceId, vacbot, vacuum, throttle = null, skipPrefix = false) {
        this.adapter = adapter;
        this.deviceId = deviceId;
        this.did = vacuum.did;
        this.vacbot = vacbot;
        this.vacuum = vacuum;

        this.model = null;
        this.device = null;
        this.api = null;

        this.commandQueue = new Queue(this, 'commandQueue', 500, true, throttle);
        this.intervalQueue = new Queue(this, 'intervalQueue', 1000, true, throttle);
        this.cleaningQueue = new Queue(this, 'cleaningQueue', 0, false);

        // In-memory caches for performance optimization
        // Avoids repeated ioBroker DB roundtrips for state reads and object existence checks
        this._stateValues = new Map();
        this._createdObjects = new Set();
        this._createdChannels = new Set();

        this.connected = false;
        this.connectionFailed = false;
        this.connectedTimestamp = 0;
        this.chargestatus = '';
        this.cleanstatus = '';
        this.waterLevel = null;
        this.moppingType = null;
        this.cleanSpeed = null;
        this.currentMapID = '';
        this.deebotPositionIsInvalid = true;
        this.currentCleanedArea = 0;
        this.currentCleanedSeconds = 0;
        this.currentSpotAreaID = 'unknown';
        this.currentSpotAreaName = 'unknown';
        this.currentSpotAreaData = {
            'spotAreaID': 'unknown',
            'lastTimeEnteredTimestamp': 0
        };
        this.cleaningClothReminder = {
            'enabled': false,
            'period': 30
        };
        this.cleanPreference = null;
        this.relocationState = 'unknown';
        this.goToPositionArea = null;
        this.deebotPosition = null;
        this.chargePosition = null;
        this.pauseBeforeDockingChargingStation = false;
        this.pauseBeforeDockingIfWaterboxInstalled = false;
        this.resetCleanSpeedToStandardOnReturn = false;
        this.waterboxInstalled = null;
        this.pauseWhenEnteringSpotArea = '';
        this.pauseWhenLeavingSpotArea = '';
        this.customAreaCleanings = 1;
        this.spotAreaCleanings = 1;
        this.cleaningLogAcknowledged = false;
        this.lastChargeStatus = '';
        this.errorCode = null;
        this.last20Errors = [];
        this.retries = 0;
        this.silentApproach = {};
        this.retrypauseTimeout = null;
        this.getStatesInterval = null;
        this.getGetPosInterval = null;
        this.airDryingActiveInterval = null;
        this.airDryingStartTimestamp = 0;
        this.unreachableWarningSent = false;
        this.unreachableRetryTimeout = null;
        this.unreachableRetryCount = 0;
        this._pendingErrorWriteTimeout = null;
        this.disconnecting = false;

        // Consecutive command failure tracking for detecting when a robot goes unreachable
        this.commandFailedCount = 0;
        this.commandFailedResetTimeout = null;

        // Store skipPrefix flag for statePath() usage
        this.skipPrefix = skipPrefix;

        // Device enabled/disabled flag - when false, device control and sync are deactivated
        this.enabled = true;

        // MQTT session sharing: first device owns the connection, others reuse it.
        /** @type {boolean} */ this.isPrimaryMqttDevice = false;
        /** @type {boolean} */ this.usesSharedMqttClient = false;

        // adapterProxy: the adapter's state/object helpers, but with the first
        // argument (the state/object id) auto-prefixed with this device's id.
        // Built as an explicit object of wrapper functions rather than a Proxy:
        // the call path is a plain function call (no per-access `get` trap on a
        // hot object) and only the intended methods are exposed. skipPrefix
        // (single-device mode) yields an empty prefix.
        const prefix = skipPrefix ? '' : (deviceId + '.');
        const prefixMethods = [
            'createObjectNotExists', 'setStateConditional', 'setStateConditionalAsync',
            'getStateAsync', 'objectExists', 'deleteObjectIfExists',
            'createChannelNotExists', 'setObjectNotExistsAsync', 'getObjectAsync',
            'extendObjectAsync', 'deleteChannelIfExists', 'getChannelsOfAsync'
        ];
        this.adapterProxy = {};
        for (const method of prefixMethods) {
            this.adapterProxy[method] = (...args) => {
                // Prefix the id unless it is already prefixed (callers may pass a
                // statePath()-built id). With an empty prefix (skipPrefix) this is
                // a no-op since every string startsWith('').
                if (typeof args[0] === 'string' && !args[0].startsWith(prefix)) {
                    args[0] = prefix + args[0];
                }
                return adapter[method](...args);
            };
        }
    }

    statePath(path) {
        if (this.skipPrefix) {
            return path;
        }
        return this.deviceId + '.' + path;
    }

    getModel() {
        return this.model;
    }

    getDevice() {
        return this.device;
    }

    /**
     * Returns the technical platform/architecture type.
     * Delegates to model.getPlatformType().
     * @returns {string}
     */
    getPlatformType() {
        return this.model ? this.model.getPlatformType() : '';
    }

    /**
     * Returns the smart type of the device.
     * Delegates to model.getSmartType().
     * @returns {string}
     */
    getSmartType() {
        return this.model ? this.model.getSmartType() : '';
    }

    /**
     * @deprecated Use getPlatformType() instead.
     * @returns {string}
     */
    getModelType() {
        return this.getPlatformType();
    }
}

module.exports = DeviceContext;