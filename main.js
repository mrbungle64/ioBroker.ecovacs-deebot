'use strict';

const utils = require('@iobroker/adapter-core');
const sucks = require('ecovacs-deebot');
const nodeMachineId = require('node-machine-id');
const adapterObjects = require('./lib/adapterObjects');
const helper = require('./lib/adapterHelper');
const Model = require('./lib/deebotModel');
const Queue = require('./lib/adapterQueue');
const EcoVacsAPI = sucks.EcoVacsAPI;
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

        this.cleaningQueue = new Queue(this);
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
        }
        if (this.getGetPosInterval) {
            clearInterval(this.getGetPosInterval);
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
                    this.log.info('start cleaning spot area: ' + areaNumber + ' on map ' + mapID );
                    this.vacbot.run('spotArea', 'start', areaNumber);
                    if (this.spotAreaCleanings > 1) {
                        this.cleaningQueue.createQueueForId('control', 'spotArea', areaNumber);
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
                    this.log.info('Unhandled move cmd: ' + stateName + ' - ' + id);
            }
            return;
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
                this.log.info('start cleaning spot area: ' + areaNumber);
                return;
            }
            if (state.val !== '') {
                switch (stateName) {
                    case 'spotArea': {
                        this.vacbot.run(stateName, 'start', state.val);
                        this.log.info('start cleaning spot area(s): ' + state.val);
                        if (this.spotAreaCleanings > 1) {
                            this.cleaningQueue.createQueueForId(channelName, stateName, state.val);
                        }
                        break;
                    }
                    case 'customArea': {
                        let customAreaValues = state.val.replace(/ /g, '');
                        const patternWithCleanings = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,[1-2]$/;
                        const patternWithoutCleanings = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$/;
                        if (patternWithCleanings.test(customAreaValues)) {
                            const customAreaCleanings = customAreaValues.split(',')[4];
                            customAreaValues = customAreaValues.split(',', 4).toString();
                            this.startCustomArea(customAreaValues, customAreaCleanings);
                            this.setState('control.customArea_cleanings', customAreaCleanings, true);
                        } else if (patternWithoutCleanings.test(customAreaValues)) {
                            this.startCustomArea(customAreaValues, this.customAreaCleanings);
                        } else {
                            this.log.info('invalid input for custom area: ' + state.val);
                        }
                        break;
                    }
                }
            }

            if ((stateName === 'stop') && (stateName === 'charge')) {
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
                case 'spotArea':
                case 'customArea':
                    break;
                default:
                    this.log.info('Unhandled control state: ' + stateName + ' - ' + id);
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
        this.setState('info.error', '', true);

        if ((!this.config.email) || (!this.config.password) || (!this.config.countrycode)) {
            this.error('Missing values in adapter config', true);
            return;
        }
        if (this.config.deviceNumber) {
            this.deviceNumber = this.config.deviceNumber;
        } else {
            this.log.info('Missing device Number in adapter config. Using value 0');
        }
        const password_hash = EcoVacsAPI.md5(this.password);
        const device_id = EcoVacsAPI.md5(nodeMachineId.machineIdSync());
        const countries = sucks.countries;
        const continent = countries[this.config.countrycode.toUpperCase()].continent.toLowerCase();
        if (this.config.pollingInterval) {
            this.pollingInterval = this.config.pollingInterval;
        }

        const api = new EcoVacsAPI(device_id, this.config.countrycode, continent);
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
                    this.setStateConditional('info.deviceName', this.nick, true);
                    this.setStateConditional('info.deviceClass', this.vacbot.deviceClass, true);
                    this.setStateConditional('info.deviceModel', this.vacbot.deviceModel, true);
                    this.setStateConditional('info.deviceImageURL', this.vacbot.deviceImageURL, true);
                    const protocol = (this.vacbot.useMqtt) ? 'MQTT' : 'XMPP';
                    this.setStateConditional('info.communicationProtocol', protocol, true);
                    this.log.info('[vacbot] name: ' + this.vacbot.getDeviceProperty('name'));
                    this.retries = 0;
                    this.setInitialStateValues();

                    this.vacbot.on('ChargeState', (status) => {
                        if ((!this.cleaningQueue.isEmpty()) && (status === 'returning')) {
                            this.log.debug('[queue] Received ChargeState event (returning)');
                            if  (this.lastChargingStatus !== status) {
                                this.cleaningQueue.startNextItemFromQueue();
                                setTimeout(() => {
                                    this.lastChargingStatus = null;
                                    this.log.info('[queue] Reset lastChargingStatus');
                                }, 3000);
                            }
                        } else {
                            this.getState('info.chargestatus', (err, state) => {
                                if (!err && state) {
                                    if (state.val !== status) {
                                        if (helper.isValidChargeStatus(status)) {
                                            this.chargestatus = status;
                                            this.setState('info.chargestatus', status, true);
                                            this.setDeviceStatusByTrigger('chargestatus');
                                            this.setStatus(status);
                                            if (status === 'charging') {
                                                this.resetErrorStates();
                                                this.setState('history.timestampOfLastStartCharging', Math.floor(Date.now() / 1000), true);
                                                this.setState('history.dateOfLastStartCharging', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                                            }
                                        } else {
                                            this.log.info('Unhandled chargestatus: ' + status);
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
                                        this.setStatus(status);
                                        if (this.deviceStatus === 'cleaning') {
                                            this.setState('info.error', '', true);
                                            this.setState('history.timestampOfLastStartCleaning', Math.floor(Date.now() / 1000), true);
                                            this.setState('history.dateOfLastStartCleaning', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                                        }
                                    } else {
                                        this.log.info('Unhandled cleanstatus: ' + status);
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
                    });
                    this.vacbot.on('DeebotPositionIsInvalid', (deebotPositionIsInvalid) => {
                        this.deebotPositionIsInvalid = deebotPositionIsInvalid;
                        this.setStateConditional('map.deebotPositionIsInvalid', deebotPositionIsInvalid, true);
                    });
                    this.vacbot.on('DeebotPositionCurrentSpotAreaID', (deebotPositionCurrentSpotAreaID) => {
                        this.deebotPositionCurrentSpotAreaID = deebotPositionCurrentSpotAreaID;
                        this.setStateConditional('map.deebotPositionCurrentSpotAreaID', deebotPositionCurrentSpotAreaID, true);
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
                    this.vacbot.on('LastUsedAreaValues', (values) => {
                        const dateTime = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                        const pattern = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$/;
                        if (pattern.test(values)) {
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
                        this.setStateConditional('cleaninglog.totalSquareMeters', meters, true);
                    });
                    this.vacbot.on('CleanSum_totalSeconds', (totalSeconds) => {
                        this.setStateConditional('cleaninglog.totalSeconds', totalSeconds, true);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = Math.floor(totalSeconds % 60);
                        const totalTimeString = hours.toString() + 'h ' + ((minutes < 10) ? '0' : '') + minutes.toString() + 'm ' + ((seconds < 10) ? '0' : '') + seconds.toString() + 's';
                        this.setStateConditional('cleaninglog.totalTime', totalTimeString, true);
                    });
                    this.vacbot.on('CleanSum_totalNumber', (number) => {
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
                        this.log.info('getGetPosInterval - deviceClass: ' + this.vacbot.deviceClass);
                        if ((model.isSupportedFeature('map.deebotPosition'))) {
                            this.getGetPosInterval = setInterval(() => {
                                const getCleanSum = model.isSupportedFeature('cleaninglog.channel');
                                this.vacbotRunGetPosition(getCleanSum);
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
        this.setState('info.error', '', false);
        this.setState('info.errorCode', '0', false);
    }

    resetStatusStates() {
        this.setState('info.chargestatus', 'unknown', false);
        this.setState('info.cleanstatus', 'unknown', false);
        this.setState('info.deviceStatus', 'unknown', false);
        this.setState('status.device', 'unknown', false);
    }

    setInitialStateValues() {
        this.resetErrorStates();
        this.resetStatusStates();

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

    setStatus(status) {
        const deviceStatus = helper.getDeviceStatusByStatus(status);
        this.setState('status.device', deviceStatus, true);
    }

    setDeviceStatusByTrigger(trigger) {
        if ((trigger === 'cleanstatus') && (this.cleanstatus === 'stop')) {
            this.deviceStatus = 'stopped';
        }
        else if ((trigger === 'cleanstatus') && ((this.cleanstatus === 'pause') || (this.cleanstatus === 'paused'))) {
            this.deviceStatus = 'paused';
        }
        else if ((trigger === 'chargestatus') && (this.chargestatus === 'returning')) {
            this.deviceStatus = 'returning';
        }
        else if ((trigger === 'chargestatus') && ((this.cleanstatus === 'alert') || (this.cleanstatus === 'error'))) {
            this.deviceStatus = 'error';
        }
        else if ((trigger === 'chargestatus') && (this.chargestatus === 'charging')) {
            this.deviceStatus = 'charging';
        }
        else if ((this.cleanstatus === 'auto') || (this.cleanstatus === 'edge') || (this.cleanstatus === 'spot')) {
            this.deviceStatus = 'cleaning';
        }
        else if ((this.cleanstatus === 'spot_area') || (this.cleanstatus === 'custom_area') || (this.cleanstatus === 'single_room')) {
            this.deviceStatus = 'cleaning';
        }
        else if (this.cleanstatus === 'returning') {
            this.deviceStatus = 'returning';
        }
        else {
            this.deviceStatus = 'idle';
        }

        this.setState('info.deviceStatus', this.deviceStatus, true);
    }

    vacbotRunGetPosition(getCleanSum) {
        this.getState('info.deviceStatus', (err, state) => {
            if (!err && state) {
                if ((state.val === 'cleaning') || ((state.val === 'returning'))) {
                    this.vacbot.run('GetPosition');
                    if (getCleanSum) {
                        this.vacbot.run('GetCleanSum');
                    }
                }
            }
        });
    }

    vacbotInitialGetStates() {
        this.vacbot.run('GetCleanState');
        this.vacbot.run('GetChargeState');
        this.vacbot.run('GetBatteryState');
        this.vacbot.run('GetPosition');
        this.vacbot.run('GetChargerPos');
        this.vacbot.run('GetNetInfo');
        if (this.vacbot.hasMoppingSystem()) {
            this.vacbot.run('GetWaterBoxInfo');
        }
        if (this.vacbot.hasSpotAreas() || this.vacbot.hasCustomAreas()) {
            this.vacbot.run('GetMaps');
        }
        this.vacbotGetStatesInterval();
    }

    vacbotGetStatesInterval() {
        const model = new Model(this.vacbot.deviceClass, this.config);

        if (this.vacbot.hasMainBrush()) {
            this.vacbot.run('GetLifeSpan', 'main_brush');
        }
        this.vacbot.run('GetLifeSpan', 'side_brush');
        this.vacbot.run('GetLifeSpan', 'filter');
        if (this.vacbot.hasMoppingSystem()) {
            this.vacbot.run('GetWaterLevel');
        }
        //update position for currentSpotArea if supported and still unknown (after connect maps are not ready)
        if (this.vacbot.hasSpotAreas()
            && model.isSupportedFeature('map.deebotPosition')
            && model.isSupportedFeature('map.spotAreas')
            && model.isSupportedFeature('map.deebotPositionCurrentSpotAreaID')
            && (this.deebotPositionCurrentSpotAreaID === 'unknown')) {

            this.vacbot.run('GetPosition');
        }
        this.vacbot.run('GetError');
        this.vacbot.run('GetSleepStatus');
        if (model.isSupportedFeature('cleaninglog.channel')) {
            this.vacbot.run('GetCleanSum');
            if ((this.vacbot.useMqtt) && (this.vacbot.deviceClass !== 'yna5xi') && (this.vacbot.deviceClass !== 'vi829v') && (this.vacbot.deviceClass !== 'x5d34r')) {
                this.vacbot.run('GetLogApiCleanLogs');
            } else {
                if (this.config['workaround.lastCleaningAPICall'] === true) {
                    this.vacbot.run('GetCleanLogsWithoutLastInfo');
                    this.vacbot.run('GetLastCleanLogInfo');
                } else {
                    this.vacbot.run('GetCleanLogs');
                }
            }
        }
        this.vacbot.run('GetCleanSpeed');
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
