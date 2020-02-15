'use strict';

const utils = require('@iobroker/adapter-core');
const sucks = require('ecovacs-deebot');
const nodeMachineId = require('node-machine-id');
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
        this.retries = 0;
        this.deviceNumber = 0;
        this.nick = null;
        this.cleanings = 1;
        this.waterLevel = null;

        this.maxautoretries = 20;
        this.retrypause = 5000;
        this.retrypauseTimeout = null;
        this.getStatesInterval = null;

        this.password = null;
    }

    async onReady() {
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
        try {
            this.setState('info.connection', false, true);
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    onStateChange(id, state) {

        const stateOfId = this.getStateById(id);
        const timestamp = Math.floor(Date.now() / 1000);
        const date = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');

        if (this.getChannelById(id) !== 'history') {

            this.log.debug('state change: ' + state);

            this.setState('history.timestampOfLastStateChange', timestamp, true);
            this.setState('history.dateOfLastStateChange', date, true);

            if ((stateOfId !== 'connection') && (stateOfId !== 'error')) {
                this.setState('info.connection', true, true);
            }

            if ((stateOfId === 'error') && (this.connectionFailed)) {
                if ((!this.retrypauseTimeout) && (this.retries <= this.maxautoretries)) {
                    this.retrypauseTimeout = setTimeout(() => {
                        this.reconnect();
                    }, this.retrypause);
                }
            }
        }

        if ((!this.connected) || (!state) || (state.ack)) {
            return;
        }
        const channel = this.getChannelById(id);
        if (channel === 'control') {
            if (stateOfId === 'customArea_cleanings') {
                this.cleanings = state.val;
                return;
            }
            if (stateOfId === 'waterLevel') {
                this.waterLevel = state.val;
                this.vacbot.run('SetWaterLevel', this.waterLevel);
                this.log.info('set water level: ' + this.waterLevel);
                return;
            }
            // area cleaning
            const pattern = /^spotArea_[0-9]$/;
            if (pattern.test(stateOfId)) {
                // spotArea buttons
                let areaNumber = stateOfId.split('_')[1];
                this.vacbot.run('spotArea', 'start', areaNumber);
                this.log.info('start cleaning spot area: ' + areaNumber);
                return;
            }
            if (state.val !== '') {
                switch (stateOfId) {
                    case 'spotArea':
                        this.vacbot.run(stateOfId, 'start', state.val);
                        this.log.info('start cleaning spot area(s): ' + state.val);
                        break;
                    case 'customArea':
                        this.vacbot.run(stateOfId, 'start', state.val, this.cleanings);
                        this.log.info('start cleaning custom area: ' + state.val + ' (' + this.cleanings + 'x)');
                        break;
                }
            }
            this.log.info('run: ' + stateOfId);
            // control buttons
            switch (stateOfId) {
                case 'clean':
                case 'stop':
                case 'pause':
                case 'edge':
                case 'spot':
                case 'charge':
                case 'playSound':
                    this.vacbot.run(stateOfId);
                    break;
                case 'spotArea':
                case 'customArea':
                    break;
                default:
                    this.log.info('Unhandled control state: ' + stateOfId);
            }
        }
    }

    reconnect() {
        this.retrypauseTimeout = null;
        this.retries++;
        this.log.info('reconnecting (' +this.retries+ ') ...');
        this.connect();
    }

    getChannelById(id) {
        const channel = id.split('.')[2];
        return channel;
    }

    getStateById(id) {
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
                this.createStates();
                this.log.debug('Devices:' + JSON.stringify(devices));
                const vacuum = devices[this.deviceNumber];
                this.nick = vacuum.nick ? vacuum.nick : 'New Device ' + this.deviceNumber;
                this.log.info('Successfully connected to Ecovacs server');
                this.vacbot = new VacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent);
                this.vacbot.on('ready', (event) => {
                    this.setState('info.connection', true);
                    this.log.info(this.nick + ' successfully connected');
                    this.setState('info.deviceName', this.nick, true);
                    this.setState('info.deviceClass', this.vacbot.deviceClass, true);
                    const protocol = (this.vacbot.useMqtt) ? 'MQTT' : 'XMPP';
                    this.setState('info.communicationProtocol', protocol, true);
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
                    this.vacbot.on('ChargeState', (status) => {
                        const timestamp = Math.floor(Date.now() / 1000);
                        const date = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                        this.setState('info.chargestatus', status, true);
                        if (isValidChargeStatus(status)) {
                            this.setState('info.deviceStatus', status, true);
                            this.setState('history.timestampOfLastStartCharging', timestamp, true);
                            this.setState('history.dateOfLastStartCharging', date, true);
                        } else {
                            this.log.info('Unhandled chargestatus: ' + status);
                        }
                    });
                    this.vacbot.on('CleanReport', (status) => {
                        const timestamp = Math.floor(Date.now() / 1000);
                        const date = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                        this.setState('info.cleanstatus', status, true);
                        if (isValidCleanStatus(status)) {
                            if (status === 'stop') {
                                this.setState('info.deviceStatus', 'stopped', true);
                            } else if (status === 'pause') {
                                this.setState('info.deviceStatus', 'paused', true);
                            } else {
                                this.setState('info.deviceStatus', 'cleaning', true);
                            }
                            this.setState('history.timestampOfLastStartCleaning', timestamp, true);
                            this.setState('history.dateOfLastStartCleaning', date, true);
                        } else {
                            this.log.info('Unhandled cleanstatus: ' + status);
                        }
                    });
                    this.vacbot.on('WaterLevel', (level) => {
                        if (this.waterLevel !== level) {
                            this.waterLevel = level;
                            this.setState('control.waterLevel', this.waterLevel, true);
                        }
                    });
                    this.vacbot.on('BatteryInfo', (batterystatus) => {
                        this.setState('info.battery', batterystatus, true);
                    });
                    this.vacbot.on('LifeSpan_filter', (level) => {
                        this.setState('consumable.filter', Math.round(level), true);
                    });
                    this.vacbot.on('LifeSpan_main_brush', (level) => {
                        this.setState('consumable.main_brush', Math.round(level), true);
                    });
                    this.vacbot.on('LifeSpan_side_brush', (level) => {
                        this.setState('consumable.side_brush', Math.round(level), true);
                    });
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

    vacbotRunGetStates() {
        this.vacbot.run('GetCleanState');
        this.vacbot.run('GetChargeState');
        this.vacbot.run('GetBatteryState');
        this.vacbot.run('GetLifeSpan', 'main_brush');
        this.vacbot.run('GetLifeSpan', 'side_brush');
        this.vacbot.run('GetLifeSpan', 'filter');
        this.vacbot.run('GetWaterLevel');
        //this.vacbot.run('GetWaterBoxInfo');
    }

    error(message, stop) {
        if (stop) {
            this.setState('info.connection', false);
        }
        const pattern = /code 0002/;
        if (pattern.test(message)) {
            this.setState('info.error', 'reconnecting', true);
            this.log.debug(message);
        } else {
            this.setState('info.error', message, true);
            this.log.error(message);
        }
    }

    async createStates() {

        // Information
        await this.createChannelNotExists('control', 'Control');

        const buttons = new Map();

        if (this.vacbot.hasSpotAreas()) {
            await this.createObjectNotExists(
                'control.spotArea', 'Cleaning multiple spot areas (comma-separated list)',
                'string', 'value', true, '', '');
            for (let i = 0; i <= 9; i++) {
                if (this.config.numberOfSpotAreas > i) {
                    await this.createObjectNotExists(
                        'control.spotArea_' + i, 'Spot area ' + i + ' (please rename with custom name)',
                        'boolean', 'button', true, '', '');
                } else {
                    this.deleteState('control.spotArea_' + i);
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
        buttons.set('charge', 'go back to charging station');
        buttons.set('playSound', 'play sound for locating the device');
        for (const [objectName, name] of buttons) {
            await this.createObjectNotExists(
                'control.' + objectName, name,
                'boolean', 'button', true, '', '');
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

        // Information
        await this.createChannelNotExists('info', 'Information');

        await this.createObjectNotExists(
            'info.deviceName', 'Name of the device',
            'string', 'text', false, '', '');
        await this.createObjectNotExists(
            'info.communicationProtocol', 'Communication protocol',
            'string', 'text', false, '', '');
        await this.createObjectNotExists(
            'info.deviceClass', 'Class number of the device',
            'string', 'text', false, '', '');
        await this.createObjectNotExists(
            'info.battery', 'Battery status',
            'integer', 'value.battery', false, '', '%');
        await this.createObjectNotExists(
            'info.connection', 'Connection status',
            'boolean', 'indicator.connected', false, false, '');
        await this.createObjectNotExists(
            'info.deviceStatus', 'Device status',
            'string', 'indicator.status', false, '', '');
        await this.createObjectNotExists(
            'info.cleanstatus', 'Clean status',
            'string', 'indicator.status', false, '', '');
        await this.createObjectNotExists(
            'info.chargestatus', 'Charge status',
            'string', 'indicator.status', false, '', '');
        await this.createObjectNotExists(
            'info.error', 'Error messages',
            'string', 'indicator.error', false, '', '');

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

function isValidChargeStatus(status) {
    if ((status === 'returning') || (status === 'charging') || (status === 'idle')) {
        return true;
    }
    return  false;
}

function isValidCleanStatus(status) {
    if ((status === 'auto') || (status === 'stop') || (status === 'pause')) {
        return true;
    }
    if ((status === 'edge') || (status === 'spot') || (status === 'spot_area')) {
        return true;
    }
    return  false;
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    module.exports = (options) => new EcovacsDeebot(options);
} else {
    new EcovacsDeebot();
}