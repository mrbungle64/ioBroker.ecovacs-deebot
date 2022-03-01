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
        this.timestampOfLastMessageReceived = 0;
        this.errorCode = null;
        this.retries = 0;
        this.deviceNumber = 0;
        this.customAreaCleanings = 1;
        this.spotAreaCleanings = 1;
        this.waterLevel = null;
        this.cleanSpeed = null;
        this.currentMapID = '';
        this.deebotPositionIsInvalid = true;
        this.deebotPositionCurrentSpotAreaID = 'unknown';
        this.goToPositionArea = null;
        this.deebotPosition = null;
        this.chargePosition = null;
        this.pauseBeforeDockingChargingStation = false;
        this.pauseBeforeDockingIfWaterboxInstalled = false;
        this.waterboxInstalled = null;
        this.pauseWhenEnteringSpotArea = '';
        this.pauseWhenLeavingSpotArea = '';
        this.canvasModuleIsInstalled = EcoVacsAPI.isCanvasModuleAvailable();

        this.commandQueue = new Queue(this, 'commandQueue');
        this.intervalQueue = new Queue(this, 'intervalQueue');
        this.cleaningQueue = new Queue(this, 'cleaningQueue', 0, false);

        this.cleaningLogAcknowledged = false;

        this.lastChargeStatus = null;
        this.chargestatus = null;
        this.cleanstatus = null;

        this.retrypauseTimeout = null;
        this.getStatesInterval = null;
        this.getGetPosInterval = null;

        this.pollingInterval = 60000;

        this.password = null;
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
                this.log.error('Error while handling state change for id ' + id + ' with value ' + state.val);
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
        const countries = ecovacsDeebot.countries;
        const continent = countries[this.config.countrycode.toUpperCase()].continent.toLowerCase();
        if (this.config.pollingInterval) {
            this.pollingInterval = Number(this.config.pollingInterval);
        }

        const api = new EcoVacsAPI(deviceId, this.config.countrycode, continent);
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
                        await adapterObjects.createExtendedObjects(this);
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
                    this.setStateConditional('info.deviceImageURL', this.getModel().getProductImageURL(), true);
                    this.setStateConditional('info.library.communicationProtocol', this.getModel().getProtocol(), true);
                    this.setStateConditional('info.library.deviceIs950type', this.getModel().is950type(), true);
                    this.log.info('[vacbot] product name: ' + this.getModel().getProductName());
                    this.retries = 0;

                    (async () => {
                        await this.setInitialStateValues();
                    })();

                    this.vacbot.on('ChargeState', (status) => {
                        if ((this.cleaningQueue.notEmpty()) && (this.lastChargeStatus !== status) && (status === 'returning')) {
                            this.log.debug('[queue] Received ChargeState event (returning)');
                            this.cleaningQueue.startNextItemFromQueue();
                            setTimeout(() => {
                                this.lastChargeStatus = null;
                                this.log.debug('[queue] Reset lastChargingStatus');
                            }, 3000);
                        } else {
                            this.getState('info.chargestatus', (err, state) => {
                                if (!err && state) {
                                    if (state.val !== status) {
                                        if (helper.isValidChargeStatus(status)) {
                                            this.chargestatus = status;
                                            this.setStateConditional('info.chargestatus', status, true);
                                            this.setDeviceStatusByTrigger('chargestatus');
                                            if (status === 'charging') {
                                                this.resetErrorStates();
                                                this.intervalQueue.addGetLifespan();
                                                this.intervalQueue.addGetCleanLogs();
                                                if (this.getModel().isMappingSupported()) {
                                                    this.intervalQueue.add('GetMaps');
                                                }
                                                this.setStateConditional('history.timestampOfLastStartCharging', Math.floor(Date.now() / 1000), true);
                                                this.setStateConditional('history.dateOfLastStartCharging', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                                            }
                                        } else {
                                            this.log.warn('Unhandled chargestatus: ' + status);
                                        }
                                    }
                                }
                            });
                        }
                        this.lastChargeStatus = status;
                        this.vacbot.run('GetPosition');
                    });

                    this.vacbot.on('messageReceived', (value) => {
                        this.log.silly('Received message: ' + value);
                        const timestamp = Math.floor(Date.now() / 1000);
                        this.setStateConditional('history.timestampOfLastMessageReceived', timestamp, true);
                        this.timestampOfLastMessageReceived = timestamp;
                        this.setStateConditional('history.dateOfLastMessageReceived', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                        if (this.connectedTimestamp > 0) {
                            const uptime = Math.floor((timestamp - this.connectedTimestamp) / 60);
                            this.setStateConditional('info.connectionUptime', uptime, true);
                        }
                    });

                    this.vacbot.on('CleanReport', (status) => {
                        this.getState('info.cleanstatus', (err, state) => {
                            if (!err && state) {
                                if (state.val !== status) {
                                    if (helper.isValidCleanStatus(status)) {
                                        this.cleanstatus = status;
                                        this.setStateConditional('info.cleanstatus', status, true);
                                        this.setDeviceStatusByTrigger('cleanstatus');
                                        this.setPauseBeforeDockingIfWaterboxInstalled();
                                        if (this.getDevice().isCleaning()) {
                                            this.resetErrorStates();
                                            this.intervalQueue.addGetLifespan();
                                            this.intervalQueue.addGetCleanLogs();
                                            if (this.getModel().isMappingSupported()) {
                                                this.intervalQueue.add('GetMaps');
                                            }
                                        }
                                    } else {
                                        this.log.warn('Unhandled cleanstatus: ' + status);
                                    }
                                }
                            }
                        });
                        this.vacbot.run('GetPosition');
                    });

                    this.vacbot.on('WaterLevel', (level) => {
                        this.waterLevel = level;
                        adapterObjects.createControlWaterLevelIfNotExists(this, 0, 'control.waterLevel_standard', 'Water level if no other value is set').then(() => {
                            adapterObjects.createControlWaterLevelIfNotExists(this, this.waterLevel).then(() => {
                                this.setStateConditional('control.waterLevel', this.waterLevel, true);
                            });
                        });
                    });

                    this.vacbot.on('disconnect', (error) => {
                        if (this.connected && error) {
                            this.disconnect();
                            // This triggers a reconnect attempt
                            this.connectionFailed = true;
                            this.error('Received disconnect event from library');
                        } else {
                            this.log.warn('Received disconnect event from library');
                        }
                    });

                    this.vacbot.on('WaterBoxInfo', (value) => {
                        this.waterboxInstalled = Boolean(Number(value));
                        this.setStateConditional('info.waterbox', this.waterboxInstalled, true);
                    });

                    this.vacbot.on('DustCaseInfo', (value) => {
                        const dustCaseInfo = Boolean(Number(value));
                        this.getState('info.dustbox', (err, state) => {
                            if (!err && state) {
                                if ((state.val !== value) && (value === false) && (this.getModel().isSupportedFeature('info.dustbox'))) {
                                    this.setStateConditional('history.timestampOfLastTimeDustboxRemoved', Math.floor(Date.now() / 1000), true);
                                    this.setStateConditional('history.dateOfLastTimeDustboxRemoved', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
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

                    this.vacbot.on('AutoEmpty', (value) => {
                        const autoEmpty = Boolean(Number(value));
                        this.setStateConditional('control.extended.autoEmpty', autoEmpty, true);
                    });

                    this.vacbot.on('Volume', (value) => {
                        this.setStateConditional('control.extended.volume', Number(value), true);
                    });

                    this.vacbot.on('BatteryInfo', (value) => {
                        this.getDevice().setBattery(Number(value));
                        this.setStateConditional('info.battery', this.getDevice().battery, true);
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

                    this.vacbot.on('LastError', (obj) => {
                        if (this.errorCode !== obj.code) {
                            if (obj.code === '110') {
                                // NoDustBox: Dust Bin Not installed
                                if (this.getModel().isSupportedFeature('info.dustbox')) {
                                    this.setStateConditional('history.timestampOfLastTimeDustboxRemoved', Math.floor(Date.now() / 1000), true);
                                    this.setStateConditional('history.dateOfLastTimeDustboxRemoved', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                                }
                            } else if (obj.code === '0') {
                                // NoError: Robot is operational
                                if (this.connected === false) {
                                    this.setConnection(true);
                                }
                            } else {
                                this.log.warn('Error message received: ' + obj.error);
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
                        this.setStateConditional('map.relocationState', relocationState, true);
                    });

                    this.vacbot.on('Position', (obj) => {
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
                        if ((this.chargestatus === 'returning') && (this.pauseBeforeDockingChargingStation || pauseBeforeDockingIfWaterboxInstalled)) {
                            let areaSize = 500;
                            if (this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize')) {
                                areaSize = Number(this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize'));
                            }
                            if (mapHelper.positionIsInRectangleForPosition(x, y, this.chargePosition, areaSize)) {
                                if (this.getDevice().isNotPaused()) {
                                    this.commandQueue.run('pause');
                                }
                                this.setStateConditional('control.extended.pauseBeforeDockingChargingStation', false, true);
                                this.pauseBeforeDockingChargingStation = false;
                                this.pauseBeforeDockingIfWaterboxInstalled = false;
                            }
                        }
                        if (this.getDevice().isCleaning() && this.deebotPositionCurrentSpotAreaID) {
                            const spotAreaChannel = 'map.' + this.currentMapID + '.spotAreas.' + this.deebotPositionCurrentSpotAreaID;
                            this.getStateAsync(spotAreaChannel + '.lastTimeEnteredTimestamp').then((state) => {
                                if (state && state.val && (state.val > 0)) {
                                    const timestamp = Math.floor(Date.now() / 1000);
                                    const diff = timestamp - Number(state.val);
                                    if (diff > 120) {
                                        this.setStateConditional(spotAreaChannel + '.lastTimePresenceTimestamp', timestamp, true);
                                        this.setStateConditional(spotAreaChannel + '.lastTimePresenceDateTime', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                                    }
                                }
                            });
                        }
                    });

                    this.vacbot.on('DeebotPositionCurrentSpotAreaID', (currentSpotAreaID) => {
                        this.log.silly('DeebotPositionCurrentSpotAreaID: ' + currentSpotAreaID);
                        if (currentSpotAreaID !== 'unknown') {
                            if (this.deebotPositionCurrentSpotAreaID !== currentSpotAreaID) {
                                const spotAreaChannel = 'map.' + this.currentMapID + '.spotAreas.' + currentSpotAreaID;
                                if (this.getDevice().isCleaning()) {
                                    this.setStateConditional(spotAreaChannel + '.lastTimeEnteredTimestamp', Math.floor(Date.now() / 1000), true);
                                    this.log.debug('Entering spot area with ID ' + currentSpotAreaID);
                                }
                                this.getStateAsync(spotAreaChannel + '.cleanSpeed').then((state) => {
                                    if (state && state.val && (state.val > 0) && (state.val !== this.cleanSpeed)) {
                                        this.cleanSpeed = state.val;
                                        this.setStateConditional('control.cleanSpeed', this.cleanSpeed, false);
                                        this.log.info('Set clean speed to ' + this.cleanSpeed + ' for spot area ' + currentSpotAreaID);
                                    } else {
                                        this.getStateAsync('control.cleanSpeed_standard').then((state) => {
                                            if (state && state.val && (state.val > 0) && (state.val !== this.cleanSpeed)) {
                                                this.cleanSpeed = state.val;
                                                this.setStateConditional('control.cleanSpeed', this.cleanSpeed, false);
                                                this.log.info('Set clean speed to standard (' + this.cleanSpeed + ') for spot area ' + currentSpotAreaID);
                                            }
                                        });
                                    }
                                });
                                if (this.waterboxInstalled === true) {
                                    this.getStateAsync(spotAreaChannel + '.waterLevel').then((state) => {
                                        if (state && state.val && (state.val !== this.waterLevel) && (state.val > 0)) {
                                            this.waterLevel = state.val;
                                            this.setStateConditional('control.waterLevel', this.waterLevel, false);
                                            this.log.info('Set water level to ' + this.waterLevel + ' for spot area ' + currentSpotAreaID);
                                        } else {
                                            this.getStateAsync('control.waterLevel_standard').then((state) => {
                                                if (state && state.val && (state.val !== this.waterLevel) && (state.val > 0)) {
                                                    this.waterLevel = state.val;
                                                    this.setStateConditional('control.waterLevel', this.waterLevel, false);
                                                    this.log.info('Set water level to standard (' + this.waterLevel + ') for spot area ' + currentSpotAreaID);
                                                }
                                            });
                                        }
                                    });
                                }
                                if (this.deebotPositionCurrentSpotAreaID && this.pauseWhenEnteringSpotArea) {
                                    if (parseInt(this.pauseWhenEnteringSpotArea) === parseInt(currentSpotAreaID)) {
                                        if (this.getDevice().isNotPaused()) {
                                            this.commandQueue.run('pause');
                                        }
                                        this.pauseWhenEnteringSpotArea = '';
                                        this.setStateConditional('control.extended.pauseWhenEnteringSpotArea', '', true);
                                    }
                                }
                                if (this.deebotPositionCurrentSpotAreaID) {
                                    if (parseInt(currentSpotAreaID) !== parseInt(this.deebotPositionCurrentSpotAreaID)) {
                                        const spotAreaChannelLeaving = 'map.' + this.currentMapID + '.spotAreas.' + this.deebotPositionCurrentSpotAreaID;
                                        if (this.getDevice().isCleaning()) {
                                            this.setStateConditional(spotAreaChannelLeaving + '.lastTimeLeavedTimestamp', Math.floor(Date.now() / 1000), true);
                                            this.log.debug('Leaving spot area with ID ' + this.deebotPositionCurrentSpotAreaID);
                                        }
                                        if (this.pauseWhenLeavingSpotArea) {
                                            if (parseInt(this.pauseWhenLeavingSpotArea) === parseInt(this.deebotPositionCurrentSpotAreaID)) {
                                                if (this.getDevice().isNotPaused()) {
                                                    this.commandQueue.run('pause');
                                                }
                                                this.pauseWhenLeavingSpotArea = '';
                                                this.setStateConditional('control.extended.pauseWhenLeavingSpotArea', '', true);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        const suppressUnknownCurrentSpotArea = this.getConfigValue('workaround.suppressUnknownCurrentSpotArea');
                        if ((!suppressUnknownCurrentSpotArea) || (currentSpotAreaID !== 'unknown')) {
                            this.deebotPositionCurrentSpotAreaID = currentSpotAreaID;
                            this.setStateConditional('map.deebotPositionCurrentSpotAreaID', currentSpotAreaID, true);
                            this.getState('map.' + this.currentMapID + '.spotAreas.' + currentSpotAreaID + '.spotAreaName', (err, state) => {
                                if (!err && state && state.val) {
                                    const spotAreaName = state.val.toString();
                                    const translatedSpotAreaName = mapHelper.getAreaName_i18n(this, spotAreaName);
                                    this.setStateConditional('map.deebotPositionCurrentSpotAreaName', translatedSpotAreaName);
                                } else {
                                    this.setStateConditional('map.deebotPositionCurrentSpotAreaName', 'unknown');
                                }
                            });
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
                        this.setStateConditional('history.timestampOfLastMapImageReceived', Math.floor(Date.now() / 1000), true);
                        this.setStateConditional('history.dateOfLastMapImageReceived', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                    });

                    this.vacbot.on('LastUsedAreaValues', (values) => {
                        const dateTime = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
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
                        this.getState('cleaninglog.last20Logs', (err, state) => {
                            if (!err && state) {
                                if (state.val !== JSON.stringify(json)) {
                                    this.setState('cleaninglog.last20Logs', JSON.stringify(json), true);
                                    this.cleaningLogAcknowledged = true;
                                }
                            }
                        });
                    });

                    this.vacbot.on('LastCleanLogs', (obj) => {
                        this.setStateConditional('cleaninglog.lastCleaningTimestamp', Number(obj.timestamp), true);
                        const lastCleaningDate = this.formatDate(new Date(obj.timestamp * 1000), 'TT.MM.JJJJ SS:mm:ss');
                        this.setStateConditional('cleaninglog.lastCleaningDate', lastCleaningDate, true);
                        this.setStateConditional('cleaninglog.lastTotalTimeString', obj.totalTimeFormatted, true);
                        this.setStateConditional('cleaninglog.lastSquareMeters', Number(obj.squareMeters), true);
                        if (this.getDevice().isReturning() || this.getDevice().isCharging()) {
                            this.resetCurrentStats();
                        }
                        if (obj.imageUrl) {
                            this.setStateConditional('cleaninglog.lastCleaningMapImageURL', obj.imageUrl, true);
                        }
                    });

                    this.vacbot.on('CurrentStats', (obj) => {
                        if (obj.cleanedArea) {
                            this.setStateConditional('cleaninglog.current.cleanedArea', obj.cleanedArea, true);
                        }
                        if (obj.cleanedSeconds) {
                            this.setStateConditional('cleaninglog.current.cleanedSeconds', obj.cleanedSeconds, true);
                            this.setStateConditional('cleaninglog.current.cleanedTime', helper.getTimeStringFormatted(obj.cleanedSeconds), true);
                        }
                        if (obj.cleanType) {
                            this.setStateConditional('cleaninglog.current.cleanType', obj.cleanType, true);
                        }
                    });

                    this.vacbot.on('HeaderInfo', (obj) => {
                        this.createObjectNotExists(
                            'info.firmwareVersion', 'Firmware version',
                            'string', 'value', false, '', '').then(() => {
                            this.setStateConditional('info.firmwareVersion', obj.fwVer, true);
                        });
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
            this.connectedTimestamp = Math.floor(Date.now() / 1000);
            this.setStateConditional('info.connectionUptime', 0, true);
        }
        this.connected = value;
    }

    resetCurrentStats() {
        if (this.vacbot.useMqtt) {
            this.setStateConditional('cleaninglog.current.cleanedArea', 0, true);
            this.setStateConditional('cleaninglog.current.cleanedSeconds', 0, true);
            this.setStateConditional('cleaninglog.current.cleanedTime', '0h 00m 00s', true);
            this.setStateConditional('cleaninglog.current.cleanType', '', true);
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
        this.setPauseBeforeDockingIfWaterboxInstalled();
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
                    if ((ack && !state.ack) || (state.val !== value) || native) {
                        this.setState(stateId, value, ack);
                        if (native) {
                            this.extendObject(
                                stateId, {
                                    native: native
                                });
                        }
                    } else {
                        this.log.silly('setStateConditional: ' + stateId + ' unchanged');
                    }
                }
            });
        } else {
            this.log.warn('setStateConditionalAsync() id not valid: ' + stateId);
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
        this.commandQueue.add('GetCleanState');
        this.commandQueue.add('GetChargeState');
        this.commandQueue.add('GetBatteryState');
        if (this.getModel().isMappingSupported()) {
            this.commandQueue.add('GetPosition');
            this.commandQueue.add('GetChargerPos');
        }
        if (this.getModel().isSupportedFeature('info.network.ip')) {
            this.commandQueue.add('GetNetInfo');
        }
        if (this.getModel().isSupportedFeature('control.advancedMode')) {
            this.commandQueue.add('GetAdvancedMode');
        }
        if (this.getModel().isSupportedFeature('control.autoEmptyStation')) {
            this.commandQueue.add('GetAutoEmpty');
        }
        if (this.vacbot.hasMoppingSystem()) {
            this.commandQueue.add('GetWaterBoxInfo');
            if (this.getModel().is950type()) {
                this.commandQueue.add('GetWaterLevel');
            }
        }
        this.commandQueue.addGetLifespan();
        this.commandQueue.add('GetSleepStatus');
        if (this.vacbot.hasVacuumPowerAdjustment()) {
            this.commandQueue.add('GetCleanSpeed');
        }
        this.commandQueue.addGetCleanLogs();
        if (this.getModel().isMappingSupported()) {
            this.commandQueue.add('GetMaps');
        }
        this.commandQueue.addOnOff();
        if (this.getModel().isSupportedFeature('control.volume')) {
            this.commandQueue.add('GetVolume');
        }

        this.commandQueue.runAll();
    }

    vacbotGetStatesInterval() {
        if (this.vacbot.hasMoppingSystem()) {
            this.intervalQueue.add('GetWaterBoxInfo');
            if (this.getModel().is950type()) {
                this.intervalQueue.add('GetWaterLevel');
            }
        }
        if (this.getModel().isSupportedFeature('cleaninglog.channel')) {
            this.intervalQueue.add('GetCleanSum');
        }
        //update position for currentSpotArea if supported and still unknown (after connect maps are not ready)
        if (this.getModel().isMappingSupported()
            && this.getModel().isSupportedFeature('map.deebotPositionCurrentSpotAreaID')
            && (this.deebotPositionCurrentSpotAreaID === 'unknown')) {

            this.intervalQueue.add('GetPosition');
        }
        this.intervalQueue.add('GetSleepStatus');
        if (this.vacbot.hasVacuumPowerAdjustment()) {
            this.intervalQueue.add('GetCleanSpeed');
        }
        this.intervalQueue.addOnOff();
        if (this.getModel().isSupportedFeature('control.volume')) {
            this.intervalQueue.add('GetVolume');
        }
        if (this.getModel().isSupportedFeature('info.network.wifiSignal') && this.getDevice().isCleaning()) {
            this.intervalQueue.add('GetNetInfo');
        }
        if (this.getModel().isSupportedFeature('control.advancedMode')) {
            this.intervalQueue.add('GetAdvancedMode');
        }
        if (this.getModel().isSupportedFeature('control.autoEmptyStation')) {
            this.intervalQueue.add('GetAutoEmpty');
        }
        if (!this.cleaningLogAcknowledged) {
            this.intervalQueue.addGetCleanLogs();
        }

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
}

// @ts-ignore parent is a valid property on module
if (module && module.parent) {
    module.exports = (options) => new EcovacsDeebot(options);
} else {
    new EcovacsDeebot();
}
