'use strict';

const utils = require('@iobroker/adapter-core');
const ecovacsDeebot = require('ecovacs-deebot');
const nodeMachineId = require('node-machine-id');
const adapterObjects = require('./lib/adapterObjects');
const adapterCommands = require('./lib/adapterCommands');
const helper = require('./lib/adapterHelper');
const Model = require('./lib/deebotModel');
const Device = require('./lib/device');
const DeviceContext = require('./lib/deviceContext');
const EcoVacsAPI = ecovacsDeebot.EcoVacsAPI;
const mapObjects = require('./lib/mapObjects');
const mapHelper = require('./lib/mapHelper');

class EcovacsDeebot extends utils.Adapter {
    constructor(options) {
        super(
            Object.assign(
                options || {}, {
                    name: 'ecovacs-deebot'
                }
            )
        );

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.on('message', this.onMessage.bind(this));

        this.deviceContexts = new Map();
        this.canvasModuleIsInstalled = EcoVacsAPI.isCanvasModuleAvailable();
        this.pollingInterval = 120000;
        this.password = '';
        this.authFailed = false;
    }

    async onReady() {
        // Migrate legacy native key that collides with dot-notation unflattening
        await this.migrateNativeConfig();

        // Reset the connection indicator during startup
        this.setStateConditional('info.connection', false, true);
        this.setStateConditional('info.deviceCount', 0, true);
        this.setStateConditional('info.deviceDiscovery', '', true);

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
            for (const ctx of this.deviceContexts.values()) {
                if (ctx.vacbot) {
                    ctx.vacbot.disconnect();
                }
                if (ctx.getStatesInterval) {
                    clearInterval(ctx.getStatesInterval);
                }
                if (ctx.getGetPosInterval) {
                    clearInterval(ctx.getGetPosInterval);
                }
                if (ctx.airDryingActiveInterval) {
                    clearInterval(ctx.airDryingActiveInterval);
                }
                if (ctx.retrypauseTimeout) {
                    clearTimeout(ctx.retrypauseTimeout);
                }
            }
            this.deviceContexts.clear();
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    async onMessage(obj) {
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
        }
    }

    disconnect(ctx, disconnectVacbot) {
        this.setConnection(false);
        if (disconnectVacbot && ctx.vacbot) {
            ctx.vacbot.disconnect();
        }
    }

    async loginAndFetchDevices(credentials) {
        const { email, password, countrycode, authDomain } = credentials;
        
        if (!email || !password) {
            throw new Error('Email and password are required');
        }
        
        const passwordHash = EcoVacsAPI.md5(password);
        const deviceId = EcoVacsAPI.getDeviceId(nodeMachineId.machineIdSync(), 0);
        const countryCode = (countrycode || 'de').toLowerCase();
        const continent = (ecovacsDeebot.countries)[countryCode.toUpperCase()]?.continent?.toLowerCase() || 'eu';
        const authDomainValue = authDomain || 'ecovacs.com';
        
        this.log.info(`Attempting login for device discovery: ${email} (${countryCode})`);
        
        try {
            const api = new EcoVacsAPI(deviceId, countryCode, continent, authDomainValue);
            await api.connect(email, passwordHash);
            const devices = await api.devices();
            
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

    onStateChange(id, state) {
        if (!state) return;
        const relativeId = id.replace(this.namespace + '.', '');
        const parts = relativeId.split('.');
        const deviceId = parts[0];
        const ctx = this.deviceContexts.get(deviceId);
        if (!ctx) {
            return;
        }
        const subPath = parts.slice(1).join('.');
        (async () => {
            try {
                await adapterCommands.handleStateChange(this, ctx, subPath, state);
            } catch (e) {
                this.log.error(`Error handling state change for id '${id}' with value '${state.val}': '${e}'`);
            }
        })();
    }

    reconnect() {
        if (this.authFailed) {
            this.log.warn('Reconnect skipped due to authentication failure. Please check your credentials and restart the adapter.');
            return;
        }
        for (const ctx of this.deviceContexts.values()) {
            this.clearGoToPosition(ctx);
            ctx.retrypauseTimeout = null;
            ctx.retries++;
        }
        this.setConnection(false);
        this.log.info('Reconnecting ...');
        this.connect();
    }

    connect() {
        this.connectionFailed = false;

        if ((!this.config.email) || (!this.config.password) || (!this.config.countrycode)) {
            this.error('Missing values in adapter config', true);
            return;
        }
        if (this.config.pollingInterval && (Number(this.config.pollingInterval) >= 60000)) {
            this.pollingInterval = Number(this.config.pollingInterval);
        }

        const password_hash = EcoVacsAPI.md5(this.password);
        const deviceId = EcoVacsAPI.getDeviceId(nodeMachineId.machineIdSync(), 0);
        const continent = (ecovacsDeebot.countries)[this.config.countrycode.toUpperCase()].continent.toLowerCase();

        let authDomain = '';
        if (this.getConfigValue('authDomain') !== '') {
            authDomain = this.getConfigValue('authDomain');
            this.log.info(`Using login: ${authDomain}`);
        }

        const api = new EcoVacsAPI(deviceId, this.config.countrycode, continent, authDomain);
        api.connect(this.config.email, password_hash).then(() => {
            api.devices().then((devices) => {

                const numberOfDevices = Object.keys(devices).length;
                if (numberOfDevices === 0) {
                    this.log.warn('Successfully connected to Ecovacs server, but no devices found. Exiting ...');
                    this.setConnection(false);
                    return;
                }
                this.log.info(`Successfully connected to Ecovacs server. Found ${numberOfDevices} device(s) ...`);
                this.log.debug(`Devices: ${JSON.stringify(devices)}`);
                
                const discoveryInfo = devices.map((device, index) => ({
                    number: index + 1,
                    name: device.deviceName || device.name || 'Unknown Device',
                    nick: device.nick || '',
                    did: device.did || '',
                    class: device.class,
                    deviceType: this.getDeviceTypeFromDevice(device)
                }));
                this.setStateConditional('info.deviceDiscovery', JSON.stringify(discoveryInfo), true);
                
                this.setStateConditional('info.deviceCount', numberOfDevices, true);

                for (const vacuum of devices) {
                    const deviceId = vacuum.did.replace(/[^a-zA-Z0-9_]/g, '_');
                    const vacbot = api.getVacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent);
                    const ctx = new DeviceContext(this, deviceId, vacbot, vacuum);
                    ctx.vacuum = vacuum;
                    ctx.api = api;
                    ctx.model = new Model(vacbot, this.config);
                    ctx.device = new Device(ctx);
                    this.deviceContexts.set(deviceId, ctx);

                    (async () => {
                        await adapterObjects.createInitialInfoObjects(this, ctx);
                        await adapterObjects.createInitialObjects(this, ctx);
                    })();

                    vacbot.on('ready', () => {

                        (async () => {
                            await adapterObjects.createAdditionalObjects(this, ctx);
                            await adapterObjects.createDeviceCapabilityObjects(this, ctx);
                            await adapterObjects.createStationObjects(this, ctx);
                        })();

                        ctx.connected = true;
                        this.updateConnectionState();

                        const nick = vacuum.nick ? vacuum.nick : 'New Device ' + ctx.deviceId;
                        this.log.info(`Instance for '${nick}' successfully initialized`);

                        ctx.adapterProxy.setStateConditional('info.version', this.version, true);
                        ctx.adapterProxy.setStateConditional('info.library.version', api.getVersion(), true);
                        ctx.adapterProxy.setStateConditional('info.library.canvasModuleIsInstalled', this.canvasModuleIsInstalled, true);
                        ctx.adapterProxy.setStateConditional('info.deviceName', nick, true);
                        ctx.adapterProxy.setStateConditional('info.deviceClass', ctx.getModel().getDeviceClass(), true);
                        ctx.adapterProxy.setStateConditional('info.deviceModel', ctx.getModel().getProductName(), true);
                        ctx.adapterProxy.setStateConditional('info.modelType', ctx.getModelType(), true);
                        ctx.adapterProxy.setStateConditional('info.deviceType', ctx.getModel().getDeviceType(), true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities', JSON.stringify(ctx.getModel().getDeviceCapabilities()), true);
                        const deviceCapabilities = ctx.getModel().getDeviceCapabilities();
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.type', deviceCapabilities.type, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasMapping', deviceCapabilities.hasMapping, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasWaterBox', deviceCapabilities.hasWaterBox, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasAirDrying', deviceCapabilities.hasAirDrying, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasAutoEmpty', deviceCapabilities.hasAutoEmpty, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasSpotAreas', deviceCapabilities.hasSpotAreas, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasVirtualBoundaries', deviceCapabilities.hasVirtualBoundaries, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasContinuousCleaning', deviceCapabilities.hasContinuousCleaning, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasDoNotDisturb', deviceCapabilities.hasDoNotDisturb, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasVoiceAssistant', deviceCapabilities.hasVoiceAssistant, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasCleaningStation', deviceCapabilities.hasCleaningStation, true);
                        ctx.adapterProxy.setStateConditional('info.deviceCapabilities.hasFloorWashing', deviceCapabilities.hasFloorWashing, true);
                        ctx.adapterProxy.setStateConditional('info.deviceImageURL', ctx.getModel().getProductImageURL(), true);
                        ctx.adapterProxy.setStateConditional('info.library.communicationProtocol', ctx.getModel().getProtocol(), true);
                        ctx.adapterProxy.setStateConditional('info.library.deviceIs950type', ctx.getModel().is950type(), true);
                        this.log.info(`Library version: ${api.getVersion()}`);
                        this.log.info(`Product name: ${ctx.getModel().getProductName()}`);
                        ctx.retries = 0;

                        (async () => {
                            await this.setInitialStateValues(ctx);
                        })();

                        vacbot.on('ChargeState', (status) => {
                            this.log.debug(`[queue] Received ChargeState event: ${status}`);
                            if (helper.isValidChargeStatus(status)) {
                                if ((status === 'returning') && (ctx.cleaningQueue.notEmpty()) && (ctx.lastChargeStatus !== status)) {
                                    ctx.cleaningQueue.startNextItemFromQueue();
                                    setTimeout(() => {
                                        ctx.lastChargeStatus = '';
                                        this.log.debug('[queue] Reset lastChargingStatus');
                                    }, 3000);
                                } else if (ctx.chargestatus !== status) {
                                    ctx.chargestatus = status;
                                    this.setDeviceStatusByTrigger(ctx, 'chargestatus');
                                    ctx.adapterProxy.setStateConditional('info.chargestatus', ctx.chargestatus, true);
                                    if (ctx.chargestatus === 'charging') {
                                        ctx.adapterProxy.setStateConditional('history.timestampOfLastStartCharging', helper.getUnixTimestamp(), true);
                                        ctx.adapterProxy.setStateConditional('history.dateOfLastStartCharging', this.getCurrentDateAndTimeFormatted(), true);
                                        ctx.currentSpotAreaData = {
                                            'spotAreaID': 'unknown',
                                            'lastTimeEnteredTimestamp': 0
                                        };
                                        this.resetErrorStates(ctx);
                                        ctx.intervalQueue.addGetLifespan();
                                        ctx.cleaningLogAcknowledged = false;
                                        ctx.intervalQueue.addGetCleanLogs();
                                        if (ctx.getModel().isMappingSupported()) {
                                            ctx.intervalQueue.add('GetMaps');
                                        }
                                        if (ctx.getModel().isSupportedFeature('map.deebotPosition')) {
                                            ctx.intervalQueue.add('GetPosition');
                                        }
                                    }
                                }
                            } else {
                                this.log.warn('Unhandled chargestatus: ' + status);
                            }
                            ctx.lastChargeStatus = status;
                        });

                        vacbot.on('CleanReport', (status) => {
                            this.log.debug(`[queue] Received CleanReport event: ${status}`);
                            if (helper.isValidCleanStatus(status)) {
                                if ((ctx.cleanstatus === 'setLocation') && (status !== 'setLocation')) {
                                    if (status === 'idle') {
                                        this.log.info('Bot arrived at destination');
                                    } else {
                                        this.log.info(`The operation was interrupted before arriving at destination (status: ${status})`);
                                    }
                                    this.handleSilentApproach(ctx);
                                }
                                if (ctx.getDevice().isNotStopped() && (ctx.cleanstatus !== status)) {
                                    if ((status === 'stop') || (status === 'idle')) {
                                        this.resetCurrentStats(ctx);
                                        ctx.cleaningLogAcknowledged = false;
                                        ctx.intervalQueue.addGetCleanLogs();
                                    }
                                    this.setPauseBeforeDockingIfWaterboxInstalled(ctx).catch(e => this.log.warn('setPauseBeforeDocking: ' + e));
                                }
                                ctx.cleanstatus = status;
                                this.setDeviceStatusByTrigger(ctx, 'cleanstatus');
                                ctx.adapterProxy.setStateConditional('info.cleanstatus', status, true);
                            } else if (status !== undefined) {
                                this.log.warn('Unhandled cleanstatus: ' + status);
                            }
                        });

                        vacbot.on('WaterLevel', (level) => {
                            ctx.waterLevel = level;
                            adapterObjects.createControlWaterLevelIfNotExists(this, ctx, 0, 'control.waterLevel_standard', 'Water level if no other value is set').then(() => {
                                adapterObjects.createControlWaterLevelIfNotExists(this, ctx, ctx.waterLevel).then(() => {
                                    ctx.adapterProxy.setStateConditional('control.waterLevel', ctx.waterLevel, true);
                                });
                            });
                        });

                        vacbot.on('WaterBoxInfo', (value) => {
                            ctx.waterboxInstalled = Boolean(Number(value));
                            ctx.adapterProxy.setStateConditional('info.waterbox', ctx.waterboxInstalled, true);
                        });

                        vacbot.on('CarpetPressure', (value) => {
                            if (ctx.getModel().isSupportedFeature('control.autoBoostSuction')) {
                                ctx.adapterProxy.createObjectNotExists(
                                    'control.extended.autoBoostSuction', 'Auto boost suction',
                                    'boolean', 'value', true, false, '').then(() => {
                                    const carpetPressure = Boolean(Number(value));
                                    ctx.adapterProxy.setStateConditional('control.extended.autoBoostSuction', carpetPressure, true);
                                });
                            }
                        });

                        vacbot.on('CleanPreference', (value) => {
                            if (ctx.getModel().isModelTypeAirbot()) return;
                            ctx.adapterProxy.createObjectNotExists(
                                'control.extended.cleanPreference', 'Clean preference',
                                'boolean', 'value', true, false, '').then(() => {
                                const cleanPreference = Boolean(Number(value));
                                ctx.cleanPreference = cleanPreference;
                                ctx.adapterProxy.setStateConditional('control.extended.cleanPreference', cleanPreference, true);
                            });
                        });

                        vacbot.on('VoiceAssistantState', (value) => {
                            ctx.adapterProxy.createObjectNotExists(
                                'control.extended.voiceAssistant', 'Indicates whether YIKO voice assistant is enabled',
                                'boolean', 'value', true, Boolean(value), '').then(() => {
                                ctx.adapterProxy.setStateConditional('control.extended.voiceAssistant', Boolean(value), true);
                            });
                        });

                        vacbot.on('BorderSpin', (value) => {
                            this.createInfoExtendedChannelNotExists(ctx).then(() => {
                                ctx.adapterProxy.createObjectNotExists(
                                    'control.extended.edgeDeepCleaning', 'Enable and disable edge deep cleaning',
                                    'boolean', 'value', true, false, '').then(() => {
                                    const edgeDeepCleaning = Boolean(Number(value));
                                    ctx.adapterProxy.setStateConditional('control.extended.edgeDeepCleaning', edgeDeepCleaning, true);
                                });
                            });
                        });

                        vacbot.on('MopOnlyMode', (value) => {
                            this.createInfoExtendedChannelNotExists(ctx).then(() => {
                                ctx.adapterProxy.createObjectNotExists(
                                    'control.extended.mopOnlyMode', 'Enable and disable mop only mode',
                                    'boolean', 'value', true, false, '').then(() => {
                                    const mopOnlyMode = Boolean(Number(value));
                                    ctx.adapterProxy.setStateConditional('control.extended.mopOnlyMode', mopOnlyMode, true);
                                });
                            });
                        });

                        vacbot.on('SweepMode', (value) => {
                            (async () => {
                                await this.handleSweepMode(ctx, value);
                            })();
                        });

                        vacbot.on('AirDryingState', (value) => {
                            this.createInfoExtendedChannelNotExists(ctx).then(() => {
                                ctx.adapterProxy.createObjectNotExists(
                                    'info.extended.airDryingState', 'Air drying state',
                                    'string', 'value', false, '', '').then(() => {
                                    ctx.adapterProxy.setStateConditional('info.extended.airDryingState', value, true);
                                });
                            });
                        });

                        vacbot.on('WashInterval', (value) => {
                            (async () => {
                                await this.createInfoExtendedChannelNotExists(ctx);
                                await ctx.adapterProxy.createObjectNotExists(
                                    'info.extended.washInterval', 'Wash interval',
                                    'number', 'value', false, 0, 'min');
                                await ctx.adapterProxy.setStateConditionalAsync('info.extended.washInterval', value, true);
                                await adapterObjects.createControlWashIntervalIfNotExists(this, ctx);
                                await ctx.adapterProxy.setStateConditionalAsync('control.extended.washInterval', value, true);
                            })();
                        });

                        vacbot.on('WorkMode', (value) => {
                            (async () => {
                                await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.cleaningMode', {
                                    'type': 'state',
                                    'common': {
                                        'name': 'Cleaning Mode',
                                        'type': 'number',
                                        'role': 'level',
                                        'read': true,
                                        'write': true,
                                        'min': 0,
                                        'max': 3,
                                        'def': value,
                                        'unit': '',
                                        'states': {
                                            0: 'vacuum and mop',
                                            1: 'vacuum only',
                                            2: 'mop only',
                                            3: 'mop after vacuum'
                                        }
                                    },
                                    'native': {}
                                });
                                await ctx.adapterProxy.setStateConditionalAsync('control.extended.cleaningMode', value, true);
                            })();
                        });

                        vacbot.on('CarpetInfo', (value) => {
                            (async () => {
                                await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.carpetCleaningStrategy', {
                                    'type': 'state',
                                    'common': {
                                        'name': 'Carpet cleaning strategy',
                                        'type': 'number',
                                        'role': 'level',
                                        'read': true,
                                        'write': true,
                                        'min': 0,
                                        'max': 2,
                                        'def': value,
                                        'unit': '',
                                        'states': {
                                            0: 'auto',
                                            1: 'bypass',
                                            2: 'include'
                                        }
                                    },
                                    'native': {}
                                });
                                await ctx.adapterProxy.setStateConditionalAsync('control.extended.carpetCleaningStrategy', value, true);
                            })();
                        });

                        vacbot.on('StationState', (object) => {
                            ctx.adapterProxy.createObjectNotExists(
                                'control.extended.airDrying', 'Start and stop air-drying mopping pads',
                                'boolean', 'button', true, false, '').then(() => {
                                ctx.adapterProxy.setStateConditional('control.extended.airDrying', object.isAirDrying, true);
                            });
                            ctx.adapterProxy.createObjectNotExists(
                                'control.extended.selfCleaning', 'Start and stop cleaning mopping pads',
                                'boolean', 'button', true, false, '').then(() => {
                                ctx.adapterProxy.setStateConditional('control.extended.selfCleaning', object.isSelfCleaning, true);
                            });
                            ctx.adapterProxy.createObjectNotExists(
                                'info.extended.selfCleaningActive', 'Indicates whether the self-cleaning process is active',
                                'boolean', 'value', false, false, '').then(() => {
                                ctx.adapterProxy.setStateConditional('info.extended.selfCleaningActive', object.isSelfCleaning, true);
                            });
                            ctx.adapterProxy.createObjectNotExists(
                                'info.extended.cleaningStationActive', 'Indicates whether the self cleaning process is active',
                                'boolean', 'value', false, false, '').then(() => {
                                ctx.adapterProxy.setStateConditional('info.extended.cleaningStationActive', object.isActive, true);
                            });
                            this.handleAirDryingActive(ctx, object.isAirDrying);
                        });

                        vacbot.on('DryingDuration', (value) => {
                            this.createAirDryingStates(ctx).then(() => {
                                ctx.adapterProxy.setStateConditional('control.extended.airDryingDuration', value, true);
                            });
                        });

                        vacbot.on('AICleanItemState', (object) => {
                            this.createInfoExtendedChannelNotExists(ctx).then(() => {
                                ctx.adapterProxy.createObjectNotExists(
                                    'info.extended.particleRemoval', 'Indicates whether the particle removal mode is enabled',
                                    'boolean', 'value', false, false, '').then(() => {
                                    ctx.adapterProxy.setStateConditional('info.extended.particleRemoval', object.particleRemoval, true);
                                });
                                ctx.adapterProxy.createObjectNotExists(
                                    'info.extended.petPoopAvoidance', 'Indicates whether the pet poop avoidance mode is enabled',
                                    'boolean', 'value', false, false, '').then(() => {
                                    ctx.adapterProxy.setStateConditional('info.extended.petPoopAvoidance', object.petPoopPrevention, true);
                                });
                            });
                        });

                        vacbot.on('StationInfo', (object) => {
                            this.createInfoExtendedChannelNotExists(ctx).then(() => {
                                ctx.adapterProxy.createChannelNotExists('info.extended.cleaningStation', 'Information about the cleaning station').then(() => {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.extended.cleaningStation.state', 'State of the cleaning station',
                                        'number', 'value', false, object.state, '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.state', object.state, true);
                                    });
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.extended.cleaningStation.name', 'Name of the cleaning station',
                                        'string', 'value', false, object.name, '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.name', object.name, true);
                                    });
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.extended.cleaningStation.model', 'Model of the cleaning station',
                                        'string', 'value', false, object.model, '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.model', object.model, true);
                                    });
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.extended.cleaningStation.serialNumber', 'Serial number of the cleaning station',
                                        'string', 'value', false, object.sn, '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.serialNumber', object.sn, true);
                                    });
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.extended.cleaningStation.firmwareVersion', 'Firmware version of the cleaning station',
                                        'string', 'value', false, object.wkVer, '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.extended.cleaningStation.firmwareVersion', object.wkVer, true);
                                    });
                                });
                            });
                        });

                        vacbot.on('DusterRemind', (object) => {
                            (async () => {
                                await ctx.adapterProxy.createObjectNotExists(
                                    'control.extended.cleaningClothReminder', 'Cleaning cloth reminder',
                                    'boolean', 'value', true, false, '').then(() => {
                                    ctx.adapterProxy.setStateConditional('control.extended.cleaningClothReminder', Boolean(Number(object.enabled)), true);
                                    ctx.cleaningClothReminder.enabled = Boolean(Number(object.enabled));
                                });
                                await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.cleaningClothReminder_period', {
                                    'type': 'state',
                                    'common': {
                                        'name': 'Cleaning cloth reminder period',
                                        'type': 'number',
                                        'role': 'value',
                                        'read': true,
                                        'write': true,
                                        'min': 15,
                                        'max': 60,
                                        'def': 30,
                                        'unit': 'min',
                                        'states': {
                                            15: '15',
                                            30: '30',
                                            45: '45',
                                            60: '60'
                                        }
                                    },
                                    'native': {}
                                });
                                await ctx.adapterProxy.setStateConditionalAsync('control.extended.cleaningClothReminder_period', Number(object.period), true);
                                ctx.cleaningClothReminder.period = Number(object.period);
                            })();
                        });

                        vacbot.on('WaterBoxMoppingType', (value) => {
                            (async () => {
                                await this.handleWaterBoxMoppingType(ctx, value);
                            })();
                        });

                        vacbot.on('WaterBoxScrubbingType', (value) => {
                            (async () => {
                                await this.handleWaterBoxScrubbingType(ctx, value);
                            })();
                        });

                        vacbot.on('DustCaseInfo', (value) => {
                            const dustCaseInfo = Boolean(Number(value));
                            (async () => {
                                const state = await ctx.adapterProxy.getStateAsync('info.dustbox');
                                if (state) {
                                    if ((state.val !== dustCaseInfo) && (dustCaseInfo === false)) {
                                        this.setHistoryValuesForDustboxRemoval(ctx);
                                    }
                                    ctx.adapterProxy.setStateConditional('info.dustbox', dustCaseInfo, true);
                                }
                            })();
                        });

                        vacbot.on('SleepStatus', (value) => {
                            const sleepStatus = Boolean(Number(value));
                            ctx.adapterProxy.setStateConditional('info.sleepStatus', sleepStatus, true);
                        });

                        vacbot.on('CleanSpeed', (level) => {
                            ctx.cleanSpeed = level;
                            adapterObjects.createControlCleanSpeedIfNotExists(this, ctx, 0, 'control.cleanSpeed_standard', 'Clean speed if no other value is set').then(() => {
                                adapterObjects.createControlCleanSpeedIfNotExists(this, ctx, ctx.cleanSpeed).then(() => {
                                    ctx.adapterProxy.setStateConditional('control.cleanSpeed', ctx.cleanSpeed, true);
                                });
                            });
                        });

                        vacbot.on('DoNotDisturbEnabled', (value) => {
                            const doNotDisturb = Boolean(Number(value));
                            ctx.adapterProxy.setStateConditional('control.extended.doNotDisturb', doNotDisturb, true);
                        });

                        vacbot.on('ContinuousCleaningEnabled', (value) => {
                            const continuousCleaning = Boolean(Number(value));
                            ctx.adapterProxy.setStateConditional('control.extended.continuousCleaning', continuousCleaning, true);
                        });

                        vacbot.on('AdvancedMode', (value) => {
                            const advancedMode = Boolean(Number(value));
                            ctx.adapterProxy.setStateConditional('control.extended.advancedMode', advancedMode, true);
                        });

                        vacbot.on('TrueDetect', (value) => {
                            const trueDetect = Boolean(Number(value));
                            ctx.adapterProxy.setStateConditional('control.extended.trueDetect', trueDetect, true);
                        });

                        vacbot.on('AutoEmptyStatus', (autoEmptyStatus) => {
                            const autoEmptyEnabled = autoEmptyStatus.autoEmptyEnabled;
                            ctx.adapterProxy.setStateConditional('control.extended.autoEmpty', autoEmptyEnabled, true);
                            ctx.adapterProxy.setStateConditional('info.autoEmptyStation.autoEmptyEnabled', autoEmptyEnabled, true);
                            const stationActive = autoEmptyStatus.stationActive;
                            ctx.adapterProxy.setStateConditional('info.autoEmptyStation.stationActive', stationActive, true);
                            const dustBagFull = autoEmptyStatus.dustBagFull;
                            ctx.adapterProxy.setStateConditional('info.autoEmptyStation.dustBagFull', dustBagFull, true);
                            if (stationActive) {
                                this.setHistoryValuesForDustboxRemoval(ctx);
                            }
                        });

                        vacbot.on('ChargeMode', (value) => {
                            ctx.adapterProxy.createObjectNotExists(
                                'info.chargemode', 'Charge mode',
                                'string', 'value', false, '', '').then(() => {
                                ctx.adapterProxy.setStateConditional('info.chargemode', value, true);
                            });
                        });

                        vacbot.on('Volume', (value) => {
                            ctx.adapterProxy.setStateConditional('control.extended.volume', Number(value), true);
                        });

                        vacbot.on('CleanCount', (value) => {
                            ctx.adapterProxy.setStateConditional('control.extended.cleanCount', Number(value), true);
                        });

                        vacbot.on('BatteryInfo', (value) => {
                            ctx.getDevice().setBatteryLevel(Number(value));
                            ctx.adapterProxy.setStateConditional('info.battery', ctx.getDevice().batteryLevel, true);
                        });

                        vacbot.on('LifeSpan_filter', (level) => {
                            ctx.adapterProxy.setStateConditional('consumable.filter', Math.round(level), true);
                        });

                        vacbot.on('LifeSpan_main_brush', (level) => {
                            ctx.adapterProxy.setStateConditional('consumable.main_brush', Math.round(level), true);
                        });

                        vacbot.on('LifeSpan_side_brush', (level) => {
                            ctx.adapterProxy.setStateConditional('consumable.side_brush', Math.round(level), true);
                        });

                        vacbot.on('LifeSpan_unit_care', (level) => {
                            ctx.adapterProxy.setStateConditional('consumable.unit_care', Math.round(level), true);
                        });

                        vacbot.on('LifeSpan_round_mop', (level) => {
                            ctx.adapterProxy.setStateConditional('consumable.round_mop', Math.round(level), true);
                        });

                        vacbot.on('LifeSpan_air_freshener', (level) => {
                            ctx.adapterProxy.setStateConditional('consumable.airFreshener', Math.round(level), true);
                        });

                        vacbot.on('LifeSpan', (object) => {
                            ctx.adapterProxy.createObjectNotExists(
                                'consumable.filter', 'Filter life span',
                                'number', 'level', false, Math.round(object.filter), '%').then(() => {
                                ctx.adapterProxy.setStateConditional('consumable.filter', Math.round(object.filter), true);
                            });
                            ctx.adapterProxy.createObjectNotExists(
                                'consumable.uv_sanitizer_module', 'Filter UV Sanitizer Module',
                                'number', 'level', false, Math.round(object.uv_sanitizer_module), '%').then(() => {
                                ctx.adapterProxy.setStateConditional('consumable.uv_sanitizer_module', Math.round(object.uv_sanitizer_module), true);
                            });
                            ctx.adapterProxy.createObjectNotExists(
                                'consumable.air_freshener', 'Filter Air Freshener',
                                'number', 'level', false, Math.round(object.air_freshener), '%').then(() => {
                                ctx.adapterProxy.setStateConditional('consumable.air_freshener', Math.round(object.air_freshener), true);
                            });
                            ctx.adapterProxy.createObjectNotExists(
                                'consumable.unit_care', 'Filter Unit Care',
                                'number', 'level', false, Math.round(object.unit_care), '%').then(() => {
                                ctx.adapterProxy.setStateConditional('consumable.unit_care', Math.round(object.unit_care), true);
                            });
                            ctx.adapterProxy.createObjectNotExists(
                                'consumable.humidification_filter', 'Filter Humidification Filter',
                                'number', 'level', false, Math.round(object.humidification_filter), '%').then(() => {
                                ctx.adapterProxy.setStateConditional('consumable.humidification_filter', Math.round(object.humidification_filter), true);
                            });
                            ctx.adapterProxy.createObjectNotExists(
                                'consumable.humidification_maintenance', 'Filter Humidification Module Maintenance',
                                'number', 'level', false, Math.round(object.humidification_maintenance), '%').then(() => {
                                ctx.adapterProxy.setStateConditional('consumable.humidification_maintenance', Math.round(object.humidification_maintenance), true);
                            });
                        });

                        vacbot.on('Evt', (obj) => {
                            this.log.info('Evt message: ' + JSON.stringify(obj));
                        });

                        vacbot.on('LastError', (obj) => {
                            if (ctx.errorCode !== obj.code) {
                                if (obj.code === '110') {
                                    this.addToLast20Errors(ctx, obj.code, obj.error);
                                    // NoDustBox: Dust Bin Not installed
                                    if (ctx.getModel().isSupportedFeature('info.dustbox')) {
                                        this.setHistoryValuesForDustboxRemoval(ctx);
                                    }
                                } else if (obj.code === '0') {
                                // NoError: Robot is operational
                                    if (ctx.connected === false) {
                                        this.setConnection(true);
                                    }
                                } else {
                                    this.log.warn(obj.error);
                                    this.addToLast20Errors(ctx, obj.code, obj.error);
                                    if (obj.code === '404') {
                                    // Recipient unavailable
                                        this.setConnection(false);
                                    }
                                }
                                ctx.errorCode = obj.code;
                                ctx.adapterProxy.setStateConditional('info.errorCode', obj.code, true);
                                ctx.adapterProxy.setStateConditional('info.error', obj.error, true);
                            }
                        });

                        vacbot.on('Debug', (value) => {
                            ctx.adapterProxy.setStateConditional('info.library.debugMessage', value, true);
                        });

                        vacbot.on('Schedule', (obj) => {
                            (async () => {
                                await this.createInfoExtendedChannelNotExists(ctx);
                                await ctx.adapterProxy.createObjectNotExists(
                                    'info.extended.currentSchedule', 'Scheduling information (read-only)',
                                    'json', 'json', false, '[]', '');
                                await ctx.adapterProxy.setStateConditionalAsync('info.extended.currentSchedule', JSON.stringify(obj), true);
                                await ctx.adapterProxy.createObjectNotExists(
                                    'info.extended.currentSchedule_refresh', 'Refresh scheduling information',
                                    'boolean', 'button', true, false, '');
                            })();
                        });

                        vacbot.on('NetworkInfo', (obj) => {
                            ctx.adapterProxy.setStateConditional('info.network.ip', obj.ip, true);
                            ctx.adapterProxy.setStateConditional('info.network.wifiSSID', obj.wifiSSID, true);
                            if (ctx.getModel().isSupportedFeature('info.network.wifiSignal')) {
                                ctx.adapterProxy.setStateConditional('info.network.wifiSignal', Number(obj.wifiSignal), true);
                            }
                            if (ctx.getModel().isSupportedFeature('info.network.mac')) {
                                ctx.adapterProxy.setStateConditional('info.network.mac', obj.mac, true);
                            }
                        });

                        vacbot.on('RelocationState', (relocationState) => {
                            if ((relocationState !== ctx.relocationState) && (relocationState === 'required')) {
                                ctx.currentSpotAreaData = {
                                    'spotAreaID': 'unknown',
                                    'lastTimeEnteredTimestamp': 0
                                };
                            }
                            ctx.adapterProxy.setStateConditional('map.relocationState', relocationState, true);
                            ctx.relocationState = relocationState;
                        });

                        vacbot.on('Position', (obj) => {
                            (async () => {
                                await this.handlePositionObj(ctx, obj);
                            })();
                        });

                        vacbot.on('ChargingPosition', (obj) => {
                            ctx.chargePosition = obj.coords;
                            ctx.adapterProxy.setStateConditional('map.chargePosition', ctx.chargePosition, true);
                        });

                        vacbot.on('CurrentMapName', (value) => {
                            ctx.adapterProxy.setStateConditional('map.currentMapName', value, true);
                        });

                        vacbot.on('CurrentMapIndex', (value) => {
                            ctx.adapterProxy.setStateConditional('map.currentMapIndex', value, true);
                        });

                        vacbot.on('CurrentMapMID', (value) => {
                            ctx.currentMapID = value.toString();
                            ctx.adapterProxy.setStateConditional('map.currentMapMID', ctx.currentMapID, true);
                        });

                        vacbot.on('Maps', (maps) => {
                            this.log.debug('Maps: ' + JSON.stringify(maps));
                            (async () => {
                                await mapObjects.processMaps(this, ctx, maps);
                            })();
                        });

                        vacbot.on('MapSpotAreas', (areas) => {
                            this.log.debug('MapSpotAreas: ' + JSON.stringify(areas));
                            (async () => {
                                await mapObjects.processSpotAreas(this, ctx, areas);
                            })();
                        });

                        vacbot.on('MapSpotAreaInfo', (area) => {
                            this.log.debug('MapSpotAreaInfo: ' + JSON.stringify(area));
                            (async () => {
                                await mapObjects.processSpotAreaInfo(this, ctx, area);
                            })();
                        });

                        vacbot.on('MapVirtualBoundaries', (boundaries) => {
                            this.log.debug('MapVirtualBoundaries: ' + JSON.stringify(boundaries));
                            (async () => {
                                await mapObjects.processVirtualBoundaries(this, ctx, boundaries);
                            })();
                        });

                        vacbot.on('MapVirtualBoundaryInfo', (boundary) => {
                            this.log.debug('MapVirtualBoundaryInfo: ' + JSON.stringify(boundary));
                            (async () => {
                                await mapObjects.processVirtualBoundaryInfo(this, ctx, boundary);
                            })();
                        });

                        vacbot.on('MapImage', (object) => {
                            ctx.adapterProxy.setStateConditional('map.' + object['mapID'] + '.map64', object['mapBase64PNG'], true);
                            ctx.adapterProxy.setStateConditional('history.timestampOfLastMapImageReceived', helper.getUnixTimestamp(), true);
                            ctx.adapterProxy.setStateConditional('history.dateOfLastMapImageReceived', this.getCurrentDateAndTimeFormatted(), true);
                            const base64Data = object['mapBase64PNG'].replace(/^data:image\/png;base64,/, '');
                            (async () => {
                                const buf = Buffer.from(base64Data, 'base64');
                                const filename = 'currentCleaningMapImage_' + object['mapID'] + '.png';
                                await this.writeFileAsync(this.namespace, filename, buf);
                            })();
                        });

                        vacbot.on('CurrentCustomAreaValues', (values) => {
                            if (((ctx.cleanstatus === 'custom_area') && (values !== '')) || (ctx.cleanstatus !== 'custom_area')) {
                                ctx.adapterProxy.setStateConditional('map.currentUsedCustomAreaValues', values, true);
                            }
                        });

                        vacbot.on('CurrentSpotAreas', (values) => {
                            if (((ctx.cleanstatus === 'spot_area') && (values !== '')) || (ctx.cleanstatus !== 'spot_area')) {
                                ctx.adapterProxy.setStateConditional('map.currentUsedSpotAreas', values, true);
                            }
                        });

                        vacbot.on('LastUsedAreaValues', (values) => {
                            const dateTime = this.getCurrentDateAndTimeFormatted();
                            let customAreaValues = values;
                            if (customAreaValues.endsWith(';')) {
                                customAreaValues = customAreaValues.slice(0, -1);
                            }
                            if (helper.singleAreaValueStringIsValid(values)) {
                                customAreaValues = values.split(',', 4).map(
                                    function (element) {
                                        return Number(parseInt(element).toFixed(0));
                                    }
                                ).toString();
                            }
                            ctx.adapterProxy.setStateConditional(
                                'map.lastUsedCustomAreaValues',
                                customAreaValues, true, {
                                    dateTime: dateTime,
                                    currentMapID: ctx.currentMapID
                                });
                        });

                        vacbot.on('CleanSum', (obj) => {
                            ctx.adapterProxy.setStateConditional('cleaninglog.totalSquareMeters', Number(obj.totalSquareMeters), true);
                            ctx.adapterProxy.setStateConditional('cleaninglog.totalSeconds', Number(obj.totalSeconds), true);
                            ctx.adapterProxy.setStateConditional('cleaninglog.totalTime', helper.getTimeStringFormatted(obj.totalSeconds), true);
                            ctx.adapterProxy.setStateConditional('cleaninglog.totalNumber', Number(obj.totalNumber), true);
                        });

                        vacbot.on('CleanLog', (json) => {
                            this.log.debug('CleanLog: ' + JSON.stringify(json));
                            (async () => {
                                const state = await ctx.adapterProxy.getStateAsync('cleaninglog.last20Logs');
                                if (state) {
                                    ctx.cleaningLogAcknowledged = true;
                                    if (state.val !== JSON.stringify(json)) {
                                        await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.last20Logs', JSON.stringify(json), true);
                                    }
                                }
                            })();
                        });

                        vacbot.on('LastCleanLogs', (obj) => {
                            this.log.debug('LastCleanLogs: ' + JSON.stringify(obj));
                            ctx.adapterProxy.setStateConditional('cleaninglog.lastCleaningTimestamp', Number(obj.timestamp), true);
                            const lastCleaningDate = this.formatDate(new Date(obj.timestamp * 1000), 'TT.MM.JJJJ SS:mm:ss');
                            ctx.adapterProxy.setStateConditional('cleaninglog.lastCleaningDate', lastCleaningDate, true);
                            ctx.adapterProxy.setStateConditional('cleaninglog.lastTotalSeconds', obj.totalTime, true);
                            ctx.adapterProxy.setStateConditional('cleaninglog.lastTotalTimeString', obj.totalTimeFormatted, true);
                            ctx.adapterProxy.setStateConditional('cleaninglog.lastSquareMeters', Number(obj.squareMeters), true);
                            if (obj.imageUrl) {
                                ctx.adapterProxy.setStateConditional('cleaninglog.lastCleaningMapImageURL', obj.imageUrl, true);
                                const configValue = Number(this.getConfigValue('feature.cleaninglog.downloadLastCleaningMapImage'));
                                if (configValue >= 1) {
                                    if (ctx.getModel().isSupportedFeature('cleaninglog.lastCleaningMap')) {
                                        this.downloadLastCleaningMapImage(ctx, obj.imageUrl, configValue);
                                    }
                                }
                            }
                        });

                        vacbot.on('CurrentStats', (obj) => {
                            if ((obj.cleanedArea !== undefined) && (obj.cleanedSeconds !== undefined)) {
                                if (ctx.getModel().isSupportedFeature('cleaninglog.channel')) {
                                    if (ctx.getDevice().isNotCharging()) {
                                        (async () => {
                                            if (ctx.getModel().isSupportedFeature('info.dustbox') && (ctx.currentCleanedArea > 0)) {
                                                let diff = obj.cleanedArea - ctx.currentCleanedArea;
                                                if (diff > 0) {
                                                    const squareMetersSinceLastDustboxRemoved = await ctx.adapterProxy.getStateAsync('history.squareMetersSinceLastDustboxRemoved');
                                                    if (squareMetersSinceLastDustboxRemoved) {
                                                        const squareMeters = Number(squareMetersSinceLastDustboxRemoved.val) + diff;
                                                        await ctx.adapterProxy.setStateConditionalAsync('history.squareMetersSinceLastDustboxRemoved', squareMeters, true);
                                                    }
                                                }
                                                diff = obj.cleanedSeconds - ctx.currentCleanedSeconds;
                                                if (diff > 0) {
                                                    const cleaningTimeSinceLastDustboxRemoved = await ctx.adapterProxy.getStateAsync('history.cleaningTimeSinceLastDustboxRemoved');
                                                    if (cleaningTimeSinceLastDustboxRemoved) {
                                                        const cleaningTime = Number(cleaningTimeSinceLastDustboxRemoved.val) + diff;
                                                        await ctx.adapterProxy.setStateConditionalAsync('history.cleaningTimeSinceLastDustboxRemoved', cleaningTime, true);
                                                        await ctx.adapterProxy.setStateConditionalAsync('history.cleaningTimeSinceLastDustboxRemovedString', helper.getTimeStringFormatted(cleaningTime), true);
                                                        const hoursUntilDustBagEmptyReminder = this.getHoursUntilDustBagEmptyReminderFlagIsSet();
                                                        if (hoursUntilDustBagEmptyReminder > 0) {
                                                            const hoursSinceLastDustboxRemoved = Math.floor(cleaningTime / 3600);
                                                            const reminderValue = (hoursSinceLastDustboxRemoved >= hoursUntilDustBagEmptyReminder);
                                                            await ctx.adapterProxy.setStateConditionalAsync('info.extended.dustBagEmptyReminder', reminderValue, true);
                                                        }
                                                    }
                                                }
                                            }
                                            ctx.currentCleanedArea = obj.cleanedArea;
                                            await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.current.cleanedArea', obj.cleanedArea, true);
                                            ctx.currentCleanedSeconds = obj.cleanedSeconds;
                                            await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.current.cleanedSeconds', obj.cleanedSeconds, true);
                                            await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.current.cleanedTime', helper.getTimeStringFormatted(obj.cleanedSeconds), true);
                                            if (obj.cleanType) {
                                                await ctx.adapterProxy.setStateConditionalAsync('cleaninglog.current.cleanType', obj.cleanType, true);
                                            }
                                        })();
                                    }
                                }
                            }
                        });

                        vacbot.on('HeaderInfo', (obj) => {
                            ctx.adapterProxy.createObjectNotExists(
                                'info.firmwareVersion', 'Firmware version',
                                'string', 'value', false, '', '').then(() => {
                                ctx.adapterProxy.setStateConditional('info.firmwareVersion', obj.fwVer, true);
                            });
                        });

                        // ==================================
                        // OTA / Firmware Update Status
                        // ==================================

                        vacbot.on('Ota', (object) => {
                            ctx.adapterProxy.createChannelNotExists('info.ota', 'Firmware Update (OTA) Information').then(() => {
                            // OTA status
                                if (Object.prototype.hasOwnProperty.call(object, 'status')) {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.ota.status', 'Update status',
                                        'string', 'value', false, '', '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.ota.status', object.status, true);
                                    });
                                }
                                // OTA progress
                                if (Object.prototype.hasOwnProperty.call(object, 'progress')) {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.ota.progress', 'Update progress',
                                        'number', 'value', false, 0, '%').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.ota.progress', object.progress, true);
                                    });
                                }
                                // OTA version (target firmware version)
                                if (Object.prototype.hasOwnProperty.call(object, 'ver')) {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.ota.version', 'Available firmware version',
                                        'string', 'value', false, '', '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.ota.version', object.ver, true);
                                    });
                                }
                                // OTA result
                                if (Object.prototype.hasOwnProperty.call(object, 'result')) {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.ota.result', 'Update result',
                                        'string', 'value', false, '', '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.ota.result', object.result, true);
                                    });
                                }
                                // OTA supportAuto
                                if (Object.prototype.hasOwnProperty.call(object, 'supportAuto')) {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.ota.supportsAutoUpdate', 'Device supports automatic updates',
                                        'boolean', 'value', false, false, '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.ota.supportsAutoUpdate', Boolean(object.supportAuto), true);
                                    });
                                }
                                // OTA isForce (forced update)
                                if (Object.prototype.hasOwnProperty.call(object, 'isForce')) {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.ota.isForced', 'Update is mandatory',
                                        'boolean', 'value', false, false, '').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.ota.isForced', Boolean(object.isForce), true);
                                    });
                                }
                                // OTA autoSwitch (auto-update enabled) - control state
                                if (Object.prototype.hasOwnProperty.call(object, 'autoSwitch')) {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'control.ota.autoUpdate', 'Enable automatic firmware updates',
                                        'boolean', 'switch', true, false, '').then(() => {
                                        ctx.adapterProxy.setStateConditional('control.ota.autoUpdate', Boolean(object.autoSwitch), true);
                                    });
                                }
                            });
                        });

                        /**
                     * @deprecated
                     */
                        if ((!ctx.getGetPosInterval) && ctx.getModel().usesXmpp()) {
                            if ((ctx.getModel().isSupportedFeature('map.deebotPosition'))) {
                                ctx.getGetPosInterval = setInterval(() => {
                                    if (ctx.getDevice().isCleaning() || ctx.getDevice().isReturning()) {
                                        vacbot.run('GetPosition');
                                    }
                                }, 3000);
                            }
                        }

                        // ==================================
                        // AIRBOT Z1 / Z1 Air Quality Monitor
                        // ==================================

                        vacbot.on('BlueSpeaker', (object) => {
                            const enable = object['enable'];
                            ctx.adapterProxy.createObjectNotExists(
                                'control.extended.bluetoothSpeaker', 'Bluetooth Speaker',
                                'boolean', 'value', true, Boolean(enable), '').then(() => {
                                ctx.adapterProxy.setStateConditional('control.extended.bluetoothSpeaker', Boolean(enable), true);
                            });
                        });

                        vacbot.on('Mic', (value) => {
                            ctx.adapterProxy.createObjectNotExists(
                                'control.extended.microphone', 'Microphone',
                                'boolean', 'value', true, Boolean(value), '').then(() => {
                                ctx.adapterProxy.setStateConditional('control.extended.microphone', Boolean(value), true);
                            });
                        });

                        vacbot.on('VoiceSimple', (value) => {
                            ctx.adapterProxy.createObjectNotExists(
                                'control.extended.voiceReport', 'Working Status Voice Report',
                                'boolean', 'value', true, Boolean(value), '').then(() => {
                                ctx.adapterProxy.setStateConditional('control.extended.voiceReport', Boolean(value), true);
                            });
                        });

                        vacbot.on('ThreeModuleStatus', (array) => {
                            ctx.adapterProxy.createChannelNotExists('info.airPurifierModules', 'Air Purifier Modules (Airbot models)').then(() => {
                                const modules = [];
                                modules['uvLight'] = {
                                    id: 'uvSanitization',
                                    name: 'UV Sanitizing Filter'
                                };
                                modules['smell'] = {
                                    id: 'airFreshening',
                                    name: 'Air Freshener Module'
                                };
                                modules['humidify'] = {
                                    id: 'humidification',
                                    name: 'Fog-free Humidification Module'
                                };
                                for (const element of array) {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.airPurifierModules.' + modules[element.type].id, modules[element.type].name,
                                        'string', 'value', false, '', '').then(() => {
                                        let status = 'not installed';
                                        if (element.state === 1) {
                                            status = element.work ? 'active' : 'idle';
                                        }
                                        ctx.adapterProxy.setStateConditional('info.airPurifierModules.' + modules[element.type].id, status, true);
                                    });
                                }
                            });
                        });

                        vacbot.on('AirQuality', (object) => {
                            ctx.adapterProxy.createChannelNotExists('info.airQuality', 'Air quality (Airbot models)').then(() => {
                                ctx.adapterProxy.createObjectNotExists(
                                    'info.airQuality.particulateMatter10', 'Particulate Matter 10 (PM10)',
                                    'number', 'value', false, 0, 'μg/m3').then(() => {
                                    ctx.adapterProxy.setStateConditional('info.airQuality.particulateMatter10', object.particulateMatter10, true);
                                });
                                ctx.adapterProxy.createObjectNotExists(
                                    'info.airQuality.particulateMatter25', 'Particulate Matter 25 (PM25)',
                                    'number', 'value', false, 0, 'μg/m3').then(() => {
                                    ctx.adapterProxy.setStateConditional('info.airQuality.particulateMatter25', object.particulateMatter25, true);
                                });
                                ctx.adapterProxy.createObjectNotExists(
                                    'info.airQuality.airQualityIndex', 'Air Quality Index',
                                    'number', 'value', false, 0, '').then(() => {
                                    ctx.adapterProxy.setStateConditional('info.airQuality.airQualityIndex', object.airQualityIndex, true);
                                });
                                ctx.adapterProxy.createObjectNotExists(
                                    'info.airQuality.volatileOrganicCompounds', 'Volatile Organic Compounds Index',
                                    'number', 'value', false, 0, '').then(() => {
                                    ctx.adapterProxy.setStateConditional('info.airQuality.volatileOrganicCompounds', object.volatileOrganicCompounds, true);
                                });
                                if (object['volatileOrganicCompounds_parts'] !== undefined) {
                                    ctx.adapterProxy.createObjectNotExists(
                                        'info.airQuality.volatileOrganicCompounds_parts', 'Volatile Organic Compounds (parts per billion)',
                                        'number', 'value', false, 0, 'ppb').then(() => {
                                        ctx.adapterProxy.setStateConditional('info.airQuality.volatileOrganicCompounds_parts', object['volatileOrganicCompounds_parts'], true);
                                    });
                                }
                                (async () => {
                                    let state;
                                    let temperatureOffset = 0;
                                    state = await ctx.adapterProxy.getStateAsync('info.airQuality.offset.temperature');
                                    if (state) {
                                        temperatureOffset = Number(Number(state.val).toFixed(1));
                                    }
                                    let humidityOffset = 0;
                                    state = await ctx.adapterProxy.getStateAsync('info.airQuality.offset.humidity');
                                    if (state) {
                                        humidityOffset = Number(Number(state.val).toFixed(0));
                                    }
                                    await ctx.adapterProxy.createChannelNotExists('info.airQuality.offset', 'Offset values');
                                    await ctx.adapterProxy.createObjectNotExists(
                                        'info.airQuality.offset.temperature', 'Temperature offset',
                                        'number', 'value', true, temperatureOffset);
                                    await ctx.adapterProxy.setStateConditionalAsync(
                                        'info.airQuality.offset.temperature', temperatureOffset, true);
                                    await ctx.adapterProxy.createObjectNotExists(
                                        'info.airQuality.offset.humidity', 'Humidity offset',
                                        'number', 'value', true, humidityOffset);
                                    await ctx.adapterProxy.setStateConditionalAsync(
                                        'info.airQuality.offset.humidity', humidityOffset, true);
                                    const temperature = object.temperature + temperatureOffset;
                                    const humidity = object.humidity + humidityOffset;
                                    await ctx.adapterProxy.createObjectNotExists(
                                        'info.airQuality.temperature', 'Temperature',
                                        'number', 'value', false, 0, '°C');
                                    await ctx.adapterProxy.setStateConditionalAsync(
                                        'info.airQuality.temperature', temperature, true);
                                    await ctx.adapterProxy.createObjectNotExists(
                                        'info.airQuality.humidity', 'Humidity',
                                        'number', 'value', false, 0, '%');
                                    await ctx.adapterProxy.setStateConditionalAsync(
                                        'info.airQuality.humidity', humidity, true);
                                })();
                            });
                        });

                        vacbot.on('AtmoLight', (value) => {
                            (async () => {
                                await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.atmoLight', {
                                    'type': 'state',
                                    'common': {
                                        'name': 'Light brightness',
                                        'type': 'number',
                                        'role': 'value',
                                        'read': true,
                                        'write': true,
                                        'min': 0,
                                        'max': 4,
                                        'def': 2,
                                        'unit': '',
                                        'states': {
                                            0: '0',
                                            1: '1',
                                            2: '2',
                                            3: '3',
                                            4: '4'
                                        }
                                    },
                                    'native': {}
                                });
                                await ctx.adapterProxy.setStateConditionalAsync('control.extended.atmoLight', Number(value), true);
                            })();
                        });

                        vacbot.on('AtmoVolume', (value) => {
                            (async () => {
                                await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.atmoVolume', {
                                    'type': 'state',
                                    'common': {
                                        'name': 'Volume for voice and sounds (0-16)',
                                        'type': 'number',
                                        'role': 'value',
                                        'read': true,
                                        'write': true,
                                        'min': 0,
                                        'max': 4,
                                        'def': 2,
                                        'unit': '',
                                        'states': {
                                            0: '0',
                                            1: '1',
                                            2: '2',
                                            3: '3',
                                            4: '4',
                                            5: '5',
                                            6: '6',
                                            7: '7',
                                            8: '8',
                                            9: '9',
                                            10: '10',
                                            11: '11',
                                            12: '12',
                                            13: '13',
                                            14: '14',
                                            15: '15',
                                            16: '16'
                                        }
                                    },
                                    'native': {}
                                });
                                await ctx.adapterProxy.setStateConditionalAsync('control.extended.atmoVolume', Number(value), true);
                            })();
                        });

                        vacbot.on('AutonomousClean', (value) => {
                            ctx.adapterProxy.createObjectNotExists(
                                'control.linkedPurification.selfLinkedPurification', 'Self-linked Purification',
                                'boolean', 'value', true, Boolean(value), '').then(() => {
                                ctx.adapterProxy.setStateConditional('control.linkedPurification.selfLinkedPurification', Boolean(value), true);
                            });
                        });

                        vacbot.on('AirbotAutoModel', (object) => {
                            const enabled = object['enable'];
                            const aqEnd = enabled ? object['aq']['aqEnd'] : 2;
                            const aqStart = enabled ? object['aq']['aqStart'] : 3;
                            const value = [enabled, aqStart, aqEnd].join(',');
                            (async () => {
                                await ctx.adapterProxy.setObjectNotExistsAsync('control.linkedPurification.linkedPurificationAQ', {
                                    'type': 'state',
                                    'common': {
                                        'name': 'Linked Purification (linked to Air Quality Monitor)',
                                        'type': 'mixed',
                                        'role': 'level',
                                        'read': true,
                                        'write': true,
                                        'def': value,
                                        'unit': '',
                                        'states': {
                                            '0,3,2': 'disabled',
                                            '1,4,3': 'very poor <> poor',
                                            '1,4,2': 'very poor <> fair',
                                            '1,4,1': 'very poor <> good',
                                            '1,3,2': 'poor <> fair',
                                            '1,3,1': 'poor <> good',
                                            '1,2,1': 'fair <> good'
                                        }
                                    },
                                    'native': {}
                                });
                                await ctx.adapterProxy.setStateConditionalAsync('control.linkedPurification.linkedPurificationAQ', value, true);
                            })();
                        });

                        vacbot.on('ThreeModule', (object) => {
                            const modules = [];
                            object.forEach((module) => {
                                modules[module['type']] = module;
                            });
                            const uvSanitization = modules['uvLight']['enable'];
                            ctx.adapterProxy.createObjectNotExists(
                                'control.airPurifierModules.uvSanitization', 'Sanitization (UV-Sanitizer)',
                                'boolean', 'value', true, Boolean(uvSanitization), '').then(() => {
                                ctx.adapterProxy.setStateConditional('control.airPurifierModules.uvSanitization', Boolean(uvSanitization), true);
                            });
                            let airFresheningLevel = modules['smell']['level'];
                            if (modules['smell']['enable'] === 0) airFresheningLevel = 0;
                            (async () => {
                                await ctx.adapterProxy.setObjectNotExistsAsync('control.airPurifierModules.airFreshening', {
                                    'type': 'state',
                                    'common': {
                                        'name': 'Air Freshening',
                                        'type': 'number',
                                        'role': 'level',
                                        'read': true,
                                        'write': true,
                                        'def': airFresheningLevel,
                                        'unit': '',
                                        'states': {
                                            0: 'disabled',
                                            1: 'light',
                                            2: 'standard',
                                            3: 'strong'
                                        }
                                    },
                                    'native': {}
                                });
                                await ctx.adapterProxy.setStateConditionalAsync('control.airPurifierModules.airFreshening', airFresheningLevel, true);
                            })();
                            let humidificationLevel = modules['humidify']['level'];
                            if (modules['humidify']['enable'] === 0) humidificationLevel = 0;
                            (async () => {
                                await ctx.adapterProxy.setObjectNotExistsAsync('control.airPurifierModules.humidification', {
                                    'type': 'state',
                                    'common': {
                                        'name': 'Humidification',
                                        'type': 'number',
                                        'role': 'level',
                                        'read': true,
                                        'write': true,
                                        'def': humidificationLevel,
                                        'unit': '',
                                        'states': {
                                            0: 'disabled',
                                            45: 'lower humidity',
                                            55: 'cozy',
                                            65: 'higher humidity'
                                        }
                                    },
                                    'native': {}
                                });
                                await ctx.adapterProxy.setStateConditionalAsync('control.airPurifierModules.humidification', humidificationLevel, true);
                            })();
                        });

                        // ==================
                        // Library connection
                        // ==================

                        vacbot.on('messageReceived', (value) => {
                            this.log.silly('Received message: ' + value);
                            const timestamp = helper.getUnixTimestamp();
                            ctx.adapterProxy.setStateConditional('history.timestampOfLastMessageReceived', timestamp, true);
                            ctx.adapterProxy.setStateConditional('history.dateOfLastMessageReceived', this.getCurrentDateAndTimeFormatted(), true);
                            if (this.connectedTimestamp > 0) {
                                const uptime = Math.floor((timestamp - this.connectedTimestamp) / 60);
                                ctx.adapterProxy.setStateConditional('info.connectionUptime', uptime, true);
                            }
                        });

                        vacbot.on('genericCommandPayload', (payload) => {
                            const payloadString = JSON.stringify(payload);
                            this.log.info('Received payload for Generic command: ' + payloadString);
                            ctx.adapterProxy.setStateConditional('control.extended.genericCommand.responsePayload', payloadString, true);
                        });

                        vacbot.on('disconnect', (error) => {
                            this.error(`Received disconnect event from library: ${error.toString()}`);
                            if (ctx.connected && error) {
                                ctx.connected = false;
                                this.updateConnectionState();
                                ctx.connectionFailed = true;
                            }
                        });
                    });

                    vacbot.connect();

                    if (!ctx.getStatesInterval) {
                        setTimeout(() => {
                            this.vacbotInitialGetStates(ctx);
                        }, 6000);
                        ctx.getStatesInterval = setInterval(() => {
                            this.vacbotGetStatesInterval(ctx);
                        }, this.pollingInterval);
                    }
                }
            });
        }).catch((e) => {
            this.connectionFailed = true;
            if (this.isAuthError(e.message)) {
                this.authFailed = true;
                this.log.error('Authentication failed. Retrying will not be attempted until the adapter is restarted or credentials are updated.');
            }
            this.error(e.message, true);
        });
    }

    setConnection(value) {
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
            this.connectedTimestamp = helper.getUnixTimestamp();
            this.setStateConditional('info.connectionUptime', 0, true);
        }
        this.connected = value;
    }

    updateConnectionState() {
        const anyConnected = Array.from(this.deviceContexts.values()).some(c => c.connected);
        this.setStateConditional('info.connection', anyConnected, true);
        this.connected = anyConnected;
        if (anyConnected) {
            this.connectedTimestamp = helper.getUnixTimestamp();
        }
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
        ctx.errorCode = '0';
        ctx.adapterProxy.setStateConditional('info.errorCode', ctx.errorCode, true);
        ctx.adapterProxy.setStateConditional('info.error', 'NoError: Robot is operational', true);
    }

    clearGoToPosition(ctx) {
        ctx.adapterProxy.setStateConditional('control.extended.goToPosition', '', true);
        ctx.goToPositionArea = null;
    }

    async setInitialStateValues(ctx) {
        this.resetErrorStates(ctx);
        this.resetCurrentStats(ctx);
        await ctx.adapterProxy.setStateConditionalAsync('info.library.debugMessage', '', true);
        let state;
        state = await ctx.adapterProxy.getStateAsync('info.cleanstatus');
        if (state && state.val) {
            ctx.cleanstatus = state.val.toString();
        }
        state = await ctx.adapterProxy.getStateAsync('info.chargestatus');
        if (state && state.val) {
            ctx.chargestatus = state.val.toString();
        }
        state = await ctx.adapterProxy.getStateAsync('map.currentMapMID');
        if (state && state.val) {
            ctx.currentMapID = state.val.toString();
        }
        state = await ctx.adapterProxy.getStateAsync('control.customArea_cleanings');
        if (state && state.val) {
            ctx.customAreaCleanings = Number(state.val);
        }
        state = await ctx.adapterProxy.getStateAsync('control.spotArea_cleanings');
        if (state && state.val) {
            ctx.spotAreaCleanings = Number(state.val);
        }
        state = await ctx.adapterProxy.getStateAsync('control.waterLevel');
        if (state && state.val) {
            ctx.waterLevel = Math.round(Number(state.val));
        }
        state = await ctx.adapterProxy.getStateAsync('control.cleanSpeed');
        if (state && state.val) {
            ctx.cleanSpeed = Math.round(Number(state.val));
        }
        state = await ctx.adapterProxy.getStateAsync('control.extended.pauseWhenEnteringSpotArea');
        if (state && state.val) {
            ctx.pauseWhenEnteringSpotArea = state.val.toString();
        }
        state = await ctx.adapterProxy.getStateAsync('control.extended.pauseWhenLeavingSpotArea');
        if (state && state.val) {
            ctx.pauseWhenLeavingSpotArea = state.val.toString();
        }
        state = await ctx.adapterProxy.getStateAsync('info.waterboxinfo');
        if (state && state.val) {
            ctx.waterboxInstalled = (state.val === true);
        }
        state = await ctx.adapterProxy.getStateAsync('map.chargePosition');
        if (state && state.val) {
            ctx.chargePosition = state.val;
        }
        state = await ctx.adapterProxy.getStateAsync('map.deebotPosition');
        if (state && state.val) {
            ctx.deebotPosition = state.val;
        }
        state = await ctx.adapterProxy.getStateAsync('control.extended.pauseBeforeDockingChargingStation');
        if (state && state.val) {
            ctx.pauseBeforeDockingChargingStation = (state.val === true);
        }
        state = await ctx.adapterProxy.getStateAsync('control.extended.pauseBeforeDockingChargingStation');
        if (state && state.val) {
            ctx.pauseBeforeDockingChargingStation = (state.val === true);
        }
        state = await ctx.adapterProxy.getStateAsync('control.extended.resetCleanSpeedToStandardOnReturn');
        if (state && state.val) {
            ctx.resetCleanSpeedToStandardOnReturn = (state.val === true);
        }
        state = await ctx.adapterProxy.getStateAsync('control.extended.cleaningClothReminder');
        if (state && state.val) {
            ctx.cleaningClothReminder.enabled = Boolean(Number(state.val));
        }
        state = await ctx.adapterProxy.getStateAsync('control.extended.cleaningClothReminder_period');
        if (state && state.val) {
            ctx.cleaningClothReminder.period = Number(state.val);
        }
        state = await ctx.adapterProxy.getStateAsync('info.extended.airDryingDateTime.startTimestamp');
        if (state && state.val) {
            ctx.airDryingStartTimestamp = Number(state.val);
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
            this.getState(stateId, (err, state) => {
                if (!err && state) {
                    if (value !== undefined) {
                        if ((ack && !state.ack) || (state.val !== value) || native) {
                            this.setState(stateId, value, ack);
                            if (native) {
                                this.extendObject(
                                    stateId, {
                                        native: native
                                    });
                            }
                        } else {
                            this.log.silly(`setStateConditional: '${stateId}' unchanged`);
                        }
                    } else {
                        this.log.warn(`setStateConditional: value for state id '${stateId}' is undefined`);
                    }
                }
            });
        } else {
            this.log.warn(`setStateConditional: state id '${stateId}' not valid`);
        }
    }

    async setStateConditionalAsync(stateId, value, ack = true, native) {
        if (helper.isIdValid(stateId)) {
            const state = await this.getStateAsync(stateId);
            if (state) {
                if ((ack && !state.ack) || (state.val !== value) || native) {
                    this.setState(stateId, value, ack);
                    if (native) {
                        this.extendObject(
                            stateId, {
                                native: native
                            });
                    }
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
        ctx.intervalQueue.addStandardGetCommands();
        ctx.intervalQueue.addAdditionalGetCommands();
        ctx.intervalQueue.runAll();
    }

    getDevice(ctx) {
        if (ctx.device) {
            return ctx.device;
        }
        ctx.device = new Device(this);
        return ctx.device;
    }

    getModel(ctx) {
        if (ctx.model && ctx.model.vacbot) {
            return ctx.model;
        }
        ctx.model = new Model(ctx.vacbot, this.config);
        return ctx.model;
    }

    getModelType(ctx) {
        return ctx.getModel().getModelType();
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
                if (adapterObj.common && adapterObj.common.native) changed = migrateNative(adapterObj.common.native) || changed;
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

    getConfigValue(cv) {
        if (this.config[cv]) {
            return this.config[cv];
        }
        return '';
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

    error(message, stop) {
        if (stop) {
            this.setConnection(false);
        }
        const pattern = /code 0002/;
        if (pattern.test(message)) {
            message = 'reconnecting';
        } else {
            this.log.error(message);
        }
        this.errorCode = '-9';
        for (const ctx of this.deviceContexts.values()) {
            this.addToLast20Errors(ctx, this.errorCode, message);
        }
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

    getPauseBeforeDockingChargingStationAreaSize() {
        if (this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize')) {
            return Number(this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize'));
        }
        return 500;
    }

    getPauseBeforeDockingSendPauseOrStop() {
        let sendPauseOrStop = 'pause';
        if (this.getConfigValue('feature.pauseBeforeDockingChargingStation.pauseOrStop')) {
            sendPauseOrStop = this.getConfigValue('feature.pauseBeforeDockingChargingStation.pauseOrStop');
        }
        return sendPauseOrStop;
    }

    getHoursUntilDustBagEmptyReminderFlagIsSet() {
        if (this.getConfigValue('feature.info.extended.hoursUntilDustBagEmptyReminderFlagIsSet')) {
            return Number(this.getConfigValue('feature.info.extended.hoursUntilDustBagEmptyReminderFlagIsSet'));
        }
        return 0;
    }

    getCurrentDateAndTimeFormatted() {
        return helper.getCurrentDateAndTimeFormatted(this);
    }

    setHistoryValuesForDustboxRemoval() {
        this.setStateConditional('history.timestampOfLastTimeDustboxRemoved', helper.getUnixTimestamp(), true);
        this.setStateConditional('history.dateOfLastTimeDustboxRemoved', this.getCurrentDateAndTimeFormatted(), true);
        this.setStateConditional('history.cleaningTimeSinceLastDustboxRemoved', 0, true);
        this.setStateConditional('history.cleaningTimeSinceLastDustboxRemovedString', helper.getTimeStringFormatted(0), true);
        this.setStateConditional('history.squareMetersSinceLastDustboxRemoved', 0, true);
        this.setStateConditional('info.extended.dustBagEmptyReminder', false, true);
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
                    await this.createObjectNotExists(
                        'cleaninglog.lastCleaningMapImageFile', 'Name of the png file', 'string', 'value', false, '', '');
                    const filePath = '/' + this.namespace + '/' + filename;
                    await this.setStateConditionalAsync(
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
            const areaSize = this.getPauseBeforeDockingChargingStationAreaSize();
            if (mapHelper.positionIsInRectangleForPosition(x, y, ctx.chargePosition, areaSize)) {
                if (ctx.getDevice().isNotPaused() && ctx.getDevice().isNotStopped()) {
                    ctx.commandQueue.run(this.getPauseBeforeDockingSendPauseOrStop());
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
        const lastTimePresenceThreshold = this.getConfigValue('feature.map.spotAreas.lastTimePresence.threshold') || 20;
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
                                        }, 60000);
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
                                setTimeout(() => {
                                    ctx.adapterProxy.setStateConditional('info.extended.airDryingActiveTime', 0, true);
                                    ctx.adapterProxy.setStateConditional('info.extended.airDryingRemainingTime', 0, true);
                                    ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.startTimestamp', 0, true);
                                    ctx.adapterProxy.setStateConditional('info.extended.airDryingDateTime.endTimestamp', 0, true);
                                    ctx.airDryingStartTimestamp = 0;
                                    this.log.debug('Reset air drying active time and timestamp states after 60 seconds');
                                }, 60000 );
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
