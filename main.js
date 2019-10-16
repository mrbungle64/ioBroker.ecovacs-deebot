'use strict';

/*
 * Created with @iobroker/create-adapter v1.17.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const sucks = require('sucks');
const nodeMachineId = require('node-machine-id');

class EcovacsDeebot extends utils.Adapter {

    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'ecovacs-deebot',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {

        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);

        const buttons = new Map();
        buttons.set('clean', 'start automatic cleaning');
        buttons.set('edge', 'start edge cleaning');
        buttons.set('spot', 'start spot cleaning');
        buttons.set('stop', 'stop cleaning');
        buttons.set('charge', 'go back to charging station');
        for (const [objectName, name] of buttons) {
            await this.setObjectNotExists('device.control.'+objectName, {
                type: 'state',
                common: {
                    name: name,
                    type: 'boolean',
                    role: 'button',
                    read: true,
                    write: true
                },
                native: {},
            });
        }
        const states = new Map();
        states.set('deviceinfo', 'Device info');
        states.set('cleanstate', 'Cleaning state');
        states.set('chargestate', 'Charging state');
        states.set('batterystate', 'Battery state');
        for (const [objectName, name] of states) {
            await this.setObjectNotExists('device.info.'+objectName, {
                type: 'state',
                common: {
                    name: name,
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true
                },
                native: {},
            });
        }

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */

        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates('*');

        this.connect();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
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
    }

    async connect() {

        const EcoVacsAPI = sucks.EcoVacsAPI;
        const VacBot = sucks.VacBot;
        //const countries = sucks.countries;

        const account_id = this.config.email;
        if (!account_id) {
            this.setState('info.connection', false);
            return;
        }
        const password = this.config.password;
        if (!password) {
            this.setState('info.connection', false);
            return;
        }
        const password_hash = EcoVacsAPI.md5(password);
        const device_id = EcoVacsAPI.md5(nodeMachineId.machineIdSync());
        const country = 'de';
        const continent = 'eu';

        const api = new EcoVacsAPI(device_id, country, continent);
        api.connect(account_id, password_hash).then(() => {
            api.devices().then((devices) => {
                let vacuum = devices[0];
                let vacbot = new VacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent);
                vacbot.on('ready', (event) => {
                    vacbot.on('CleanState', (cleanstate) => {
                        this.setState('device.info.cleanstate', cleanstate);
                    });
                    vacbot.on('ChargeState', (chargestate) => {
                        this.setState('device.info.chargestate', chargestate*100);
                    });
                    vacbot.on('BatteryInfo', (batterystate) => {
                        this.setState('device.info.batterystate', batterystate*100);
                    });
                });
                vacbot.connect_and_wait_until_ready();
                this.setState('info.connection', true);
            });
        }).catch((e) => {
            console.error('Failure in connecting!');
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