'use strict';

/**
 * @typedef {Object} VacBot
 * @property {function(): void} connect
 * @property {function(Object): void} connectShared
 * @property {function(): (Object|null)} getMqttClient
 * @property {function(): Promise<any>} disconnect
 * @property {function(string, function): void} on
 * @property {function(): void} [removeAllListeners]
 * @property {Object} [client]
 */

const utils = require('@iobroker/adapter-core');
const ecovacsDeebot = require('ecovacs-deebot');
const nodeMachineId = require('node-machine-id');
const adapterObjects = require('./lib/adapterObjects');
const adapterCommands = require('./lib/adapterCommands');
const C = require('./lib/constants');
const helper = require('./lib/adapterHelper');
const Model = require('./lib/models');
const Device = require('./lib/device');
const DeviceContext = require('./lib/deviceContext');
const RequestThrottle = require('./lib/requestThrottle');
const EcoVacsAPI = ecovacsDeebot.EcoVacsAPI;
// Device-verification error types (login response codes 1013 / 1012). Also
// exposed as static props on EcoVacsAPI; captured here for instanceof checks.
// (Cast: the library's shipped type defs don't declare these runtime exports.)
const { DeviceVerificationRequired, InvalidVerificationCode } = /** @type {any} */ (ecovacsDeebot);
const mapObjects = require('./lib/mapObjects');
const eventHandlers = require('./lib/eventHandlers');
const mapHelper = require('./lib/mapHelper');

/**
 * Maps the dotted feature.* config keys used throughout the adapter to the
 * (dot-free) field names of the per-device "devices" accordion in
 * admin/jsonConfig.json. Dot-free attr names are required because the admin
 * UI unflattens dotted keys into nested objects (see migrateNativeConfig).
 *
 * The virtualBoundaries entries intentionally map to the keys that
 * Model.getConfigOverride() actually reads ('feature.map.virtualBoundaries'
 * and '...write'), not the legacy '...Read'/'...Write' native names.
 */
const PER_DEVICE_FEATURE_KEYS = {
    'feature.info.dustbox': 'infoDustbox',
    'feature.control.autoBoostSuction': 'controlAutoBoostSuction',
    'feature.map.mapImage': 'mapMapImage',
    'feature.map.virtualBoundaries': 'mapVirtualBoundariesRead',
    'feature.map.virtualBoundaries.write': 'mapVirtualBoundariesWrite',
    'feature.control.spotAreaKeepModifiedNames': 'controlSpotAreaKeepModifiedNames',
    'feature.control.spotAreaSync': 'controlSpotAreaSync',
    'feature.control.autoEmptyStation': 'controlAutoEmptyStation',
    'feature.info.extended.hoursUntilDustBagEmptyReminderFlagIsSet': 'infoHoursUntilDustBagEmptyReminder',
    'feature.map.spotAreas.cleanSpeed': 'mapSpotAreasCleanSpeed',
    'feature.map.spotAreas.waterLevel': 'mapSpotAreasWaterLevel',
    'feature.control.experimental': 'controlExperimental',
    'feature.control.v2commands': 'controlV2commands',
    'feature.control.nativeGoToPosition': 'controlNativeGoToPosition',
    'feature.pauseBeforeDockingChargingStation.areasize': 'pauseBeforeDockingAreasize',
    'feature.pauseBeforeDockingChargingStation.pauseOrStop': 'pauseBeforeDockingPauseOrStop',
    'feature.map.spotAreas.lastTimePresence.threshold': 'mapSpotAreasLastTimePresenceThreshold',
    'feature.cleaninglog.downloadLastCleaningMapImage': 'cleaninglogDownloadLastCleaningMapImage',
    'feature.control.move': 'controlMove',
    'feature.consumable.airFreshener': 'consumableAirFreshener'
};

class EcovacsDeebot extends utils.Adapter {
    constructor(options) {
        super(
            Object.assign(
                options || {}, {
                    name: 'ecovacs-deebot'
                }
            )
        );
        this._deviceConnectionTimeout = null;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.on('message', this.onMessage.bind(this));

        this.deviceContexts = new Map();
        this.pollingInterval = 120000;
        this.autoUpdateInterval = 30000; // Debounced auto-update: max 30s between polls, reset on any event
        this.password = '';
        this.authFailed = false;

        // Global request throttle — the hard cloud-request rate cap. Starts at
        // one device's budget and is scaled by device count in connect(). See
        // the "Request budget" note in lib/constants.js for how this interacts
        // with the per-queue pacing delay.
        this.requestThrottle = new RequestThrottle({
            maxRequests: C.REQUEST_THROTTLE_MAX_PER_DEVICE,
            windowMs: C.REQUEST_THROTTLE_WINDOW_MS
        });

        // Global MQTT unreachable state - when set, ALL device requests are paused
        // This prevents a flood of identical "MQTT server is offline" warnings
        // from multiple devices when the MQTT server goes down
        this.globalMqttUnreachable = false;
        this.globalMqttUnreachableTimeout = null;
        this.globalMqttUnreachableCount = 0;
        this.globalMqttOfflineWarningSent = false;
        this.lastMqttOfflineLogTimestamp = 0;
        this._lastConnectTime = 0;
        this._startupTime = 0;

        // Active EcovacsAPI instance (shared by all devices of one account).
        // Kept so automatic token refresh can be torn down on unload.
        this.api = null;
        this._onCredentialsUpdated = null;
        this._onCredentialsRefreshError = null;

        // Persisted client deviceId (see ensureDeviceId) - one per account.
        this._clientDeviceId = null;
        // Device-verification (login response code 1013) state.
        this._awaitingVerification = false;
        this._verificationStatus = 'idle';
        // The auth params (continent, passwordHash) captured when verification
        // started, so setupDevices can run with the same values afterwards.
        this._verificationAuth = null;
        // Guards against concurrent verifyDevice submissions.
        this._verifying = false;
    }

    async onReady() {
        this._startupTime = Date.now();
        this.log.info(`EcovacsDeebot onReady: namespace=${this.namespace}, adapter is alive and listening`);
        // Migrate legacy native key that collides with dot-notation unflattening
        await this.migrateNativeConfig();

        // Assign logger to the throttle now that adapter is ready
        this.requestThrottle.log = this.log;

        // Reset the connection indicator during startup
        this.setStateConditional('info.connection', false, true);
        this.setStateConditional('info.deviceCount', 0, true);
        this.setStateConditional('info.deviceDiscovery', '', true);

        // Ensure the persisted-deviceId and device-verification state trees exist
        // before connect() may need them (new installs / dev instances where the
        // io-package instanceObjects have not been (re)created yet).
        await this.ensureDeviceIdObject();
        await this.ensureVerificationObjects();
        this.setVerificationStatus('idle');

        // Password is auto-decrypted by js-controller via encryptedNative
        this.password = this.config.password;
        if (this.password) {
            this.connect();
        } else {
            this.log.error('No password configured. Please check adapter config.');
        }
        this.subscribeStates('*');
    }

    onUnload(callback) {
        try {
            this.disableTokenRefresh(this.api);
            this.api = null;
            for (const ctx of this.deviceContexts.values()) {
                if (ctx.vacbot) {
                    if (ctx.vacbot.client && typeof ctx.vacbot.client.removeAllListeners === 'function') {
                        ctx.vacbot.client.removeAllListeners();
                    }
                    ctx.disconnecting = true;
                    ctx.vacbot.disconnect();
                    if (typeof ctx.vacbot.removeAllListeners === 'function') {
                        ctx.vacbot.removeAllListeners();
                    }
                }
                this.stopPolling(ctx);
                if (ctx.getGetPosInterval) {
                    clearInterval(ctx.getGetPosInterval);
                }
                if (ctx.airDryingActiveInterval) {
                    clearInterval(ctx.airDryingActiveInterval);
                }
                if (ctx.retrypauseTimeout) {
                    clearTimeout(ctx.retrypauseTimeout);
                }
                if (ctx._pendingErrorWriteTimeout) {
                    clearTimeout(ctx._pendingErrorWriteTimeout);
                    ctx._pendingErrorWriteTimeout = null;
                }
                if (ctx.commandFailedResetTimeout) {
                    clearTimeout(ctx.commandFailedResetTimeout);
                    ctx.commandFailedResetTimeout = null;
                }
                if (ctx.unreachableRetryTimeout) {
                    clearTimeout(ctx.unreachableRetryTimeout);
                    ctx.unreachableRetryTimeout = null;
                }
                // Tracked init-get-states timer (set by registerReadyEvent).
                // Must be cleared so a delayed initial command burst cannot
                // fire after the adapter has been unloaded.
                if (ctx._initialGetStatesTimeout) {
                    clearTimeout(ctx._initialGetStatesTimeout);
                    ctx._initialGetStatesTimeout = null;
                }
                if (ctx._recoveryRefetchTimeout) {
                    clearTimeout(ctx._recoveryRefetchTimeout);
                    ctx._recoveryRefetchTimeout = null;
                }
                if (ctx._airDryingResetTimeout) {
                    clearTimeout(ctx._airDryingResetTimeout);
                    ctx._airDryingResetTimeout = null;
                }
            }
            if (this.globalMqttUnreachableTimeout) {
                clearTimeout(this.globalMqttUnreachableTimeout);
                this.globalMqttUnreachableTimeout = null;
            }
            if (this._deviceConnectionTimeout) {
                clearTimeout(this._deviceConnectionTimeout);
                this._deviceConnectionTimeout = null;
            }
            this.deviceContexts.clear();
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            this.log.error('Error during unload: ' + e.message);
            callback();
        }
    }

    async onMessage(obj) {
        this.log.debug(`onMessage received: command=${obj?.command} from=${obj?.from}`);
        if (obj && obj.command === 'loginAndFetchDevices') {
            this.log.info('Received loginAndFetchDevices request from admin interface');
            try {
                const result = await this.loginAndFetchDevices(obj.message);
                this.sendTo(obj.from, obj.command, result, obj.callback);
            } catch (error) {
                this.log.error('Error in loginAndFetchDevices: ' + error.message);
                this.sendTo(obj.from, obj.command, {
                    error: error.message || 'Unknown error occurred',
                    result: null
                }, obj.callback);
            }
        } else if (obj && obj.command === 'getDeviceList') {
            this.log.info('Received getDeviceList request from admin interface');
            try {
                const result = await this.getDeviceList();
                this.sendTo(obj.from, obj.command, result, obj.callback);
            } catch (error) {
                this.log.error('Error in getDeviceList: ' + error.message);
                this.sendTo(obj.from, obj.command, [], obj.callback);
            }
        }
    }

    /**
     * Centralizes the credential boilerplate shared by every login path:
     * password hash, persisted client deviceId, country-code normalization,
     * continent lookup and authDomain default.
     * @param {{password: string, countrycode?: string, authDomain?: string}} opts
     */
    async buildAuthParams({ password, countrycode, authDomain }) {
        const passwordHash = EcoVacsAPI.md5(password);
        const deviceId = await this.ensureDeviceId();
        const countryCode = (countrycode || 'de').toLowerCase();
        const continent = (ecovacsDeebot.countries)[countryCode.toUpperCase()]?.continent?.toLowerCase() || 'eu';
        const authDomainValue = authDomain || 'ecovacs.com';
        return { passwordHash, deviceId, countryCode, continent, authDomainValue };
    }

    /**
     * Returns a stable client device ID for the whole account. Ecovacs ties its
     * device-verification (login response code 1013) to this ID, so it must stay
     * constant across restarts — otherwise every restart re-triggers a
     * verification e-mail. `machineIdSync()` changes when the host machine ID
     * changes (e.g. Docker rebuilds), so the value is persisted in the
     * `info.deviceId` state on first use and reused afterwards. A non-empty
     * `clientDeviceId` in the instance config overrides it (manual set/reset).
     *
     * One ID is used for the entire account (not per vacuum) — the adapter runs
     * a single API session with one api.resource and a shared MQTT client; the
     * per-device `did` is only an internal object-tree key.
     * @returns {Promise<string>}
     */
    /**
     * Creates the (protected, read-only) info.deviceId state used to persist the
     * client deviceId. Safe to call repeatedly; only creates when missing.
     */
    async ensureDeviceIdObject() {
        try {
            await this.setObjectNotExistsAsync('info.deviceId', {
                type: 'state',
                common: {
                    name: 'Persisted client device ID (for Ecovacs device verification)',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: ''
                },
                native: {}
            });
        } catch (e) {
            this.log.debug('Could not create info.deviceId object: ' + (e && e.message ? e.message : e));
        }
    }

    async ensureDeviceId() {
        if (this._clientDeviceId) {
            return this._clientDeviceId;
        }
        // 1. Explicit config override (optional manual set/reset).
        const configured = this.config && this.config.clientDeviceId;
        if (typeof configured === 'string' && configured.trim() !== '') {
            this._clientDeviceId = configured.trim();
            return this._clientDeviceId;
        }
        // 2. Previously persisted value.
        try {
            const st = await this.getStateAsync('info.deviceId');
            if (st && typeof st.val === 'string' && st.val.trim() !== '') {
                this._clientDeviceId = st.val.trim();
                return this._clientDeviceId;
            }
        } catch (e) {
            // state not available yet (e.g. admin one-shot login) - fall through
        }
        // 3. First use: derive once and persist so it survives restarts.
        const generated = EcoVacsAPI.getDeviceId(nodeMachineId.machineIdSync(), 0);
        this._clientDeviceId = generated;
        try {
            await this.setStateAsync('info.deviceId', { val: generated, ack: true });
        } catch (e) {
            this.log.debug('Could not persist info.deviceId: ' + (e && e.message ? e.message : e));
        }
        return generated;
    }

    /**
     * Single login path: constructs an EcoVacsAPI instance, authenticates and
     * fetches the raw device list. Callers are responsible for storing the api
     * (e.g. for token refresh) and for formatting the returned devices.
     * @param {{email: string, password: string, countrycode?: string, authDomain?: string}} credentials
     * @returns {Promise<{api: Object, devices: Object[], auth: Object}>}
     */
    async authenticate({ email, password, countrycode, authDomain }) {
        const auth = await this.buildAuthParams({ password, countrycode, authDomain });
        const api = new EcoVacsAPI(auth.deviceId, auth.countryCode, auth.continent, auth.authDomainValue);
        await api.connect(email, auth.passwordHash);
        const devices = /** @type {Object[]} */ (await api.devices());
        return { api, devices, auth };
    }

    async loginAndFetchDevices(credentials) {
        const { email, password, countrycode, authDomain } = credentials;

        if (!email || !password) {
            throw new Error('Email and password are required');
        }

        this.log.info(`Attempting login for device discovery: ${email} (${(countrycode || 'de').toLowerCase()})`);

        try {
            const { devices } = await this.authenticate({ email, password, countrycode, authDomain });

            const numberOfDevices = Object.keys(devices).length;
            this.log.info(`Device discovery successful. Found ${numberOfDevices} device(s)`);

            if (numberOfDevices === 0) {
                return {
                    error: null,
                    result: 'Login successful but no devices found'
                };
            }

            // Format device information for the admin interface
            const formattedDevices = devices.map((device, index) => ({
                number: index + 1,
                value: index,
                name: device.deviceName || device.name || 'Unknown Device',
                nick: device.nick || '',
                deviceName: device.deviceName || device.name || 'Unknown Device',
                deviceNick: device.nick || '',
                deviceClass: device.class || '',
                deviceType: this.getDeviceTypeFromDevice(device)
            }));

            return {
                error: null,
                result: `Found ${numberOfDevices} device(s)`,
                devices: formattedDevices
            };
        } catch (error) {
            this.log.error('Device discovery failed: ' + error.message);
            throw new Error('Login failed: ' + (error.message || 'Unknown error'));
        }
    }

    async getDeviceList() {
        // Read credentials from adapter config (decrypted by js-controller)
        const email = this.config.email || this.config?.['native']?.email || '';
        const password = this.password || this.config.password || this.config?.['native']?.password || '';
        const countrycode = this.config.countrycode || this.config?.['native']?.countrycode || 'de';
        const authDomain = this.config.authDomain || this.config?.['native']?.authDomain || '';

        if (!email || !password) {
            this.log.debug('getDeviceList: no credentials in adapter config, returning empty list');
            return [];
        }

        this.log.info(`Fetching device list for admin UI: ${email} (${(countrycode || 'de').toLowerCase()})`);

        try {
            const { devices } = await this.authenticate({ email, password, countrycode, authDomain });

            const numberOfDevices = Object.keys(devices).length;
            this.log.info(`Device list fetch successful. Found ${numberOfDevices} device(s)`);

            if (numberOfDevices === 0) {
                return [];
            }

            // Format devices for selectSendTo dropdown
            // Response must be [{value, label, (optional) description}, ...]
            return devices.map(device => {
                const deviceName = device.deviceName || device.name || 'Unknown Device';
                const displayName = device.nick
                    ? `${deviceName} (${device.nick})`
                    : deviceName;
                const deviceType = this.getDeviceTypeFromDevice(device);
                return {
                    value: device.did || device.name || 'unknown',
                    label: displayName,
                    description: `${deviceType} [${device.did || device.name || 'unknown'}]`
                };
            });
        } catch (error) {
            this.log.error('Failed to fetch device list for admin UI: ' + error.message);
            return [];
        }
    }

    onStateChange(id, state) {
        if (!state) return;
        const relativeId = id.replace(this.namespace + '.', '');

        // Device-verification controls are account-level (no device prefix) and
        // must be handled before the device routing below. Only react to fresh
        // user writes (ack === false); our own ack'd resets are ignored.
        if (relativeId === 'verification.submit' || relativeId === 'verification.requestCode') {
            if (state.ack || !state.val) return;
            // Reset the button, then run the action (fire-and-forget: onStateChange
            // is not awaited by js-controller).
            this.setStateAsync(relativeId, { val: false, ack: true }).catch(() => { });
            if (relativeId === 'verification.submit') {
                this.submitVerificationCode().catch(e => this.log.error('submitVerificationCode failed: ' + (e && e.message ? e.message : e)));
            } else {
                this.requestVerificationCode().catch(e => this.log.error('requestVerificationCode failed: ' + (e && e.message ? e.message : e)));
            }
            return;
        }
        if (relativeId === 'verification.code' || relativeId === 'verification.status') {
            // The code is just stored until submit; status is adapter-written.
            return;
        }

        const parts = relativeId.split('.');
        const stateName = parts[parts.length - 1];

        // Single-device mode publishes states without a device-id prefix, so the
        // relative id IS the device sub-path and every change routes to the one
        // context. Multi-device mode prefixes each state with the device id.
        const singleDeviceMode = this.config.singleDeviceMode;
        const ctx = singleDeviceMode
            ? this.deviceContexts.values().next().value
            : this.deviceContexts.get(parts[0]);
        if (!ctx) return;
        const subPath = singleDeviceMode ? relativeId : parts.slice(1).join('.');

        if (stateName === 'enabled' && subPath === 'status.enabled') {
            ctx.enabled = state.val;
            const displayName = ctx.vacuum && ctx.vacuum.nick ? `${ctx.deviceId} (${ctx.vacuum.nick})` : ctx.deviceId;
            if (state.val) {
                this.log.info(`Device ${displayName}: control and updates enabled`);
                if (ctx.connected) {
                    this.startPolling(ctx);
                }
            } else {
                this.log.info(`Device ${displayName}: control and updates disabled`);
                this.stopPolling(ctx);
            }
        }
        if (!ctx.enabled && stateName !== 'enabled') return;
        ctx._stateChangePromise = (ctx._stateChangePromise || Promise.resolve()).then(() =>
            adapterCommands.handleStateChange(this, ctx, subPath, state)
        ).catch(e => this.log.error(`Error handling state change for id '${id}' with value '${state.val}': '${e}'`));
    }

    reconnect() {
        if (this._startupTime && (Date.now() - this._startupTime < C.STARTUP_GRACE_PERIOD_MS)) {
            this.log.debug('Reconnect skipped - startup grace period active');
            return;
        }
        if (this.authFailed) {
            this.log.warn('Reconnect skipped due to authentication failure. Please check your credentials and restart the adapter.');
            return;
        }
        const now = Date.now();
        if (this._lastReconnectTime && (now - this._lastReconnectTime < C.RECONNECT_COOLDOWN_MS)) {
            this.log.debug('Reconnect skipped - cooldown active (' + Math.round((now - this._lastReconnectTime) / 1000) + 's since last reconnect, minimum 60s)');
            return;
        }
        this._lastReconnectTime = now;
        for (const ctx of this.deviceContexts.values()) {
            this.clearGoToPosition(ctx);
            ctx.retrypauseTimeout = null;
            this.clearUnreachableRetry(ctx);
            ctx.retries++;
        }
        this.setConnection(false);
        for (const ctx1 of this.deviceContexts.values()) {
            if (ctx1.getGetPosInterval) {
                clearInterval(ctx1.getGetPosInterval);
                ctx1.getGetPosInterval = null;
            }
            if (ctx1.airDryingActiveInterval) {
                clearInterval(ctx1.airDryingActiveInterval);
                ctx1.airDryingActiveInterval = null;
            }
            // Tracked one-shot timers: clear so a delayed callback cannot fire
            // against a stale ctx after we recreate everything.
            if (ctx1._initialGetStatesTimeout) {
                clearTimeout(ctx1._initialGetStatesTimeout);
                ctx1._initialGetStatesTimeout = null;
            }
            if (ctx1._recoveryRefetchTimeout) {
                clearTimeout(ctx1._recoveryRefetchTimeout);
                ctx1._recoveryRefetchTimeout = null;
            }
            if (ctx1._airDryingResetTimeout) {
                clearTimeout(ctx1._airDryingResetTimeout);
                ctx1._airDryingResetTimeout = null;
            }
            this.stopPolling(ctx1);
            try {
                if (ctx1.vacbot) {
                    if (ctx1.vacbot.client && typeof ctx1.vacbot.client.removeAllListeners === 'function') {
                        ctx1.vacbot.client.removeAllListeners();
                    }
                    ctx1.disconnecting = true;
                    ctx1.vacbot.disconnect();
                    if (typeof ctx1.vacbot.removeAllListeners === 'function') {
                        ctx1.vacbot.removeAllListeners();
                    }
                }
            } catch (e) {
                // ignore cleanup errors
            }
        }
        this.deviceContexts.clear();
        if (this._deviceConnectionTimeout) {
            clearTimeout(this._deviceConnectionTimeout);
            this._deviceConnectionTimeout = null;
        }
        this.log.info('Reconnecting ...');
        this.connect();
    }

    async connect() {
        if (this._connecting) {
            this.log.debug('Connection already in progress, skipping concurrent connect()');
            return;
        }
        if (this._awaitingVerification) {
            // A device-verification code was requested and we are waiting for the
            // user to submit it. Re-running connect() here would just throw 1013
            // again and send another e-mail, so skip until verification finishes.
            this.log.debug('Connect skipped - waiting for device verification code');
            return;
        }
        const connectNow = Date.now();
        if (this._lastConnectTime && (connectNow - this._lastConnectTime < C.CONNECT_COOLDOWN_MS)) {
            this.log.debug('Connect skipped - cooldown active (' + Math.round((connectNow - this._lastConnectTime) / 1000) + 's since last connect)');
            return;
        }
        this._connecting = true;
        this.connectionFailed = false;
        this._lastConnectTime = connectNow;

        if ((!this.config.email) || (!this.config.password) || (!this.config.countrycode)) {
            this.error('Missing values in adapter config', true);
            this._connecting = false;
            return;
        }
        if (this.config.pollingInterval && (Number(this.config.pollingInterval) >= C.MIN_POLLING_INTERVAL_MS)) {
            this.pollingInterval = Number(this.config.pollingInterval);
        }

        try {
            let authDomain = '';
            if (this.getConfigValue('authDomain') !== '') {
                authDomain = this.getConfigValue('authDomain');
                this.log.info('Using login: ' + authDomain);
            }

            // Tear down any token refresh from a previous session before the
            // reference is overwritten, so old timers/listeners cannot keep
            // firing duplicate logins after a reconnect.
            this.disableTokenRefresh(this.api);

            const auth = await this.buildAuthParams({
                password: this.password,
                countrycode: this.config.countrycode,
                authDomain
            });
            const api = new EcoVacsAPI(auth.deviceId, auth.countryCode, auth.continent, auth.authDomainValue);
            // Store the api eagerly: if the login triggers device verification we
            // must reuse THIS instance (it caches the account and RSA key) for
            // requestDeviceVerificationCode() / verifyDevice().
            this.api = api;
            try {
                await api.connect(this.config.email, auth.passwordHash);
            } catch (e) {
                if (e instanceof DeviceVerificationRequired) {
                    // Not a hard failure: Ecovacs wants an e-mailed code for this
                    // client deviceId. Switch into verification mode and wait for
                    // the user to submit the code via the verification.* states.
                    this._connecting = false;
                    await this.startDeviceVerification(api, auth);
                    return;
                }
                throw e;
            }
            const devices = /** @type {Object[]} */ (await api.devices());
            await this.setupDevices(api, devices, auth);
            this._connecting = false;
        } catch (e) {
            this._connecting = false;
            this.connectionFailed = true;
            if (this.isAuthError(e.message)) {
                this.authFailed = true;
                this.log.error('Authentication failed. Retrying will not be attempted until the adapter is restarted or credentials are updated.');
            }
            this.error(e.message, true);
        }
    }

    /**
     * Post-login device wiring shared by the normal login path (connect) and the
     * device-verification path (submitVerificationCode): sorts the discovered
     * devices, creates their object trees, wires event handlers, brings up the
     * (shared) MQTT connection and enables automatic token refresh.
     *
     * The caller owns the `_connecting` guard and the outer error handling; this
     * method only performs the setup and may return early (no devices, unmatched
     * single-device mode) without touching those flags.
     * @param {Object} api - the authenticated EcovacsAPI instance
     * @param {Object[]} devices - the raw device list from api.devices()
     * @param {{passwordHash: string, continent: string}} auth - auth params from buildAuthParams
     */
    async setupDevices(api, devices, auth) {
        {
            const continent = auth.continent;

            // Sort devices by did to ensure stable and deterministic ordering across restarts
            devices.sort((a, b) => {
                const didA = (a.did || '').toLowerCase();
                const didB = (b.did || '').toLowerCase();
                if (didA < didB) return -1;
                if (didA > didB) return 1;
                return 0;
            });

            const numberOfDevices = Object.keys(devices).length;
            // Scale the shared budget by device count so each device keeps its
            // own ~REQUEST_THROTTLE_MAX_PER_DEVICE-per-window allowance.
            this.requestThrottle.maxRequests = Math.max(
                C.REQUEST_THROTTLE_MAX_PER_DEVICE,
                numberOfDevices * C.REQUEST_THROTTLE_MAX_PER_DEVICE
            );
            if (numberOfDevices === 0) {
                this.log.warn('Successfully connected to Ecovacs server, but no devices found. Exiting ...');
                this.setConnection(false);
                return;
            }
            this.log.info('Successfully connected to Ecovacs server. Found ' + numberOfDevices + ' device(s) ...');
            this.setStateConditional('info.deviceDiscovery', JSON.stringify(devices.map((device, index) => ({
                number: index + 1,
                name: device.deviceName || device.name || 'Unknown Device',
                nick: device.nick || '',
                did: device.did || '',
                class: device.class,
                deviceType: this.getDeviceTypeFromDevice(device)
            }))), true);
            this.setStateConditional('info.deviceCount', numberOfDevices, true);

            // Auto-populate the per-device configuration (Devices tab) with the
            // devices discovered on the account, so the user only has to toggle
            // features instead of entering device IDs by hand.
            await this.ensureDeviceConfigEntries(devices);

            let devicesToProcess = devices;
            let useSkipPrefix = false;
            const singleDeviceMode = this.config.singleDeviceMode;
            const singleDeviceId = this.config.singleDeviceId;

            if (singleDeviceMode && singleDeviceId) {
                const searchTerm = singleDeviceId.toLowerCase();
                const matchedDevice = devices.find(d =>
                    (d.did && d.did.toLowerCase() === searchTerm) ||
                    (d.nick && d.nick.toLowerCase() === searchTerm) ||
                    (d.deviceName && d.deviceName.toLowerCase() === searchTerm) ||
                    (d.name && d.name.toLowerCase() === searchTerm)
                );

                if (matchedDevice) {
                    const matchName = matchedDevice.nick || matchedDevice.deviceName || matchedDevice.did;
                    this.log.info('Single device mode: Using device ' + matchName + ' (did: ' + matchedDevice.did + ')');
                    devicesToProcess = [matchedDevice];
                    useSkipPrefix = true;
                } else {
                    this.log.warn('Single device mode: Could not find device matching ' + singleDeviceId + '. No devices will be connected.');
                    return;
                }
            }

            // Shared MQTT client for multi-device: all devices use the same API session
            // (api) so the broker delivers events for all devices through one connection.
            // The first device creates the MQTT connection; subsequent devices subscribe
            // through it. See: https://github.com/DeebotUniverse/client.py — one session,
            // one MqttClient, multiple Device subscriptions routed by DID.
            let sharedMqttClient = null;

            for (let i = 0; i < devicesToProcess.length; i++) {
                const vacuum = devicesToProcess[i];
                const deviceId = vacuum.did.replace(/[^a-zA-Z0-9_]/g, '_');
                if (this.deviceContexts.has(deviceId)) {
                    this.log.debug('[' + deviceId + '] Device already connected, skipping');
                    continue;
                }
                let vacbot;
                try {
                    vacbot = (api.getDevice(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent));
                } catch (e) {
                    if (e.message && e.message.includes("'XML' based model identified")) {
                        const nick = vacuum.nick || vacuum.deviceName || vacuum.name || deviceId;
                        this.log.error(`[${nick}] 'XML' based model identified (unsupported). This model is not supported by this version of the adapter.`);
                        continue;
                    }
                    throw e;
                }
                const ctx = new DeviceContext(this, deviceId, vacbot, vacuum, this.requestThrottle, useSkipPrefix);
                ctx.vacuum = vacuum; ctx.api = api; ctx.model = new Model(vacbot, this.buildDeviceConfig(deviceId)); ctx.device = new Device(ctx);
                this.deviceContexts.set(deviceId, ctx);
                try {
                    const enabledState = await this.getStateAsync(ctx.statePath('status.enabled'));
                    if (enabledState && enabledState.val === false) ctx.enabled = false;
                } catch (e) { }
                try {
                    await adapterObjects.createInitialInfoObjects(this, ctx);
                    await adapterObjects.createInitialObjects(this, ctx);
                } catch (e) {
                    this.log.error('Error creating initial objects for ' + deviceId + ': ' + e.message);
                }
                const readyPromise = eventHandlers.registerReadyEvent(this, vacbot, ctx, vacuum);
                eventHandlers.registerChargeStateEvent(this, vacbot, ctx);
                eventHandlers.registerCleanReportEvent(this, vacbot, ctx);
                eventHandlers.registerWaterCleaningEvents(this, vacbot, ctx);
                eventHandlers.registerStationEvents(this, vacbot, ctx);
                eventHandlers.registerMiscEventHandlers(this, vacbot, ctx);
                eventHandlers.registerConsumableEvents(this, vacbot, ctx);
                eventHandlers.registerConnectionEvents(this, vacbot, ctx);
                eventHandlers.registerMapEvents(this, vacbot, ctx);
                eventHandlers.registerAirbotEvents(this, vacbot, ctx);
                if (this.globalMqttUnreachable) {
                    this.log.debug('[' + ctx.deviceId + '] Skipping vacbot.connect() - MQTT server globally unreachable');
                } else if (sharedMqttClient) {
                    this.log.debug(`[${deviceId}] Attaching to shared MQTT session`);
                    vacbot.connectShared(sharedMqttClient);
                    ctx.usesSharedMqttClient = true;
                } else {
                    vacbot.connect();
                    ctx.isPrimaryMqttDevice = true;
                }
                if (ctx.enabled) this.startPolling(ctx);
                await readyPromise;
                if (!sharedMqttClient && ctx.isPrimaryMqttDevice) {
                    const client = vacbot.getMqttClient();
                    if (client) {
                        sharedMqttClient = client;
                        this.log.debug(`[${deviceId}] Captured shared MQTT client for subsequent devices`);
                    }
                }
                if (i < devicesToProcess.length - 1) {
                    this.log.info('Staggering next device connection in ' + (C.DEVICE_CONNECTION_DELAY_MS / 1000) + 's...');
                    await new Promise(resolve => {
                        this._deviceConnectionTimeout = setTimeout(resolve, C.DEVICE_CONNECTION_DELAY_MS);
                    });
                }
            }
            // Enable automatic token refresh only when at least one VacBot was
            // actually created, so neither the early-return paths above (no
            // devices, unmatched single-device mode) nor a run where every
            // device was skipped (e.g. unsupported XML models) leaves a refresh
            // timer running with no VacBot to apply the token to.
            if (this.deviceContexts.size > 0) {
                this.enableTokenRefresh(api, this.config.email, auth.passwordHash);
            } else {
                this.log.debug('No devices were created - skipping automatic token refresh');
            }
        }
    }

    // =========================================================================
    // Device verification (Ecovacs login response code 1013)
    //
    // When Ecovacs does not recognise the client deviceId it refuses the login
    // with DeviceVerificationRequired and expects the account to confirm an
    // e-mailed code. An adapter has no stdin, so the code is entered through the
    // writable verification.* states (see ensureVerificationObjects). The api
    // instance from the failed connect() is reused throughout so its cached
    // account/RSA key stay intact.
    // =========================================================================

    /**
     * Creates the verification.* state tree used to drive the device-verification
     * flow from the admin UI / states (headless, no stdin). Safe to call on every
     * start; only missing objects are created.
     */
    async ensureVerificationObjects() {
        try {
            await this.setObjectNotExistsAsync('verification', {
                type: 'channel',
                common: { name: 'Device verification' },
                native: {}
            });
            await this.setObjectNotExistsAsync('verification.status', {
                type: 'state',
                common: {
                    name: 'Device verification status (idle/required/code_sent/invalid_code/verified/error)',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: 'idle'
                },
                native: {}
            });
            await this.setObjectNotExistsAsync('verification.code', {
                type: 'state',
                common: {
                    name: 'Device verification code (from the e-mail)',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                },
                native: {}
            });
            await this.setObjectNotExistsAsync('verification.submit', {
                type: 'state',
                common: {
                    name: 'Submit the verification code',
                    type: 'boolean',
                    role: 'button',
                    read: false,
                    write: true,
                    def: false
                },
                native: {}
            });
            await this.setObjectNotExistsAsync('verification.requestCode', {
                type: 'state',
                common: {
                    name: 'Request a new verification code by e-mail',
                    type: 'boolean',
                    role: 'button',
                    read: false,
                    write: true,
                    def: false
                },
                native: {}
            });
        } catch (e) {
            this.log.warn('Could not create verification objects: ' + (e && e.message ? e.message : e));
        }
    }

    /**
     * Reflects the current verification status in the readonly verification.status
     * state and the internal flag.
     * @param {'idle'|'required'|'code_sent'|'invalid_code'|'verified'|'error'} status
     */
    setVerificationStatus(status) {
        this._verificationStatus = status;
        this.setStateConditional('verification.status', status, true);
    }

    /**
     * Enters verification mode after connect() caught DeviceVerificationRequired:
     * marks the account disconnected, records the auth params for the later
     * setupDevices() and requests the e-mailed code.
     * @param {Object} api - the EcovacsAPI instance that threw code 1013
     * @param {{passwordHash: string, continent: string}} auth
     */
    async startDeviceVerification(api, auth) {
        this.api = api;
        this._verificationAuth = auth;
        this._awaitingVerification = true;
        this.setConnection(false);
        await this.ensureVerificationObjects();
        this.log.warn('Ecovacs requires device verification for this login. A verification code will be sent by e-mail.');
        this.setVerificationStatus('required');
        await this.requestVerificationCode();
    }

    /**
     * Requests (or re-requests) the e-mailed verification code for the account.
     * Only status codes are logged - never the code itself.
     */
    async requestVerificationCode() {
        const api = this.api;
        if (!api || typeof api.requestDeviceVerificationCode !== 'function') {
            this.log.error('Cannot request verification code: no active login session or unsupported library version.');
            this.setVerificationStatus('error');
            return;
        }
        try {
            await api.requestDeviceVerificationCode();
            this.setVerificationStatus('code_sent');
            this.log.info('Verification code requested by e-mail. Enter it in verification.code and set verification.submit to true.');
        } catch (e) {
            this.log.error('Failed to request verification code: ' + (e && e.message ? e.message : e));
            this.setVerificationStatus('error');
        }
    }

    /**
     * Confirms the verification code the user entered in verification.code and,
     * on success, resumes the normal post-login flow (setupDevices). Reuses the
     * same api instance that connect() built. Never logs the code or tokens.
     */
    async submitVerificationCode() {
        if (this._verifying) {
            this.log.debug('Verification already in progress, ignoring duplicate submit');
            return;
        }
        const api = this.api;
        if (!api || typeof api.verifyDevice !== 'function') {
            this.log.warn('Cannot verify device: no pending verification session.');
            return;
        }
        let code = '';
        try {
            const codeState = await this.getStateAsync('verification.code');
            code = codeState && typeof codeState.val === 'string' ? codeState.val.trim() : '';
        } catch (e) {
            // fall through - empty code handled below
        }
        if (!code) {
            this.log.warn('No verification code entered in verification.code.');
            return;
        }

        this._verifying = true;
        try {
            // Step one: confirm the code. Verification-specific failures
            // (invalid/expired code) must let the user retry, so they are handled
            // here and never fall through to the login-completion path.
            try {
                await api.verifyDevice(code);
            } catch (e) {
                if (e instanceof InvalidVerificationCode) {
                    this.setVerificationStatus('invalid_code');
                    this.log.warn('Verification code invalid or expired. Please enter the code again (or request a new one).');
                } else {
                    this.log.error('Device verification failed: ' + (e && e.message ? e.message : e));
                    this.setVerificationStatus('error');
                }
                return;
            }

            // Verified. Clear the entered code and resume the normal login flow
            // with the now-authenticated api. verifyDevice already emitted
            // credentialsUpdated; enableTokenRefresh (inside setupDevices) wires
            // up future refreshes.
            this._awaitingVerification = false;
            this.setVerificationStatus('verified');
            try {
                await this.setStateAsync('verification.code', { val: '', ack: true });
            } catch (e) { }
            this.log.info('Device verification successful. Completing login...');

            // Step two: bring up the devices. A failure here is a normal
            // account-level login error (not a bad code), so surface it the same
            // way connect() does instead of reverting the verification status.
            try {
                const devices = /** @type {Object[]} */ (await api.devices());
                await this.setupDevices(api, devices, this._verificationAuth);
            } catch (e) {
                this.connectionFailed = true;
                if (this.isAuthError(e.message)) {
                    this.authFailed = true;
                }
                this.error(e.message, true);
            }
        } finally {
            this._verifying = false;
        }
    }

    /**
     * Enables proactive, automatic access-token refresh for a long-running
     * adapter session. The access token returned by `api.connect()` is only
     * valid for a limited time (typically ~7 days). Without refreshing it, a
     * 24/7 adapter would eventually hit authentication errors once the token
     * expires.
     *
     * The library re-runs the login flow shortly before expiry and emits a
     * `credentialsUpdated` event with the new token, which we apply to every
     * connected VacBot instance (each one needs its own refreshed REST token).
     * Only the MQTT connection owner actually reconnects; shared instances just
     * update their token in place.
     *
     * @param {object} api - the active EcovacsAPI instance
     * @param {string} accountId - the account ID used for `connect()`
     * @param {string} passwordHash - the password hash used for `connect()`
     */
    enableTokenRefresh(api, accountId, passwordHash) {
        if (typeof api.enableAutoTokenRefresh !== 'function') {
            this.log.debug('Installed ecovacs-deebot version does not support automatic token refresh - skipping');
            return;
        }

        this._onCredentialsUpdated = (creds) => {
            if (!creds || !creds.token) {
                return;
            }
            const updated = this._applyRefreshedToken(creds.token);
            if (updated > 0) {
                this.log.info(`Access token refreshed - applied to ${updated} device(s)`);
            }
        };
        this._onCredentialsRefreshError = (e) => {
            this.log.warn('Automatic token refresh failed (will be retried): ' + (e && e.message ? e.message : e));
        };
        api.on('credentialsUpdated', this._onCredentialsUpdated);
        api.on('credentialsRefreshError', this._onCredentialsRefreshError);

        api.enableAutoTokenRefresh(accountId, passwordHash);
        const expiry = typeof api.getTokenExpiry === 'function' ? api.getTokenExpiry() : null;
        if (expiry) {
            this.log.info('Automatic token refresh enabled - next refresh scheduled for ' + new Date(expiry).toISOString());
        } else {
            this.log.info('Automatic token refresh enabled');
        }
    }

    /**
     * Tear down automatic token refresh for the given API instance: cancel the
     * scheduled refresh timer and remove our listeners. Called before a new
     * session is created (reconnect) and on unload, so stale timers/listeners
     * from a previous EcovacsAPI instance cannot keep firing duplicate logins.
     * @param {object|null} api - the EcovacsAPI instance to tear down
     */
    disableTokenRefresh(api) {
        if (!api) {
            return;
        }
        if (typeof api.disableAutoTokenRefresh === 'function') {
            api.disableAutoTokenRefresh();
        }
        if (typeof api.removeListener === 'function') {
            if (this._onCredentialsUpdated) {
                api.removeListener('credentialsUpdated', this._onCredentialsUpdated);
            }
            if (this._onCredentialsRefreshError) {
                api.removeListener('credentialsRefreshError', this._onCredentialsRefreshError);
            }
        }
        this._onCredentialsUpdated = null;
        this._onCredentialsRefreshError = null;
    }

    /**
     * Apply a refreshed access token to every connected VacBot. Each device
     * needs its own refreshed REST token; the primary (MQTT connection owner)
     * additionally reconnects its owned MQTT client with the new credentials,
     * while shared instances only update the token in place.
     *
     * The primary's MQTT client is replaced asynchronously by the library
     * (client.end -> connect). Rather than poll for the new client object, we
     * listen once for the library's 'mqttClientReplaced' event and re-subscribe
     * any secondary devices through the replacement client.
     * @param {string} token - the refreshed user access token
     * @returns {number} number of devices the token was applied to
     */
    _applyRefreshedToken(token) {
        if (!token) {
            return 0;
        }
        const primaryCtx = this._getPrimaryMqttContext();

        let hasShared = false;
        for (const ctx of this.deviceContexts.values()) {
            if (ctx.usesSharedMqttClient) {
                hasShared = true;
                break;
            }
        }

        // Register the reattach listener BEFORE refreshing the primary's token,
        // so the asynchronous client replacement it triggers cannot be missed.
        if (primaryCtx && hasShared && primaryCtx.vacbot && typeof primaryCtx.vacbot.once === 'function') {
            primaryCtx.vacbot.once('mqttClientReplaced', (newClient) => {
                this._reattachSharedClients(newClient);
            });
        }

        let updated = 0;
        for (const ctx of this.deviceContexts.values()) {
            if (ctx.vacbot && typeof ctx.vacbot.updateUserAccessToken === 'function') {
                try {
                    ctx.vacbot.updateUserAccessToken(token);
                    updated++;
                } catch (e) {
                    this.log.warn(`[${ctx.deviceId}] Failed to apply refreshed access token: ${e.message}`);
                }
            }
        }

        return updated;
    }

    /**
     * Re-subscribe shared (secondary) devices through the primary's replacement
     * MQTT client after a token refresh. Driven by the primary vacbot's
     * 'mqttClientReplaced' event (see _applyRefreshedToken).
     * @param {object|null} newClient - the primary's replacement MQTT client
     */
    _reattachSharedClients(newClient) {
        if (!newClient || !this.deviceContexts.size) {
            return;
        }
        for (const ctx of this.deviceContexts.values()) {
            if (ctx.usesSharedMqttClient && ctx.vacbot && typeof ctx.vacbot.connectShared === 'function') {
                try {
                    ctx.vacbot.connectShared(newClient);
                    this.log.debug(`[${ctx.deviceId}] Re-subscribed to refreshed shared MQTT client`);
                } catch (e) {
                    this.log.debug(`[${ctx.deviceId}] connectShared after refresh failed: ${e && e.message}`);
                }
            }
        }
    }

    _flushPendingPosition(ctx) {
        if (ctx._pendingPosition) {
            this.handlePositionObj(ctx, ctx._pendingPosition);
            ctx._pendingPosition = null;
        }
    }

    /**
     * Set the GLOBAL (adapter-root) connection indicator directly. Reserved for
     * account-level transitions that affect every device: a full connect, a full
     * teardown (reconnect/unload), "no devices found", an account-level error,
     * or the MQTT server itself going offline. On `false` it also marks every
     * device disconnected and tears down their timers/polling.
     *
     * Do NOT use this for a single device's problem — that would force all other
     * devices offline too. Use updateDeviceConnectionState(ctx, ...) for the
     * device and updateConnectionState() to recompute the global indicator.
     * @param {boolean} value
     */
    setConnection(value) {
        this.setStateConditional('info.connection', value, true);
        if (value === false) {
            for (const ctx of this.deviceContexts.values()) {
                this.updateDeviceConnectionState(ctx, false);
                if (ctx.retrypauseTimeout) {
                    clearTimeout(ctx.retrypauseTimeout);
                    ctx.retrypauseTimeout = null;
                }
                this.stopPolling(ctx);
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
            this.connectedTimestamp = helper.getUnixTimestamp();
            this.setStateConditional('info.connectionUptime', 0, true);
        }
        this.connected = value;
    }

    /**
     * Recompute the GLOBAL connection indicator from the per-device states:
     * `info.connection` is true iff at least one device is connected. Call this
     * after changing a single device's connection state so the global indicator
     * stays consistent without forcing the other devices.
     */
    updateConnectionState() {
        const anyConnected = Array.from(this.deviceContexts.values()).some(c => c.connected);
        this.setStateConditional('info.connection', anyConnected, true);
        this.connected = anyConnected;
        if (anyConnected) {
            this.connectedTimestamp = helper.getUnixTimestamp();
        }
    }

    /**
     * Set a single device's connection state (`<deviceId>.info.connection` and
     * its uptime). Does not touch the global indicator — pair with
     * updateConnectionState() when a per-device change should be reflected globally.
     * @param {object} ctx - DeviceContext
     * @param {boolean} value
     */
    updateDeviceConnectionState(ctx, value) {
        ctx.adapterProxy.setStateConditional('info.connection', value, true);
        if (value) {
            ctx.connectedTimestamp = helper.getUnixTimestamp();
            ctx.adapterProxy.setStateConditional('info.connectionUptime', 0, true);
            ctx._lastUptimeValue = 0;
        } else {
            ctx.connectedTimestamp = 0;
            ctx.adapterProxy.setStateConditional('info.connectionUptime', 0, true);
            ctx._lastUptimeValue = 0;
        }
    }

    /**
     * Marks ALL devices as unreachable when the MQTT server itself goes offline.
     * Sets a global flag so no further requests are sent from any device until
     * connectivity is restored. Uses backoff retry schedule (30s, 60s, 5min).
     * Only logs the "MQTT server is offline" warning once globally.
     * @param {object} ctx - The DeviceContext that detected the MQTT offline condition
     */
    setGlobalMqttUnreachable(ctx) {
        if (this.globalMqttUnreachable) {
            return; // already in global unreachable state
        }

        this.globalMqttUnreachable = true;
        const nick = ctx.vacuum.nick || ctx.deviceId;
        const model = ctx.getModel().getProductName();

        // Log the warning once globally (not per-device)
        if (!this.globalMqttOfflineWarningSent) {
            this.log.warn(`[${nick} (${model})] MQTT server is offline or not reachable. Pausing ALL device communication until server is reachable again.`);
            this.globalMqttOfflineWarningSent = true;
        }

        // Mark ALL devices as unreachable so queues and polling are stopped
        for (const deviceCtx of this.deviceContexts.values()) {
            deviceCtx.connectionFailed = true;
            if (!deviceCtx.unreachableWarningSent) {
                deviceCtx.unreachableWarningSent = true;
            }
        }
        this.setConnection(false);

        // Schedule a single global retry instead of per-device retries
        this.scheduleGlobalMqttRetry();
    }

    /**
     * Clears the global MQTT unreachable state when any device successfully
     * receives data, indicating the MQTT server is back online.
     */
    clearGlobalMqttUnreachable() {
        if (!this.globalMqttUnreachable) {
            return;
        }

        this.log.info('MQTT server is reachable again. Resuming communication for all devices.');
        this.globalMqttUnreachable = false;
        this.globalMqttUnreachableCount = 0;
        this.globalMqttOfflineWarningSent = false;

        for (const deviceCtx of this.deviceContexts.values()) {
            if (deviceCtx.connectionFailed) {
                this.clearUnreachableRetry(deviceCtx);
                if (deviceCtx.enabled) {
                    this.startPolling(deviceCtx);
                }
            }
        }

        if (this.globalMqttUnreachableTimeout) {
            clearTimeout(this.globalMqttUnreachableTimeout);
            this.globalMqttUnreachableTimeout = null;
        }
    }

    /**
     * Schedules a single global retry that attempts to reconnect ALL devices.
     * Uses backoff: 30s, 60s, then 5min for all subsequent retries.
     */
    scheduleGlobalMqttRetry() {
        if (this.globalMqttUnreachableTimeout) {
            return;
        }
        // Prevent reconnect triggered by stale states during adapter startup
        if (this._startupTime && (Date.now() - this._startupTime < C.STARTUP_GRACE_PERIOD_MS)) {
            this.log.debug('Reconnect skipped - startup grace period active');
            return;
        }
        if (this.authFailed) {
            return;
        }

        const BACKOFF_SCHEDULE = C.BACKOFF_SCHEDULE;
        const retryIndex = Math.min(this.globalMqttUnreachableCount, BACKOFF_SCHEDULE.length - 1);
        const delay = BACKOFF_SCHEDULE[retryIndex];
        this.globalMqttUnreachableCount++;

        this.log.debug(`[Global] MQTT server unreachable. Scheduling global retry #${this.globalMqttUnreachableCount} in ${Math.round(delay / 1000)}s`);

        this.globalMqttUnreachableTimeout = setTimeout(() => {
            this.globalMqttUnreachableTimeout = null;
            this.log.debug(`[Global] Executing global MQTT reconnect attempt #${this.globalMqttUnreachableCount}`);

            // Try to reconnect ALL devices. vacbot.connect() self-cleans the
            // previous MQTT client (ecovacs-deebot alpha.21+), so a plain
            // reconnect via _reconnectVacbotSafely does not leak clients.
            let reconnectCount = 0;
            for (const deviceCtx of this.deviceContexts.values()) {
                if (!deviceCtx.connected || deviceCtx.connectionFailed) {
                    // Per-device error containment: a sync throw from
                    // _reconnectVacbotSafely (which re-throws connect()
                    // failures) must NOT abort the iteration over the
                    // remaining devices.
                    try {
                        this._reconnectVacbotSafely(deviceCtx, '[Global] ');
                        reconnectCount++;
                    } catch (e) {
                        this.log.debug(`[Global] Reconnect failed for ${deviceCtx.deviceId}: ${e && e.message}`);
                    }
                }
            }

            if (reconnectCount === 0) {
                // All devices already connected, clear global state
                this.clearGlobalMqttUnreachable();
            }
        }, delay);
    }

    /**
     * Tracks consecutive command failures per device.
     * After 2+ failures, marks the device as unreachable and schedules a retry.
     * Resets the counter after a period without failures (60s timeout).
     * @param {object} ctx - DeviceContext
     */
    incrementCommandFailedCount(ctx) {
        ctx.commandFailedCount++;

        // Reset the counter after 60 seconds of no failures
        if (ctx.commandFailedResetTimeout) {
            clearTimeout(ctx.commandFailedResetTimeout);
        }
        ctx.commandFailedResetTimeout = setTimeout(() => {
            ctx.commandFailedCount = 0;
            ctx.commandFailedResetTimeout = null;
        }, C.COMMAND_FAILURE_RESET_TIMEOUT_MS);

        // After 2+ consecutive failures, mark device as unreachable
        if (ctx.commandFailedCount >= C.CONSECUTIVE_FAILURE_THRESHOLD && !ctx.connectionFailed) {
            const nick = ctx.vacuum.nick || ctx.deviceId;
            const model = ctx.getModel().getProductName();
            this.log.warn(`[${nick} (${model})] ${ctx.commandFailedCount} consecutive command failures. Marking device as unreachable.`);
            ctx.connectionFailed = true;
            if (!ctx.unreachableWarningSent) {
                ctx.unreachableWarningSent = true;
            }
            this.scheduleUnreachableRetry(ctx);
        }
    }

    scheduleUnreachableRetry(ctx) {
        // If we are in global MQTT unreachable state, skip per-device retry
        // The global retry mechanism will reconnect all devices at once
        if (this.globalMqttUnreachable) {
            this.log.silly(`[${ctx.vacuum.nick || ctx.deviceId}] Skipping per-device retry - global MQTT retry in progress`);
            return;
        }
        if (ctx.unreachableRetryTimeout) { return; }
        // Prevent reconnect triggered by stale states during adapter startup
        if (this._startupTime && (Date.now() - this._startupTime < C.STARTUP_GRACE_PERIOD_MS)) {
            this.log.debug('Reconnect skipped - startup grace period active');
            return;
        }
        if (this.authFailed) { return; }

        // Backoff schedule: 30s, 60s, then 5min for all subsequent retries
        const BACKOFF_SCHEDULE = C.BACKOFF_SCHEDULE;
        const retryIndex = Math.min(ctx.unreachableRetryCount, BACKOFF_SCHEDULE.length - 1);
        const delay = BACKOFF_SCHEDULE[retryIndex];
        ctx.unreachableRetryCount++;

        const nick = ctx.vacuum.nick || ctx.deviceId;
        const model = ctx.getModel().getProductName();
        this.log.debug(`[${nick} (${model})] Device unreachable. Scheduling retry #${ctx.unreachableRetryCount} in ${Math.round(delay / 1000)}s`);
        ctx.unreachableRetryTimeout = setTimeout(() => {
            ctx.unreachableRetryTimeout = null;
            const retryNick = ctx.vacuum.nick || ctx.deviceId;
            const retryModel = ctx.getModel().getProductName();
            this.log.debug(`[${retryNick} (${retryModel})] Executing reconnect attempt #${ctx.unreachableRetryCount}`);
            try {
                this._reconnectVacbotSafely(ctx, `[${retryNick} (${retryModel})] `);
            } catch (e) {
                this.log.warn(`[${retryNick} (${retryModel})] Reconnect failed: ${e.message}`);
                this.scheduleUnreachableRetry(ctx);
            }
        }, delay);
    }

    /**
     * Reconnect a vacbot's MQTT client.
     *
     * Since ecovacs-deebot alpha.21, vacbot.connect() self-cleans: it detaches
     * the previous client's listeners and force-closes the previously-owned
     * client (`client.end(true)`) before installing the new one. So a plain
     * connect() no longer leaks the old client, and we don't need to
     * disconnect-before-connect here anymore.
     *
     * @param {object} ctx        - DeviceContext
     * @param {string} [logPrefix] - prefix for debug logs
     */
    _reconnectVacbotSafely(ctx, logPrefix) {
        const prefix = logPrefix || '';
        if (!ctx || !ctx.vacbot) return;

        const vacbot = /** @type {VacBot} */ (ctx.vacbot);

        if (ctx.usesSharedMqttClient) {
            // Secondary device: primary owns the MQTT connection. Just resubscribe.
            this.log.debug(`${prefix}[${ctx.deviceId}] Shared MQTT device — resubscribing via primary`);
            try {
                const primaryCtx = this._getPrimaryMqttContext();
                if (primaryCtx) {
                    const client = (/** @type {VacBot} */ (primaryCtx.vacbot)).getMqttClient();
                    if (client) {
                        vacbot.connectShared(client);
                        return;
                    }
                }
            } catch (e) {
                this.log.debug(`${prefix}[${ctx.deviceId}] Resubscribe failed: ${e && e.message}`);
                throw e;
            }
            return;
        }

        // Primary (or single) device: connect() self-cleans the old client.
        try {
            vacbot.connect();

            // Propagate the new MQTT client to all secondary devices.
            const newClient = vacbot.getMqttClient();
            if (newClient) {
                for (const [, otherCtx] of this.deviceContexts) {
                    if (otherCtx.usesSharedMqttClient) {
                        this.log.debug(`${prefix}[${otherCtx.deviceId}] Updating shared MQTT client after primary reconnect`);
                        try {
                            (/** @type {VacBot} */ (otherCtx.vacbot)).connectShared(newClient);
                        } catch (e) {
                            this.log.debug(`${prefix}[${otherCtx.deviceId}] connectShared update failed: ${e && e.message}`);
                        }
                    }
                }
            }
        } catch (e) {
            this.log.debug(`${prefix}connect() failed: ${e && e.message}`);
            throw e;
        }
    }

    _getPrimaryMqttContext() {
        for (const [, ctx] of this.deviceContexts) {
            if (ctx.isPrimaryMqttDevice) return ctx;
        }
        return null;
    }

    clearUnreachableRetry(ctx) {
        if (ctx.unreachableRetryTimeout) {
            clearTimeout(ctx.unreachableRetryTimeout);
            ctx.unreachableRetryTimeout = null;
        }
        ctx.unreachableRetryCount = 0;
        ctx.connectionFailed = false;
        // Reset consecutive command failure tracking
        ctx.commandFailedCount = 0;
        if (ctx.commandFailedResetTimeout) {
            clearTimeout(ctx.commandFailedResetTimeout);
            ctx.commandFailedResetTimeout = null;
        }
    }

    /**
     * Called when a device that was previously unreachable sends data (event or successful response).
     * Resets the unreachable state and triggers an immediate re-fetch of device states.
     * Uses a per-device debounce to prevent rapid re-entry during burst recovery events.
     * @param {object} ctx - DeviceContext
     */
    handleDeviceDataReceived(ctx) {
        // If any device receives data while global MQTT unreachable is set,
        // it means the MQTT server is back online - clear the global state
        if (this.globalMqttUnreachable) {
            this.clearGlobalMqttUnreachable();
        }

        if (!ctx.connectionFailed && ctx.connected) {
            return; // Device was already in good state, nothing to reset
        }

        // Debounce: ignore if recovery was already triggered within the last 5 seconds
        const now = Date.now();
        if (ctx._lastRecoveryTimestamp && (now - ctx._lastRecoveryTimestamp < C.RECOVERY_DEBOUNCE_MS)) {
            return;
        }
        ctx._lastRecoveryTimestamp = now;

        const nick = ctx.vacuum.nick || ctx.deviceId;
        const model = ctx.getModel().getProductName();
        this.log.info(`[${nick} (${model})] Device is reachable again - received data. Resetting unreachable state and re-fetching states.`);

        // Clear any pending retry
        this.clearUnreachableRetry(ctx);

        // Mark device as connected
        ctx.connected = true;
        ctx.unreachableWarningSent = false;
        this.updateDeviceConnectionState(ctx, true);
        this.updateConnectionState();
        this.resetErrorStates(ctx);

        // Re-fetch device states immediately since some may have been missed.
        // Tracked on ctx so it can be cleared on unload (see onUnload), avoiding
        // a callback firing against a torn-down context.
        if (ctx._recoveryRefetchTimeout) {
            clearTimeout(ctx._recoveryRefetchTimeout);
        }
        ctx._recoveryRefetchTimeout = setTimeout(() => {
            ctx._recoveryRefetchTimeout = null;
            if (ctx.connected && !ctx.connectionFailed) {
                this.log.debug(`[${nick}] Triggering state re-fetch after recovery`);
                ctx.commandQueue.addStandardGetCommands();
                ctx.commandQueue.runAll();
            }
        }, C.RECOVERY_REFETCH_DELAY_MS);
    }

    resetCurrentStats(ctx) {
        if (ctx.getModel().usesMqtt()) {
            this.log.debug('Reset current cleaninglog stats');
            ctx.adapterProxy.setStateConditional('cleaninglog.current.cleanedArea', 0, true);
            ctx.adapterProxy.setStateConditional('cleaninglog.current.cleanedSeconds', 0, true);
            ctx.adapterProxy.setStateConditional('cleaninglog.current.cleanedTime', '0h 00m 00s', true);
            ctx.adapterProxy.setStateConditional('cleaninglog.current.cleanType', '', true);
            ctx.currentCleanedSeconds = 0;
            ctx.currentCleanedArea = 0;
            ctx.silentApproach = {};
        }
    }

    resetErrorStates(ctx) {
        if (ctx._pendingErrorWriteTimeout) {
            clearTimeout(ctx._pendingErrorWriteTimeout);
            ctx._pendingErrorWriteTimeout = null;
        }
        ctx.errorCode = '0';
        ctx.adapterProxy.setStateConditional('info.errorCode', ctx.errorCode, true);
        ctx.adapterProxy.setStateConditional('info.error', 'NoError: Robot is operational', true);
    }

    debouncedSetError(ctx, code, error) {
        if (ctx._pendingErrorWriteTimeout) {
            clearTimeout(ctx._pendingErrorWriteTimeout);
        }
        ctx.errorCode = code;
        ctx._pendingErrorWriteTimeout = setTimeout(() => {
            ctx._pendingErrorWriteTimeout = null;
            ctx.adapterProxy.setStateConditional('info.errorCode', ctx.errorCode, true);
            ctx.adapterProxy.setStateConditional('info.error', error, true);
        }, C.ERROR_WRITE_DEBOUNCE_MS);
    }

    clearGoToPosition(ctx) {
        ctx.adapterProxy.setStateConditional('control.extended.goToPosition', '', true);
        ctx.goToPositionArea = null;
    }

    async setInitialStateValues(ctx) {
        this.resetErrorStates(ctx);
        this.resetCurrentStats(ctx);
        // Fetch all initial states in parallel for performance
        const stateKeys = [
            'info.cleanstatus',
            'info.chargestatus',
            'map.currentMapMID',
            'control.customArea_cleanings',
            'control.spotArea_cleanings',
            'control.waterLevel',
            'control.cleanSpeed',
            'control.extended.pauseWhenEnteringSpotArea',
            'control.extended.pauseWhenLeavingSpotArea',
            'info.waterboxinfo',
            'map.chargePosition',
            'map.deebotPosition',
            'control.extended.pauseBeforeDockingChargingStation',
            'control.extended.resetCleanSpeedToStandardOnReturn',
            'control.extended.cleaningClothReminder',
            'control.extended.cleaningClothReminder_period',
            'info.extended.airDryingDateTime.startTimestamp'
        ];

        const results = await Promise.all(
            stateKeys.map(key => ctx.adapterProxy.getStateAsync(key).catch(() => null))
        );

        // Apply results in same order as stateKeys array
        for (let i = 0; i < stateKeys.length; i++) {
            const state = results[i];
            switch (stateKeys[i]) {
                case 'info.cleanstatus':
                    if (state && state.val) ctx.cleanstatus = state.val.toString();
                    break;
                case 'info.chargestatus':
                    if (state && state.val) ctx.chargestatus = state.val.toString();
                    break;
                case 'map.currentMapMID':
                    if (state && state.val) ctx.currentMapID = state.val.toString();
                    break;
                case 'control.customArea_cleanings':
                    if (state && state.val) ctx.customAreaCleanings = Number(state.val);
                    break;
                case 'control.spotArea_cleanings':
                    if (state && state.val) ctx.spotAreaCleanings = Number(state.val);
                    break;
                case 'control.waterLevel':
                    if (state && state.val) ctx.waterLevel = Math.round(Number(state.val));
                    break;
                case 'control.cleanSpeed':
                    if (state && state.val) ctx.cleanSpeed = Math.round(Number(state.val));
                    break;
                case 'control.extended.pauseWhenEnteringSpotArea':
                    if (state && state.val) ctx.pauseWhenEnteringSpotArea = state.val.toString();
                    break;
                case 'control.extended.pauseWhenLeavingSpotArea':
                    if (state && state.val) ctx.pauseWhenLeavingSpotArea = state.val.toString();
                    break;
                case 'info.waterboxinfo':
                    if (state && state.val) ctx.waterboxInstalled = (state.val === true);
                    break;
                case 'map.chargePosition':
                    if (state && state.val) ctx.chargePosition = state.val;
                    break;
                case 'map.deebotPosition':
                    if (state && state.val) ctx.deebotPosition = state.val;
                    break;
                case 'control.extended.pauseBeforeDockingChargingStation':
                    if (state && state.val) ctx.pauseBeforeDockingChargingStation = (state.val === true);
                    break;
                case 'control.extended.resetCleanSpeedToStandardOnReturn':
                    if (state && state.val) ctx.resetCleanSpeedToStandardOnReturn = (state.val === true);
                    break;
                case 'control.extended.cleaningClothReminder':
                    if (state && state.val) ctx.cleaningClothReminder.enabled = Boolean(Number(state.val));
                    break;
                case 'control.extended.cleaningClothReminder_period':
                    if (state && state.val) ctx.cleaningClothReminder.period = Number(state.val);
                    break;
                case 'info.extended.airDryingDateTime.startTimestamp':
                    if (state && state.val) ctx.airDryingStartTimestamp = Number(state.val);
                    break;
            }
        }

        await this.initLast20Errors(ctx);
        await this.setPauseBeforeDockingIfWaterboxInstalled(ctx);
    }

    async initLast20Errors(ctx) {
        /** @type {Object} */
        const state = await ctx.adapterProxy.getStateAsync('history.last20Errors');
        if (state && state.val) {
            if (state.val !== '') {
                /** @type {string} */
                const obj = state.val;
                ctx.last20Errors = JSON.parse(obj);
            }
        }
    }

    addToLast20Errors(ctx, code, error) {
        const obj = {
            'timestamp': helper.getUnixTimestamp(),
            'date': this.getCurrentDateAndTimeFormatted(),
            'code': code,
            'error': error
        };
        ctx.last20Errors.unshift(obj);
        if (ctx.last20Errors.length > 20) {
            ctx.last20Errors.pop();
        }
        ctx.adapterProxy.setStateConditional('history.last20Errors', JSON.stringify(ctx.last20Errors), true);
    }

    async setPauseBeforeDockingIfWaterboxInstalled(ctx) {
        const state = await ctx.adapterProxy.getStateAsync('control.extended.pauseBeforeDockingIfWaterboxInstalled');
        if (state) {
            ctx.pauseBeforeDockingIfWaterboxInstalled = (state.val === true);
        }
    }

    setStateConditional(stateId, value, ack = true, native) {
        if (helper.isIdValid(stateId)) {
            if (value === undefined) {
                this.log.warn("setStateConditional: value for state id '" + stateId + "' is undefined");
                return;
            }
            const _dotIdx = stateId.indexOf('.');
            if (_dotIdx > 0) {
                let _cacheCtx = null;
                if (this.config.singleDeviceMode) {
                    // In single device mode, use the single context for cache lookup
                    _cacheCtx = this.deviceContexts.values().next().value;
                } else {
                    const _deviceId = stateId.substring(0, _dotIdx);
                    _cacheCtx = this.deviceContexts.get(_deviceId);
                }
                if (_cacheCtx && _cacheCtx._stateValues) {
                    // In single device mode, the entire stateId is the cache key
                    const cacheKey = this.config.singleDeviceMode ? stateId : stateId.substring(_dotIdx + 1);
                    const _cachedVal = _cacheCtx._stateValues.get(cacheKey);
                    if (_cachedVal === value && !native) {
                        return;
                    }
                }
            }
            // Ensure object exists before setting state
            this.getObject(stateId, (err, obj) => {
                if (err || !obj) {
                    this.log.silly("setStateConditional: object '" + stateId + "' does not exist yet, skipping");
                    return;
                }
                this.getState(stateId, (err2, state) => {
                    if (!err2) {
                        if (!state || (ack && !state.ack) || (state.val !== value) || native) {
                            this.setState(stateId, value, ack);
                            if (_dotIdx > 0) {
                                let _cacheCtx2 = null;
                                if (this.config.singleDeviceMode) {
                                    _cacheCtx2 = this.deviceContexts.values().next().value;
                                } else {
                                    const _deviceId2 = stateId.substring(0, stateId.indexOf('.'));
                                    _cacheCtx2 = this.deviceContexts.get(_deviceId2);
                                }
                                if (_cacheCtx2 && _cacheCtx2._stateValues) {
                                    const cacheKey = this.config.singleDeviceMode ? stateId : stateId.substring(stateId.indexOf('.') + 1);
                                    _cacheCtx2._stateValues.set(cacheKey, value);
                                }
                            }
                            if (native) {
                                this.extendObject(
                                    stateId, {
                                        native: native
                                    });
                            }
                        } else {
                            this.log.silly("setStateConditional: '" + stateId + "' unchanged");
                        }
                    }
                });
            });
        } else {
            this.log.warn("setStateConditional: state id '" + stateId + "' not valid");
        }
    }

    async setStateConditionalAsync(stateId, value, ack = true, native) {
        if (helper.isIdValid(stateId)) {
            if (value === undefined) {
                this.log.warn("setStateConditionalAsync: value for state id '" + stateId + "' is undefined");
                return;
            }
            const _dotIdx2 = stateId.indexOf('.');
            if (_dotIdx2 > 0) {
                let _cacheCtx2 = null;
                if (this.config.singleDeviceMode) {
                    // In single device mode, use the single context for cache lookup
                    _cacheCtx2 = this.deviceContexts.values().next().value;
                } else {
                    const _deviceId2 = stateId.substring(0, _dotIdx2);
                    _cacheCtx2 = this.deviceContexts.get(_deviceId2);
                }
                if (_cacheCtx2 && _cacheCtx2._stateValues) {
                    // In single device mode, the entire stateId is the cache key
                    const cacheKey = this.config.singleDeviceMode ? stateId : stateId.substring(_dotIdx2 + 1);
                    const _cachedVal2 = _cacheCtx2._stateValues.get(cacheKey);
                    if (_cachedVal2 === value && !native) {
                        return;
                    }
                }
            }
            // Ensure object exists before setting state
            const obj = await this.getObjectAsync(stateId);
            if (!obj) {
                this.log.silly("setStateConditionalAsync: object '" + stateId + "' does not exist yet, skipping");
                return;
            }
            const state = await this.getStateAsync(stateId);
            if (!state || (ack && !state.ack) || (state.val !== value) || native) {
                this.setState(stateId, value, ack);
                if (_dotIdx2 > 0) {
                    let _cacheCtx3 = null;
                    if (this.config.singleDeviceMode) {
                        _cacheCtx3 = this.deviceContexts.values().next().value;
                    } else {
                        const _deviceId3 = stateId.substring(0, stateId.indexOf('.'));
                        _cacheCtx3 = this.deviceContexts.get(_deviceId3);
                    }
                    if (_cacheCtx3 && _cacheCtx3._stateValues) {
                        const cacheKey = this.config.singleDeviceMode ? stateId : stateId.substring(stateId.indexOf('.') + 1);
                        _cacheCtx3._stateValues.set(cacheKey, value);
                    }
                }
                if (native) {
                    this.extendObject(
                        stateId, {
                            native: native
                        });
                }
            }
        } else {
            this.log.warn('setStateConditionalAsync() id not valid: ' + stateId);
        }
    }

    setDeviceStatusByTrigger(ctx, trigger) {
        ctx.getDevice().setStatusByTrigger(trigger);
        ctx.adapterProxy.setStateConditional('info.deviceStatus', ctx.getDevice().status, true);
        ctx.adapterProxy.setStateConditional('status.device', ctx.getDevice().status, true);
        if (ctx.getDevice().isReturning() && ctx.resetCleanSpeedToStandardOnReturn) {
            if (ctx.getModel().isSupportedFeature('control.resetCleanSpeedToStandardOnReturn') &&
                ctx.getModel().isSupportedFeature('control.cleanSpeed')) {
                adapterCommands.runSetCleanSpeed(this, ctx, 2);
            }
        }
        this.setStateValuesOfControlButtonsByDeviceStatus(ctx);
    }

    setStateValuesOfControlButtonsByDeviceStatus(ctx) {
        let charge, stop, pause, clean;
        charge = stop = pause = clean = false;
        switch (ctx.getDevice().status) {
            case 'charging':
                charge = true;
                stop = true;
                break;
            case 'paused':
                pause = true;
                break;
            case 'stopped':
            case 'error':
                stop = true;
                break;
            case 'cleaning':
                clean = true;
                break;
        }
        ctx.adapterProxy.setStateConditional('control.charge', charge, true);
        ctx.adapterProxy.setStateConditional('control.stop', stop, true);
        ctx.adapterProxy.setStateConditional('control.pause', pause, true);
        ctx.adapterProxy.setStateConditional('control.clean', clean, true);
    }

    vacbotInitialGetStates(ctx) {
        ctx.commandQueue.addInitialGetCommands();
        ctx.commandQueue.addStandardGetCommands();
        ctx.commandQueue.runAll();
    }

    vacbotGetStatesInterval(ctx) {
        // Skip polling when global MQTT unreachable or device not connected
        if (this.globalMqttUnreachable || ctx.connectionFailed || !ctx.connected || !ctx.enabled) {
            const nick = ctx.vacuum.nick || ctx.deviceId;
            this.log.debug(`[${nick}] Skipping polling interval - device unreachable (connectionFailed=${ctx.connectionFailed}, connected=${ctx.connected}, enabled=${ctx.enabled})`);
            return;
        }
        ctx.intervalQueue.addStandardGetCommands();
        ctx.intervalQueue.addAdditionalGetCommands();
        ctx.intervalQueue.runAll();
    }

    startPolling(ctx) {
        if (ctx._autoUpdateInterval) {
            return;
        }
        const interval = Math.max(this.pollingInterval, C.MIN_POLLING_INTERVAL_MS);
        ctx._autoUpdateInterval = setInterval(() => {
            if (this.globalMqttUnreachable || ctx.connectionFailed || !ctx.connected || !ctx.enabled) {
                return;
            }
            this.vacbotGetStatesInterval(ctx);
        }, interval);
        this.log.debug(ctx.deviceId + ' Polling every ' + (interval / 1000) + 's');
    }

    stopPolling(ctx) {
        if (ctx._autoUpdateInterval) {
            clearInterval(ctx._autoUpdateInterval);
            ctx._autoUpdateInterval = null;
        }
    }

    /**
     * Returns the technical platform/architecture type for a device context.
     * @param {object} ctx
     * @returns {string}
     */
    getPlatformType(ctx) {
        return ctx.getModel().getPlatformType();
    }

    /**
     * @deprecated Use getPlatformType() instead.
     * @param {object} ctx
     * @returns {string}
     */
    getModelType(ctx) {
        return this.getPlatformType(ctx);
    }

    /**
     * Get device type from device object for discovery cache
     * @param {object} device - Device object from API
     * @returns {string} Device type classification
     */
    getDeviceTypeFromDevice(device) {
        if (device.deviceName) {
            if (device.deviceName.includes('Airbot') || device.deviceName.includes('AVA') || device.deviceName.includes('ANDY')) {
                return 'Air Purifier';
            }
            if (device.deviceName.includes('Air Quality') || device.deviceName.includes('Z1 Air')) {
                return 'Air Quality Monitor';
            }
            if (device.deviceName.includes('GOAT') || device.deviceName.includes('Goat')) {
                return 'Lawn Mower';
            }
            if (device.deviceName.includes('WINBOT') || device.deviceName.includes('Winbot')) {
                return 'Window Cleaner';
            }
        }
        return 'Vacuum Cleaner';
    }

    /**
     * Migrate legacy native config keys that cause dot-notation collisions.
     * Renames:
     *   - 'feature.map.virtualBoundaries'       -> 'feature.map.virtualBoundariesRead'
     *   - 'feature.map.virtualBoundaries.write' -> 'feature.map.virtualBoundariesWrite'
     * The old keys collide during admin UI dot-notation unflattening,
     * causing React error #31.
     */
    async migrateNativeConfig() {
        const renames = [
            ['feature.map.virtualBoundaries', 'feature.map.virtualBoundariesRead'],
            ['feature.map.virtualBoundaries.write', 'feature.map.virtualBoundariesWrite']
        ];

        const migrateNative = (native) => {
            let changed = false;
            for (const [oldKey, newKey] of renames) {
                if (native[oldKey] !== undefined) {
                    native[newKey] = native[oldKey] || '';
                    delete native[oldKey];
                    changed = true;
                }
            }
            return changed;
        };

        try {
            // 1. Fix the adapter definition object (native defaults)
            const adapterObj = await this.getForeignObjectAsync('system.adapter.ecovacs-deebot');
            if (adapterObj) {
                let changed = false;
                if (adapterObj.native) changed = migrateNative(adapterObj.native) || changed;
                if (adapterObj.common && adapterObj.common['native']) changed = migrateNative(adapterObj.common['native']) || changed;
                if (changed) {
                    await this.setForeignObjectAsync('system.adapter.ecovacs-deebot', adapterObj);
                    this.log.info('Migrated adapter definition object');
                }
            }

            // 2. Fix all instance objects
            for (let i = 0; i <= 99; i++) {
                const id = 'system.adapter.ecovacs-deebot.' + i;
                try {
                    const obj = await this.getForeignObjectAsync(id);
                    if (!obj || !obj.native) continue;
                    if (migrateNative(obj.native)) {
                        await this.setForeignObjectAsync(id, obj);
                        this.log.info('Migration completed for ' + id);
                    }
                } catch (e) {
                    // Instance does not exist or access error, skip
                }
            }
        } catch (e) {
            this.log.warn('Migration error: ' + e.message);
        }
    }

    /**
     * Returns the per-device config entry from the "devices" accordion for a
     * given deviceId, or undefined if none is configured.
     * @param {string} deviceId
     * @returns {Object|undefined}
     */
    getDeviceConfigEntry(deviceId) {
        if (!deviceId || !Array.isArray(this.config.devices)) {
            return undefined;
        }
        // The runtime deviceId is the sanitized did (vacuum.did with non
        // [a-zA-Z0-9_] chars replaced by '_'), which is also the device's
        // channel name. Sanitize the configured value the same way so a pasted
        // raw did matches regardless of special characters.
        const sanitize = (s) => String(s).replace(/[^a-zA-Z0-9_]/g, '_');
        return this.config.devices.find((d) => d && sanitize(d.deviceId) === deviceId);
    }

    /**
     * Ensures the per-device configuration ("devices" accordion in the admin)
     * has an entry for every device discovered on the account. Existing entries
     * (including the user's feature overrides and custom names) are never
     * modified or removed; only missing devices are appended.
     *
     * Writing the instance config object causes js-controller to restart the
     * adapter, so this only writes when there is actually something new to add
     * (typically only on the first run or when a new device appears), avoiding
     * restart loops.
     * @param {Object[]} devices - discovered devices from the Ecovacs API
     * @returns {Promise<boolean>} true if new entries were added (config written)
     */
    async ensureDeviceConfigEntries(devices) {
        try {
            const objId = 'system.adapter.' + this.namespace;
            const obj = await this.getForeignObjectAsync(objId);
            if (!obj || !obj.native) {
                return false;
            }
            const existing = Array.isArray(obj.native.devices) ? obj.native.devices : [];
            const sanitize = (s) => String(s).replace(/[^a-zA-Z0-9_]/g, '_');
            const known = new Set(existing.map((d) => d && sanitize(d.deviceId)));

            const additions = [];
            for (const device of devices) {
                const did = device.did || device.name;
                if (!did || known.has(sanitize(did))) {
                    continue;
                }
                known.add(sanitize(did));
                additions.push({
                    name: device.nick || device.deviceName || device.name || did,
                    deviceId: did
                });
            }

            if (additions.length === 0) {
                return false;
            }

            obj.native.devices = existing.concat(additions);
            await this.setForeignObjectAsync(objId, obj);
            this.log.info(`Added ${additions.length} newly discovered device(s) to the configuration. The adapter will restart to apply.`);
            return true;
        } catch (e) {
            this.log.warn('Could not auto-populate the device configuration: ' + e.message);
            return false;
        }
    }

    /**
     * Resolves a feature.* config value. When a deviceId is supplied and the
     * device has a per-device override configured, that override wins; otherwise
     * the (legacy) global value is used as a fallback for backward compatibility.
     * Non-feature keys (e.g. authDomain) only ever resolve globally.
     * @param {string} cv
     * @param {string} [deviceId]
     */
    getConfigValue(cv, deviceId) {
        if (deviceId && Object.hasOwn(PER_DEVICE_FEATURE_KEYS, cv)) {
            const entry = this.getDeviceConfigEntry(deviceId);
            if (entry) {
                const value = entry[PER_DEVICE_FEATURE_KEYS[cv]];
                if (value !== undefined && value !== null && value !== '') {
                    return value;
                }
            }
        }
        const globalValue = this.config[cv];
        if (globalValue !== undefined && globalValue !== null && globalValue !== '') {
            return globalValue;
        }
        return '';
    }

    /**
     * Builds the effective adapter config for a single device's Model: the
     * global config overlaid with that device's configured feature.* overrides.
     * Used so Model.getConfigOverride() resolves per-device values.
     * @param {string} deviceId
     * @returns {Object}
     */
    buildDeviceConfig(deviceId) {
        const merged = { ...this.config };
        const entry = this.getDeviceConfigEntry(deviceId);
        if (entry) {
            for (const [featureKey, attr] of Object.entries(PER_DEVICE_FEATURE_KEYS)) {
                const value = entry[attr];
                if (value !== undefined && value !== null && value !== '') {
                    merged[featureKey] = value;
                }
            }
        }
        return merged;
    }

    isAuthError(message) {
        if (typeof message !== 'string') {
            return false;
        }
        const authErrorPatterns = [
            /code 1010/i,
            /incorrect account or password/i,
            /invalid.*credentials/i,
            /authentication.*failed/i,
            /unauthorized/i
        ];
        return authErrorPatterns.some((pattern) => pattern.test(message));
    }

    /**
     * Surfaces an account/adapter-level error (missing config or a failed
     * login). These are not tied to a specific device, so they are written to
     * the global info.error / info.errorCode states. Per-device errors go
     * through debouncedSetError(ctx, ...) which writes device-prefixed states.
     * @param {string} message
     * @param {boolean} [stop] - also clear the global connection indicator
     */
    error(message, stop) {
        if (stop) {
            this.setConnection(false);
        }
        // Always log and surface the real message. (Previously a "code 0002"
        // message was rewritten to "reconnecting" and the log suppressed, but
        // nothing here ever reconnects — that just hid the actual error.)
        this.log.error(message);
        this.errorCode = '-9';
        this.setStateConditional('info.errorCode', this.errorCode, true);
        this.setStateConditional('info.error', message, true);
    }

    async createChannelNotExists(id, name) {
        if (id === undefined) {
            this.log.warn(`createChannelNotExists() id is undefined. Using id: 'unknown'`);
            id = 'unknown';
        }
        if (name === undefined) {
            this.log.warn(`createChannelNotExists() name is undefined. Using name: 'unknown'`);
            name = 'unknown';
        }
        await this.setObjectNotExistsAsync(id, {
            type: 'channel',
            common: {
                name: name
            },
            native: {}
        });
    }

    async deleteChannelIfExists(id) {
        const obj = await this.getObjectAsync(id);
        if (obj) {
            await this.delObjectAsync(obj._id);
        }
    }

    async deleteObjectIfExists(id) {
        const obj = await this.getObjectAsync(id);
        if (obj) {
            await this.delObjectAsync(id);
        }
    }

    async createObjectNotExists(id, name, type, role, write, def, unit = '') {
        if (helper.isIdValid(id)) {
            await this.setObjectNotExistsAsync(id, {
                type: 'state',
                common: {
                    name: name,
                    type: type,
                    role: role,
                    read: true,
                    write: write,
                    def: def,
                    unit: unit
                },
                native: {}
            });
        } else {
            this.log.warn('createObjectNotExists() id not valid: ' + id);
        }
    }

    /**
     * Returns whether the robot is currently cleaning specific spot areas
     * and the current spot area is part of the cleaning process
     * @returns {Promise<boolean>}
     */
    async isCurrentSpotAreaPartOfCleaningProcess(ctx) {
        if (ctx.getDevice().isNotCleaning()) {
            return false;
        }
        if (ctx.cleanstatus !== 'spot_area') {
            return true;
        }
        if (ctx.currentSpotAreaID === 'unknown') {
            return false;
        }
        let spotAreaArray = [];
        const state = await ctx.adapterProxy.getStateAsync('map.currentUsedSpotAreas');
        if (state && state.val) {
            spotAreaArray = state.val.toString().split(',');
        }
        const isPartOfCleaningProcess = spotAreaArray.includes(ctx.currentSpotAreaID);
        if (!isPartOfCleaningProcess) {
            this.log.debug('Spot Area ' + ctx.currentSpotAreaID + ' is not part of the cleaning process');
        }
        return isPartOfCleaningProcess;
    }

    getPauseBeforeDockingChargingStationAreaSize(deviceId) {
        if (this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize', deviceId)) {
            return Number(this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize', deviceId));
        }
        return 500;
    }

    getPauseBeforeDockingSendPauseOrStop(deviceId) {
        let sendPauseOrStop = 'pause';
        if (this.getConfigValue('feature.pauseBeforeDockingChargingStation.pauseOrStop', deviceId)) {
            sendPauseOrStop = this.getConfigValue('feature.pauseBeforeDockingChargingStation.pauseOrStop', deviceId);
        }
        return sendPauseOrStop;
    }

    getHoursUntilDustBagEmptyReminderFlagIsSet(deviceId) {
        if (this.getConfigValue('feature.info.extended.hoursUntilDustBagEmptyReminderFlagIsSet', deviceId)) {
            return Number(this.getConfigValue('feature.info.extended.hoursUntilDustBagEmptyReminderFlagIsSet', deviceId));
        }
        return 0;
    }

    getCurrentDateAndTimeFormatted() {
        return helper.getCurrentDateAndTimeFormatted(this);
    }

    setHistoryValuesForDustboxRemoval(ctx) {
        ctx.adapterProxy.setStateConditional('history.timestampOfLastTimeDustboxRemoved', helper.getUnixTimestamp(), true);
        ctx.adapterProxy.setStateConditional('history.dateOfLastTimeDustboxRemoved', this.getCurrentDateAndTimeFormatted(), true);
        ctx.adapterProxy.setStateConditional('history.cleaningTimeSinceLastDustboxRemoved', 0, true);
        ctx.adapterProxy.setStateConditional('history.cleaningTimeSinceLastDustboxRemovedString', helper.getTimeStringFormatted(0), true);
        ctx.adapterProxy.setStateConditional('history.squareMetersSinceLastDustboxRemoved', 0, true);
        ctx.adapterProxy.setStateConditional('info.extended.dustBagEmptyReminder', false, true);
    }

    downloadLastCleaningMapImage(ctx, imageUrl, configValue) {
        const axios = require('axios').default;
        const crypto = require('crypto');
        (async () => {
            let filename = 'lastestCleaningMapImage.png';
            let headers = {};
            if (ctx.getModel().isModelTypeT9Based()) {
                const sign = crypto.createHash('sha256').update(ctx.vacbot.getCryptoHashStringForSecuredContent()).digest('hex');
                headers = {
                    'Authorization': 'Bearer ' + ctx.vacbot.user_access_token,
                    'token': ctx.vacbot.user_access_token,
                    'appid': 'ecovacs',
                    'plat': 'android',
                    'userid': ctx.vacbot.uid,
                    'user-agent': 'EcovacsHome/2.3.7 (Linux; U; Android 5.1.1; A5010 Build/LMY48Z)',
                    'v': '2.3.7',
                    'country': ctx.vacbot.country,
                    'sign': sign,
                    'signType': 'sha256'
                };
            }
            const keepAllFiles = (configValue === 1);
            if (keepAllFiles) {
                const searchElement = ctx.getModel().isModelTypeT9Based() ? '=' : '/';
                const imageId = imageUrl.substring(imageUrl.lastIndexOf(searchElement) + 1);
                filename = `lastCleaningMapImage_${imageId}.png`;
            }
            try {
                const fileExists = await this.fileExistsAsync(this.namespace, filename);
                if (!keepAllFiles || !fileExists) {
                    const res = await axios.get(imageUrl, {
                        headers, responseType: 'arraybuffer'
                    });
                    await this.writeFileAsync(this.namespace, filename, res.data);
                    await ctx.adapterProxy.createObjectNotExists(
                        'cleaninglog.lastCleaningMapImageFile', 'Name of the png file', 'string', 'value', false, '', '');
                    const filePath = '/' + this.namespace + '/' + filename;
                    await ctx.adapterProxy.setStateConditionalAsync(
                        'cleaninglog.lastCleaningMapImageFile', filePath, true);
                } else if (fileExists) {
                    this.log.debug(`File ${filename} already exists`);
                }
            } catch (e) {
                this.log.error(`Error downloading last cleaning map image: ${e}`);
            }
        })();
    }

    async handleChangedCurrentSpotAreaID(ctx, spotAreaID) {
        const spotAreaChannel = 'map.' + ctx.currentMapID + '.spotAreas.' + spotAreaID;
        await this.setCurrentSpotAreaName(ctx, spotAreaID);
        if (ctx.getDevice().isCleaning()) {
            const timestamp = helper.getUnixTimestamp();
            ctx.currentSpotAreaData = {
                'spotAreaID': spotAreaID,
                'lastTimeEnteredTimestamp': timestamp
            };
            await this.handleCleanSpeedForSpotArea(ctx, spotAreaID);
            await this.handleWaterLevelForSpotArea(ctx, spotAreaID);
            await this.handleEnteringSpotArea(ctx, spotAreaID);
            await this.handleLeavingSpotArea(ctx, spotAreaID);
            ctx.adapterProxy.setStateConditional(spotAreaChannel + '.lastTimeEnteredTimestamp', timestamp, true);
            this.log.info(`Entering '${ctx.currentSpotAreaName}' (spotAreaID: ${spotAreaID}, cleanStatus: '${ctx.cleanstatus})'`);
        } else {
            this.handleSilentApproach(ctx);
        }
    }

    async handleEnteringSpotArea(ctx, spotAreaID) {
        if (ctx.currentSpotAreaID && ctx.pauseWhenEnteringSpotArea) {
            if (parseInt(ctx.pauseWhenEnteringSpotArea) === parseInt(spotAreaID)) {
                if (ctx.getDevice().isNotPaused() && ctx.getDevice().isNotStopped()) {
                    ctx.commandQueue.run('pause');
                }
                ctx.pauseWhenEnteringSpotArea = '';
                ctx.adapterProxy.setStateConditional('control.extended.pauseWhenEnteringSpotArea', '', true);
            }
        }
    }

    async handleLeavingSpotArea(ctx, spotAreaID) {
        if (ctx.currentSpotAreaID) {
            if (parseInt(spotAreaID) !== parseInt(ctx.currentSpotAreaID)) {
                if (ctx.pauseWhenLeavingSpotArea) {
                    if (parseInt(ctx.pauseWhenLeavingSpotArea) === parseInt(ctx.currentSpotAreaID)) {
                        if (ctx.getDevice().isNotPaused() && ctx.getDevice().isNotStopped()) {
                            ctx.commandQueue.run('pause');
                        }
                        ctx.pauseWhenLeavingSpotArea = '';
                        ctx.adapterProxy.setStateConditional('control.extended.pauseWhenLeavingSpotArea', '', true);
                    }
                }
            }
        }
    }

    async setCurrentSpotAreaName(ctx, spotAreaID) {
        const state = await ctx.adapterProxy.getStateAsync('map.' + ctx.currentMapID + '.spotAreas.' + spotAreaID + '.spotAreaName');
        if (state && state.val) {
            const spotAreaName = state.val.toString();
            ctx.currentSpotAreaName = mapHelper.getAreaName_i18n(this, ctx, spotAreaName);
        } else {
            ctx.currentSpotAreaName = '';
        }
        ctx.adapterProxy.setStateConditional('map.deebotPositionCurrentSpotAreaName', ctx.currentSpotAreaName, true);
    }

    async handleCleanSpeedForSpotArea(ctx, spotAreaID) {
        const spotAreaChannel = 'map.' + ctx.currentMapID + '.spotAreas.' + spotAreaID;
        const spotAreaState = await ctx.adapterProxy.getStateAsync(spotAreaChannel + '.cleanSpeed');
        if (spotAreaState && spotAreaState.val && (Number(spotAreaState.val) > 0) && (spotAreaState.val !== ctx.cleanSpeed)) {
            ctx.cleanSpeed = spotAreaState.val;
            ctx.adapterProxy.setStateConditional('control.cleanSpeed', ctx.cleanSpeed, false);
            this.log.info('Set clean speed to ' + ctx.cleanSpeed + ' for spot area ' + spotAreaID);
        } else {
            const standardState = await ctx.adapterProxy.getStateAsync('control.cleanSpeed_standard');
            if (standardState && standardState.val && (Number(standardState.val) > 0) && (standardState.val !== ctx.cleanSpeed)) {
                ctx.cleanSpeed = standardState.val;
                ctx.adapterProxy.setStateConditional('control.cleanSpeed', ctx.cleanSpeed, false);
                this.log.info('Set clean speed to standard (' + ctx.cleanSpeed + ') for spot area ' + spotAreaID);
            }
        }
    }

    async handleWaterLevelForSpotArea(ctx, spotAreaID) {
        const spotAreaChannel = 'map.' + ctx.currentMapID + '.spotAreas.' + spotAreaID;
        if (ctx.waterboxInstalled) {
            const spotAreaState = await ctx.adapterProxy.getStateAsync(spotAreaChannel + '.waterLevel');
            if (spotAreaState && spotAreaState.val && (Number(spotAreaState.val) > 0) && (spotAreaState.val !== ctx.waterLevel)) {
                ctx.waterLevel = spotAreaState.val;
                ctx.adapterProxy.setStateConditional('control.waterLevel', ctx.waterLevel, false);
                this.log.info('Set water level to ' + ctx.waterLevel + ' for spot area ' + spotAreaID);
            } else {
                const standardState = await ctx.adapterProxy.getStateAsync('control.waterLevel_standard');
                if (standardState && standardState.val && (Number(standardState.val) > 0) && (standardState.val !== ctx.waterLevel)) {
                    ctx.waterLevel = standardState.val;
                    ctx.adapterProxy.setStateConditional('control.waterLevel', ctx.waterLevel, false);
                    this.log.info('Set water level to standard (' + ctx.waterLevel + ') for spot area ' + spotAreaID);
                }
            }
        }
    }

    handleSilentApproach(ctx) {
        if (ctx.silentApproach.mapSpotAreaID) {
            if ((Number(ctx.silentApproach.mapID) === Number(ctx.currentMapID)) &&
                (Number(ctx.silentApproach.mapSpotAreaID) === Number(ctx.currentSpotAreaID))) {
                if (ctx.silentApproach.mapSpotAreas && ctx.silentApproach.mapSpotAreas !== '') {
                    this.log.info(`Handle silent approach for 'spotArea_silentApproach'`);
                    this.log.info(`Reached spot area '${ctx.silentApproach.mapSpotAreaID}' - start cleaning spot areas '${ctx.silentApproach.mapSpotAreas}' now`);
                    adapterCommands.startSpotAreaCleaning(this, ctx, ctx.silentApproach.mapSpotAreas);
                } else {
                    this.log.info(`Handle silent approach for 'cleanSpotArea_silentApproach'`);
                    this.log.info(`Reached spot area '${ctx.silentApproach.mapSpotAreaID}' - start cleaning now`);
                    adapterCommands.cleanSpotArea(this, ctx, ctx.silentApproach.mapID, ctx.silentApproach.mapSpotAreaID);
                }
                ctx.silentApproach = {};
            } else {
                this.log.debug(`Handle silent approach, but spot area '${ctx.silentApproach.mapSpotAreaID}' not reached yet ...`);
            }
        }
    }

    async handlePositionObj(ctx, obj) {
        ctx.deebotPosition = obj.coords;
        const x = Number(obj.x);
        const y = Number(obj.y);
        const spotAreaID = obj.spotAreaID;
        this.log.silly('DeebotPositionCurrentSpotAreaID: ' + spotAreaID);
        if ((spotAreaID !== 'unknown') && (spotAreaID !== 'void')) {
            const spotAreaHasChanged =
                (ctx.currentSpotAreaData.spotAreaID !== spotAreaID) ||
                (ctx.currentSpotAreaID !== spotAreaID);
            ctx.currentSpotAreaID = spotAreaID;
            if (spotAreaHasChanged) {
                await this.handleChangedCurrentSpotAreaID(ctx, spotAreaID);
            }
            ctx.adapterProxy.setStateConditional('map.deebotPositionCurrentSpotAreaID', spotAreaID, true);
        } else if (ctx.getDevice().isCleaning()) {
            this.log.debug('DeebotPositionCurrentSpotAreaID: spotAreaID is unknown');
        }
        ctx.adapterProxy.setStateConditional('map.deebotPosition', ctx.deebotPosition, true);
        ctx.adapterProxy.setStateConditional('map.deebotPosition_x', x, true);
        ctx.adapterProxy.setStateConditional('map.deebotPosition_y', y, true);
        if (obj.a) {
            const angle = Number(obj.a);
            ctx.adapterProxy.setStateConditional('map.deebotPosition_angle', angle, true);
        }
        ctx.deebotPositionIsInvalid = obj.invalid;
        ctx.adapterProxy.setStateConditional('map.deebotPositionIsInvalid', ctx.deebotPositionIsInvalid, true);
        ctx.adapterProxy.setStateConditional('map.deebotDistanceToChargePosition', obj.distanceToChargingStation, true);
        if (ctx.goToPositionArea) {
            if (mapHelper.positionIsInAreaValueString(x, y, ctx.goToPositionArea)) {
                ctx.vacbot.run('stop');
                this.clearGoToPosition(ctx);
            }
        }
        const pauseBeforeDockingIfWaterboxInstalled = ctx.pauseBeforeDockingIfWaterboxInstalled && ctx.waterboxInstalled;
        if (ctx.getDevice().isReturning() && (ctx.pauseBeforeDockingChargingStation || pauseBeforeDockingIfWaterboxInstalled)) {
            const areaSize = this.getPauseBeforeDockingChargingStationAreaSize(ctx.deviceId);
            if (mapHelper.positionIsInRectangleForPosition(x, y, ctx.chargePosition, areaSize)) {
                if (ctx.getDevice().isNotPaused() && ctx.getDevice().isNotStopped()) {
                    ctx.commandQueue.run(this.getPauseBeforeDockingSendPauseOrStop(ctx.deviceId));
                }
                ctx.adapterProxy.setStateConditional('control.extended.pauseBeforeDockingChargingStation', false, true);
                ctx.pauseBeforeDockingChargingStation = false;
                ctx.pauseBeforeDockingIfWaterboxInstalled = false;
            }
        }
        await this.handleIsCurrentSpotAreaPartOfCleaningProcess(ctx);
    }

    async handleIsCurrentSpotAreaPartOfCleaningProcess(ctx) {
        if ((ctx.currentSpotAreaData.spotAreaID === ctx.currentSpotAreaID) && (ctx.currentSpotAreaData.lastTimeEnteredTimestamp > 0)) {
            const isCurrentSpotAreaPartOfCleaningProcess = await this.isCurrentSpotAreaPartOfCleaningProcess(ctx);
            if (isCurrentSpotAreaPartOfCleaningProcess) {
                await this.handleDurationForLastTimePresence(ctx);
            }
        }
    }

    async handleDurationForLastTimePresence(ctx) {
        const duration = helper.getUnixTimestamp() - ctx.currentSpotAreaData.lastTimeEnteredTimestamp;
        const lastTimePresenceThreshold = this.getConfigValue('feature.map.spotAreas.lastTimePresence.threshold', ctx.deviceId) || 20;
        if (duration >= lastTimePresenceThreshold) {
            await mapObjects.createOrUpdateLastTimePresenceAndLastCleanedSpotArea(this, ctx, duration);
        }
    }

    async createInfoExtendedChannelNotExists(ctx) {
        return ctx.adapterProxy.createChannelNotExists('info.extended', 'Extended information');
    }

    async handleSweepMode(ctx, value) {
        const options = {
            0: 'standard',
            1: 'deep'
        };
        if (ctx.getModel().isModelTypeT20() || ctx.getModel().isModelTypeX2()) {
            Object.assign(options, {
                2: 'fast'
            });
        }
        if (options[value] !== undefined) {
            await this.createInfoExtendedChannelNotExists(ctx);
            await ctx.adapterProxy.createObjectNotExists(
                'info.extended.moppingMode', 'Mopping mode',
                'string', 'value', false, '', '');
            await ctx.adapterProxy.setStateConditionalAsync('info.extended.moppingMode', options[value], true);
            await adapterObjects.createControlSweepModeIfNotExists(this, ctx, options).then(() => {
                ctx.adapterProxy.setStateConditional('control.extended.moppingMode', value, true);
            });
            // Delete previously used states
            await ctx.adapterProxy.deleteObjectIfExists('info.extended.sweepMode');
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.sweepMode');
            await ctx.adapterProxy.deleteObjectIfExists('info.waterbox_moppingType');
            await ctx.adapterProxy.deleteObjectIfExists('info.waterbox_scrubbingPattern');
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.scrubbingPattern');
        } else {
            this.log.warn(`Sweep mode (Mopping mode) with the value ${value} is currently unknown`);
        }
    }

    async handleWaterBoxMoppingType(ctx, value) {
        if (ctx.getModel().isModelTypeAirbot()) return;
        const options = {
            1: 'standard',
            2: 'scrubbing'
        };
        ctx.moppingType = 'waterbox not installed';
        if (options[value] !== undefined) {
            ctx.moppingType = options[value];
            await ctx.adapterProxy.createObjectNotExists(
                'info.waterbox_moppingType', 'Mopping type (OZMO Pro)',
                'string', 'value', false, ctx.moppingType, '');
        }
        if (await ctx.adapterProxy.objectExists('info.waterbox_moppingType')) {
            ctx.adapterProxy.setStateConditional('info.waterbox_moppingType', ctx.moppingType, true);
        }
    }

    async handleWaterBoxScrubbingType(ctx, value) {
        const options = {
            1: 'quick scrubbing',
            2: 'deep scrubbing'
        };
        if (options[value] !== undefined) {
            if (ctx.moppingType === 'scrubbing') {
                await ctx.adapterProxy.createObjectNotExists(
                    'info.waterbox_scrubbingPattern', 'Scrubbing pattern (OZMO Pro)',
                    'string', 'value', false, '', '');
            }
            if (await ctx.adapterProxy.objectExists('info.waterbox_scrubbingPattern')) {
                ctx.adapterProxy.setStateConditional('info.waterbox_scrubbingPattern', options[value], true);
                adapterObjects.createControlScrubbingPatternIfNotExists(this, ctx, options).then(() => {
                    ctx.adapterProxy.setStateConditional('control.extended.scrubbingPattern', value, true);
                });
            }
        } else {
            this.log.warn(`Scrubbing pattern with the value ${value} is currently unknown`);
        }
    }

    handleAirDryingActive(ctx, isAirDrying) {
        this.createAirDryingStates(ctx).then(async () => {
            const state = await ctx.adapterProxy.getStateAsync('info.extended.airDryingActive');
            const timestamp = helper.getUnixTimestamp();
            if (state) {
                ctx.adapterProxy.createChannelNotExists('info.extended.airDryingDateTime',
                    'Air drying process related timestamps').then(() => {
                    let lastEndTimestamp = 0;
                    if (state.val !== isAirDrying) {
                        if ((state.val === false) && (isAirDrying === true)) {
                            ctx.airDryingStartTimestamp = timestamp;
                            ctx.adapterProxy.createObjectNotExists(
                                'info.extended.airDryingDateTime.startTimestamp', 'Start timestamp of the air drying process',
                                'number', 'value', false, 0, '').then(() => {
                                ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.startTimestamp', timestamp, true);
                                if (!ctx.airDryingActiveInterval) {
                                    this.setAirDryingActiveTime(ctx).then(() => {
                                        ctx.airDryingActiveInterval = setInterval(() => {
                                            (async () => {
                                                await this.setAirDryingActiveTime(ctx);
                                            })();
                                        }, C.AIR_DRYING_INTERVAL_MS);
                                        this.log.debug('Set airDryingActiveInterval');
                                    });
                                }
                            });
                            ctx.adapterProxy.createObjectNotExists(
                                'info.extended.airDryingDateTime.endTimestamp', 'End timestamp of the air drying process',
                                'number', 'value', false, 0, '').then(() => {
                                ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.endTimestamp', 0, true);
                            });
                        } else {
                            lastEndTimestamp = timestamp;
                            ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.endTimestamp', timestamp, true);
                            this.setAirDryingActiveTime(ctx).then(() => {
                                if (ctx.airDryingActiveInterval) {
                                    clearInterval(ctx.airDryingActiveInterval);
                                    ctx.airDryingActiveInterval = null;
                                    this.log.debug('Clear airDryingActiveInterval');
                                }
                                // Tracked on ctx so it can be cleared on unload /
                                // reconnect and cannot fire against a torn-down context.
                                if (ctx._airDryingResetTimeout) {
                                    clearTimeout(ctx._airDryingResetTimeout);
                                }
                                ctx._airDryingResetTimeout = setTimeout(() => {
                                    ctx._airDryingResetTimeout = null;
                                    ctx.adapterProxy.setStateConditional('info.extended.airDryingActiveTime', 0, true);
                                    ctx.adapterProxy.setStateConditional('info.extended.airDryingRemainingTime', 0, true);
                                    ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.startTimestamp', 0, true);
                                    ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.endTimestamp', 0, true);
                                    ctx.airDryingStartTimestamp = 0;
                                    this.log.debug('Reset air drying active time and timestamp states after 60 seconds');
                                }, C.AIR_DRYING_RESET_DELAY_MS);
                            });
                            this.log.info(`Air drying process finished`);
                        }
                    }
                    ctx.adapterProxy.setStateConditional('info.extended.airDryingActive', isAirDrying, true);
                    const lastStartTimestamp = ctx.airDryingStartTimestamp;
                    if (lastStartTimestamp > 0) {
                        const startDateTime = this.formatDate(lastStartTimestamp, 'TT.MM.JJJJ SS:mm:ss');
                        ctx.adapterProxy.createObjectNotExists(
                            'info.extended.airDryingDateTime.startDateTime', 'Start date and time of the air drying process',
                            'string', 'value', false, '', '').then(() => {
                            ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.startDateTime', startDateTime, true);
                        });
                        ctx.adapterProxy.createObjectNotExists(
                            'info.extended.airDryingDateTime.endDateTime', 'End date and time of the air drying process',
                            'string', 'value', false, '', '').then(() => {
                            ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.endDateTime', '', true);
                        });
                        this.log.info(`Air drying process started`);
                    }
                    if (lastEndTimestamp > 0) {
                        const endDateTime = this.formatDate(lastEndTimestamp, 'TT.MM.JJJJ SS:mm:ss');
                        ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.endDateTime', endDateTime, true);
                    }
                });
            }
        });
    }

    async createAirDryingStates(ctx) {
        let states = {
            120: '120',
            180: '180',
            240: '240'
        };
        let def = 120;
        if (ctx.getModel().isModelTypeX1()) {
            // @ts-ignore
            states = {
                150: '150',
                210: '210'
            };
            def = 150;
        }
        await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.airDryingDuration', {
            'type': 'state',
            'common': {
                'name': 'Duration of the air drying process in minutes',
                'type': 'number',
                'role': 'level',
                'read': true,
                'write': true,
                'min': 120,
                'max': 240,
                'def': def,
                'unit': 'min',
                'states': states
            },
            'native': {}
        });
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingActive', 'Indicates whether the air drying process is active',
            'boolean', 'value', false, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingActiveTime', 'Active time (duration) of the air drying process',
            'number', 'value', false, 0, 'min');
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingRemainingTime', 'Remaining time (duration) of the air drying process',
            'number', 'value', false, 0, 'min');
    }

    async setAirDryingActiveTime(ctx) {
        if (ctx.airDryingStartTimestamp > 0) {
            const timestamp = helper.getUnixTimestamp();
            const activeTime = Math.floor((timestamp - ctx.airDryingStartTimestamp) / 60);
            await this.createAirDryingStates(ctx);
            await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingActiveTime', activeTime, true);
            const airDryingDurationState = await ctx.adapterProxy.getStateAsync('control.extended.airDryingDuration');
            if (airDryingDurationState && airDryingDurationState.val) {
                let endTimestamp = ctx.airDryingStartTimestamp + (Number(airDryingDurationState.val) * 60);
                let remainingTime = Number(airDryingDurationState.val) - activeTime;
                // It happened with the X1 Turbo using the value 60 (airDryingDuration) ...
                if (timestamp >= endTimestamp) {
                    endTimestamp = timestamp;
                    remainingTime = 0;
                }
                await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingRemainingTime', remainingTime, true);
                await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingDateTime.endTimestamp', endTimestamp, true);
                const endDateTime = this.formatDate(endTimestamp, 'TT.MM.JJJJ SS:mm:ss');
                await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingDateTime.endDateTime', endDateTime, true);
            }
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module && module.parent) {
    module.exports = (options) => new EcovacsDeebot(options);
} else {
    new EcovacsDeebot();
}














