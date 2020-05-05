'use strict';

const utils = require('@iobroker/adapter-core');
const sucks = require('ecovacs-deebot');
const nodeMachineId = require('node-machine-id');
const Model = require('./lib/deebotModel');
const EcoVacsAPI = sucks.EcoVacsAPI;
const mapHelper = require('./lib/mapHelper');
const adapter = utils.Adapter ('ecovacs-deebot');

function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

class EcovacsDeebot extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'ecovacs-deebot',
        });

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
        this.cleanings = 1;
        this.waterLevel = null;
        this.cleanSpeed = null;
        this.currentMapID = null;
        this.deebotPositionIsInvalid = true;
        this.deebotPositionCurrentSpotAreaID = 'unknown'

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
        this.createInitialInfoObjects();

        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);

        this.getForeignObject('system.config', (err, obj) => {
            if (obj && obj.native && obj.native.secret) {
                this.password = decrypt(obj.native.secret, this.config.password);
            } else {
                this.password = decrypt('Zgfr56gFe87jJOM', this.config.password);
            }
            this.connect();
        })
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

        const MAX_RETRIES = 20;
        const RETRY_PAUSE = 6000;

        const stateName = this.getStateNameById(id);
        const timestamp = Math.floor(Date.now() / 1000);
        const date = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');

        if (this.getChannelNameById(id) !== 'history') {

            this.log.debug('state change ' + this.getChannelNameById(id) + '.' + stateName + ' => ' + state.val);

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

        const channelName = this.getChannelNameById(id);
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
                let path = id.split('.');
                let mapID = path[3];
                let areaNumber = path[5];
                const model = new Model(this.vacbot.deviceClass, this.config);
                        
                if(mapID == this.currentMapID && (!this.deebotPositionIsInvalid || !model.isSupportedFeature('map.deebotPositionIsInvalid'))) {
                    adapter.log.info('start cleaning spot area: ' + areaNumber + ' on map ' + mapID );
                    this.vacbot.run('spotArea', 'start', areaNumber);
                } else {
                    adapter.log.error('failed start cleaning spot area: ' + areaNumber + ' - position invalid or bot not on map ' + mapID + ' (current mapID: ' + this.currentMapID + ')');
                }
                return;
                //TODO: relocate if not correct map, queueing until relocate finished (async)
            }
            if (stateName === 'lastUsedAreaValues_rerun') {
                if (!state.ack) {
                    this.getState('map.lastUsedAreaValues', (err, state) => {
                        if ((!err) && (state) && (state.val)) {
                            this.startCustomArea(state.val, this.cleanings);
                        }
                    });
                }
                return;
            }
        }

        const subChannelName = this.getSubChannelNameById(id);
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
                this.cleanings = state.val;
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
                let areaNumber = id.split('_')[1];
                this.vacbot.run('spotArea', 'start', areaNumber);
                this.log.info('start cleaning spot area: ' + areaNumber);
                return;
            }
            if (state.val !== '') {
                switch (stateName) {
                    case 'spotArea':
                        this.vacbot.run(stateName, 'start', state.val);
                        this.log.info('start cleaning spot area(s): ' + state.val);
                        break;
                    case 'customArea':
                        let customAreaValues = state.val.replace(/ /g, '');
                        const patternWithCleanings = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,[1-2]$/;
                        const patternWithoutCleanings = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$/;
                        if (patternWithCleanings.test(customAreaValues))  {
                            let cleanings = customAreaValues.split(',')[4];
                            customAreaValues = customAreaValues.split(',',4).toString();
                            this.startCustomArea(customAreaValues, cleanings);
                            this.setState('control.customArea_cleanings', cleanings, true);
                        } else if (patternWithoutCleanings.test(customAreaValues)) {
                            this.startCustomArea(customAreaValues, this.cleanings);
                        } else {
                            this.log.info('invalid input for custom area: ' + state.val);
                        }
                        break;
                }
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
                        if ((!err) && (state)) {
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

    startCustomArea(areaValues, cleanings) {
        this.vacbot.run('customArea', 'start', areaValues, cleanings);
        this.log.info('start cleaning custom area: ' + areaValues + ' (' + cleanings + 'x)');
    }

    reconnect() {
        this.retrypauseTimeout = null;
        this.retries++;
        this.log.info('reconnecting (' +this.retries+ ') ...');
        this.connect();
    }

    getChannelNameById(id) {
        const channel = id.split('.')[2];
        return channel;
    }

    getSubChannelNameById(id) {
        const pos = id.split('.').length - 2;
        const channel = id.split('.')[pos];
        return channel;
    }

    getStateNameById(id) {
        const pos = id.split('.').length - 1;
        const state = id.split('.')[pos];
        return state;
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

                this.createInitialObjects();

                this.vacbot.on('ready', (event) => {

                    this.createExtendedObjects();

                    this.setState('info.connection', true, true);
                    this.connected = true;
                    this.log.info(this.nick + ' successfully connected');
                    this.setStateConditional('info.deviceName', this.nick, true);
                    this.setStateConditional('info.deviceClass', this.vacbot.deviceClass, true);
                    const protocol = (this.vacbot.useMqtt) ? 'MQTT' : 'XMPP';
                    this.setStateConditional('info.communicationProtocol', protocol, true);
                    this.log.info('[vacbot] name: ' + this.vacbot.getDeviceProperty('name'));
                    this.retries = 0;
                    this.setInitialStateValues();

                    this.vacbot.on('ChargeState', (status) => {
                        this.getState('info.chargestatus', (err, state) => {
                            if ((!err) && (state)) {
                                if (state.val !== status) {
                                    if (isValidChargeStatus(status)) {
                                        this.chargestatus = status;
                                        this.setState('info.chargestatus', status, true);
                                        this.setDeviceStatus('chargestatus');
                                        if (status === 'charging') {
                                            this.setState('info.error', '', true);
                                            this.setState('info.errorCode', '0', true);
                                            this.setState('history.timestampOfLastStartCharging', Math.floor(Date.now() / 1000), true);
                                            this.setState('history.dateOfLastStartCharging', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
                                            this.vacbotGetCleanLogs();
                                        }
                                    } else {
                                        this.log.info('Unhandled chargestatus: ' + status);
                                    }
                                }
                            }
                        });
                        this.vacbot.run('GetPosition');
                        this.vacbot.run('GetCleanSum');
                    });
                    this.vacbot.on('CleanReport', (status) => {
                        this.getState('info.cleanstatus', (err, state) => {
                            if ((!err) && (state)) {
                                if (state.val !== status) {
                                    if (isValidCleanStatus(status)) {
                                        this.cleanstatus = status;
                                        this.setState('info.cleanstatus', status, true);
                                        this.setDeviceStatus('cleanstatus');
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
                        this.vacbot.run('GetCleanSum');
                    });
                    this.vacbot.on('WaterLevel', (level) => {
                        if (this.waterLevel !== level) {
                            this.waterLevel = level;
                            this.setStateConditional('control.waterLevel', this.waterLevel, true);
                        }
                    });
                    this.vacbot.on('disconnect', (status) => {
                        this.disconnect(false);
                    });
                    this.vacbot.on('WaterBoxInfo', (status) => {
                        let waterboxinfo = (status == 1) ? true : false;
                        this.setStateConditional('info.waterbox', waterboxinfo, true);
                    });
                    this.vacbot.on('DustCaseInfo', (status) => {
                        let dustCaseInfo = (status == 1) ? true : false;
                        this.setStateConditional('info.dustbox', dustCaseInfo, true);
                    });
                    this.vacbot.on('SleepStatus', (status) => {
                        let sleepStatus = (status == 1) ? true : false;
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
                        let x = deebotPosition.split(',')[0];
                        this.setStateConditional('map.deebotPosition_x', x, true);
                        let y = deebotPosition.split(',')[1];
                        this.setStateConditional('map.deebotPosition_y', y, true);
                        let a = deebotPosition.split(',')[2];
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
                        this.currentMapID = value;
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
                        this.setStateConditional('map.lastUsedAreaValues', values, true);
                    });
                    this.vacbot.on('CleanSum_totalSquareMeters', (meters) => {
                        this.setStateConditional('cleaninglog.totalSquareMeters', meters, true);
                    });
                    this.vacbot.on('CleanSum_totalSeconds', (totalSeconds) => {
                        this.setStateConditional('cleaninglog.totalSeconds', totalSeconds, true);
                        let hours = Math.floor(totalSeconds / 3600);
                        let minutes = Math.floor((totalSeconds % 3600) / 60);
                        let seconds = Math.floor(totalSeconds % 60);
                        let totalTimeString = hours.toString() + 'h ' + ((minutes < 10) ? '0' : '') + minutes.toString() + 'm ' + ((seconds < 10) ? '0' : '') + seconds.toString() + 's';
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

    setInitialStateValues() {
        if (this.config['workaround.batteryValue'] === true) {
            this.setState('info.battery', '', false);
        }
        this.getState('info.chargestatus', (err, state) => {
            if ((!err) && (state)) {
                this.chargestatus = state.val;
                this.setDeviceStatus(this.chargestatus);
            }
        });
        this.getState('info.cleanstatus', (err, state) => {
            if ((!err) && (state)) {
                this.cleanstatus = state.val;
                this.setDeviceStatus(this.cleanstatus);
            }
        });
        this.getState('control.customArea_cleanings', (err, state) => {
            if ((!err) && (state)) {
                this.cleanings = state.val;
            }
        });
        this.getState('control.waterLevel', (err, state) => {
            if ((!err) && (state)) {
                this.waterLevel = Math.round(state.val);
            }
        });
        this.getState('control.cleanSpeed', (err, state) => {
            if ((!err) && (state)) {
                this.cleanSpeed = Math.round(state.val);
            }
        });
    }

    setStateConditional(stateId, value, ack = true) {
        this.getState(stateId, (err, state) => {
            if ((!err) && (state)) {
                if (state.val !== value) {
                    this.setState(stateId, value, ack);
                }
            }
        });
    }

    setBatteryState(newValue, ack = true) {
        this.getState('info.battery', (err, state) => {
            if ((!err) && (state)) {
                if (this.config['workaround.batteryValue'] === true) {
                    if ((this.chargestatus === 'charging') && ((newValue > state.val)) || (!state.val)) {
                        this.setState('info.battery', newValue, ack);
                    } else if ((this.chargestatus !== 'charging') && ((newValue < state.val)) || (!state.val)) {
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

    setDeviceStatus(trigger) {

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

    vacbotRunGetPosition() {
        this.getState('info.deviceStatus', (err, state) => {
            if ((!err) && (state)) {
                if ((state.val === 'cleaning') || ((state.val === 'returning'))) {
                    this.vacbot.run('GetPosition');
                    this.vacbot.run('GetCleanSum');
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
        this.vacbotGetCleanLogs();
    }

    vacbotGetCleanLogs() {
        const model = new Model(this.vacbot.deviceClass, this.config);
        if (model.isSupportedFeature('cleaninglog.channel')) {
            setTimeout(() => {
                if ((this.vacbot.deviceClass === 'ls1ok3') || (this.vacbot.deviceClass === 'y79a7u')) {
                    // Deebot 900/901 and Ozmo 900
                    this.vacbot.run('GetLogApiCleanLogs');
                } else {
                    this.vacbot.run('GetCleanLogs');
                }
            }, 15000);
        }
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
        if(this.vacbot.hasSpotAreas() 
            && model.isSupportedFeature('map.deebotPosition')
            && model.isSupportedFeature('map.spotAreas')
            && model.isSupportedFeature('map.deebotPositionCurrentSpotAreaID')
            && this.deebotPositionCurrentSpotAreaID == 'unknown'
            ) {
            this.vacbot.run('GetPosition');
        }
        this.vacbot.run('GetError');
        this.vacbot.run('GetSleepStatus');
        this.vacbot.run('GetCleanSum');
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

    createInitialInfoObjects() {
        this.createChannelNotExists('info', 'Information');

        this.createObjectNotExists(
            'info.deviceName', 'Name of the device',
            'string', 'text', false, '', '');
        this.createObjectNotExists(
            'info.communicationProtocol', 'Communication protocol',
            'string', 'text', false, '', '');
        this.createObjectNotExists(
            'info.deviceClass', 'Class number of the device',
            'string', 'text', false, '', '');
        this.createObjectNotExists(
            'info.connection', 'Connection status',
            'boolean', 'indicator.connected', false, false, '');
        this.createObjectNotExists(
            'info.error', 'Error messages',
            'string', 'indicator.error', false, '', '');
        this.createObjectNotExists(
            'info.errorCode', 'Error code',
            'string', 'indicator.error', false, '0', '');
    }

    async createInitialObjects() {
        const model = new Model(this.vacbot.deviceClass, this.config);

        // Control channel
        await this.createChannelNotExists('control', 'Control');
        const buttons = new Map();

        if (this.vacbot.hasSpotAreas()) {
            await this.createObjectNotExists(
                'control.spotArea', 'Cleaning multiple spot areas (comma-separated list)',
                'string', 'value', true, '', '');
            for (let i = 0; i <= 19; i++) {
                if (this.config.numberOfSpotAreas > i) {
                    await this.createObjectNotExists(
                        'control.spotArea_' + i, 'Spot area ' + i + ' (please rename with custom name)',
                        'boolean', 'button', true, false, '');
                } else {
                    this.getState('control.spotArea_' + i, (err, state) => {
                        if ((!err) && (state)) {
                            this.delObject('control.spotArea_' + i);
                        }
                    });
                }
            }
        } else {
            buttons.set('spot', 'start spot cleaning');
            buttons.set('edge', 'start edge cleaning');
        }

        if (this.vacbot.hasCustomAreas()) {
            await this.createObjectNotExists(
                'control.customArea', 'Custom area',
                'string', 'value', true, '', '');
            await this.createObjectNotExists(
                'control.customArea_cleanings', 'Custom area cleanings',
                'number', 'value', true, 1, '');
        }

        buttons.set('clean', 'start automatic cleaning');
        buttons.set('stop', 'stop cleaning');
        if (model.isSupportedFeature('control.pause')) {
            buttons.set('pause', 'pause cleaning');
        } else {
            this.deleteObjectIfExists('control.pause');
        }
        if (model.isSupportedFeature('control.resume')) {
            buttons.set('resume', 'resume cleaning');
        } else {
            this.deleteObjectIfExists('control.resume');
        }
        if (model.isSupportedFeature('control.relocate')) {
            buttons.set('relocate', 'Relocate the bot');
        }
        buttons.set('charge', 'go back to charging station');
        if (model.isSupportedFeature('control.playSound')) {
            buttons.set('playSound', 'play sound for locating the device');
        } else {
            this.deleteObjectIfExists('control.playSound');
        }
        if (model.isSupportedFeature('control.playIamHere')) {
            buttons.set('playIamHere', 'play I am here');
        } else {
            this.deleteObjectIfExists('control.playIamHere');
        }
        for (let [objectName, name] of buttons) {
            await this.createObjectNotExists(
                'control.' + objectName, name,
                'boolean', 'button', true, false, '');
        }

        if (this.vacbot.hasMoppingSystem()) {
            await this.setObjectNotExists('control.waterLevel', {
                type: 'state',
                common: {
                    name: 'Water level',
                    type: 'number',
                    role: 'level',
                    read: true,
                    write: true,
                    'min': 1,
                    'max': 4,
                    'states': {
                        1: 'low',
                        2: 'medium',
                        3: 'high',
                        4: 'max'
                    }
                },
                native: {}
            });
        }
        if (model.isSupportedFeature('control.cleanSpeed')) {
            await this.setObjectNotExists('control.cleanSpeed', {
                type: 'state',
                common: {
                    name: 'Clean Speed',
                    type: 'number',
                    role: 'level',
                    read: true,
                    write: true,
                    'min': 1,
                    'max': 4,
                    'states': {
                        1: 'silent',
                        2: 'normal',
                        3: 'high',
                        4: 'veryhigh'
                    }
                },
                native: {}
            });
        }
        const moveButtons = new Map();
        moveButtons.set('forward', 'forward');
        moveButtons.set('left', 'spin left');
        moveButtons.set('right', 'spin right');
        moveButtons.set('backward', 'backward');
        moveButtons.set('stop', 'stop');
        // moveButtons.set('turnAround', 'turn around');

        // Move control channel
        if (model.isSupportedFeature('control.move')) {
            await this.createChannelNotExists('control.move', 'Move commands');
            for (let [objectName, name] of moveButtons) {
                await this.createObjectNotExists(
                    'control.move.' + objectName, name,
                    'boolean', 'button', true, false, '');
            }
        } else {
            for (let [objectName, name] of moveButtons) {
                this.deleteObjectIfExists('control.move.' + objectName);
            }
        }

        // Information channel
        await this.createObjectNotExists(
            'info.battery', 'Battery status',
            'number', 'value.battery', false, '', '%');
        await this.createObjectNotExists(
            'info.deviceStatus', 'Device status',
            'string', 'indicator.status', false, '', '');
        await this.createObjectNotExists(
            'info.cleanstatus', 'Clean status',
            'string', 'indicator.status', false, '', '');
        await this.createObjectNotExists(
            'info.chargestatus', 'Charge status',
            'string', 'indicator.status', false, '', '');

        // Timestamps
        await this.createChannelNotExists('history', 'History');

        await this.createObjectNotExists(
            'history.timestampOfLastStateChange', 'Timestamp of last state change',
            'number', 'value.datetime', false, '', '');
        await this.createObjectNotExists(
            'history.dateOfLastStateChange', 'Human readable timestamp of last state change',
            'string', 'value.datetime', false, '', '');

        await this.createObjectNotExists(
            'history.timestampOfLastStartCleaning', 'Timestamp of last start cleaning',
            'number', 'value.datetime', false, '', '');
        await this.createObjectNotExists(
            'history.dateOfLastStartCleaning', 'Human readable timestamp of last start cleaning',
            'string', 'value.datetime', false, '', '');

        await this.createObjectNotExists(
            'history.timestampOfLastStartCharging', 'Timestamp of last start charging',
            'number', 'value.datetime', false, '', '');
        await this.createObjectNotExists(
            'history.dateOfLastStartCharging', 'Human readable timestamp of last start charging',
            'string', 'value.datetime', false, '', '');

        // Consumable lifespan
        await this.createChannelNotExists('consumable', 'Consumable');

        await this.createObjectNotExists(
            'consumable.filter', 'Filter lifespan',
            'number', 'level', false, '', '%');
        if (this.vacbot.hasMainBrush()) {
            await this.createObjectNotExists(
                'consumable.main_brush', 'Main brush lifespan',
                'number', 'level', false, '', '%');
        }
        await this.createObjectNotExists(
            'consumable.side_brush', 'Side brush lifespan',
            'number', 'level', false, '', '%');
    }

    async createExtendedObjects() {
        const model = new Model(this.vacbot.deviceClass, this.config);

        if (this.vacbot.hasMoppingSystem()) {
            await this.createObjectNotExists(
                'info.waterbox', 'Waterbox status',
                'boolean', 'value', false, false, '');
        }
        if (model.isSupportedFeature('info.dustbox')) {
            await this.createObjectNotExists(
                'info.dustbox', 'Dustbox status',
                'boolean', 'value', false, true, '');
        } else {
            this.deleteObjectIfExists('info.dustbox');
        }
        if (model.isSupportedFeature('info.ip')) {
            await this.createObjectNotExists(
                'info.ip', 'IP address',
                'string', 'text', false, '', '');
        }
        if (model.isSupportedFeature('info.wifiSSID')) {
            await this.createObjectNotExists(
                'info.wifiSSID', 'WiFi SSID',
                'string', 'text', false, '', '');
        }
        if (model.isSupportedFeature('info.wifiSignal')) {
            await this.createObjectNotExists(
                'info.wifiSignal', 'WiFi signal strength in dBm',
                'number', 'level', false, '', 'dBm');
        }
        if (model.isSupportedFeature('info.mac')) {
            await this.createObjectNotExists(
                'info.mac', 'MAC address',
                'string', 'text', false, '', '');
        }
        if (model.isSupportedFeature('info.sleepStatus')) {
            await this.createObjectNotExists(
                'info.sleepStatus', 'Sleep status',
                'boolean', 'value', false, false, '');
        }

        // cleaning log
        if (model.isSupportedFeature('cleaninglog')) {
            await this.createChannelNotExists('cleaninglog', 'Cleaning logs');
        }

        if (model.isSupportedFeature('cleaninglog.channel')) {
            await this.createObjectNotExists(
                'cleaninglog.totalSquareMeters', 'Total square meters',
                'number', 'value', false, '', 'm²');
            await this.createObjectNotExists(
                'cleaninglog.totalSeconds', 'Total seconds',
                'number', 'value', false, '', '');
            await this.createObjectNotExists(
                'cleaninglog.totalTime', 'Total time',
                'number', 'value', false, '', '');
            await this.createObjectNotExists(
                'cleaninglog.totalNumber', 'Total number of cleanings',
                'number', 'value', false, '', '');
            await this.createObjectNotExists(
                'cleaninglog.last20Logs', 'Last 20 cleaning logs',
                'object', 'history', false, '', '');
        } else {
            this.deleteObjectIfExists('cleaninglog.totalSquareMeters');
            this.deleteObjectIfExists('cleaninglog.totalSeconds');
            this.deleteObjectIfExists('cleaninglog.totalTime');
            this.deleteObjectIfExists('cleaninglog.totalNumber');
            this.deleteObjectIfExists('cleaninglog.last20Logs');
        }
        this.deleteObjectIfExists('cleaninglog.squareMeters');

        if (model.isSupportedFeature('cleaninglog.lastCleaningMap')) {
            await this.createObjectNotExists(
                'cleaninglog.lastCleaningMapImageURL', 'Image URL of the last cleaning',
                'string', 'value', false, '', '');
            await this.createObjectNotExists(
                'cleaninglog.lastCleaningTimestamp', 'Timestamp of the last cleaning',
                'string', 'value', false, '', '');
        }

        // Map
        if (model.isSupportedFeature('map')) {
            await this.createChannelNotExists('map', 'Map');
        }

        if (model.isSupportedFeature('map.currentMapName')) {
            await this.createObjectNotExists(
                'map.currentMapName', 'Name of current active map',
                'string', 'text', false, '', '');
        }
        if (model.isSupportedFeature('map.currentMapIndex')) {
            await this.createObjectNotExists(
                'map.currentMapIndex', 'Index of current active map',
                'number', 'value', false, '', '');
        }
        if (model.isSupportedFeature('map.currentMapMID')) {
            await this.createObjectNotExists(
                'map.currentMapMID', 'MID of current active map',
                'string', 'text', false, '', '');
        }
        if (model.isSupportedFeature('map.relocationState')) {
            await this.createObjectNotExists(
                'map.relocationState', 'Relocation status',
                'string', 'text', false, '', '');
        }
        if (model.isSupportedFeature('map.deebotPosition')) {
            await this.createObjectNotExists(
                'map.deebotPosition', 'Bot position (x, y, angle)',
                'string', 'text', false, '', '');
            await this.createObjectNotExists(
                'map.deebotPosition_x', 'Bot position (x)',
                'number', 'value', false, '', '');
            await this.createObjectNotExists(
                'map.deebotPosition_y', 'Bot position (y)',
                'number', 'value', false, '', '');
            await this.createObjectNotExists(
                'map.deebotPosition_angle', 'Bot position (angle)',
                'number', 'value', false, '', '');
        }
        if (model.isSupportedFeature('map.deebotPositionIsInvalid')) {
            await this.createObjectNotExists(
                'map.deebotPositionIsInvalid', 'Bot position is invalid / unknown',
                'boolean', 'indicator.status', false, false, '');
        }
        if (model.isSupportedFeature('map.deebotPositionCurrentSpotAreaID')) {
            await this.createObjectNotExists(
                'map.deebotPositionCurrentSpotAreaID', 'ID of the SpotArea the bot is currently in',
                'string', 'text', false, 'unknown', '');
        }
        if (model.isSupportedFeature('map.chargePosition')) {
            await this.createObjectNotExists(
                'map.chargePosition', 'Charge position (x, y, angle)',
                'string', 'text', false, '', '');
        }
        if (model.isSupportedFeature('map.lastUsedAreaValues')) {
            await this.createObjectNotExists(
                'map.lastUsedAreaValues', 'Last used area values',
                'string', 'text', false, '', '');
            await this.createObjectNotExists(
                'map.lastUsedAreaValues_rerun', 'Rerun cleaning with the last area values used',
                'boolean', 'button', true, false, '');
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
            if ((!err) && (state)) {
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

function isValidChargeStatus(status) {
    switch(status) {
        case 'returning':
        case 'charging':
        case 'idle':
            return true;
        default:
            return  false;
    }
}

function isValidCleanStatus(status) {
    switch(status) {
        case 'stop':
        case 'pause':
        case 'auto':
        case 'edge':
        case 'spot':
        case 'spot_area':
        case 'custom_area':
        case 'single_room':
        case 'idle':
        case 'returning':
        case 'error':
        case 'alert':
            return true;
        default:
            return  false;
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    module.exports = (options) => new EcovacsDeebot(options);
} else {
    new EcovacsDeebot();
}