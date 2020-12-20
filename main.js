'use strict';

const utils = require('@iobroker/adapter-core');
const ecovacsDeebot = require('ecovacs-deebot');
const nodeMachineId = require('node-machine-id');
const adapterObjects = require('./lib/adapterObjects');
const helper = require('./lib/adapterHelper');
const Model = require('./lib/deebotModel');
const Queue = require('./lib/adapterQueue');
const EcoVacsAPI = ecovacsDeebot.EcoVacsAPI;
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
        this.connectionFailed = false;
        this.connected = false;
        this.retries = 0;
        this.deviceNumber = 0;
        this.deviceClass = null;
        this.nick = null;
        this.customAreaCleanings = 1;
        this.spotAreaCleanings = 1;
        this.waterLevel = null;
        this.cleanSpeed = null;
        this.currentMapID = null;
        this.deebotPositionIsInvalid = true;
        this.deebotPositionCurrentSpotAreaID = 'unknown';
        this.goToPositionArea = null;
        this.chargePosition = null;
        this.pauseBeforeDockingChargingStation = false;
        this.pauseWhenEnteringSpotArea = null;
        this.pauseWhenLeavingSpotArea = null;
        this.canvasModuleIsInstalled = EcoVacsAPI.isCanvasModuleAvailable();

        this.commandQueue = new Queue(this, 'commandQueue');
        this.intervalQueue = new Queue(this, 'intervalQueue');
        this.cleaningQueue = new Queue(this, 'cleaningQueue', 0, false);

        this.lastChargingStatus = null;

        this.cleanstatus = null;
        this.chargestatus = null;
        this.deviceStatus = null;

        this.retrypauseTimeout = null;
        this.getStatesInterval = null;
        this.getGetPosInterval = null;

        this.pollingInterval = 60000;

        this.password = null;
    }

    async onReady() {
        adapterObjects.createInitialInfoObjects(this);

        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);

        this.getForeignObject('system.config', (err, obj) => {
            if (obj && obj.native && obj.native.secret) {
                this.password = helper.decrypt(obj.native.secret, this.config.password);
            } else {
                this.password = helper.decrypt('Zgfr56gFe87jJOM', this.config.password);
            }
            this.connect();
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
        this.setState('info.connection', false, true);
        this.connected = false;
        if (disconnectVacbot) {
            this.vacbot.disconnect();
        }
        this.log.info('cleaned everything up...');
    }

    onStateChange(id, state) {
        if (!state) return;
        if (!state.ack) {
            this.getObject(id, (err, obj) => {
                if ((!err) && (obj) && (obj.common.role === 'button')) {
                    this.log.debug('obj.common.role: ' + obj.common.role);
                    this.setState(id, false, true);
                }
            });
        }

        const MAX_RETRIES = 3;
        const RETRY_PAUSE = 6000;

        const stateName = helper.getStateNameById(id);
        const timestamp = Math.floor(Date.now() / 1000);
        const date = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');

        if (helper.getChannelNameById(id) !== 'history') {

            this.log.debug('state change ' + helper.getChannelNameById(id) + '.' + stateName + ' => ' + state.val);

            this.setState('history.timestampOfLastStateChange', timestamp, true);
            this.setState('history.dateOfLastStateChange', date, true);

            if ((stateName === 'error') && (this.connectionFailed)) {
                if ((!this.retrypauseTimeout) && (this.retries <= MAX_RETRIES)) {
                    this.retrypauseTimeout = setTimeout(() => {
                        this.reconnect();
                    }, RETRY_PAUSE);
                }
            }
        }

        const channelName = helper.getChannelNameById(id);
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

        if (channelName === 'map') {
            // spotarea cleaning (map-specific)
            const mapSpotAreaPattern = /cleanSpotArea/;
            if (mapSpotAreaPattern.test(id)) {
                if (state.ack) { //do not clean if command is not set by user
                    return;
                }
                const path = id.split('.');
                const mapID = parseInt(path[3]);
                const areaNumber = path[5];
                const model = new Model(this.vacbot.deviceClass, this.config);

                if (mapID === this.currentMapID && (!this.deebotPositionIsInvalid || !model.isSupportedFeature('map.deebotPositionIsInvalid'))) {
                    this.log.info('Start cleaning spot area: ' + areaNumber + ' on map ' + mapID );
                    this.vacbot.run('spotArea', 'start', areaNumber);
                    if (this.spotAreaCleanings > 1) {
                        this.cleaningQueue.createForId('control', 'spotArea', areaNumber);
                    }
                } else {
                    this.log.error('failed start cleaning spot area: ' + areaNumber + ' - position invalid or bot not on map ' + mapID + ' (current mapID: ' + this.currentMapID + ')');
                }
                return;
                //TODO: relocate if not correct map, queueing until relocate finished (async)
            }
            if (stateName === 'lastUsedCustomAreaValues_rerun') {
                if (!state.ack) {
                    this.getState('map.lastUsedCustomAreaValues', (err, state) => {
                        if ((!err) && (state) && (state.val)) {
                            this.startCustomArea(state.val, this.customAreaCleanings);
                        }
                    });
                }
                return;
            }

            if (id.split('.')[3] === 'savedCustomAreas') {
                if (!state.ack) {
                    const pattern = /map\.savedCustomAreas\.customArea_[0-9]{10}$/;
                    if (pattern.test(id)) {
                        this.getObject(id, (err, obj) => {
                            if ((!err) && (obj) && (obj.native) && (obj.native.area)) {
                                this.startCustomArea(obj.native.area, this.customAreaCleanings);
                            }
                        });
                        return;
                    }
                }
            }

            if (stateName === 'lastUsedCustomAreaValues_save') {
                if (!state.ack) {
                    this.getState('map.lastUsedCustomAreaValues', (err, state) => {
                        if ((!err) && (state) && (state.val)) {
                            this.createChannelNotExists('map.savedCustomAreas', 'Saved areas');
                            const timestamp = Math.floor(Date.now() / 1000);
                            let dateTime = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                            const savedAreaID = 'map.savedCustomAreas.customArea_' + timestamp;
                            const customAreaValues = state.val;
                            let currentMapID = this.currentMapID;
                            this.getObject('map.lastUsedCustomAreaValues', (err, obj) => {
                                if ((!err) && (obj)) {
                                    if ((obj.native) && (obj.native.dateTime) && (obj.native.currentMapID)) {
                                        dateTime = obj.native.dateTime;
                                        currentMapID = obj.native.currentMapID;
                                    }
                                    this.setObjectNotExists(
                                        savedAreaID, {
                                            type: 'state',
                                            common: {
                                                name: 'myAreaName (mapID ' + currentMapID + ', customArea ' + customAreaValues + ')',
                                                type: 'boolean',
                                                role: 'button',
                                                read: true,
                                                write: true,
                                                def: false,
                                                unit: ''
                                            },
                                            native: {
                                                area: customAreaValues,
                                                dateTime: dateTime,
                                                currentMapID: currentMapID
                                            }
                                        });
                                }
                            });
                        }
                    });
                }
                return;
            }
            if (stateName === 'saveVirtualBoundary') {
                if (!state.ack) {

                    this.createChannelNotExists('map.savedBoundaries', 'Saved virtual boundaries in the map for de-/activation');
                    const path = id.split('.');
                    const mapID = parseInt(path[3]);
                    const mssid = path[5];
                    const model = new Model(this.vacbot.deviceClass, this.config);
                    this.log.info('save virtual boundary: ' + mssid + ' on map ' + mapID );
                    //TODO save
                    return;
                }
            }

            if (stateName === 'deleteVirtualBoundary') {
                if (!state.ack) {

                    const path = id.split('.');
                    const mapID = parseInt(path[3]);
                    const mssid = path[5];
                    const model = new Model(this.vacbot.deviceClass, this.config);

                    if (!model.isSupportedFeature('map.deleteVirtualBoundary')) {
                        this.getState('map.'+mapID+'.virtualBoundaries.'+mssid+'.virtualBoundaryType', (err, state) => {
                            if ((!err) && (state) && (state.val)) {
                                this.log.info('delete virtual boundary: ' + mssid + ' on map ' + mapID );
                                this.vacbot.run('DeleteVirtualBoundary', mapID, mssid, state.val);
                            } else {
                                this.log.debug('delete virtual boundary not successful as no boundary type was found in map.'+mapID+'.virtualBoundaries.'+mssid+'.virtualBoundaryType');
                            } //could maybe optimized as boundaryType is not checked on delete
                        });

                    } else {
                        this.log.debug('delete virtual boundary not supported by model: ' + this.vacbot.deviceClass);
                    }
                    return;
                }
            }
        }

        const subChannelName = helper.getSubChannelNameById(id);
        if (subChannelName === 'move') {
            if (state.ack) {
                return;
            }
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
            if (state.ack) {
                return;
            }
            switch (stateName) {
                case 'volume': {
                    const volume = parseInt(state.val);
                    if ((volume >= 1) && (volume <= 10)) {
                        this.vacbot.run('setVolume', volume);
                    }
                    break;
                }
                case 'doNotDisturb': {
                    const doNotDisturb = state.val === true ? '1' : '0';
                    this.vacbot.run('SetOnOff', 'do_not_disturb', doNotDisturb);
                    this.log.info('set doNotDisturb: ' + state.val);
                    break;
                }
                case 'continuousCleaning': {
                    const continuousCleaning = state.val === true ? '1' : '0';
                    this.vacbot.run('SetOnOff', 'continuous_cleaning', continuousCleaning);
                    this.log.info('set continuousCleaning: ' + state.val);
                    return;
                }
                case 'goToPosition': {
                    const goToPositionValues = state.val.replace(/ /g, '');
                    if (helper.positionValueStringIsValid(goToPositionValues)) {
                        const accuracy = 150;
                        const goToAreaArray = goToPositionValues.split(',');
                        const x1 = parseInt(goToAreaArray[0]) - accuracy;
                        const y1 = parseInt(goToAreaArray[1]) - accuracy;
                        const x2 = parseInt(goToAreaArray[0]) + accuracy;
                        const y2 = parseInt(goToAreaArray[1]) + accuracy;
                        const goToAreaValues = x1 + ',' + y1 + ',' + x2 + ',' + y2;
                        this.goToPositionArea = goToAreaValues;
                        this.log.info('Go to position: ' + goToPositionValues);
                        this.startCustomArea(goToAreaValues, 1);
                    } else {
                        this.log.warn('Invalid input for go to position: ' + state.val);
                    }
                    break;
                }
                case 'pauseWhenEnteringSpotArea': {
                    if (helper.isSingleSpotAreaValue(state.val)) {
                        this.pauseWhenEnteringSpotArea = state.val;
                        this.log.info('Pause when entering spotArea ' + state.val);
                    }
                    break;
                }
                case 'pauseWhenLeavingSpotArea': {
                    if (helper.isSingleSpotAreaValue(state.val)) {
                        this.pauseWhenLeavingSpotArea = state.val;
                        this.log.info('Pause when leaving spotArea ' + state.val);
                    }
                    break;
                }
                case 'pauseBeforeDockingChargingStation': {
                    this.pauseBeforeDockingChargingStation = state.val;
                    if (state.val) {
                        this.log.info('Pause before docking onto charging station');
                    } else {
                        this.log.info('Do not pause before docking onto charging station');
                    }
                    break;
                }
            }
            return;
        }

        if (channelName === 'consumable') {
            if (state.ack) {
                return;
            }
            // control buttons
            switch (stateName) {
                case 'main_brush_reset':
                    this.log.debug('Reset main brush to 100%');
                    this.vacbot.run('ResetLifeSpan','main_brush');
                    break;
                case 'side_brush_reset':
                    this.log.debug('Reset side brush to 100%');
                    this.vacbot.run('ResetLifeSpan','side_brush');
                    break;
                case 'filter_reset':
                    this.log.debug('Reset filter to 100%');
                    this.vacbot.run('ResetLifeSpan','filter');
                    break;
                default:
                    this.log.warn('Unhandled consumable state: ' + stateName + ' - ' + id);
            }
        }

        if (channelName === 'control') {
            if (stateName === 'customArea_cleanings') {
                this.customAreaCleanings = state.val;
                return;
            }
            if (stateName === 'spotArea_cleanings') {
                this.spotAreaCleanings = state.val;
                return;
            }
            if (stateName === 'waterLevel') {
                this.waterLevel = Math.round(state.val);
                this.vacbot.run('SetWaterLevel', this.waterLevel);
                this.log.info('set water level: ' + this.waterLevel);
                return;
            }
            if (stateName === 'cleanSpeed') {
                this.cleanSpeed = Math.round(state.val);
                this.vacbot.run('SetCleanSpeed', this.cleanSpeed);
                this.log.info('set Clean Speed: ' + this.cleanSpeed);
                return;
            }

            if (state.ack) {
                return;
            }

            // spotarea cleaning (generic)
            const pattern = /spotArea_[0-9]{1,2}$/;
            if (pattern.test(id)) {
                // spotArea buttons
                const areaNumber = id.split('_')[1];
                this.vacbot.run('spotArea', 'start', areaNumber);
                this.log.info('Start cleaning spot area: ' + areaNumber);
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
                        break;
                    }
                    case 'customArea': {
                        let customAreaValues = state.val.replace(/ /g, '');
                        if (helper.areaValueStringWithCleaningsIsValid(customAreaValues)) {
                            const customAreaCleanings = customAreaValues.split(',')[4];
                            customAreaValues = customAreaValues.split(',', 4).toString();
                            this.startCustomArea(customAreaValues, customAreaCleanings);
                            this.setState('control.customArea_cleanings', customAreaCleanings, true);
                        } else if (helper.areaValueStringIsValid(customAreaValues)) {
                            this.startCustomArea(customAreaValues, this.customAreaCleanings);
                        } else {
                            this.log.warn('Invalid input for custom area: ' + state.val);
                        }
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
                case 'stop':
                case 'resume':
                case 'edge':
                case 'spot':
                case 'relocate':
                case 'charge':
                case 'playSound':
                    this.log.info('run: ' + stateName);
                    this.vacbot.run(stateName);
                    break;
                case 'playIamHere':
                    this.log.info('run: ' + stateName);
                    this.vacbot.run('playSound',30);
                    break;
                case 'pause':
                    this.getState('info.deviceStatus', (err, state) => {
                        if (!err && state) {
                            if (state.val === 'paused') {
                                this.log.info('resuming cleaning');
                                this.vacbot.run('resume');
                            } else {
                                this.log.info('cleaning paused');
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

    startCustomArea(areaValues, customAreaCleanings) {
        this.vacbot.run('customArea', 'start', areaValues, customAreaCleanings);
        this.log.info('start cleaning custom area: ' + areaValues + ' (' + customAreaCleanings + 'x)');
    }

    reconnect() {
        this.retrypauseTimeout = null;
        this.retries++;
        this.log.info('reconnecting (' +this.retries+ ') ...');
        this.connect();
    }

    async connect() {
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
            this.pollingInterval = this.config.pollingInterval;
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
                this.deviceClass = vacuum.deviceClass;
                this.nick = vacuum.nick ? vacuum.nick : 'New Device ' + this.deviceNumber;

                this.vacbot = api.getVacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent);

                adapterObjects.createInitialObjects(this);

                this.vacbot.on('ready', (event) => {

                    adapterObjects.createExtendedObjects(this);

                    this.setState('info.connection', true, true);
                    this.connected = true;
                    this.log.info(this.nick + ' successfully connected');
                    const libVersion = api.getVersion();
                    this.setStateConditional('info.version', this.version + ' (' + libVersion +')', true);
                    this.setStateConditional('info.canvasModuleIsInstalled', this.canvasModuleIsInstalled, true);
                    this.setStateConditional('info.deviceName', this.nick, true);
                    this.setStateConditional('info.deviceClass', this.vacbot.deviceClass, true);
                    this.setStateConditional('info.deviceModel', this.vacbot.deviceModel, true);
                    this.setStateConditional('info.deviceImageURL', this.vacbot.deviceImageURL, true);
                    const protocol = (this.vacbot.useMqtt) ? 'MQTT' : 'XMPP';
                    this.setStateConditional('info.communicationProtocol', protocol, true);
                    this.setStateConditional('info.deviceIs950type', this.vacbot.is950type(), true);
                    this.log.info('[vacbot] name: ' + this.vacbot.getDeviceProperty('name'));
                    this.retries = 0;
                    this.setInitialStateValues();

                    this.vacbot.on('ChargeState', (status) => {
                        if ((this.cleaningQueue.notEmpty()) && (this.lastChargingStatus !== status) && (status === 'returning')) {
                            this.log.debug('[queue] Received ChargeState event (returning)');
                            this.cleaningQueue.startNextItemFromQueue();
                            setTimeout(() => {
                                this.lastChargingStatus = null;
                                this.log.debug('[queue] Reset lastChargingStatus');
                            }, 3000);
                        } else {
                            this.getState('info.chargestatus', (err, state) => {
                                if (!err && state) {
                                    if (state.val !== status) {
                                        if (helper.isValidChargeStatus(status)) {
                                            this.chargestatus = status;
                                            this.setState('info.chargestatus', status, true);
                                            this.setDeviceStatusByTrigger('chargestatus');
                                            if (status === 'charging') {
                                                this.resetErrorStates();
                                                this.intervalQueue.addGetLifespan();
                                                this.intervalQueue.addGetCleanLogs();
                                                if (this.vacbot.hasSpotAreas() || this.vacbot.hasCustomAreas()) {
                                                    this.intervalQueue.add('GetMaps');
                                                }
                                                this.setState('history.timestampOfLastStartCharging', Math.floor(Date.now() / 1000), true);
                                                this.setState('history.dateOfLastStartCharging', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                                            }
                                        } else {
                                            this.log.warn('Unhandled chargestatus: ' + status);
                                        }
                                    }
                                }
                            });
                        }
                        this.lastChargingStatus = status;
                        this.vacbot.run('GetPosition');
                    });
                    this.vacbot.on('CleanReport', (status) => {
                        this.getState('info.cleanstatus', (err, state) => {
                            if (!err && state) {
                                if (state.val !== status) {
                                    if (helper.isValidCleanStatus(status)) {
                                        this.cleanstatus = status;
                                        this.setState('info.cleanstatus', status, true);
                                        this.setDeviceStatusByTrigger('cleanstatus');
                                        if (this.deviceStatus === 'cleaning') {
                                            this.resetErrorStates();
                                            this.intervalQueue.addGetLifespan();
                                            this.intervalQueue.addGetCleanLogs();
                                            if (this.vacbot.hasSpotAreas() || this.vacbot.hasCustomAreas()) {
                                                this.intervalQueue.add('GetMaps');
                                            }
                                            this.setState('history.timestampOfLastStartCleaning', Math.floor(Date.now() / 1000), true);
                                            this.setState('history.dateOfLastStartCleaning', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
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
                        if (this.waterLevel !== level) {
                            this.waterLevel = level;
                            this.setStateConditional('control.waterLevel', this.waterLevel, true);
                        }
                    });
                    this.vacbot.on('disconnect', (error) => {
                        if (this.connected) {
                            if (error) {
                                // This triggers a reconnect attempt
                                this.connectionFailed = true;
                            }
                            this.disconnect(false);
                        }
                    });
                    this.vacbot.on('WaterBoxInfo', (status) => {
                        const waterboxinfo = (parseInt(status) === 1);
                        this.setStateConditional('info.waterbox', waterboxinfo, true);
                    });
                    this.vacbot.on('DustCaseInfo', (status) => {
                        const dustCaseInfo = (parseInt(status) === 1);
                        this.setStateConditional('info.dustbox', dustCaseInfo, true);
                    });
                    this.vacbot.on('SleepStatus', (status) => {
                        const sleepStatus = (parseInt(status) === 1);
                        this.setStateConditional('info.sleepStatus', sleepStatus, true);
                    });
                    this.vacbot.on('CleanSpeed', (level) => {
                        if (this.cleanSpeed !== level) {
                            this.cleanSpeed = level;
                            this.setStateConditional('control.cleanSpeed', this.cleanSpeed, true);
                        }
                    });
                    this.vacbot.on('DoNotDisturbEnabled', (value) => {
                        const doNotDisturb = (parseInt(value) === 1);
                        this.setStateConditional('control.extended.doNotDisturb', doNotDisturb, true);
                    });
                    this.vacbot.on('ContinuousCleaningEnabled', (value) => {
                        const continuousCleaning = (parseInt(value) === 1);
                        this.setStateConditional('control.extended.continuousCleaning', continuousCleaning, true);
                    });
                    this.vacbot.on('Volume', (value) => {
                        this.setStateConditional('control.extended.volume', value, true);
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
                    this.vacbot.on('Error', (value) => {
                        this.setStateConditional('info.error', value, true);
                    });
                    this.vacbot.on('ErrorCode', (value) => {
                        this.setStateConditional('info.errorCode', value, true);
                    });
                    this.vacbot.on('Debug', (value) => {
                        this.setStateConditional('info.debugMessage', value, true);
                    });
                    this.vacbot.on('NetInfoIP', (value) => {
                        this.setStateConditional('info.ip', value, true);
                    });
                    this.vacbot.on('NetInfoWifiSSID', (value) => {
                        this.setStateConditional('info.wifiSSID', value, true);
                    });
                    this.vacbot.on('NetInfoWifiSignal', (value) => {
                        this.setStateConditional('info.wifiSignal', value, true);
                    });
                    this.vacbot.on('NetInfoMAC', (value) => {
                        this.setStateConditional('info.mac', value, true);
                    });
                    this.vacbot.on('RelocationState', (relocationState) => {
                        this.setStateConditional('map.relocationState', relocationState, true);
                    });
                    this.vacbot.on('DeebotPosition', (deebotPosition) => {
                        this.setStateConditional('map.deebotPosition', deebotPosition, true);
                        const x = deebotPosition.split(',')[0];
                        this.setStateConditional('map.deebotPosition_x', x, true);
                        const y = deebotPosition.split(',')[1];
                        this.setStateConditional('map.deebotPosition_y', y, true);
                        const a = deebotPosition.split(',')[2];
                        if (a) {
                            this.setStateConditional('map.deebotPosition_angle', a, true);
                        }
                        if (this.goToPositionArea) {
                            if (mapHelper.positionIsInAreaValueString(x, y, this.goToPositionArea)) {
                                this.vacbot.run('stop');
                                this.setStateConditional('control.goToPosition', '', true);
                                this.goToPositionArea = null;
                            }
                        }
                        if ((this.chargestatus === 'returning') && (this.pauseBeforeDockingChargingStation)) {
                            if (mapHelper.positionIsInRectangleForPosition(x, y, this.chargePosition)) {
                                this.vacbot.run('pause');
                                this.setStateConditional('control.pauseBeforeDockingChargingStation', false, true);
                                this.pauseBeforeDockingChargingStation = false;
                            }
                        }
                    });
                    this.vacbot.on('DeebotPositionIsInvalid', (deebotPositionIsInvalid) => {
                        this.deebotPositionIsInvalid = deebotPositionIsInvalid;
                        this.setStateConditional('map.deebotPositionIsInvalid', deebotPositionIsInvalid, true);
                    });
                    this.vacbot.on('DeebotPositionCurrentSpotAreaID', (deebotPositionCurrentSpotAreaID) => {
                        this.log.silly('[vacbot] DeebotPositionCurrentSpotAreaID: ' + deebotPositionCurrentSpotAreaID);
                        const suppressUnknownCurrentSpotArea = this.getConfigValue('workaround.suppressUnknownCurrentSpotArea');
                        if ((!suppressUnknownCurrentSpotArea) || (deebotPositionCurrentSpotAreaID !== 'unknown')) {
                            if (this.pauseWhenEnteringSpotArea) {
                                if (parseInt(this.pauseWhenEnteringSpotArea) === parseInt(deebotPositionCurrentSpotAreaID)) {
                                    this.vacbot.run('pause');
                                    this.pauseWhenEnteringSpotArea = null;
                                    this.setStateConditional('control.extended.pauseWhenEnteringSpotArea', '', true);
                                }
                            }
                            if (this.pauseWhenLeavingSpotArea) {
                                if (parseInt(deebotPositionCurrentSpotAreaID) !== parseInt(this.deebotPositionCurrentSpotAreaID)) {
                                    if (parseInt(this.pauseWhenLeavingSpotArea) === parseInt(this.deebotPositionCurrentSpotAreaID)) {
                                        this.vacbot.run('pause');
                                        this.pauseWhenLeavingSpotArea = null;
                                        this.setStateConditional('control.extended.pauseWhenLeavingSpotArea', '', true);
                                    }
                                }
                            }
                            this.deebotPositionCurrentSpotAreaID = deebotPositionCurrentSpotAreaID;
                            this.setStateConditional('map.deebotPositionCurrentSpotAreaID', deebotPositionCurrentSpotAreaID, true);
                        }
                    });
                    this.vacbot.on('ChargePosition', (chargePosition) => {
                        this.setStateConditional('map.chargePosition', chargePosition, true);
                    });
                    this.vacbot.on('CurrentMapName', (value) => {
                        this.setStateConditional('map.currentMapName', value, true);
                    });
                    this.vacbot.on('CurrentMapIndex', (value) => {
                        this.setStateConditional('map.currentMapIndex', value, true);
                    });
                    this.vacbot.on('CurrentMapMID', (value) => {
                        this.log.silly('[vacbot] CurrentMapMID: ' + value);
                        this.currentMapID = parseInt(value);
                        this.setStateConditional('map.currentMapMID', value, true);
                    });
                    this.vacbot.on('Maps', (maps) => {
                        this.log.debug('Maps: ' + JSON.stringify(maps));
                        mapHelper.processMaps(this, maps);
                    });
                    this.vacbot.on('MapSpotAreas', (areas) => {
                        this.log.debug('MapSpotAreas: ' + JSON.stringify(areas));
                        mapHelper.processSpotAreas(this, areas);
                    });
                    this.vacbot.on('MapSpotAreaInfo', (area) => {
                        this.log.debug('MapSpotAreaInfo: ' + JSON.stringify(area));
                        mapHelper.processSpotAreaInfo(this, area);
                    });
                    this.vacbot.on('MapVirtualBoundaries', (boundaries) => {
                        this.log.debug('MapVirtualBoundaries: ' + JSON.stringify(boundaries));
                        mapHelper.processVirtualBoundaries(this, boundaries);
                    });
                    this.vacbot.on('MapVirtualBoundaryInfo', (boundary) => {
                        this.log.debug('MapVirtualBoundaryInfo: ' + JSON.stringify(boundary));
                        mapHelper.processVirtualBoundaryInfo(this, boundary);
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
                    this.vacbot.on('CleanSum_totalSquareMeters', (meters) => {
                        this.log.silly('[vacbot] CleanSum_totalSquareMeters: ' + meters);
                        this.setStateConditional('cleaninglog.totalSquareMeters', meters, true);
                    });
                    this.vacbot.on('CleanSum_totalSeconds', (totalSeconds) => {
                        this.log.silly('[vacbot] CleanSum_totalSeconds: ' + totalSeconds);
                        this.setStateConditional('cleaninglog.totalSeconds', totalSeconds, true);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = Math.floor(totalSeconds % 60);
                        const totalTimeString = hours.toString() + 'h ' + ((minutes < 10) ? '0' : '') + minutes.toString() + 'm ' + ((seconds < 10) ? '0' : '') + seconds.toString() + 's';
                        this.setStateConditional('cleaninglog.totalTime', totalTimeString, true);
                    });
                    this.vacbot.on('CleanSum_totalNumber', (number) => {
                        this.log.silly('[vacbot] CleanSum_totalNumber: ' + number);
                        this.setStateConditional('cleaninglog.totalNumber', number, true);
                    });

                    this.vacbot.on('CleanLog', (json) => {
                        this.setStateConditional('cleaninglog.last20Logs', JSON.stringify(json), true);
                    });
                    this.vacbot.on('CleanLog_lastImageUrl', (url) => {
                        this.setStateConditional('cleaninglog.lastCleaningMapImageURL', url, true);
                    });
                    this.vacbot.on('CleanLog_lastImageTimestamp', (timestamp) => {
                        this.setStateConditional('cleaninglog.lastCleaningTimestamp', timestamp, true);
                    });

                    if ((!this.vacbot.useMqtt) && (!this.getGetPosInterval)) {
                        const model = new Model(this.vacbot.deviceClass, this.config);
                        this.log.silly('getGetPosInterval - deviceClass: ' + this.vacbot.deviceClass);
                        if ((model.isSupportedFeature('map.deebotPosition'))) {
                            this.getGetPosInterval = setInterval(() => {
                                this.vacbotRunGetPosition();
                            }, 6000);
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

    resetErrorStates() {
        this.setState('info.error', 'NoError: Robot is operational', true);
        this.setState('info.errorCode', '0', true);
    }

    setInitialStateValues() {
        this.resetErrorStates();

        this.getState('map.currentMapMID', (err, state) => {
            if (!err && state) {
                this.currentMapID = Number(state.val);
            }
        });
        if (this.config['workaround.batteryValue'] === true) {
            this.setState('info.battery', '', false);
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
        this.getState('map.chargePosition', (err, state) => {
            if (!err && state) {
                this.chargePosition = state.val;
            }
        });
    }

    setStateConditional(stateId, value, ack = true, native) {
        this.getState(stateId, (err, state) => {
            if (!err && state) {
                if (state.val !== value) {
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
    }

    setBatteryState(newValue, ack = true) {
        this.getState('info.battery', (err, state) => {
            if (!err && state) {
                if (this.config['workaround.batteryValue'] === true) {
                    if ((this.chargestatus === 'charging') && (newValue > Number(state.val)) || (!state.val)) {
                        this.setState('info.battery', newValue, ack);
                    } else if ((this.chargestatus !== 'charging') && (newValue < Number(state.val)) || (!state.val)) {
                        this.setState('info.battery', newValue, ack);
                    } else {
                        this.log.debug('Ignoring battery value: ' + newValue +' (current value: ' + state.val + ')');
                    }
                } else if (state.val !== newValue) {
                    this.setState('info.battery', newValue, ack);
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
        this.setState('info.deviceStatus', this.deviceStatus, true);
        this.setState('status.device', this.deviceStatus, true);
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
        const model = new Model(this.vacbot.deviceClass, this.config);
        this.commandQueue.add('GetCleanState', '');
        this.commandQueue.add('GetChargeState', '');
        this.commandQueue.add('GetBatteryState', '');
        this.commandQueue.add('GetPosition', '');
        this.commandQueue.add('GetChargerPos', '');
        if (model.isSupportedFeature('info.ip')) {
            this.commandQueue.add('GetNetInfo','');
        }
        if (this.vacbot.hasMoppingSystem()) {
            this.commandQueue.add('GetWaterBoxInfo','');
            this.commandQueue.add('GetWaterLevel','');
        }
        this.commandQueue.addGetLifespan();
        this.commandQueue.add('GetSleepStatus','');
        this.commandQueue.add('GetCleanSpeed','');
        this.commandQueue.addGetCleanLogs();
        if (this.vacbot.hasSpotAreas() || this.vacbot.hasCustomAreas()) {
            this.commandQueue.add('GetMaps');
        }
        if (model.isSupportedFeature('control.volume')) {
            this.commandQueue.add('GetVolume');
        }
        if (model.isSupportedFeature('control.doNotDisturb')) {
            this.commandQueue.add('GetOnOff', 'do_not_disturb');
        }
        if (model.isSupportedFeature('control.continuousCleaning')) {
            this.commandQueue.add('GetOnOff', 'continuous_cleaning');
        }

        this.commandQueue.runAll();
    }

    vacbotGetStatesInterval() {
        const model = new Model(this.vacbot.deviceClass, this.config);

        if (this.vacbot.hasMoppingSystem()) {
            this.intervalQueue.add('GetWaterLevel');
        }
        if (model.isSupportedFeature('cleaninglog.channel')) {
            this.intervalQueue.add('GetCleanSum');
        }
        //update position for currentSpotArea if supported and still unknown (after connect maps are not ready)
        if (this.vacbot.hasSpotAreas()
            && model.isSupportedFeature('map.deebotPosition')
            && model.isSupportedFeature('map.spotAreas')
            && model.isSupportedFeature('map.deebotPositionCurrentSpotAreaID')
            && (this.deebotPositionCurrentSpotAreaID === 'unknown')) {

            this.intervalQueue.add('GetPosition');
        }
        this.intervalQueue.add('GetSleepStatus');
        this.intervalQueue.add('GetCleanSpeed');
        if (model.isSupportedFeature('control.volume')) {
            this.intervalQueue.add('GetVolume');
        }
        if (model.isSupportedFeature('control.doNotDisturb')) {
            this.intervalQueue.add('GetOnOff', 'do_not_disturb');
        }
        if (model.isSupportedFeature('control.continuousCleaning')) {
            this.intervalQueue.add('GetOnOff', 'continuous_cleaning');
        }

        this.intervalQueue.runAll();
    }

    getConfigValue(cv) {
        if (this.config[cv]) {
            return this.config[cv];
        }
        return '';
    }

    error(message, stop) {
        if (stop) {
            this.setState('info.connection', false, true);
            this.connected = false;
        }
        const pattern = /code 0002/;
        if (pattern.test(message)) {
            this.setState('info.error', 'reconnecting', true);
        } else {
            this.setState('info.error', message, true);
            this.log.error(message);
        }
    }

    async createChannelNotExists(id, name) {
        this.setObjectNotExists(id, {
            type: 'channel',
            common: {
                name: name
            },
            native: {}
        });
    }

    deleteObjectIfExists(id) {
        this.getState(id, (err, state) => {
            if (!err && state) {
                this.delObject(id);
            }
        });
    }

    async createObjectNotExists(id, name, type, role, write, def, unit) {
        this.setObjectNotExists(id, {
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
    }
}

// @ts-ignore parent is a valid property on module
if (module && module.parent) {
    module.exports = (options ) => new EcovacsDeebot(options);
} else {
    new EcovacsDeebot();
}
