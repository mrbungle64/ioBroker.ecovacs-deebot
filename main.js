'use strict';

const utils = require('@iobroker/adapter-core');
const sucks = require('sucks');
const nodeMachineId = require('node-machine-id');
const EcoVacsAPI = sucks.EcoVacsAPI;
const VacBot = sucks.VacBot;

class EcovacsDeebot extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'ecovacs-deebot',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));

        this.deviceName = null;
        this.vacbot = null;
        this.connectionFailed = false;
        this.retries = 0;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.createStates();
        // Reset the connection indicator during startup
        this.setState('info.connection', false);
        this.connect();
        this.subscribeStates('*');
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.setState('info.connection', false);
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }

        if ((this.getStateById(id) !== 'timestampOfLastStateChange') && (this.getStateById(id) !== 'dateOfLastStateChange')) {
            this.setState('info.timestampOfLastStateChange', Math.floor(Date.now() / 1000));
            this.setState('info.dateOfLastStateChange', this.formatDate(new Date(), "TT.MM.JJJJ SS:mm:ss"));
            if ((this.getStateById(id) !== 'connection') && (this.getStateById(id) !== 'error')) {
                this.setState('info.connection', true);
            }
            if ((this.getStateById(id) === 'error') && (this.connectionFailed)) {
                if (this.retries <= this.config.maxautoretries) {
                    setTimeout(() => {
                        this.reconnect();
                    }, this.config.retrypause);
                }
            }
        }

        let channel = this.getChannelById(id);
        if (channel === 'control') {
            let state = this.getStateById(id);
            this.log.info('run: '+state);
            switch (state) {
                case 'clean':
                case 'stop':
                case 'edge':
                case 'spot':
                case 'charge':
                    this.vacbot.run(state);
                    break;
            }
        }
    }

    reconnect() {
        this.log.info('reconnecting ...');
        this.retries++;
        this.connect();
    }

    getChannelById(id) {
        let channel = id.split('.')[2];
        return channel;
    }

    getStateById(id) {
        let state = id.split('.')[3];
        return state;
    }

    async connect() {
        this.connectionFailed = false;
        this.setState('info.error', '');

        if ((!this.config.email)||(!this.config.password)||(!this.config.countrycode)) {
            this.error('Missing values in adapter config',true);
            return;
        }
        const password_hash = EcoVacsAPI.md5(this.config.password);
        const device_id = EcoVacsAPI.md5(nodeMachineId.machineIdSync());
        const countries = sucks.countries;
        const continent = countries[this.config.countrycode.toUpperCase()].continent.toLowerCase();

        const api = new EcoVacsAPI(device_id, this.config.countrycode, continent);
        api.connect(this.config.email, password_hash).then(() => {
            api.devices().then((devices) => {
                this.log.info("Devices:"+JSON.stringify(devices));
                let vacuum = devices[0];
                this.deviceName = vacuum.nick;
                this.vacbot = new VacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent);
                this.vacbot.on('ready', (event) => {
                    this.setState('info.connection', true);
                    this.vacbot.on('ChargeState', (chargestatus) => {
                        this.setState('info.chargestatus', chargestatus);
                        if (chargestatus === 'charging') {
                            this.setState('info.cleanstatus', '');
                        }
                    });
                    this.vacbot.on('CleanReport', (cleanstatus) => {
                        this.setState('info.cleanstatus', cleanstatus);
                        if (cleanstatus === 'auto') {
                            this.setState('info.chargestatus', '');
                        }
                    });
                    this.vacbot.on('BatteryInfo', (batterystatus) => {
                        this.setState('info.battery', Math.round(batterystatus*100));
                    });
                    // Doesn't seem to work...
                    this.vacbot.on('Error', (message) => {
                        this.error(message,false);
                    });
                });
                this.vacbot.connect_and_wait_until_ready();
            });
        }).catch((e) => {
            this.connectionFailed = true;
            this.error('Failure in connecting!',true);
        });
    }

    error(message,stop) {
        if (stop) {
            this.setState('info.connection', false);
        }
        this.setState('info.error', message);
        this.log.error(message);
    }

    async createStates() {
        const buttons = new Map();
        buttons.set('clean', 'start automatic cleaning');
        buttons.set('edge', 'start edge cleaning');
        buttons.set('spot', 'start spot cleaning');
        buttons.set('stop', 'stop cleaning');
        buttons.set('charge', 'go back to charging station');
        for (const [objectName, name] of buttons) {
            await this.createObjectNotExists(
                'control.'+objectName,name,
                'boolean','button',true,'','');
        }

        this.createObjectNotExists(
            'info.deviceName','Name of the device',
            'string','text',false,this.deviceName,'');
        await this.createObjectNotExists(
            'info.timestampOfLastStateChange','Timestamp of last state change',
            'state','value.datetime',false,'','');
        await this.createObjectNotExists(
            'info.dateOfLastStateChange','Human readable timestamp of last state change',
            'state','value.datetime',false,'','');
        await this.createObjectNotExists(
            'info.battery','Battery status',
            'integer','value.battery',false,'','%');
        await this.createObjectNotExists(
            'info.connection','Connection status',
            'boolean','indicator.connected',false,false,'');
        await this.createObjectNotExists(
            'info.cleanstatus','Clean status',
            'string','indicator.status',false,'','');
        await this.createObjectNotExists(
            'info.chargestatus','Charge status',
            'string','indicator.status',false,'','');
        await this.createObjectNotExists(
            'info.error','Error messages',
            'string','indicator.error',false,'','');
    }

    async createObjectNotExists(id, name, type, role, write, def, unit) {
        await this.setObjectNotExists(id, {
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
            native: {},
        });
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new EcovacsDeebot(options);
} else {
    // otherwise start the instance directly
    new EcovacsDeebot();
}