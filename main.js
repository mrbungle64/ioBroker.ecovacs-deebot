'use strict';

const utils = require('@iobroker/adapter-core');
const ecovacsDeebot = require('ecovacs-deebot');
const nodeMachineId = require('node-machine-id');
const adapterObjects = require('./lib/adapterObjects');
const adapterCommands = require('./lib/adapterCommands');
const helper = require('./lib/adapterHelper');
const Model = require('./lib/deebotModel');
const Device = require('./lib/device');
const Queue = require('./lib/adapterQueue');
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
        this.vacbot = {};
        this.model = {};
        this.device = null;
        this.connectionFailed = false;
        this.connected = false;
        this.connectedTimestamp = 0;
        this.errorCode = null;
        this.last20Errors = [];
        this.retries = 0;
        this.deviceNumber = 0;
        this.customAreaCleanings = 1;
        this.spotAreaCleanings = 1;
        this.waterLevel = null;
        this.moppingType = null;
        this.scrubbingPattern = null;
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
        this.canvasModuleIsInstalled = EcoVacsAPI.isCanvasModuleAvailable();

        this.commandQueue = new Queue(this, 'commandQueue', 500);
        this.intervalQueue = new Queue(this, 'intervalQueue', 1000);
        this.cleaningQueue = new Queue(this, 'cleaningQueue', 0, false);

        this.cleaningLogAcknowledged = false;

        this.lastChargeStatus = '';
        this.chargestatus = '';
        this.cleanstatus = '';

        this.silentApproach = {};

        this.retrypauseTimeout = null;
        this.getStatesInterval = null;
        this.getGetPosInterval = null;

        this.pollingInterval = 120000;

        this.password = '';
    }

    async onReady() {
        await adapterObjects.createInitialInfoObjects(this);

        // Reset the connection indicator during startup
        this.setStateConditional('info.connection', false, true);

        this.getForeignObject('system.config', (err, obj) => {
            if (obj && obj.native && obj.native.secret) {
                this.password = helper.decrypt(obj.native.secret, this.config.password);
                this.connect();
            } else {
                this.error('Error reading config. Please check adapter config.');
            }
        });
        this.subscribeStates('*');
    }

    onUnload(callback) {
        try {
            this.disconnect(true);
            callback();
        } catch (e) {
            callback();
        }
    }

    disconnect(disconnectVacbot) {
        this.setConnection(false);
        if (disconnectVacbot) {
            this.vacbot.disconnect();
        }
        this.log.info('cleaned everything up...');
    }

    onStateChange(id, state) {
        if (!state) return;
        (async () => {
            try {
                await adapterCommands.handleStateChange(this, id, state);
            } catch (e) {
                this.log.error(`Error handling state change for id '${id}' with value '${state.val}': '${e}'`);
            }
        })();
    }

    reconnect() {
        this.clearGoToPosition();
        this.retrypauseTimeout = null;
        this.retries++;
        this.setConnection(false);
        this.log.info('Reconnecting (' + this.retries + ') ...');
        this.connect();
    }

    connect() {
        this.connectionFailed = false;
        this.resetErrorStates();

        if ((!this.config.email) || (!this.config.password) || (!this.config.countrycode)) {
            this.error('Missing values in adapter config', true);
            return;
        }
        if (this.config.deviceNumber) {
            this.deviceNumber = this.config.deviceNumber;
        } else {
            this.log.warn('Missing device Number in adapter config. Using value 0');
        }
        const password_hash = EcoVacsAPI.md5(this.password);
        const deviceId = EcoVacsAPI.getDeviceId(nodeMachineId.machineIdSync(), this.config.deviceNumber);
        const continent = (ecovacsDeebot.countries)[this.config.countrycode.toUpperCase()].continent.toLowerCase();
        if (this.config.pollingInterval && (Number(this.config.pollingInterval) >= 60000)) {
            this.pollingInterval = Number(this.config.pollingInterval);
        }

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
                this.log.info('Successfully connected to Ecovacs server');
                this.log.info('Number of devices: ' + numberOfDevices);
                this.log.debug('Devices:' + JSON.stringify(devices));
                for (let d = 0; d < numberOfDevices; d++) {
                    this.log.info('Device[' + d + ']: ' + JSON.stringify(devices[d]));
                }
                this.log.info('Using device Device[' + this.deviceNumber + ']');

                const vacuum = devices[this.deviceNumber];

                this.vacbot = api.getVacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent);

                (async () => {
                    await adapterObjects.createInitialObjects(this);
                })();

                this.vacbot.on('ready', () => {

                    (async () => {
                        await adapterObjects.createAdditionalObjects(this);
                    })();

                    this.setConnection(true);

                    const nick = vacuum.nick ? vacuum.nick : 'New Device ' + this.deviceNumber;
                    this.log.info(nick + ' instance successfully connected');

                    this.model = new Model(this.vacbot, this.config);
                    this.device = new Device(this);

                    this.setStateConditional('info.version', this.version, true);
                    this.setStateConditional('info.library.version', api.getVersion(), true);
                    this.setStateConditional('info.library.canvasModuleIsInstalled', this.canvasModuleIsInstalled, true);
                    this.setStateConditional('info.deviceName', nick, true);
                    this.setStateConditional('info.deviceClass', this.getModel().getDeviceClass(), true);
                    this.setStateConditional('info.deviceModel', this.getModel().getProductName(), true);
                    this.setStateConditional('info.modelType', this.getModel().getModelType(), true);
                    this.setStateConditional('info.deviceImageURL', this.getModel().getProductImageURL(), true);
                    this.setStateConditional('info.library.communicationProtocol', this.getModel().getProtocol(), true);
                    this.setStateConditional('info.library.deviceIs950type', this.getModel().is950type(), true);
                    this.log.info('[vacbot] product name: ' + this.getModel().getProductName());
                    this.retries = 0;

                    (async () => {
                        await this.setInitialStateValues();
                    })();

                    this.vacbot.on('ChargeState', (status) => {
                        this.log.debug(`[queue] Received ChargeState event: ${status}`);
                        if (helper.isValidChargeStatus(status)) {
                            if ((status === 'returning') && (this.cleaningQueue.notEmpty()) && (this.lastChargeStatus !== status)) {
                                this.cleaningQueue.startNextItemFromQueue();
                                setTimeout(() => {
                                    this.lastChargeStatus = '';
                                    this.log.debug('[queue] Reset lastChargingStatus');
                                }, 3000);
                            } else if (this.chargestatus !== status) {
                                this.chargestatus = status;
                                this.setDeviceStatusByTrigger('chargestatus');
                                this.setStateConditional('info.chargestatus', this.chargestatus, true);
                                if (this.chargestatus === 'charging') {
                                    this.setStateConditional('history.timestampOfLastStartCharging', helper.getUnixTimestamp(), true);
                                    this.setStateConditional('history.dateOfLastStartCharging', this.getCurrentDateAndTimeFormatted(), true);
                                    this.currentSpotAreaData = {
                                        'spotAreaID': 'unknown',
                                        'lastTimeEnteredTimestamp': 0
                                    };
                                    this.resetErrorStates();
                                    this.intervalQueue.addGetLifespan();
                                    this.cleaningLogAcknowledged = false;
                                    this.intervalQueue.addGetCleanLogs();
                                    if (this.getModel().isMappingSupported()) {
                                        this.intervalQueue.add('GetMaps');
                                    }
                                    if (this.getModel().isSupportedFeature('map.deebotPosition')) {
                                        this.intervalQueue.add('GetPosition');
                                    }
                                }
                            }
                        } else {
                            this.log.warn('Unhandled chargestatus: ' + status);
                        }
                        this.lastChargeStatus = status;
                    });

                    this.vacbot.on('CleanReport', (status) => {
                        this.log.debug(`[queue] Received CleanReport event: ${status}`);
                        if (helper.isValidCleanStatus(status)) {
                            if ((this.cleanstatus === 'setLocation') && (status !== 'setLocation')) {
                                if (status === 'idle') {
                                    this.log.info('Bot arrived at destination');
                                } else {
                                    this.log.info(`The operation was interrupted before arriving at destination (status: ${status})`);
                                }
                                this.handleSilentApproach();
                            }
                            if (this.getDevice().isNotStopped() && (this.cleanstatus !== status)) {
                                if ((status === 'stop') || (status === 'idle')) {
                                    this.resetCurrentStats();
                                    this.cleaningLogAcknowledged = false;
                                    this.intervalQueue.addGetCleanLogs();
                                }
                                this.setPauseBeforeDockingIfWaterboxInstalled();
                            }
                            this.cleanstatus = status;
                            this.setDeviceStatusByTrigger('cleanstatus');
                            this.setStateConditional('info.cleanstatus', status, true);
                        } else if (status !== undefined) {
                            this.log.warn('Unhandled cleanstatus: ' + status);
                        }
                    });

                    this.vacbot.on('WaterLevel', (level) => {
                        this.waterLevel = level;
                        adapterObjects.createControlWaterLevelIfNotExists(this, 0, 'control.waterLevel_standard', 'Water level if no other value is set').then(() => {
                            adapterObjects.createControlWaterLevelIfNotExists(this, this.waterLevel).then(() => {
                                this.setStateConditional('control.waterLevel', this.waterLevel, true);
                            });
                        });
                    });

                    this.vacbot.on('WaterBoxInfo', (value) => {
                        this.waterboxInstalled = Boolean(Number(value));
                        this.setStateConditional('info.waterbox', this.waterboxInstalled, true);
                    });

                    this.vacbot.on('CarpetPressure', (value) => {
                        if (this.getModel().isSupportedFeature('control.autoBoostSuction')) {
                            this.createObjectNotExists(
                                'control.extended.autoBoostSuction', 'Auto boost suction',
                                'boolean', 'value', true, false, '').then(() => {
                                const carpetPressure = Boolean(Number(value));
                                this.setStateConditional('control.extended.autoBoostSuction', carpetPressure, true);
                            });
                        }
                    });

                    this.vacbot.on('CleanPreference', (value) => {
                        this.createObjectNotExists(
                            'control.extended.cleanPreference', 'Clean preference',
                            'boolean', 'value', true, false, '').then(() => {
                            const cleanPreference = Boolean(Number(value));
                            this.cleanPreference = cleanPreference;
                            this.setStateConditional('control.extended.cleanPreference', cleanPreference, true);
                        });
                    });

                    this.vacbot.on('VoiceAssistantState', (value) => {
                        this.createObjectNotExists(
                            'control.extended.voiceAssistant', 'Indicates whether YIKO voice assistant is enabled',
                            'boolean', 'value', true, Boolean(value), '').then(() => {
                            this.setStateConditional('control.extended.voiceAssistant', Boolean(value), true);
                        });
                    });

                    this.vacbot.on('BorderSpin', (value) => {
                        this.createInfoExtendedChannelNotExists().then(() => {
                            this.createObjectNotExists(
                                'control.extended.edgeDeepCleaning', 'Enable and disable edge deep cleaning',
                                'boolean', 'value', true, false, '').then(() => {
                                const edgeDeepCleaning = Boolean(Number(value));
                                this.setStateConditional('control.extended.edgeDeepCleaning', edgeDeepCleaning, true);
                            });
                        });
                    });
                    this.vacbot.on('MopOnlyMode', (value) => {
                        this.createInfoExtendedChannelNotExists().then(() => {
                            this.createObjectNotExists(
                                'control.extended.mopOnlyMode', 'Enable and disable mop only mode',
                                'boolean', 'value', true, false, '').then(() => {
                                const mopOnlyMode = Boolean(Number(value));
                                this.setStateConditional('control.extended.mopOnlyMode', mopOnlyMode, true);
                            });
                        });
                    });
                    this.vacbot.on('SweepMode', (value) => {
                        this.createInfoExtendedChannelNotExists().then(() => {
                            this.createObjectNotExists(
                                'info.extended.sweepMode', 'Sweep mode',
                                'string', 'value', false, '', '').then(() => {
                                const sweepMode = value === 1 ? 'deep' : 'standard';
                                this.setStateConditional('info.extended.sweepMode', sweepMode, true);
                            });
                        });
                        value = value + 1;
                        this.handleWaterBoxScrubbingType(value);
                    });
                    this.vacbot.on('AirDryingState', (value) => {
                        this.createInfoExtendedChannelNotExists().then(() => {
                            this.createObjectNotExists(
                                'info.extended.airDryingState', 'Air drying state',
                                'string', 'value', false, '', '').then(() => {
                                this.setStateConditional('info.extended.airDryingState', value, true);
                            });
                        });
                    });
                    this.vacbot.on('WashInterval', (value) => {
                        (async () => {
                            await this.createInfoExtendedChannelNotExists();
                            await this.createObjectNotExists(
                                'info.extended.washInterval', 'Wash interval',
                                'number', 'value', false, 0, 'min');
                            await this.setStateConditionalAsync('info.extended.washInterval', value, true);
                            await this.setObjectNotExistsAsync('control.extended.washInterval', {
                                'type': 'state',
                                'common': {
                                    'name': 'Wash interval',
                                    'type': 'number',
                                    'role': 'value',
                                    'read': true,
                                    'write': true,
                                    'min': 10,
                                    'max': 25,
                                    'def': 15,
                                    'unit': 'min',
                                    'states': {
                                        10: '10',
                                        15: '15',
                                        25: '25'
                                    }
                                },
                                'native': {}
                            });
                            await this.setStateConditionalAsync('control.extended.washInterval', value, true);
                        })();
                    });
                    this.vacbot.on('StationState', (object) => {
                        this.createObjectNotExists(
                            'control.extended.airDrying', 'Start and stop air-drying mopping pads',
                            'boolean', 'button', true, false, '').then(() => {
                            this.setStateConditional('control.extended.airDrying', object.isAirDrying, true);
                        });
                        this.createObjectNotExists(
                            'info.extended.airDryingActive', 'Indicates whether the air drying process is active',
                            'boolean', 'value', false, false, '').then(() => {
                            this.setStateConditional('info.extended.airDryingActive', object.isAirDrying, true);
                        });
                        this.createObjectNotExists(
                            'control.extended.selfCleaning', 'Start and stop cleaning mopping pads',
                            'boolean', 'button', true, false, '').then(() => {
                            this.setStateConditional('control.extended.selfCleaning', object.isSelfCleaning, true);
                        });
                        this.createObjectNotExists(
                            'info.extended.selfCleaningActive', 'Indicates whether the self-cleaning process is active',
                            'boolean', 'value', false, false, '').then(() => {
                            this.setStateConditional('info.extended.selfCleaningActive', object.isSelfCleaning, true);
                        });
                        this.createObjectNotExists(
                            'info.extended.cleaningStationActive', 'Indicates whether the self cleaning process is active',
                            'boolean', 'value', false, false, '').then(() => {
                            this.setStateConditional('info.extended.cleaningStationActive', object.isActive, true);
                        });
                    });
                    this.vacbot.on('AICleanItemState', (object) => {
                        this.createInfoExtendedChannelNotExists().then(() => {
                            this.createObjectNotExists(
                                'info.extended.particleRemoval', 'Indicates whether the particle removal mode is enabled',
                                'boolean', 'value', false, false, '').then(() => {
                                this.setStateConditional('info.extended.particleRemoval', object.particleRemoval, true);
                            });
                            this.createObjectNotExists(
                                'info.extended.petPoopAvoidance', 'Indicates whether the pet poop avoidance mode is enabled',
                                'boolean', 'value', false, false, '').then(() => {
                                this.setStateConditional('info.extended.petPoopAvoidance', object.petPoopPrevention, true);
                            });
                        });
                    });
                    this.vacbot.on('StationInfo', (object) => {
                        this.createInfoExtendedChannelNotExists().then(() => {
                            this.createChannelNotExists('info.extended.cleaningStation', 'Information about the cleaning station').then(() => {
                                this.createObjectNotExists(
                                    'info.extended.cleaningStation.state', 'State of the cleaning station',
                                    'number', 'value', false, object.state, '').then(() => {
                                    this.setStateConditional('info.extended.cleaningStation.state', object.state, true);
                                });
                                this.createObjectNotExists(
                                    'info.extended.cleaningStation.name', 'Name of the cleaning station',
                                    'string', 'value', false, object.name, '').then(() => {
                                    this.setStateConditional('info.extended.cleaningStation.name', object.name, true);
                                });
                                this.createObjectNotExists(
                                    'info.extended.cleaningStation.model', 'Model of the cleaning station',
                                    'string', 'value', false, object.model, '').then(() => {
                                    this.setStateConditional('info.extended.cleaningStation.model', object.model, true);
                                });
                                this.createObjectNotExists(
                                    'info.extended.cleaningStation.serialNumber', 'Serial number of the cleaning station',
                                    'string', 'value', false, object.sn, '').then(() => {
                                    this.setStateConditional('info.extended.cleaningStation.serialNumber', object.sn, true);
                                });
                                this.createObjectNotExists(
                                    'info.extended.cleaningStation.firmwareVersion', 'Firmware version of the cleaning station',
                                    'string', 'value', false, object.wkVer, '').then(() => {
                                    this.setStateConditional('info.extended.cleaningStation.firmwareVersion', object.wkVer, true);
                                });
                            });
                        });
                    });

                    this.vacbot.on('DusterRemind', (object) => {
                        (async () => {
                            await this.createObjectNotExists(
                                'control.extended.cleaningClothReminder', 'Cleaning cloth reminder',
                                'boolean', 'value', true, false, '').then(() => {
                                this.setStateConditional('control.extended.cleaningClothReminder', Boolean(Number(object.enabled)), true);
                                this.cleaningClothReminder.enabled = Boolean(Number(object.enabled));
                            });
                            await this.setObjectNotExistsAsync('control.extended.cleaningClothReminder_period', {
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
                            await this.setStateConditionalAsync('control.extended.cleaningClothReminder_period', Number(object.period), true);
                            this.cleaningClothReminder.period = Number(object.period);
                        })();
                    });

                    this.vacbot.on('WaterBoxMoppingType', (value) => {
                        if (this.getModel().getModelType() === 'airbot') return;
                        this.createObjectNotExists(
                            'info.waterbox_moppingType', 'Mopping type',
                            'string', 'value', false, '', '').then(() => {
                            this.moppingType = 'waterbox not installed';
                            if (value >= 1) {
                                this.moppingType = (value === 2) ? 'scrubbing' : 'standard';
                            }
                            this.setStateConditional('info.waterbox_moppingType', this.moppingType, true);
                        });
                    });

                    this.vacbot.on('WaterBoxScrubbingType', (value) => {
                        if (this.getModel().getModelType() === 'airbot') return;
                        this.handleWaterBoxScrubbingType(value);
                    });

                    this.vacbot.on('DustCaseInfo', (value) => {
                        const dustCaseInfo = Boolean(Number(value));
                        this.getState('info.dustbox', (err, state) => {
                            if (!err && state) {
                                if ((state.val !== dustCaseInfo) && (dustCaseInfo === false)) {
                                    this.setHistoryValuesForDustboxRemoval();
                                }
                                this.setStateConditional('info.dustbox', dustCaseInfo, true);
                            }
                        });
                    });

                    this.vacbot.on('SleepStatus', (value) => {
                        const sleepStatus = Boolean(Number(value));
                        this.setStateConditional('info.sleepStatus', sleepStatus, true);
                    });

                    this.vacbot.on('CleanSpeed', (level) => {
                        this.cleanSpeed = level;
                        adapterObjects.createControlCleanSpeedIfNotExists(this, 0, 'control.cleanSpeed_standard', 'Clean speed if no other value is set').then(() => {
                            adapterObjects.createControlCleanSpeedIfNotExists(this, this.cleanSpeed).then(() => {
                                this.setStateConditional('control.cleanSpeed', this.cleanSpeed, true);
                            });
                        });
                    });

                    this.vacbot.on('DoNotDisturbEnabled', (value) => {
                        const doNotDisturb = Boolean(Number(value));
                        this.setStateConditional('control.extended.doNotDisturb', doNotDisturb, true);
                    });

                    this.vacbot.on('ContinuousCleaningEnabled', (value) => {
                        const continuousCleaning = Boolean(Number(value));
                        this.setStateConditional('control.extended.continuousCleaning', continuousCleaning, true);
                    });

                    this.vacbot.on('AdvancedMode', (value) => {
                        const advancedMode = Boolean(Number(value));
                        this.setStateConditional('control.extended.advancedMode', advancedMode, true);
                    });

                    this.vacbot.on('TrueDetect', (value) => {
                        const trueDetect = Boolean(Number(value));
                        this.setStateConditional('control.extended.trueDetect', trueDetect, true);
                    });

                    this.vacbot.on('AutoEmptyStatus', (autoEmptyStatus) => {
                        const autoEmptyEnabled = autoEmptyStatus.autoEmptyEnabled;
                        this.setStateConditional('control.extended.autoEmpty', autoEmptyEnabled, true);
                        this.setStateConditional('info.autoEmptyStation.autoEmptyEnabled', autoEmptyEnabled, true);
                        const stationActive = autoEmptyStatus.stationActive;
                        this.setStateConditional('info.autoEmptyStation.stationActive', stationActive, true);
                        const dustBagFull = autoEmptyStatus.dustBagFull;
                        this.setStateConditional('info.autoEmptyStation.dustBagFull', dustBagFull, true);
                        if (stationActive) {
                            this.setHistoryValuesForDustboxRemoval();
                        }
                    });

                    this.vacbot.on('ChargeMode', (value) => {
                        this.createObjectNotExists(
                            'info.chargemode', 'Charge mode',
                            'string', 'value', false, '', '').then(() => {
                            this.setStateConditional('info.chargemode', value, true);
                        });
                    });

                    // Vacuum cleaner
                    this.vacbot.on('Volume', (value) => {
                        this.setStateConditional('control.extended.volume', Number(value), true);
                    });

                    this.vacbot.on('CleanCount', (value) => {
                        this.setStateConditional('control.extended.cleanCount', Number(value), true);
                    });

                    this.vacbot.on('BatteryInfo', (value) => {
                        this.getDevice().setBatteryLevel(Number(value));
                        this.setStateConditional('info.battery', this.getDevice().batteryLevel, true);
                    });

                    this.vacbot.on('LifeSpan_filter', (level) => {
                        this.setStateConditional('consumable.filter', Math.round(level), true);
                    });

                    this.vacbot.on('LifeSpan_main_brush', (level) => {
                        this.setStateConditional('consumable.main_brush', Math.round(level), true);
                    });

                    this.vacbot.on('LifeSpan_side_brush', (level) => {
                        this.setStateConditional('consumable.side_brush', Math.round(level), true);
                    });

                    this.vacbot.on('LifeSpan_unit_care', (level) => {
                        this.setStateConditional('consumable.unit_care', Math.round(level), true);
                    });

                    this.vacbot.on('LifeSpan_round_mop', (level) => {
                        this.setStateConditional('consumable.round_mop', Math.round(level), true);
                    });

                    this.vacbot.on('LifeSpan_air_freshener', (level) => {
                        this.setStateConditional('consumable.airFreshener', Math.round(level), true);
                    });

                    this.vacbot.on('LifeSpan', (object) => {
                        this.createObjectNotExists(
                            'consumable.filter', 'Filter life span',
                            'number', 'level', false, Math.round(object.filter), '%').then(() => {
                            this.setStateConditional('consumable.filter', Math.round(object.filter), true);
                        });
                        this.createObjectNotExists(
                            'consumable.uv_sanitizer_module', 'Filter UV Sanitizer Module',
                            'number', 'level', false, Math.round(object.uv_sanitizer_module), '%').then(() => {
                            this.setStateConditional('consumable.uv_sanitizer_module', Math.round(object.uv_sanitizer_module), true);
                        });
                        this.createObjectNotExists(
                            'consumable.air_freshener', 'Filter Air Freshener',
                            'number', 'level', false, Math.round(object.air_freshener), '%').then(() => {
                            this.setStateConditional('consumable.air_freshener', Math.round(object.air_freshener), true);
                        });
                        this.createObjectNotExists(
                            'consumable.unit_care', 'Filter Unit Care',
                            'number', 'level', false, Math.round(object.unit_care), '%').then(() => {
                            this.setStateConditional('consumable.unit_care', Math.round(object.unit_care), true);
                        });
                        this.createObjectNotExists(
                            'consumable.humidification_filter', 'Filter Humidification Filter',
                            'number', 'level', false, Math.round(object.humidification_filter), '%').then(() => {
                            this.setStateConditional('consumable.humidification_filter', Math.round(object.humidification_filter), true);
                        });
                        this.createObjectNotExists(
                            'consumable.humidification_maintenance', 'Filter Humidification Module Maintenance',
                            'number', 'level', false, Math.round(object.humidification_maintenance), '%').then(() => {
                            this.setStateConditional('consumable.humidification_maintenance', Math.round(object.humidification_maintenance), true);
                        });
                    });

                    this.vacbot.on('LastError', (obj) => {
                        if (this.errorCode !== obj.code) {
                            if (obj.code === '110') {
                                this.addToLast20Errors(obj.code, obj.error);
                                // NoDustBox: Dust Bin Not installed
                                if (this.getModel().isSupportedFeature('info.dustbox')) {
                                    this.setHistoryValuesForDustboxRemoval();
                                }
                            } else if (obj.code === '0') {
                                // NoError: Robot is operational
                                if (this.connected === false) {
                                    this.setConnection(true);
                                }
                            } else {
                                this.log.warn(obj.error);
                                this.addToLast20Errors(obj.code, obj.error);
                                if (obj.code === '404') {
                                    // Recipient unavailable
                                    this.setConnection(false);
                                }
                            }
                            this.errorCode = obj.code;
                            this.setStateConditional('info.errorCode', obj.code, true);
                            this.setStateConditional('info.error', obj.error, true);
                        }
                    });

                    this.vacbot.on('Debug', (value) => {
                        this.setStateConditional('info.library.debugMessage', value, true);
                    });

                    this.vacbot.on('Schedule', (obj) => {
                        (async () => {
                            await this.createInfoExtendedChannelNotExists();
                            await this.createObjectNotExists(
                                'info.extended.currentSchedule', 'Scheduling information (read-only)',
                                'json', 'json', false, '[]', '');
                            await this.setStateConditionalAsync('info.extended.currentSchedule', JSON.stringify(obj), true);
                            await this.createObjectNotExists(
                                'info.extended.currentSchedule_refresh', 'Refresh scheduling information',
                                'boolean', 'button', true, false, '');
                        })();
                    });

                    this.vacbot.on('NetworkInfo', (obj) => {
                        this.setStateConditional('info.network.ip', obj.ip, true);
                        this.setStateConditional('info.network.wifiSSID', obj.wifiSSID, true);
                        if (this.getModel().isSupportedFeature('info.network.wifiSignal')) {
                            this.setStateConditional('info.network.wifiSignal', Number(obj.wifiSignal), true);
                        }
                        if (this.getModel().isSupportedFeature('info.network.mac')) {
                            this.setStateConditional('info.network.mac', obj.mac, true);
                        }
                    });

                    this.vacbot.on('RelocationState', (relocationState) => {
                        if ((relocationState !== this.relocationState) && (relocationState === 'required')) {
                            this.currentSpotAreaData = {
                                'spotAreaID': 'unknown',
                                'lastTimeEnteredTimestamp': 0
                            };
                        }
                        this.setStateConditional('map.relocationState', relocationState, true);
                        this.relocationState = relocationState;
                    });

                    this.vacbot.on('Position', (obj) => {
                        (async () => {
                            await this.handlePositionObj(obj);
                        })();
                    });

                    this.vacbot.on('DeebotPositionCurrentSpotAreaID', (deebotPositionCurrentSpotAreaID) => {
                        const spotAreaID = deebotPositionCurrentSpotAreaID;
                        this.log.silly('DeebotPositionCurrentSpotAreaID: ' + spotAreaID);
                        if ((spotAreaID !== 'unknown') && (spotAreaID !== 'void')) {
                            const spotAreaHasChanged =
                                (this.currentSpotAreaData.spotAreaID !== spotAreaID) ||
                                (this.currentSpotAreaID !== spotAreaID);
                            this.currentSpotAreaID = spotAreaID;
                            if (spotAreaHasChanged) {
                                (async () => {
                                    await this.handleChangedCurrentSpotAreaID(deebotPositionCurrentSpotAreaID);
                                })();
                            }
                            this.setStateConditional('map.deebotPositionCurrentSpotAreaID', spotAreaID, true);
                        } else if (this.getDevice().isCleaning()) {
                            this.log.debug('DeebotPositionCurrentSpotAreaID: spotAreaID is unknown');
                        }
                    });

                    this.vacbot.on('ChargingPosition', (obj) => {
                        this.chargePosition = obj.coords;
                        this.setStateConditional('map.chargePosition', this.chargePosition, true);
                    });

                    this.vacbot.on('CurrentMapName', (value) => {
                        this.setStateConditional('map.currentMapName', value, true);
                    });

                    this.vacbot.on('CurrentMapIndex', (value) => {
                        this.setStateConditional('map.currentMapIndex', value, true);
                    });

                    this.vacbot.on('CurrentMapMID', (value) => {
                        this.currentMapID = value.toString();
                        this.setStateConditional('map.currentMapMID', this.currentMapID, true);
                    });

                    this.vacbot.on('Maps', (maps) => {
                        this.log.debug('Maps: ' + JSON.stringify(maps));
                        (async () => {
                            await mapObjects.processMaps(this, maps);
                        })();
                    });

                    this.vacbot.on('MapSpotAreas', (areas) => {
                        this.log.debug('MapSpotAreas: ' + JSON.stringify(areas));
                        (async () => {
                            await mapObjects.processSpotAreas(this, areas);
                        })();
                    });

                    this.vacbot.on('MapSpotAreaInfo', (area) => {
                        this.log.debug('MapSpotAreaInfo: ' + JSON.stringify(area));
                        (async () => {
                            await mapObjects.processSpotAreaInfo(this, area);
                        })();
                    });

                    this.vacbot.on('MapVirtualBoundaries', (boundaries) => {
                        this.log.debug('MapVirtualBoundaries: ' + JSON.stringify(boundaries));
                        (async () => {
                            await mapObjects.processVirtualBoundaries(this, boundaries);
                        })();
                    });

                    this.vacbot.on('MapVirtualBoundaryInfo', (boundary) => {
                        this.log.debug('MapVirtualBoundaryInfo: ' + JSON.stringify(boundary));
                        (async () => {
                            await mapObjects.processVirtualBoundaryInfo(this, boundary);
                        })();
                    });

                    this.vacbot.on('MapImage', (object) => {
                        this.setStateConditional('map.' + object['mapID'] + '.map64', object['mapBase64PNG'], true);
                        this.setStateConditional('history.timestampOfLastMapImageReceived', helper.getUnixTimestamp(), true);
                        this.setStateConditional('history.dateOfLastMapImageReceived', this.getCurrentDateAndTimeFormatted(), true);
                        const base64Data = object['mapBase64PNG'].replace(/^data:image\/png;base64,/, '');
                        (async () => {
                            const buf = Buffer.from(base64Data, 'base64');
                            const filename = 'currentCleaningMapImage_' + object['mapID'] + '.png';
                            await this.writeFileAsync(this.namespace, filename, buf);
                        })();
                    });

                    this.vacbot.on('CurrentCustomAreaValues', (values) => {
                        if (((this.cleanstatus === 'custom_area') && (values !== '')) || (this.cleanstatus !== 'custom_area')) {
                            this.setStateConditional('map.currentUsedCustomAreaValues', values, true);
                        }
                    });

                    this.vacbot.on('CurrentSpotAreas', (values) => {
                        if (((this.cleanstatus === 'spot_area') && (values !== '')) || (this.cleanstatus !== 'spot_area')) {
                            this.setStateConditional('map.currentUsedSpotAreas', values, true);
                        }
                    });

                    this.vacbot.on('LastUsedAreaValues', (values) => {
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
                        this.setStateConditional(
                            'map.lastUsedCustomAreaValues',
                            customAreaValues, true, {
                                dateTime: dateTime,
                                currentMapID: this.currentMapID
                            });
                    });

                    this.vacbot.on('CleanSum', (obj) => {
                        this.setStateConditional('cleaninglog.totalSquareMeters', Number(obj.totalSquareMeters), true);
                        this.setStateConditional('cleaninglog.totalSeconds', Number(obj.totalSeconds), true);
                        this.setStateConditional('cleaninglog.totalTime', helper.getTimeStringFormatted(obj.totalSeconds), true);
                        this.setStateConditional('cleaninglog.totalNumber', Number(obj.totalNumber), true);
                    });

                    this.vacbot.on('CleanLog', (json) => {
                        this.log.debug('CleanLog: ' + JSON.stringify(json));
                        this.getState('cleaninglog.last20Logs', (err, state) => {
                            if (!err && state) {
                                this.cleaningLogAcknowledged = true;
                                if (state.val !== JSON.stringify(json)) {
                                    this.setState('cleaninglog.last20Logs', JSON.stringify(json), true);
                                }
                            }
                        });
                    });

                    this.vacbot.on('LastCleanLogs', (obj) => {
                        this.log.debug('LastCleanLogs: ' + JSON.stringify(obj));
                        this.setStateConditional('cleaninglog.lastCleaningTimestamp', Number(obj.timestamp), true);
                        const lastCleaningDate = this.formatDate(new Date(obj.timestamp * 1000), 'TT.MM.JJJJ SS:mm:ss');
                        this.setStateConditional('cleaninglog.lastCleaningDate', lastCleaningDate, true);
                        this.setStateConditional('cleaninglog.lastTotalSeconds', obj.totalTime, true);
                        this.setStateConditional('cleaninglog.lastTotalTimeString', obj.totalTimeFormatted, true);
                        this.setStateConditional('cleaninglog.lastSquareMeters', Number(obj.squareMeters), true);
                        if (obj.imageUrl) {
                            this.setStateConditional('cleaninglog.lastCleaningMapImageURL', obj.imageUrl, true);
                            const configValue = Number(this.getConfigValue('feature.cleaninglog.downloadLastCleaningMapImage'));
                            if (configValue >= 1) {
                                if (this.getModel().isSupportedFeature('cleaninglog.lastCleaningMap')) {
                                    this.downloadLastCleaningMapImage(obj.imageUrl, configValue);
                                }
                            }
                        }
                    });

                    this.vacbot.on('CurrentStats', (obj) => {
                        if ((obj.cleanedArea !== undefined) && (obj.cleanedSeconds !== undefined)) {
                            if (this.getModel().isSupportedFeature('cleaninglog.channel')) {
                                if (this.getDevice().isNotCharging()) {
                                    (async () => {
                                        if (this.getModel().isSupportedFeature('info.dustbox') && (this.currentCleanedArea > 0)) {
                                            let diff = obj.cleanedArea - this.currentCleanedArea;
                                            if (diff > 0) {
                                                const squareMetersSinceLastDustboxRemoved = await this.getStateAsync('history.squareMetersSinceLastDustboxRemoved');
                                                if (squareMetersSinceLastDustboxRemoved) {
                                                    const squareMeters = Number(squareMetersSinceLastDustboxRemoved.val) + diff;
                                                    await this.setStateConditionalAsync('history.squareMetersSinceLastDustboxRemoved', squareMeters, true);
                                                }
                                            }
                                            diff = obj.cleanedSeconds - this.currentCleanedSeconds;
                                            if (diff > 0) {
                                                const cleaningTimeSinceLastDustboxRemoved = await this.getStateAsync('history.cleaningTimeSinceLastDustboxRemoved');
                                                if (cleaningTimeSinceLastDustboxRemoved) {
                                                    const cleaningTime = Number(cleaningTimeSinceLastDustboxRemoved.val) + diff;
                                                    await this.setStateConditionalAsync('history.cleaningTimeSinceLastDustboxRemoved', cleaningTime, true);
                                                    await this.setStateConditionalAsync('history.cleaningTimeSinceLastDustboxRemovedString', helper.getTimeStringFormatted(cleaningTime), true);
                                                }
                                            }
                                        }
                                        this.currentCleanedArea = obj.cleanedArea;
                                        this.setStateConditional('cleaninglog.current.cleanedArea', obj.cleanedArea, true);
                                        this.currentCleanedSeconds = obj.cleanedSeconds;
                                        this.setStateConditional('cleaninglog.current.cleanedSeconds', obj.cleanedSeconds, true);
                                        this.setStateConditional('cleaninglog.current.cleanedTime', helper.getTimeStringFormatted(obj.cleanedSeconds), true);
                                        if (obj.cleanType) {
                                            this.setStateConditional('cleaninglog.current.cleanType', obj.cleanType, true);
                                        }
                                    })();
                                }
                            }
                        }
                    });

                    this.vacbot.on('ThreeModuleStatus', (array) => {
                        this.createChannelNotExists('info.airPurifierModules', 'Air Purifier Modules (Airbot models)').then(() => {
                            const types = [];
                            types['uvLight'] = 'UV Sanitizing Filter';
                            types['smell'] = 'Air Freshener Module';
                            types['humidify'] = 'Fog-free Humidification Module';
                            for (const element of array) {
                                this.createObjectNotExists(
                                    'info.airPurifierModules.' + element.type, types[element.type],
                                    'string', 'value', false, '', '').then(() => {
                                    let status = '';
                                    if (element.state === 1) {
                                        status = element.work ? 'working' : 'installed';
                                    }
                                    this.setStateConditional('info.airPurifierModules.' + element.type, status, true);
                                });
                            }
                        });
                    });

                    this.vacbot.on('AirQuality', (object) => {
                        this.createChannelNotExists('info.airQuality', 'Air quality (Airbot models)').then(() => {
                            this.createObjectNotExists(
                                'info.airQuality.particulateMatter10', 'Particulate Matter 10 (PM10)',
                                'number', 'value', false, 0, 'μg/m3').then(() => {
                                this.setStateConditional('info.airQuality.particulateMatter10', object.particulateMatter10, true);
                            });
                            this.createObjectNotExists(
                                'info.airQuality.particulateMatter25', 'Particulate Matter 25 (PM25)',
                                'number', 'value', false, 0, 'μg/m3').then(() => {
                                this.setStateConditional('info.airQuality.particulateMatter25', object.particulateMatter25, true);
                            });
                            this.createObjectNotExists(
                                'info.airQuality.airQualityIndex', 'Air Quality Index',
                                'number', 'value', false, 0, '').then(() => {
                                this.setStateConditional('info.airQuality.airQualityIndex', object.airQualityIndex, true);
                            });
                            this.createObjectNotExists(
                                'info.airQuality.volatileOrganicCompounds', 'Volatile Organic Compounds Index',
                                'number', 'value', false, 0, '').then(() => {
                                this.setStateConditional('info.airQuality.volatileOrganicCompounds', object.volatileOrganicCompounds, true);
                            });
                            this.createObjectNotExists(
                                'info.airQuality.temperature', 'Temperature',
                                'number', 'value', false, 0, '°C').then(() => {
                                this.setStateConditional('info.airQuality.temperature', object.temperature, true);
                            });
                            this.createObjectNotExists(
                                'info.airQuality.humidity', 'Humidity',
                                'number', 'value', false, 0, '%').then(() => {
                                this.setStateConditional('info.airQuality.humidity', object.humidity, true);
                            });
                        });
                    });

                    this.vacbot.on('AtmoLight', (value) => {
                        (async () => {
                            await this.setObjectNotExistsAsync('control.extended.atmoLight', {
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
                            await this.setStateConditionalAsync('control.extended.atmoLight', Number(value), true);
                        })();
                    });

                    this.vacbot.on('AtmoVolume', (value) => {
                        (async () => {
                            await this.setObjectNotExistsAsync('control.extended.atmoVolume', {
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
                            await this.setStateConditionalAsync('control.extended.atmoVolume', Number(value), true);
                        })();
                    });

                    this.vacbot.on('AutonomousClean', (value) => {
                        this.createObjectNotExists(
                            'control.extended.autonomousClean', 'Self-linked Purification',
                            'boolean', 'value', true, Boolean(value), '').then(() => {
                            this.setStateConditional('control.extended.autonomousClean', Boolean(value), true);
                        });
                    });

                    this.vacbot.on('messageReceived', (value) => {
                        this.log.silly('Received message: ' + value);
                        const timestamp = helper.getUnixTimestamp();
                        this.setStateConditional('history.timestampOfLastMessageReceived', timestamp, true);
                        this.setStateConditional('history.dateOfLastMessageReceived', this.getCurrentDateAndTimeFormatted(), true);
                        if (this.connectedTimestamp > 0) {
                            const uptime = Math.floor((timestamp - this.connectedTimestamp) / 60);
                            this.setStateConditional('info.connectionUptime', uptime, true);
                        }
                    });

                    this.vacbot.on('HeaderInfo', (obj) => {
                        this.createObjectNotExists(
                            'info.firmwareVersion', 'Firmware version',
                            'string', 'value', false, '', '').then(() => {
                            this.setStateConditional('info.firmwareVersion', obj.fwVer, true);
                        });
                    });

                    this.vacbot.on('disconnect', (error) => {
                        this.error(`Received disconnect event from library: ${error.toString()}`);
                        if (this.connected && error) {
                            this.disconnect();
                            // This triggers a reconnect attempt
                            this.connectionFailed = true;
                        }
                    });

                    if ((!this.getGetPosInterval) && this.getModel().usesXmpp()) {
                        if ((this.getModel().isSupportedFeature('map.deebotPosition'))) {
                            this.getGetPosInterval = setInterval(() => {
                                if (this.getDevice().isCleaning() || this.getDevice().isReturning()) {
                                    this.vacbot.run('GetPosition');
                                }
                            }, 3000);
                        }
                    }
                });

                this.vacbot.connect();

                if (!this.getStatesInterval) {
                    setTimeout(() => {
                        this.vacbotInitialGetStates();
                    }, 6000);
                    this.getStatesInterval = setInterval(() => {
                        this.vacbotGetStatesInterval();
                    }, this.pollingInterval);
                }
            });
        }).catch((e) => {
            this.connectionFailed = true;
            this.error(e.message, true);
        });
    }

    setConnection(value) {
        this.setStateConditional('info.connection', value, true);
        if (value === false) {
            if (this.retrypauseTimeout) {
                clearTimeout(this.retrypauseTimeout);
            }
            if (this.getStatesInterval) {
                clearInterval(this.getStatesInterval);
                this.getStatesInterval = null;
            }
            if (this.getGetPosInterval) {
                clearInterval(this.getGetPosInterval);
                this.getGetPosInterval = null;
            }
        } else {
            this.connectedTimestamp = helper.getUnixTimestamp();
            this.setStateConditional('info.connectionUptime', 0, true);
        }
        this.connected = value;
    }

    resetCurrentStats() {
        if (this.getModel().usesMqtt()) {
            this.log.info('Reset current cleaninglog stats');
            this.setStateConditional('cleaninglog.current.cleanedArea', 0, true);
            this.setStateConditional('cleaninglog.current.cleanedSeconds', 0, true);
            this.setStateConditional('cleaninglog.current.cleanedTime', '0h 00m 00s', true);
            this.setStateConditional('cleaninglog.current.cleanType', '', true);
            this.currentCleanedSeconds = 0;
            this.currentCleanedArea = 0;
            this.silentApproach = {};
        }
    }

    resetErrorStates() {
        this.errorCode = '0';
        this.setStateConditional('info.errorCode', this.errorCode, true);
        this.setStateConditional('info.error', 'NoError: Robot is operational', true);
    }

    clearGoToPosition() {
        this.setStateConditional('control.extended.goToPosition', '', true);
        this.goToPositionArea = null;
    }

    async setInitialStateValues() {
        this.resetErrorStates();
        this.resetCurrentStats();
        await this.setStateConditionalAsync('info.library.debugMessage', '', true);
        let state;
        state = await this.getStateAsync('info.cleanstatus');
        if (state && state.val) {
            this.cleanstatus = state.val.toString();
        }
        state = await this.getStateAsync('info.chargestatus');
        if (state && state.val) {
            this.chargestatus = state.val.toString();
        }
        state = await this.getStateAsync('map.currentMapMID');
        if (state && state.val) {
            this.currentMapID = state.val.toString();
        }
        state = await this.getStateAsync('control.customArea_cleanings');
        if (state && state.val) {
            this.customAreaCleanings = Number(state.val);
        }
        state = await this.getStateAsync('control.spotArea_cleanings');
        if (state && state.val) {
            this.spotAreaCleanings = Number(state.val);
        }
        state = await this.getStateAsync('control.waterLevel');
        if (state && state.val) {
            this.waterLevel = Math.round(Number(state.val));
        }
        state = await this.getStateAsync('control.cleanSpeed');
        if (state && state.val) {
            this.cleanSpeed = Math.round(Number(state.val));
        }
        state = await this.getStateAsync('control.extended.pauseWhenEnteringSpotArea');
        if (state && state.val) {
            this.pauseWhenEnteringSpotArea = state.val.toString();
        }
        state = await this.getStateAsync('control.extended.pauseWhenLeavingSpotArea');
        if (state && state.val) {
            this.pauseWhenLeavingSpotArea = state.val.toString();
        }
        state = await this.getStateAsync('info.waterboxinfo');
        if (state && state.val) {
            this.waterboxInstalled = (state.val === true);
        }
        state = await this.getStateAsync('map.chargePosition');
        if (state && state.val) {
            this.chargePosition = state.val;
        }
        state = await this.getStateAsync('map.deebotPosition');
        if (state && state.val) {
            this.deebotPosition = state.val;
        }
        state = await this.getStateAsync('control.extended.pauseBeforeDockingChargingStation');
        if (state && state.val) {
            this.pauseBeforeDockingChargingStation = (state.val === true);
        }
        state = await this.getStateAsync('control.extended.pauseBeforeDockingChargingStation');
        if (state && state.val) {
            this.pauseBeforeDockingChargingStation = (state.val === true);
        }
        state = await this.getStateAsync('control.extended.resetCleanSpeedToStandardOnReturn');
        if (state && state.val) {
            this.resetCleanSpeedToStandardOnReturn = (state.val === true);
        }
        state = await this.getStateAsync('control.extended.cleaningClothReminder');
        if (state && state.val) {
            this.cleaningClothReminder.enabled = Boolean(Number(state.val));
        }
        state = await this.getStateAsync('control.extended.cleaningClothReminder_period');
        if (state && state.val) {
            this.cleaningClothReminder.period = Number(state.val);
        }

        await this.initLast20Errors();
        this.setPauseBeforeDockingIfWaterboxInstalled();
    }

    async initLast20Errors() {
        /** @type {Object} */
        const state = await this.getStateAsync('history.last20Errors');
        if (state && state.val) {
            if (state.val !== '') {
                /** @type {string} */
                const obj = state.val;
                this.last20Errors = JSON.parse(obj);
            }
        }
    }

    addToLast20Errors(code, error) {
        const obj = {
            'timestamp': helper.getUnixTimestamp(),
            'date': this.getCurrentDateAndTimeFormatted(),
            'code': code,
            'error': error
        };
        this.last20Errors.unshift(obj);
        if (this.last20Errors.length > 20) {
            this.last20Errors.pop();
        }
        this.setStateConditional('history.last20Errors', JSON.stringify(this.last20Errors), true);
    }

    setPauseBeforeDockingIfWaterboxInstalled() {
        this.getState('control.extended.pauseBeforeDockingIfWaterboxInstalled', (err, state) => {
            if (!err && state) {
                this.pauseBeforeDockingIfWaterboxInstalled = (state.val === true);
            }
        });
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

    setDeviceStatusByTrigger(trigger) {
        this.getDevice().setStatusByTrigger(trigger);
        this.setStateConditional('info.deviceStatus', this.getDevice().status, true);
        this.setStateConditional('status.device', this.getDevice().status, true);
        if (this.getDevice().isReturning() && this.resetCleanSpeedToStandardOnReturn) {
            if (this.getModel().isSupportedFeature('control.resetCleanSpeedToStandardOnReturn') &&
                this.getModel().isSupportedFeature('control.cleanSpeed')) {
                adapterCommands.runSetCleanSpeed(this, 2);
            }
        }
        this.setStateValuesOfControlButtonsByDeviceStatus();
    }

    setStateValuesOfControlButtonsByDeviceStatus() {
        let charge, stop, pause, clean;
        charge = stop = pause = clean = false;
        switch (this.getDevice().status) {
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
        this.setStateConditional('control.charge', charge, true);
        this.setStateConditional('control.stop', stop, true);
        this.setStateConditional('control.pause', pause, true);
        this.setStateConditional('control.clean', clean, true);
    }

    vacbotInitialGetStates() {
        this.commandQueue.addInitialGetCommands();
        this.commandQueue.addStandardGetCommands();
        this.commandQueue.runAll();
    }

    vacbotGetStatesInterval() {
        this.intervalQueue.addStandardGetCommands();
        this.intervalQueue.addAdditionalGetCommands();
        this.intervalQueue.runAll();
    }

    getDevice() {
        if (this.device) {
            return this.device;
        }
        this.device = new Device(this);
        return this.device;
    }

    getModel() {
        if (this.model && this.model.vacbot) {
            return this.model;
        }
        this.model = new Model(this.vacbot, this.config);
        return this.model;
    }

    getConfigValue(cv) {
        if (this.config[cv]) {
            return this.config[cv];
        }
        return '';
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
        this.addToLast20Errors(this.errorCode, message);
        this.setStateConditional('info.errorCode', this.errorCode, true);
        this.setStateConditional('info.error', message, true);
    }

    async createChannelNotExists(id, name) {
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
    async isCurrentSpotAreaPartOfCleaningProcess() {
        if (this.getDevice().isNotCleaning()) {
            return false;
        }
        if (this.cleanstatus !== 'spot_area') {
            return true;
        }
        if (this.currentSpotAreaID === 'unknown') {
            return false;
        }
        let spotAreaArray = [];
        const state = await this.getStateAsync('map.currentUsedSpotAreas');
        if (state && state.val) {
            spotAreaArray = state.val.toString().split(',');
        }
        const isPartOfCleaningProcess = spotAreaArray.includes(this.currentSpotAreaID);
        if (!isPartOfCleaningProcess) {
            this.log.debug('Spot Area ' + this.currentSpotAreaID + ' is not part of the cleaning process');
        }
        return isPartOfCleaningProcess;
    }

    getPauseBeforeDockingChargingStationAreaSize() {
        let areaSize = 500;
        if (this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize')) {
            areaSize = Number(this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize'));
        }
        return areaSize;
    }

    getPauseBeforeDockingSendPauseOrStop() {
        let sendPauseOrStop = 'pause';
        if (this.getConfigValue('feature.pauseBeforeDockingChargingStation.pauseOrStop')) {
            sendPauseOrStop = this.getConfigValue('feature.pauseBeforeDockingChargingStation.pauseOrStop');
        }
        return sendPauseOrStop;
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
    }

    downloadLastCleaningMapImage(imageUrl, configValue) {
        const axios = require('axios').default;
        const crypto = require('crypto');
        (async () => {
            let filename = '';
            if ((this.getModel().getModelType() === 'T9') || (this.getModel().getModelType() === 'X1')) {
                try {
                    const imageId = imageUrl.substring(imageUrl.lastIndexOf('=') + 1);
                    if (configValue === 1) {
                        filename = 'lastCleaningMapImage_' + imageId + '.png';
                    } else {
                        filename = 'lastestCleaningMapImage.png';
                    }

                    const sign = crypto.createHash('sha256').update(this.vacbot.getCryptoHashStringForSecuredContent()).digest('hex');

                    const headers = {
                        'Authorization': 'Bearer ' + this.vacbot.user_access_token,
                        'token': this.vacbot.user_access_token,
                        'appid': 'ecovacs',
                        'plat': 'android',
                        'userid': this.vacbot.uid,
                        'user-agent': 'EcovacsHome/2.3.7 (Linux; U; Android 5.1.1; A5010 Build/LMY48Z)',
                        'v': '2.3.7',
                        'country': this.vacbot.country,
                        'sign': sign,
                        'signType': 'sha256'
                    };
                    try {
                        const res = await axios.get(imageUrl, {
                            headers,
                            responseType: 'arraybuffer'
                        });
                        await this.writeFileAsync(this.namespace, filename, res.data);
                    } catch (err) {
                        this.log.error('Error downloading last cleaning map image: ' + err);
                    }
                } catch (e) {
                    this.log.warn('Error downloading last cleaning map image');
                }
            } else {
                const imageId = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
                if (configValue === 1) {
                    filename = 'lastCleaningMapImage_' + imageId + '.png';
                } else {
                    filename = 'lastestCleaningMapImage.png';
                }
                try {
                    const res = await axios.get(imageUrl, {
                        responseType: 'arraybuffer'
                    });
                    await this.writeFileAsync(this.namespace, filename, res.data);
                } catch (err) {
                    this.log.error('Error downloading last cleaning map image: ' + err);
                }
            }
            if (filename !== '') {
                await this.createObjectNotExists(
                    'cleaninglog.lastCleaningMapImageFile', 'Name of the png file',
                    'string', 'value', false, '', '');
                await this.setStateConditionalAsync('cleaninglog.lastCleaningMapImageFile', '/' + this.namespace + '/' + filename, true);
            }
        })();
    }

    async handleChangedCurrentSpotAreaID(spotAreaID) {
        const spotAreaChannel = 'map.' + this.currentMapID + '.spotAreas.' + spotAreaID;
        await this.setCurrentSpotAreaName(spotAreaID);
        if (this.getDevice().isCleaning()) {
            const timestamp = helper.getUnixTimestamp();
            this.currentSpotAreaData = {
                'spotAreaID': spotAreaID,
                'lastTimeEnteredTimestamp': timestamp
            };
            await this.handleCleanSpeedForSpotArea(spotAreaID);
            await this.handleWaterLevelForSpotArea(spotAreaID);
            await this.handleEnteringSpotArea(spotAreaID);
            await this.handleLeavingSpotArea(spotAreaID);
            this.setStateConditional(spotAreaChannel + '.lastTimeEnteredTimestamp', timestamp, true);
            this.log.info(`Entering '${this.currentSpotAreaName}' (spotAreaID: ${spotAreaID}, cleanStatus: '${this.cleanstatus})'`);
        } else {
            this.handleSilentApproach();
        }
    }

    async handleEnteringSpotArea(spotAreaID) {
        if (this.currentSpotAreaID && this.pauseWhenEnteringSpotArea) {
            if (parseInt(this.pauseWhenEnteringSpotArea) === parseInt(spotAreaID)) {
                if (this.getDevice().isNotPaused() && this.getDevice().isNotStopped()) {
                    this.commandQueue.run('pause');
                }
                this.pauseWhenEnteringSpotArea = '';
                this.setStateConditional('control.extended.pauseWhenEnteringSpotArea', '', true);
            }
        }
    }

    async handleLeavingSpotArea(spotAreaID) {
        if (this.currentSpotAreaID) {
            if (parseInt(spotAreaID) !== parseInt(this.currentSpotAreaID)) {
                if (this.pauseWhenLeavingSpotArea) {
                    if (parseInt(this.pauseWhenLeavingSpotArea) === parseInt(this.currentSpotAreaID)) {
                        if (this.getDevice().isNotPaused() && this.getDevice().isNotStopped()) {
                            this.commandQueue.run('pause');
                        }
                        this.pauseWhenLeavingSpotArea = '';
                        this.setStateConditional('control.extended.pauseWhenLeavingSpotArea', '', true);
                    }
                }
            }
        }
    }

    async setCurrentSpotAreaName(spotAreaID) {
        const state = await this.getStateAsync('map.' + this.currentMapID + '.spotAreas.' + spotAreaID + '.spotAreaName');
        if (state && state.val) {
            const spotAreaName = state.val.toString();
            this.currentSpotAreaName = mapHelper.getAreaName_i18n(this, spotAreaName);
        } else {
            this.currentSpotAreaName = '';
        }
        this.setStateConditional('map.deebotPositionCurrentSpotAreaName', this.currentSpotAreaName, true);
    }

    async handleCleanSpeedForSpotArea(spotAreaID) {
        const spotAreaChannel = 'map.' + this.currentMapID + '.spotAreas.' + spotAreaID;
        const spotAreaState = await this.getStateAsync(spotAreaChannel + '.cleanSpeed');
        if (spotAreaState && spotAreaState.val && (Number(spotAreaState.val) > 0) && (spotAreaState.val !== this.cleanSpeed)) {
            this.cleanSpeed = spotAreaState.val;
            this.setStateConditional('control.cleanSpeed', this.cleanSpeed, false);
            this.log.info('Set clean speed to ' + this.cleanSpeed + ' for spot area ' + spotAreaID);
        } else {
            const standardState = await this.getStateAsync('control.cleanSpeed_standard');
            if (standardState && standardState.val && (Number(standardState.val) > 0) && (standardState.val !== this.cleanSpeed)) {
                this.cleanSpeed = standardState.val;
                this.setStateConditional('control.cleanSpeed', this.cleanSpeed, false);
                this.log.info('Set clean speed to standard (' + this.cleanSpeed + ') for spot area ' + spotAreaID);
            }
        }
    }

    async handleWaterLevelForSpotArea(spotAreaID) {
        const spotAreaChannel = 'map.' + this.currentMapID + '.spotAreas.' + spotAreaID;
        if (this.waterboxInstalled) {
            const spotAreaState = await this.getStateAsync(spotAreaChannel + '.waterLevel');
            if (spotAreaState && spotAreaState.val && (Number(spotAreaState.val) > 0) && (spotAreaState.val !== this.waterLevel)) {
                this.waterLevel = spotAreaState.val;
                this.setStateConditional('control.waterLevel', this.waterLevel, false);
                this.log.info('Set water level to ' + this.waterLevel + ' for spot area ' + spotAreaID);
            } else {
                const standardState = await this.getStateAsync('control.waterLevel_standard');
                if (standardState && standardState.val && (Number(standardState.val) > 0) && (standardState.val !== this.waterLevel)) {
                    this.waterLevel = standardState.val;
                    this.setStateConditional('control.waterLevel', this.waterLevel, false);
                    this.log.info('Set water level to standard (' + this.waterLevel + ') for spot area ' + spotAreaID);
                }
            }
        }
    }

    handleSilentApproach() {
        if (this.silentApproach.mapSpotAreaID) {
            if ((Number(this.silentApproach.mapID) === Number(this.currentMapID)) &&
                (Number(this.silentApproach.mapSpotAreaID) === Number(this.currentSpotAreaID))) {
                if (this.silentApproach.mapSpotAreas && this.silentApproach.mapSpotAreas !== '') {
                    this.log.info(`Handle silent approach for 'spotArea_silentApproach'`);
                    this.log.info(`Reached spot area '${this.silentApproach.mapSpotAreaID}' - start cleaning spot areas '${this.silentApproach.mapSpotAreas}' now`);
                    adapterCommands.startSpotAreaCleaning(this, this.silentApproach.mapSpotAreas);
                } else {
                    this.log.info(`Handle silent approach for 'cleanSpotArea_silentApproach'`);
                    this.log.info(`Reached spot area '${this.silentApproach.mapSpotAreaID}' - start cleaning now`);
                    adapterCommands.cleanSpotArea(this, this.silentApproach.mapID, this.silentApproach.mapSpotAreaID);
                }
                this.silentApproach = {};
            } else {
                this.log.debug(`Handle silent approach, but spot area '${this.silentApproach.mapSpotAreaID}' not reached yet ...`);
            }
        }
    }

    async handlePositionObj(obj) {
        this.deebotPosition = obj.coords;
        const x = Number(obj.x);
        const y = Number(obj.y);
        this.setStateConditional('map.deebotPosition', this.deebotPosition, true);
        this.setStateConditional('map.deebotPosition_x', x, true);
        this.setStateConditional('map.deebotPosition_y', y, true);
        if (obj.a) {
            const angle = Number(obj.a);
            this.setStateConditional('map.deebotPosition_angle', angle, true);
        }
        this.deebotPositionIsInvalid = obj.invalid;
        this.setStateConditional('map.deebotPositionIsInvalid', this.deebotPositionIsInvalid, true);
        this.setStateConditional('map.deebotDistanceToChargePosition', obj.distanceToChargingStation, true);
        if (this.goToPositionArea) {
            if (mapHelper.positionIsInAreaValueString(x, y, this.goToPositionArea)) {
                this.vacbot.run('stop');
                this.clearGoToPosition();
            }
        }
        const pauseBeforeDockingIfWaterboxInstalled = this.pauseBeforeDockingIfWaterboxInstalled && this.waterboxInstalled;
        if (this.getDevice().isReturning() && (this.pauseBeforeDockingChargingStation || pauseBeforeDockingIfWaterboxInstalled)) {
            const areaSize = this.getPauseBeforeDockingChargingStationAreaSize();
            if (mapHelper.positionIsInRectangleForPosition(x, y, this.chargePosition, areaSize)) {
                if (this.getDevice().isNotPaused() && this.getDevice().isNotStopped()) {
                    this.commandQueue.run(this.getPauseBeforeDockingSendPauseOrStop());
                }
                this.setStateConditional('control.extended.pauseBeforeDockingChargingStation', false, true);
                this.pauseBeforeDockingChargingStation = false;
                this.pauseBeforeDockingIfWaterboxInstalled = false;
            }
        }
        await this.handleIsCurrentSpotAreaPartOfCleaningProcess();
    }

    async handleIsCurrentSpotAreaPartOfCleaningProcess() {
        if ((this.currentSpotAreaData.spotAreaID === this.currentSpotAreaID) && (this.currentSpotAreaData.lastTimeEnteredTimestamp > 0)) {
            const isCurrentSpotAreaPartOfCleaningProcess = await this.isCurrentSpotAreaPartOfCleaningProcess();
            if (isCurrentSpotAreaPartOfCleaningProcess) {
                await this.handleDurationForLastTimePresence();
            }
        }
    }

    async handleDurationForLastTimePresence() {
        const duration = helper.getUnixTimestamp() - this.currentSpotAreaData.lastTimeEnteredTimestamp;
        const lastTimePresenceThreshold = this.getConfigValue('feature.map.spotAreas.lastTimePresence.threshold') || 20;
        if (duration >= lastTimePresenceThreshold) {
            await mapObjects.createOrUpdateLastTimePresenceAndLastCleanedSpotArea(this, duration);
        }
    }

    async createInfoExtendedChannelNotExists() {
        return this.createChannelNotExists('info.extended', 'Extended information');
    }

    handleWaterBoxScrubbingType(value) {
        this.createObjectNotExists(
            'info.waterbox_scrubbingPattern', 'Scrubbing pattern',
            'string', 'value', false, '', '').then(() => {
            if (value >= 1) {
                this.scrubbingPattern = (value === 2) ? 'deep scrubbing' : 'quick scrubbing';
                this.setStateConditional('info.waterbox_scrubbingPattern', this.scrubbingPattern, true);
                adapterObjects.createControlScrubbingPatternIfNotExists(this).then(() => {
                    this.setStateConditional('control.extended.scrubbingPattern', value, true);
                });
            }
        });
    }
}

// @ts-ignore parent is a valid property on module
if (module && module.parent) {
    module.exports = (options) => new EcovacsDeebot(options);
} else {
    new EcovacsDeebot();
}
