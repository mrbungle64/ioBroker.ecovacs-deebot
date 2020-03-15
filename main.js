'use strict';

const utils = require('@iobroker/adapter-core');
const sucks = require('ecovacs-deebot');
const nodeMachineId = require('node-machine-id');
const Model = require('./lib/deebotModel');
const EcoVacsAPI = sucks.EcoVacsAPI;
const VacBot = sucks.VacBot;

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

        this.retrypauseTimeout = null;
        this.getStatesInterval = null;
        this.getGetPosInterval = null;

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
        if (this.retrypauseTimeout) {
            clearTimeout(this.retrypauseTimeout);
        }
        if (this.getStatesInterval) {
            clearInterval(this.getStatesInterval);
        }
        if (this.getGetPosInterval) {
            clearInterval(this.getGetPosInterval);
        }
        try {
            this.setState('info.connection', false, true);
            this.connected = false;
            this.vacbot.disconnect();
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
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

        if (channelName === 'control') {
            if (stateName === 'customArea_cleanings') {
                this.cleanings = state.val;
                return;
            }
            if (stateName === 'waterLevel') {
                this.waterLevel = state.val;
                this.vacbot.run('SetWaterLevel', this.waterLevel);
                this.log.info('set water level: ' + this.waterLevel);
                return;
            }
            if (stateName === 'cleanSpeed') {
                this.cleanSpeed = state.val;
                this.vacbot.run('SetCleanSpeed', this.cleanSpeed);
                this.log.info('set Clean Speed: ' + this.cleanSpeed);
                return;
            }

            if (state.ack) {
                return;
            }

            // area cleaning
            const pattern = /^spotArea_[0-9]{1,2}$/;
            if (pattern.test(stateName)) {
                // spotArea buttons
                let areaNumber = stateName.split('_')[1];
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
                    this.log.info('Unhandled control state: ' + stateName);
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

    getStateNameById(id) {
        const state = id.split('.')[3];
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
                    this.getState('control.customArea_cleanings', (err, state) => {
                        if ((!err) && (state)) {
                            this.cleanings = state.val;
                        }
                    });
                    this.getState('control.waterLevel', (err, state) => {
                        if ((!err) && (state)) {
                            this.waterLevel = state.val;
                        }
                    });
                    this.getState('control.cleanSpeed', (err, state) => {
                        if ((!err) && (state)) {
                            this.cleanSpeed = state.val;
                        }
                    });
                    this.vacbot.on('ChargeState', (status) => {
                        this.getState('info.chargestatus', (err, state) => {
                            if ((!err) && (state)) {
                                if (state.val !== status) {
                                    const timestamp = Math.floor(Date.now() / 1000);
                                    const date = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                                    this.setState('info.chargestatus', status, true);
                                    if (isValidChargeStatus(status)) {
                                        this.vacbot.run('GetPosition');
                                        this.setState('info.deviceStatus', status, true);
                                        this.setState('info.error', '', true);
                                        if (status === 'charging') {
                                            this.setState('history.timestampOfLastStartCharging', timestamp, true);
                                            this.setState('history.dateOfLastStartCharging', date, true);
                                        }
                                    } else {
                                        this.log.info('Unhandled chargestatus: ' + status);
                                    }
                                }
                            }
                        });
                    });
                    this.vacbot.on('CleanReport', (status) => {
                        this.getState('info.cleanstatus', (err, state) => {
                            if ((!err) && (state)) {
                                if (state.val !== status) {
                                    const timestamp = Math.floor(Date.now() / 1000);
                                    const date = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                                    this.setState('info.cleanstatus', status, true);
                                    if (isValidCleanStatus(status)) {
                                        this.vacbot.run('GetPosition');
                                        let deviceStatus = getDeviceStatusByCleanStatus(status);
                                        this.setState('info.deviceStatus', deviceStatus, true);
                                        if (deviceStatus === 'cleaning') {
                                            this.setState('info.error', '', true);
                                            this.setState('history.timestampOfLastStartCleaning', timestamp, true);
                                            this.setState('history.dateOfLastStartCleaning', date, true);
                                        }
                                    } else {
                                        this.log.info('Unhandled cleanstatus: ' + status);
                                    }
                                }
                            }
                        });
                    });
                    this.vacbot.on('WaterLevel', (level) => {
                        if (this.waterLevel !== level) {
                            this.waterLevel = level;
                            this.setStateConditional('control.waterLevel', this.waterLevel, true);
                        }
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
                        this.setStateConditional('info.battery', batterystatus, true);
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
                        this.setStateConditional('map.currentMapMID', value, true);
                    });

                    if ((!this.vacbot.useMqtt) && (!this.getGetPosInterval)) {
                        const model = new Model(this.vacbot.deviceClass);
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
                    this.vacbotRunGetStates();
                    if (!this.vacbot.useMqtt) {
                        this.getStatesInterval = setInterval(() => {
                            this.vacbotRunGetStates();
                        }, 60000);
                    }
                }
            });
        }).catch((e) => {
            this.connectionFailed = true;
            this.error(e.message, true);
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

    vacbotRunGetPosition() {
        this.getState('info.deviceStatus', (err, state) => {
            if ((!err) && (state)) {
                if ((state.val === 'cleaning') || ((state.val === 'returning'))) {
                    this.vacbot.run('GetPosition');
                }
            }
        });
    }

    vacbotRunGetStates() {
        this.vacbot.run('GetCleanState');
        this.vacbot.run('GetChargeState');
        this.vacbot.run('GetBatteryState');
        if (this.vacbot.hasMainBrush()) {
            this.vacbot.run('GetLifeSpan', 'main_brush');
        }
        this.vacbot.run('GetLifeSpan', 'side_brush');
        this.vacbot.run('GetLifeSpan', 'filter');
        if (this.vacbot.hasMoppingSystem()) {
            this.vacbot.run('GetWaterLevel');
            this.vacbot.run('GetWaterBoxInfo');
        }
        this.vacbot.run('GetPosition');
        this.vacbot.run('GetChargerPos');
        this.vacbot.run('GetCleanSpeed');
        this.vacbot.run('GetNetInfo');
        this.vacbot.run('GetCurrentMapName');
        this.vacbot.run('GetError');
        this.vacbot.run('GetSleepStatus');
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
    }

    async createInitialObjects() {
        const model = new Model(this.vacbot.deviceClass);

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
        buttons.set('pause', 'pause cleaning');
        if (model.isSupportedFeature('control.resume')) {
            buttons.set('resume', 'resume cleaning');
        }
        if (model.isSupportedFeature('control.relocate')) {
            buttons.set('relocate', 'Relocate the bot');
        }
        buttons.set('charge', 'go back to charging station');
        buttons.set('playSound', 'play sound for locating the device');
        buttons.set('playIamHere', 'play I am here');
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

        // Information channel
        await this.createObjectNotExists(
            'info.battery', 'Battery status',
            'integer', 'value.battery', false, '', '%');
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
            'integer', 'value.datetime', false, '', '');
        await this.createObjectNotExists(
            'history.dateOfLastStateChange', 'Human readable timestamp of last state change',
            'string', 'value.datetime', false, '', '');

        await this.createObjectNotExists(
            'history.timestampOfLastStartCleaning', 'Timestamp of last start cleaning',
            'integer', 'value.datetime', false, '', '');
        await this.createObjectNotExists(
            'history.dateOfLastStartCleaning', 'Human readable timestamp of last start cleaning',
            'string', 'value.datetime', false, '', '');

        await this.createObjectNotExists(
            'history.timestampOfLastStartCharging', 'Timestamp of last start charging',
            'integer', 'value.datetime', false, '', '');
        await this.createObjectNotExists(
            'history.dateOfLastStartCharging', 'Human readable timestamp of last start charging',
            'string', 'value.datetime', false, '', '');

        // Consumable lifespan
        await this.createChannelNotExists('consumable', 'Consumable');

        await this.createObjectNotExists(
            'consumable.filter', 'Filter lifespan',
            'integer', 'level', false, '', '%');
        if (this.vacbot.hasMainBrush()) {
            await this.createObjectNotExists(
                'consumable.main_brush', 'Main brush lifespan',
                'integer', 'level', false, '', '%');
        }
        await this.createObjectNotExists(
            'consumable.side_brush', 'Side brush lifespan',
            'integer', 'level', false, '', '%');
    }

    async createExtendedObjects() {
        const model = new Model(this.vacbot.deviceClass);

        if (this.vacbot.hasMoppingSystem()) {
            await this.createObjectNotExists(
                'info.waterbox', 'Waterbox status',
                'boolean', 'value', false, false, '');
        }
        if (model.isSupportedFeature('info.dustbox')) {
            await this.createObjectNotExists(
                'info.dustbox', 'Dustbox status',
                'boolean', 'value', false, true, '');
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
                'integer', 'level', false, '', 'dBm');
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
                'integer', 'value', false, '', '');
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
        }
        if (model.isSupportedFeature('map.chargePosition')) {
            await this.createObjectNotExists(
                'map.chargePosition', 'Charge position (x, y, angle)',
                'string', 'text', false, '', '');
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

function getDeviceStatusByCleanStatus(status) {
    switch(status) {
        case 'stop':
            return 'stopped';
        case 'pause':
        case 'paused':
            return 'paused';
        case 'alert':
        case 'error':
            return 'error';
        case 'idle':
            return 'idle';
        case 'returning':
            return 'returning';
        default:
            return 'cleaning';
    }
}

function isValidChargeStatus(status) {
    switch(status) {
        case 'returning':
        case 'charging':
        case 'idle':
        case 'not charging':
        case 'docked':
            return true;
        default:
            return  false;
    }
}

function isValidCleanStatus(status) {
    switch(status) {
        case 'auto':
        case 'stop':
        case 'pause':
        case 'edge':
        case 'spot':
        case 'spot_area':
        case 'custom_area':
        case 'cleaning':
        case 'idle':
        case 'returning':
        case 'paused':
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