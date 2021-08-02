'use strict';

const utils = require('@iobroker/adapter-core');
const ecovacsDeebot = require('ecovacs-deebot');
const nodeMachineId = require('node-machine-id');
const adapterObjects = require('./lib/adapterObjects');
const helper = require('./lib/adapterHelper');
const Model = require('./lib/deebotModel');
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
        this.vacbot = null;
        this.model = null;
        this.connectionFailed = false;
        this.connected = false;
        this.connectedTimestamp = 0;
        this.timestampOfLastMessageReceived = 0;
        this.errorCode = '0';
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
        this.pauseWhenEnteringSpotArea = null;
        this.pauseWhenLeavingSpotArea = null;
        this.canvasModuleIsInstalled = EcoVacsAPI.isCanvasModuleAvailable();

        this.commandQueue = new Queue(this, 'commandQueue');
        this.intervalQueue = new Queue(this, 'intervalQueue');
        this.cleaningQueue = new Queue(this, 'cleaningQueue', 0, false);

        this.cleaningLogAcknowledged = false;

        this.lastChargeStatus = null;
        this.chargestatus = null;
        this.cleanstatus = null;
        this.deviceStatus = null;

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

        let stateName = helper.getStateNameById(id);
        if (!state.ack) {
            if (stateName === 'clean_home') {
                switch (this.deviceStatus) {
                    case 'paused':
                        stateName = 'resume';
                        this.setStateConditional(id, true, true);
                        break;
                    case 'cleaning':
                        stateName = 'charge';
                        this.setStateConditional(id, false, true);
                        break;
                    default:
                        stateName = 'clean';
                        this.setStateConditional(id, true, true);
                }
                this.log.debug('clean_home => ' + stateName);
            } else {
                this.getObject(id, (err, obj) => {
                    if ((!err) && (obj) && (obj.common.role === 'button')) {
                        this.setStateConditional(id, false, true);
                    }
                });
            }
        }

        const MAX_RETRIES = 3;
        const RETRY_PAUSE = 6000;
        const timestamp = Math.floor(Date.now() / 1000);
        const date = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');

        // id cropped by namespace
        const stateId = id.replace(this.namespace + '.', '');

        const channelName = helper.getChannelNameById(id);
        const subChannelName = helper.getSubChannelNameById(id);

        if (channelName !== 'history') {
            this.log.debug('state change ' + stateId + ' => ' + state.val);
            this.setStateConditional('history.timestampOfLastStateChange', timestamp, true);
            this.setStateConditional('history.dateOfLastStateChange', date, true);
            if ((stateName === 'error') && (this.connectionFailed)) {
                if ((!this.retrypauseTimeout) && (this.retries <= MAX_RETRIES)) {
                    this.retrypauseTimeout = setTimeout(() => {
                        this.reconnect();
                    }, RETRY_PAUSE);
                }
            }
        }

        if (!this.connected) {
            if (channelName === 'control') {
                this.getState(id, (err, state) => {
                    if ((!err) && (state) && (state.val)) {
                        this.log.info('Not connected yet... Skip control cmd: ' + stateName);
                    }
                });
            }
            return;
        }

        if (channelName === 'control') {
            if (stateName === 'customArea_cleanings') {
                this.customAreaCleanings = state.val;
                this.log.info('Set customArea_cleanings to ' + state.val);
                return;
            }
            if (stateName === 'spotArea_cleanings') {
                this.spotAreaCleanings = state.val;
                this.log.info('Set spotArea_cleanings to ' + state.val);
                return;
            }
        }

        if ((channelName === 'control') && (subChannelName === 'extended')) {
            switch (stateName) {
                case 'pauseWhenEnteringSpotArea': {
                    if (helper.isSingleSpotAreaValue(state.val)) {
                        this.pauseWhenEnteringSpotArea = state.val;
                        if (this.pauseWhenEnteringSpotArea) {
                            this.log.info('Pause when entering spotArea: ' + this.pauseWhenEnteringSpotArea);
                        }
                    }
                    break;
                }
                case 'pauseWhenLeavingSpotArea': {
                    if (helper.isSingleSpotAreaValue(state.val)) {
                        this.pauseWhenLeavingSpotArea = state.val;
                        if (this.pauseWhenLeavingSpotArea) {
                            this.log.info('Pause when leaving spotArea: ' + this.pauseWhenLeavingSpotArea);
                        }
                    }
                    break;
                }
                case 'pauseBeforeDockingChargingStation': {
                    this.pauseBeforeDockingChargingStation = state.val;
                    if (this.pauseBeforeDockingChargingStation) {
                        this.log.info('Pause before docking onto charging station');
                    } else {
                        this.log.info('Do not pause before docking onto charging station');
                    }
                    break;
                }
                case 'pauseBeforeDockingIfWaterboxInstalled': {
                    this.pauseBeforeDockingIfWaterboxInstalled = state.val;
                    if (state.val) {
                        this.log.info('Always pause before docking onto charging station if waterbox installed');
                    } else {
                        this.log.info('Do not pause before docking onto charging station if waterbox installed');
                    }
                    break;
                }
            }
        }

        // From here on the commands are handled
        // -------------------------------------
        if (state.ack) {
            return;
        }

        if (channelName === 'map') {

            if (stateName === 'lastUsedCustomAreaValues_save') {
                mapHelper.saveLastUsedCustomAreaValues(this);
                return;
            }
            if (stateName === 'currentSpotAreaValues_save') {
                mapHelper.saveCurrentSpotAreaValues(this);
                return;
            }
            if (stateName === 'lastUsedCustomAreaValues_rerun') {
                mapHelper.rerunLastUsedCustomAreaValues(this);
                return;
            }
            if (subChannelName === 'savedCustomAreas') {
                mapHelper.cleanSavedCustomArea(this, id);
                return;
            }
            if (subChannelName === 'savedSpotAreas') {
                mapHelper.cleanSavedSpotArea(this, id);
                return;
            }
            if (stateName === 'loadCurrentMapImage') {
                this.vacbot.run('GetMapImage', this.currentMapID, 'outline');
                return;
            }

            if (stateId.includes('map.savedBoundaries.virtualBoundary_')) {
                mapHelper.createVirtualBoundary(this, stateId);
                return;
            }
            if (stateId.includes('map.savedBoundarySets.virtualBoundarySet_')) {
                mapHelper.createVirtualBoundarySet(this, stateId);
                return;
            }

            const path = id.split('.');
            const mapID = path[3];
            const mssID = path[5];

            if (stateName === 'saveVirtualBoundarySet') {
                mapHelper.saveVirtualBoundarySet(this, mapID);
                return;
            }
            const mapSpotAreaPattern = /cleanSpotArea/;
            if (mapSpotAreaPattern.test(id)) {
                mapHelper.cleanSpotArea(this, mapID, mssID);
                return;
            }
            if (stateName === 'saveVirtualBoundary') {
                mapHelper.saveVirtualBoundary(this, mapID, mssID);
                return;
            }
            if (stateName === 'deleteVirtualBoundary') {
                mapHelper.deleteVirtualBoundary(this, mapID, mssID);
                return;
            }
            if (stateName === 'loadMapImage') {
                this.vacbot.run('GetMapImage', mapID, 'outline');
                return;
            }
            if ((parseInt(state.val) > 0) && (this.currentMapID === mapID) && (this.deebotPositionCurrentSpotAreaID === mssID)) {
                if (stateName === 'waterLevel') {
                    this.runSetWaterLevel(state.val);
                    return;
                }
                if (stateName === 'cleanSpeed') {
                    this.runSetCleanSpeed(state.val);
                    return;
                }
            }
        }

        if (subChannelName === 'move') {
            switch (stateName) {
                case 'forward':
                case 'left':
                case 'right':
                case 'backward':
                case 'turnAround':
                case 'spot':
                    this.log.info('move: ' + stateName);
                    this.vacbot.run('move' + stateName);
                    break;
                default:
                    this.log.warn('Unhandled move cmd: ' + stateName + ' - ' + id);
            }
            return;
        }

        if ((channelName === 'control') && (subChannelName === 'extended')) {
            switch (stateName) {
                case 'volume': {
                    const volume = parseInt(state.val);
                    if ((volume >= 1) && (volume <= 10)) {
                        this.vacbot.run('setVolume', volume);
                    }
                    break;
                }
                case 'advancedMode': {
                    const command = state.val === true ? 'EnableAdvancedMode' : 'DisableAdvancedMode';
                    this.vacbot.run(command);
                    break;
                }
                case 'doNotDisturb': {
                    const doNotDisturb = state.val === true ? '1' : '0';
                    this.vacbot.run('SetOnOff', 'do_not_disturb', doNotDisturb);
                    this.log.info('Set doNotDisturb: ' + state.val);
                    break;
                }
                case 'continuousCleaning': {
                    const continuousCleaning = state.val === true ? '1' : '0';
                    this.vacbot.run('SetOnOff', 'continuous_cleaning', continuousCleaning);
                    this.log.info('Set continuousCleaning: ' + state.val);
                    return;
                }
                case 'goToPosition': {
                    mapHelper.goToPosition(this, state);
                    break;
                }
            }
            return;
        }

        if (channelName === 'consumable') {
            // control buttons
            switch (stateName) {
                case 'main_brush_reset':
                    this.log.debug('Reset main brush to 100%');
                    this.commandQueue.add('ResetLifeSpan', 'main_brush');
                    break;
                case 'side_brush_reset':
                    this.log.debug('Reset side brush to 100%');
                    this.commandQueue.add('ResetLifeSpan', 'side_brush');
                    break;
                case 'filter_reset':
                    this.log.debug('Reset filter to 100%');
                    this.commandQueue.add('ResetLifeSpan', 'filter');
                    break;
                default:
                    this.log.warn('Unhandled consumable state: ' + stateName + ' - ' + id);
            }
            this.commandQueue.addGetLifespan();
            this.commandQueue.runAll();
        }

        if (channelName === 'control') {
            if (stateName === 'reconnect') {
                this.reconnect();
                return;
            }
            if (stateName === 'cleanSpeed') {
                this.runSetCleanSpeed(state.val);
                return;
            }
            if (stateName === 'cleanSpeed_reset') {
                mapHelper.resetCleanSpeedOrWaterLevel(this, 'cleanSpeed');
                return;
            }
            if (stateName === 'waterLevel') {
                this.runSetWaterLevel(state.val);
                return;
            }
            if (stateName === 'waterLevel_reset') {
                mapHelper.resetCleanSpeedOrWaterLevel(this, 'waterLevel');
                return;
            }

            // spotarea cleaning (generic)
            const pattern = /spotArea_[0-9]{1,2}$/;
            if (pattern.test(id)) {
                // spotArea buttons
                const areaNumber = id.split('_')[1];
                this.vacbot.run('spotArea', 'start', areaNumber);
                this.log.info('Start cleaning spot area: ' + areaNumber);
                this.clearGoToPosition();
                return;
            }
            if (state.val !== '') {
                switch (stateName) {
                    case 'spotArea': {
                        // 950 type models have native support for up to 2 spot area cleanings
                        if (this.vacbot.is950type() && (this.spotAreaCleanings === 2)) {
                            this.vacbot.run(stateName, 'start', state.val, this.spotAreaCleanings);
                            this.log.debug('Using API for running multiple spot area cleanings');
                        } else {
                            this.vacbot.run(stateName, 'start', state.val);
                            if (this.spotAreaCleanings > 1) {
                                this.log.debug('Using workaround for running multiple spot area cleanings');
                                this.cleaningQueue.createForId(channelName, stateName, state.val);
                            }
                        }
                        this.log.info('Start cleaning spot area(s): ' + state.val);
                        this.clearGoToPosition();
                        break;
                    }
                    case 'customArea': {
                        let customAreaValues = state.val.replace(/ /g, '');
                        if (helper.areaValueStringWithCleaningsIsValid(customAreaValues)) {
                            const customAreaCleanings = customAreaValues.split(',')[4];
                            customAreaValues = customAreaValues.split(',', 4).toString();
                            this.startCustomArea(customAreaValues, customAreaCleanings);
                            this.setStateConditional('control.customArea_cleanings', customAreaCleanings, true);
                        } else if (helper.areaValueStringIsValid(customAreaValues)) {
                            this.startCustomArea(customAreaValues, this.customAreaCleanings);
                        } else {
                            this.log.warn('Invalid input for custom area: ' + state.val);
                        }
                        this.clearGoToPosition();
                        break;
                    }
                }
            }

            if ((stateName === 'stop') && (stateName === 'charge')) {
                this.commandQueue.resetQueue();
                this.cleaningQueue.resetQueue();
            }

            // control buttons
            switch (stateName) {
                case 'clean':
                case 'edge':
                case 'spot':
                case 'stop':
                case 'charge':
                case 'relocate':
                    this.log.info('Run: ' + stateName);
                    this.vacbot.run(stateName);
                    this.clearGoToPosition();
                    break;
                case 'resume':
                case 'playSound':
                    this.log.info('Run: ' + stateName);
                    this.vacbot.run(stateName);
                    break;
                case 'playSoundId':
                    this.log.info('Run: ' + stateName + ' ' + state.val);
                    this.vacbot.run('playSound', state.val);
                    break;
                case 'playIamHere':
                    this.log.info('Run: ' + stateName);
                    this.vacbot.run('playSound', 30);
                    break;
                case 'pause':
                    this.getState('info.deviceStatus', (err, state) => {
                        if (!err && state) {
                            if (state.val === 'paused') {
                                this.log.info('Resuming cleaning');
                                this.vacbot.run('resume');
                            } else {
                                this.log.info('Cleaning paused');
                                this.vacbot.run('pause');
                            }
                        }
                    });
                    break;
                case 'volume':
                case 'spotArea':
                case 'customArea':
                case 'goToPosition':
                    break;
                default:
                    this.log.warn('Unhandled control state: ' + stateName + ' - ' + id);
            }
        }
    }

    runSetCleanSpeed(value) {
        this.cleanSpeed = Math.round(value);
        this.vacbot.run('SetCleanSpeed', this.cleanSpeed);
        this.log.info('Set Clean Speed: ' + this.cleanSpeed);
    }

    runSetWaterLevel(value) {
        this.waterLevel = Math.round(value);
        this.vacbot.run('SetWaterLevel', this.waterLevel);
        this.log.info('Set water level: ' + this.waterLevel);
    }

    startCustomArea(areaValues, customAreaCleanings) {
        this.vacbot.run('customArea', 'start', areaValues, customAreaCleanings);
        this.log.info('Start cleaning custom area: ' + areaValues + ' (' + customAreaCleanings + 'x)');
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

                this.log.info('Successfully connected to Ecovacs server');
                this.log.debug('Devices:' + JSON.stringify(devices));
                this.log.info('Number of devices: ' + Object.keys(devices).length);
                for (let d = 0; d < Object.keys(devices).length; d++) {
                    this.log.info('Device[' + d + ']: ' + JSON.stringify(devices[d]));
                }
                this.log.info('Using device Device[' + this.deviceNumber + ']');

                const vacuum = devices[this.deviceNumber];
                const nick = vacuum.nick ? vacuum.nick : 'New Device ' + this.deviceNumber;

                this.vacbot = api.getVacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent);

                (async () => {
                    await adapterObjects.createInitialObjects(this);
                })();

                this.vacbot.on('ready', () => {

                    (async () => {
                        await adapterObjects.createExtendedObjects(this);
                    })();

                    this.setConnection(true);
                    this.model = this.getModel();
                    this.log.info(nick + ' instance successfully connected');
                    this.setStateConditional('info.version', this.version, true);
                    this.setStateConditional('info.library.version', api.getVersion(), true);
                    this.setStateConditional('info.library.canvasModuleIsInstalled', this.canvasModuleIsInstalled, true);
                    this.setStateConditional('info.deviceName', nick, true);
                    this.setStateConditional('info.deviceClass', this.vacbot.deviceClass, true);
                    this.setStateConditional('info.deviceModel', this.vacbot.deviceModel, true);
                    this.setStateConditional('info.deviceImageURL', this.vacbot.deviceImageURL, true);
                    const protocol = (this.vacbot.useMqtt) ? 'MQTT' : 'XMPP';
                    this.setStateConditional('info.library.communicationProtocol', protocol, true);
                    this.setStateConditional('info.library.deviceIs950type', this.vacbot.is950type(), true);
                    this.log.info('[vacbot] name: ' + this.vacbot.getDeviceProperty('name'));
                    this.retries = 0;
                    this.setInitialStateValues();

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
                                                if (this.vacbot.hasSpotAreas() && this.getModel().isSupportedFeature('map')) {
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

                    this.vacbot.on('messageReceived', (date) => {
                        const timestamp = Math.floor(Date.parse(date) / 1000);
                        this.setStateConditional('history.timestampOfLastMessageReceived', timestamp, true);
                        this.timestampOfLastMessageReceived = timestamp;
                        this.setStateConditional('history.dateOfLastMessageReceived', this.formatDate(date, 'TT.MM.JJJJ SS:mm:ss'), true);
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
                                        if (this.deviceStatus === 'cleaning') {
                                            this.resetErrorStates();
                                            this.intervalQueue.addGetLifespan();
                                            this.intervalQueue.addGetCleanLogs();
                                            if (this.vacbot.hasSpotAreas() && this.getModel().isSupportedFeature('map')) {
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

                    this.vacbot.on('Volume', (value) => {
                        this.setStateConditional('control.extended.volume', Number(value), true);
                    });

                    this.vacbot.on('BatteryInfo', (batterystatus) => {
                        this.setBatteryState(batterystatus, true);
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
                        this.getState('info.error', (err, state) => {
                            if (!err && state) {
                                if (state.val !== obj.error) {
                                    if (obj.error === 'NoDustBox: Dust Bin Not installed') {
                                        if (this.getModel().isSupportedFeature('info.dustbox')) {
                                            this.setStateConditional('history.timestampOfLastTimeDustboxRemoved', Math.floor(Date.now() / 1000), true);
                                            this.setStateConditional('history.dateOfLastTimeDustboxRemoved', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                                        }
                                    } else if (obj.error === 'NoError: Robot is operational') {
                                        if (this.connected === false) {
                                            this.setConnection(true);
                                        }
                                    } else {
                                        this.log.warn('Error message received: ' + obj.error);
                                        if (obj.error === 'Recipient unavailable') {
                                            this.setConnection(false);
                                        }
                                    }
                                }
                            }
                            this.setStateConditional('info.errorCode', obj.code, true);
                            this.errorCode = obj.code;
                            this.setStateConditional('info.error', obj.error, true);
                        });
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
                        this.setStateConditional('map.deebotPosition', this.deebotPosition, true);
                        this.setStateConditional('map.deebotPosition_x', Number(obj.x), true);
                        this.setStateConditional('map.deebotPosition_y', Number(obj.y), true);
                        if (obj.a) {
                            this.setStateConditional('map.deebotPosition_angle', Number(obj.a), true);
                        }
                        this.deebotPositionIsInvalid = obj.invalid;
                        this.setStateConditional('map.deebotPositionIsInvalid', this.deebotPositionIsInvalid, true);
                        if (this.getModel().isSupportedFeature('map.chargePosition')) {
                            if (this.deebotPosition && this.chargePosition) {
                                const distance = mapHelper.getDistanceToChargeStation(this.deebotPosition, this.chargePosition);
                                this.setStateConditional('map.deebotDistanceToChargePosition', distance, true);
                            }
                        }
                        if (this.goToPositionArea) {
                            if (mapHelper.positionIsInAreaValueString(obj.x, obj.y, this.goToPositionArea)) {
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
                            if (mapHelper.positionIsInRectangleForPosition(obj.x, obj.y, this.chargePosition, areaSize)) {
                                if (this.deviceStatus !== 'paused') {
                                    this.commandQueue.run('pause');
                                }
                                this.setStateConditional('control.extended.pauseBeforeDockingChargingStation', false, true);
                                this.pauseBeforeDockingChargingStation = false;
                                this.pauseBeforeDockingIfWaterboxInstalled = false;
                            }
                        }
                    });

                    this.vacbot.on('DeebotPositionCurrentSpotAreaID', (currentSpotAreaID) => {
                        this.log.silly('[vacbot] DeebotPositionCurrentSpotAreaID: ' + currentSpotAreaID);
                        if (currentSpotAreaID !== 'unknown') {
                            if (this.deebotPositionCurrentSpotAreaID !== currentSpotAreaID) {
                                const spotAreaChannel = 'map.' + this.currentMapID + '.spotAreas.' + currentSpotAreaID;
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
                                        if (this.deviceStatus !== 'paused') {
                                            this.commandQueue.run('pause');
                                        }
                                        this.pauseWhenEnteringSpotArea = null;
                                        this.setStateConditional('control.extended.pauseWhenEnteringSpotArea', '', true);
                                    }
                                }
                                if (this.deebotPositionCurrentSpotAreaID && this.pauseWhenLeavingSpotArea) {
                                    if (parseInt(currentSpotAreaID) !== parseInt(this.deebotPositionCurrentSpotAreaID)) {
                                        if (parseInt(this.pauseWhenLeavingSpotArea) === parseInt(this.deebotPositionCurrentSpotAreaID)) {
                                            if (this.deviceStatus !== 'paused') {
                                                this.commandQueue.run('pause');
                                            }
                                            this.pauseWhenLeavingSpotArea = null;
                                            this.setStateConditional('control.extended.pauseWhenLeavingSpotArea', '', true);
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
                                if (!err && state) {
                                    const spotAreaName = mapHelper.getAreaName_i18n(this, state.val);
                                    this.setStateConditional('map.deebotPositionCurrentSpotAreaName', spotAreaName);
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
                    });

                    this.vacbot.on('LastUsedAreaValues', (values) => {
                        const dateTime = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                        if (helper.areaValueStringIsValid(values)) {
                            const customAreaValues = values.split(',', 4).map(
                                function (element) {
                                    return Number(parseInt(element).toFixed(0));
                                }
                            ).toString();
                            this.setStateConditional(
                                'map.lastUsedCustomAreaValues',
                                customAreaValues, true, {
                                    dateTime: dateTime,
                                    currentMapID: this.currentMapID
                                });
                        }
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
                        if ((this.deviceStatus === 'returning') || (this.deviceStatus === 'charging')) {
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

                    if ((!this.vacbot.useMqtt) && (!this.getGetPosInterval)) {
                        if ((this.getModel().isSupportedFeature('map.deebotPosition'))) {
                            this.getGetPosInterval = setInterval(() => {
                                this.vacbotRunGetPosition();
                            }, 3000);
                        }
                    }
                });

                this.vacbot.connect_and_wait_until_ready();

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
        this.setStateConditional('info.error', 'NoError: Robot is operational', true);
        this.setStateConditional('info.errorCode', '0', true);
    }

    clearGoToPosition() {
        this.setStateConditional('control.extended.goToPosition', '', true);
        this.goToPositionArea = null;
    }

    setInitialStateValues() {
        this.resetErrorStates();
        this.resetCurrentStats();
        this.setStateConditional('info.library.debugMessage', '', true);

        this.getState('map.currentMapMID', (err, state) => {
            if (!err && state && state.val) {
                this.currentMapID = state.val.toString();
            }
        });
        if (this.config['workaround.batteryValue'] === true) {
            this.setStateConditional('info.battery', '', true);
        }
        this.getState('control.customArea_cleanings', (err, state) => {
            if (!err && state) {
                this.customAreaCleanings = Number(state.val);
            }
        });
        this.getState('control.spotArea_cleanings', (err, state) => {
            if (!err && state) {
                this.spotAreaCleanings = Number(state.val);
            }
        });
        this.getState('control.waterLevel', (err, state) => {
            if (!err && state) {
                this.waterLevel = Math.round(Number(state.val));
            }
        });
        this.getState('control.cleanSpeed', (err, state) => {
            if (!err && state) {
                this.cleanSpeed = Math.round(Number(state.val));
            }
        });
        this.getState('control.extended.pauseWhenEnteringSpotArea', (err, state) => {
            if (!err && state) {
                this.pauseWhenEnteringSpotArea = state.val;
            }
        });
        this.getState('control.extended.pauseWhenLeavingSpotArea', (err, state) => {
            if (!err && state) {
                this.pauseWhenLeavingSpotArea = state.val;
            }
        });
        this.getState('control.extended.pauseBeforeDockingChargingStation', (err, state) => {
            if (!err && state) {
                this.pauseBeforeDockingChargingStation = (state.val === true);
            }
        });
        this.setPauseBeforeDockingIfWaterboxInstalled();
        this.getState('info.waterboxinfo', (err, state) => {
            if (!err && state) {
                this.waterboxInstalled = (state.val === true);
            }
        });
        this.getState('map.chargePosition', (err, state) => {
            if (!err && state) {
                this.chargePosition = state.val;
            }
        });
        this.getState('map.deebotPosition', (err, state) => {
            if (!err && state) {
                this.deebotPosition = state.val;
            }
        });
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

    setBatteryState(newValue, ack = true) {
        this.getState('info.battery', (err, state) => {
            if (!err && state) {
                if (this.config['workaround.batteryValue'] === true) {
                    if ((this.chargestatus === 'charging') && (newValue > Number(state.val)) || (!state.val)) {
                        this.setStateConditional('info.battery', newValue, ack);
                    } else if ((this.chargestatus !== 'charging') && (newValue < Number(state.val)) || (!state.val)) {
                        this.setStateConditional('info.battery', newValue, ack);
                    } else {
                        this.log.debug('Ignoring battery value: ' + newValue + ' (current value: ' + state.val + ')');
                    }
                } else if (state.val !== newValue) {
                    this.setStateConditional('info.battery', newValue, ack);
                }
            }
        });
    }

    setDeviceStatusByTrigger(trigger) {
        if ((trigger === 'chargestatus') && (this.chargestatus !== 'idle')) {
            this.deviceStatus = helper.getDeviceStatusByStatus(this.chargestatus);
        } else if (trigger === 'cleanstatus') {
            if (((this.cleanstatus === 'stop') || (this.cleanstatus === 'idle')) && (this.chargestatus === 'charging')) {
                this.deviceStatus = helper.getDeviceStatusByStatus(this.chargestatus);
            } else {
                this.deviceStatus = helper.getDeviceStatusByStatus(this.cleanstatus);
            }
        }
        this.setStateConditional('info.deviceStatus', this.deviceStatus, true);
        this.setStateConditional('status.device', this.deviceStatus, true);
        this.setStateValuesOfControlButtonsByDeviceStatus();
    }

    setStateValuesOfControlButtonsByDeviceStatus() {
        let charge, stop, pause, clean;
        charge = stop = pause = clean = false;
        switch (this.deviceStatus) {
            case 'charging':
                charge = true;
                stop = true;
                break;
            case 'paused':
                pause = true;
                break;
            case 'stopped':
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

    vacbotRunGetPosition() {
        this.getState('info.deviceStatus', (err, state) => {
            if (!err && state) {
                if ((state.val === 'cleaning') || ((state.val === 'returning'))) {
                    this.vacbot.run('GetPosition');
                }
            }
        });
    }

    vacbotInitialGetStates() {
        this.commandQueue.add('GetCleanState');
        this.commandQueue.add('GetChargeState');
        this.commandQueue.add('GetBatteryState');
        this.commandQueue.add('GetPosition');
        this.commandQueue.add('GetChargerPos');
        if (this.getModel().isSupportedFeature('info.network.ip')) {
            this.commandQueue.add('GetNetInfo');
        }
        if (this.getModel().isSupportedFeature('control.advancedMode')) {
            this.commandQueue.add('GetAdvancedMode');
        }
        if (this.vacbot.hasMoppingSystem()) {
            this.commandQueue.add('GetWaterBoxInfo');
            this.commandQueue.add('GetWaterLevel');
        }
        this.commandQueue.addGetLifespan();
        this.commandQueue.add('GetSleepStatus');
        if (this.vacbot.hasVacuumPowerAdjustment()) {
            this.commandQueue.add('GetCleanSpeed');
        }
        this.commandQueue.addGetCleanLogs();
        if (this.vacbot.hasSpotAreas() && this.getModel().isSupportedFeature('map')) {
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
            this.intervalQueue.add('GetWaterLevel');
        }
        if (this.getModel().isSupportedFeature('cleaninglog.channel')) {
            this.intervalQueue.add('GetCleanSum');
        }
        //update position for currentSpotArea if supported and still unknown (after connect maps are not ready)
        if (this.vacbot.hasSpotAreas()
            && this.getModel().isSupportedFeature('map.deebotPosition')
            && this.getModel().isSupportedFeature('map.spotAreas')
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
        if (this.getModel().isSupportedFeature('info.network.wifiSignal') && (this.deviceStatus === 'cleaning')) {
            this.intervalQueue.add('GetNetInfo');
        }
        if (this.getModel().isSupportedFeature('control.advancedMode')) {
            this.intervalQueue.add('GetAdvancedMode');
        }
        if (!this.cleaningLogAcknowledged) {
            this.intervalQueue.addGetCleanLogs();
        }

        this.intervalQueue.runAll();
    }

    getModel() {
        if (this.model && this.vacbot && (this.model.getDeviceClass() === this.vacbot.deviceClass)) {
            return this.model;
        } else if (this.vacbot) {
            this.model = new Model(this.vacbot.deviceClass, this.config);
            return this.model;
        } else {
            return new Model('', this.config);
        }
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
            this.setStateConditional('info.error', 'reconnecting', true);
        } else {
            this.setStateConditional('info.error', message, true);
            this.log.error(message);
        }
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
