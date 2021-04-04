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
        this.deebotPosition = null;
        this.chargePosition = null;
        this.pauseBeforeDockingChargingStation = false;
        this.pauseBeforeDockingIfWaterboxInstalled = false;
        this.waterboxinfo = null;
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
        this.setConnection(false);
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
                    this.setStateConditional(id, false, true);
                }
            });
        }

        const MAX_RETRIES = 3;
        const RETRY_PAUSE = 6000;

        const stateName = helper.getStateNameById(id);
        const timestamp = Math.floor(Date.now() / 1000);
        const date = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');

        // id cropped by namespace
        const stateId = id.replace(this.namespace + '.', '');

        if (helper.getChannelNameById(id) !== 'history') {
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

            if (state.ack) {
                return;
            }

            const path = id.split('.');
            const mapID = parseInt(path[3]);
            const mssID = path[5];

            // spotarea cleaning (map-specific)
            const mapSpotAreaPattern = /cleanSpotArea/;
            if (mapSpotAreaPattern.test(id)) {
                if (mapID === this.currentMapID && (!this.deebotPositionIsInvalid || !this.getModel().isSupportedFeature('map.deebotPositionIsInvalid'))) {
                    this.log.info('Start cleaning spot area: ' + mssID + ' on map ' + mapID);
                    this.vacbot.run('spotArea', 'start', mssID);
                    if (this.spotAreaCleanings > 1) {
                        this.cleaningQueue.createForId('control', 'spotArea', mssID);
                    }
                } else {
                    this.log.error('failed start cleaning spot area: ' + mssID + ' - position invalid or bot not on map ' + mapID + ' (current mapID: ' + this.currentMapID + ')');
                }
                return;
                //TODO: relocate if not correct map, queueing until relocate finished (async)
            }

            if (stateName === 'lastUsedCustomAreaValues_rerun') {
                this.getStateAsync('map.lastUsedCustomAreaValues').then(state => {
                    if (state && state.val) {
                        this.startCustomArea(state.val, this.customAreaCleanings);
                    }
                });
                return;
            }

            if (id.split('.')[3] === 'savedCustomAreas') {
                const pattern = /map\.savedCustomAreas\.customArea_[0-9]{10}$/;
                if (pattern.test(id)) {
                    this.getObjectAsync(id).then(obj => {
                        if (obj && obj.native && obj.native.area) {
                            this.startCustomArea(obj.native.area, this.customAreaCleanings);
                        }
                    });
                }
                return;
            }

            if (stateName === 'lastUsedCustomAreaValues_save') {
                this.getStateAsync('map.lastUsedCustomAreaValues').then(state => {
                    if (state && state.val) {
                        this.createChannelNotExists('map.savedCustomAreas', 'Saved areas').then(() => {
                            const timestamp = Math.floor(Date.now() / 1000);
                            let dateTime = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                            const savedAreaID = 'map.savedCustomAreas.customArea_' + timestamp;
                            const customAreaValues = state.val;
                            let currentMapID = this.currentMapID;
                            this.getObjectAsync('map.lastUsedCustomAreaValues').then(obj => {
                                if (obj) {
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
                                                currentMapID: currentMapID,
                                                area: customAreaValues,
                                                dateTime: dateTime
                                            }
                                        });
                                }
                            });
                        });
                    }
                });
                return;
            }

            if (stateName === 'saveVirtualBoundary') {
                this.createChannelNotExists('map.savedBoundaries', 'Saved virtual boundaries in the map for de-/activation').then(() => {
                    this.log.info('save virtual boundary: ' + mssID + ' on map ' + mapID);
                    this.getStateAsync('map.' + mapID + '.virtualBoundaries.' + mssID + '.virtualBoundaryType').then(state => {
                        if (state && state.val) {
                            const savedBoundaryType = state.val;
                            this.getStateAsync('map.' + mapID + '.virtualBoundaries.' + mssID + '.virtualBoundaryCoordinates').then(state => {
                                if (state && state.val) {
                                    this.createChannelNotExists('map.savedBoundaries', 'Saved virtual boundaries in the map for de-/activation').then(() => {
                                        const timestamp = Math.floor(Date.now() / 1000);
                                        const dateTime = this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss');
                                        const savedBoundaryID = 'map.savedBoundaries.virtualBoundary_' + timestamp;
                                        const savedBoundaryCoordinates = state.val;
                                        this.setObjectNotExists(
                                            savedBoundaryID, {
                                                type: 'state',
                                                common: {
                                                    name: 'myAreaName (mapID ' + mapID + ', virtualBoundary ' + savedBoundaryCoordinates + ')',
                                                    type: 'boolean',
                                                    role: 'button',
                                                    read: true,
                                                    write: true,
                                                    def: false,
                                                    unit: ''
                                                },
                                                native: {
                                                    currentMapID: mapID,
                                                    boundaryType: savedBoundaryType,
                                                    boundaryCoordinates: savedBoundaryCoordinates,
                                                    dateTime: dateTime
                                                }
                                            });
                                    });
                                }
                            });
                        }
                    });
                });
                return;
            }

            if (stateId.includes('map.savedBoundaries.virtualBoundary_')) {
                this.getObjectAsync(stateId).then(obj => {
                    if (obj) {
                        if ((obj.native) && (obj.native.dateTime) && (obj.native.currentMapID)) {
                            this.log.info('Add virtual boundary on map ' + obj.native.currentMapID + ' with type ' + obj.native.boundaryType);
                            this.vacbot.run('AddVirtualBoundary', obj.native.currentMapID.toString(), obj.native.boundaryCoordinates, obj.native.boundaryType);
                            if (obj.native.boundaryType === 'vw') {
                                this.intervalQueue.add('GetMaps');
                            }
                        }
                    }
                });
                return;
            }

            if (stateName === 'deleteVirtualBoundary') {
                const objID = 'map.' + mapID + '.virtualBoundaries.' + mssID;
                this.getObjectAsync(objID).then(obj => {
                    if (obj) {
                        this.log.debug('Mark virtual boundary for deletion: ' + mssID + ' on map ' + mapID);
                        this.extendObject(objID, {
                            native: {
                                markedForDeletion: true,
                                timestamp: Math.floor(Date.now() / 1000)
                            }
                        });
                        const stateID = objID + '.virtualBoundaryType';
                        this.getStateAsync(stateID).then(state => {
                            if (state && state.val) {
                                const type = state.val;
                                this.log.info('Delete virtual boundary on server: ' + mssID + ' on map ' + mapID + ' with type ' + type);
                                this.commandQueue.run('DeleteVirtualBoundary', mapID.toString(), mssID, type);
                            }
                        });
                    }
                });
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
            switch (stateName) {
                case 'volume': {
                    if (!state.ack) {
                        const volume = parseInt(state.val);
                        if ((volume >= 1) && (volume <= 10)) {
                            this.vacbot.run('setVolume', volume);
                        }
                    }
                    break;
                }
                case 'doNotDisturb': {
                    if (!state.ack) {
                        const doNotDisturb = state.val === true ? '1' : '0';
                        this.vacbot.run('SetOnOff', 'do_not_disturb', doNotDisturb);
                        this.log.info('Set doNotDisturb: ' + state.val);
                    }
                    break;
                }
                case 'continuousCleaning': {
                    if (!state.ack) {
                        const continuousCleaning = state.val === true ? '1' : '0';
                        this.vacbot.run('SetOnOff', 'continuous_cleaning', continuousCleaning);
                        this.log.info('Set continuousCleaning: ' + state.val);
                    }
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
                    } else if (state.val !== '') {
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
            if (stateName === 'customArea_cleanings') {
                this.customAreaCleanings = state.val;
                return;
            }
            if (stateName === 'spotArea_cleanings') {
                this.spotAreaCleanings = state.val;
                return;
            }

            if (state.ack) {
                return;
            }

            if (stateName === 'waterLevel') {
                this.runSetWaterLevel(state.val);
                return;
            }
            if (stateName === 'cleanSpeed') {
                this.runSetCleanSpeed(state.val);
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
                            this.setStateConditional('control.customArea_cleanings', customAreaCleanings, true);
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
                    this.log.info('Run: ' + stateName);
                    this.vacbot.run(stateName);
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
        this.retrypauseTimeout = null;
        this.retries++;
        this.log.info('Reconnecting (' + this.retries + ') ...');
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
                this.nick = vacuum.nick ? vacuum.nick : 'New Device ' + this.deviceNumber;

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
                    this.log.info(this.nick + ' instance successfully connected');
                    this.setStateConditional('info.version', this.version, true);
                    this.setStateConditional('info.library.version', api.getVersion(), true);
                    this.setStateConditional('info.library.canvasModuleIsInstalled', this.canvasModuleIsInstalled, true);
                    this.setStateConditional('info.deviceName', this.nick, true);
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
                                            this.setStateConditional('history.timestampOfLastStartCleaning', Math.floor(Date.now() / 1000), true);
                                            this.setStateConditional('history.dateOfLastStartCleaning', this.formatDate(new Date(), 'TT.MM.JJJJ SS:mm:ss'), true);
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
                        if (this.connected) {
                            if (error) {
                                // This triggers a reconnect attempt
                                this.connectionFailed = true;
                            }
                            this.disconnect(false);
                        }
                    });
                    this.vacbot.on('WaterBoxInfo', (status) => {
                        this.waterboxinfo = (parseInt(status) === 1);
                        this.setStateConditional('info.waterbox', this.waterboxinfo, true);
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
                        this.cleanSpeed = level;
                        adapterObjects.createControlCleanSpeedIfNotExists(this, 0, 'control.cleanSpeed_standard', 'Clean speed if no other value is set').then(() => {
                            adapterObjects.createControlCleanSpeedIfNotExists(this, this.cleanSpeed).then(() => {
                                this.setStateConditional('control.cleanSpeed', this.cleanSpeed, true);
                            });
                        });
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
                        this.getState('info.error', (err, state) => {
                            if (!err && state) {
                                if (state.val !== value) {
                                    this.setState('info.error', value, true);
                                    if (value === 'NoError: Robot is operational') {
                                        if (this.connected === false) {
                                            this.setConnection(true);
                                        }
                                    } else {
                                        this.log.warn('Error message received: ' + value);
                                        if (value === 'Recipient unavailable') {
                                            this.setConnection(false);
                                        }
                                    }
                                }
                            }
                        });
                    });
                    this.vacbot.on('ErrorCode', (value) => {
                        this.setStateConditional('info.errorCode', value, true);
                    });
                    this.vacbot.on('Debug', (value) => {
                        this.setStateConditional('info.library.debugMessage', value, true);
                    });
                    this.vacbot.on('NetInfoIP', (value) => {
                        this.setStateConditional('info.network.ip', value, true);
                    });
                    this.vacbot.on('NetInfoWifiSSID', (value) => {
                        this.setStateConditional('info.network.wifiSSID', value, true);
                    });
                    this.vacbot.on('NetInfoWifiSignal', (value) => {
                        this.setStateConditional('info.network.wifiSignal', value, true);
                    });
                    this.vacbot.on('NetInfoMAC', (value) => {
                        this.setStateConditional('info.network.mac', value, true);
                    });
                    this.vacbot.on('RelocationState', (relocationState) => {
                        this.setStateConditional('map.relocationState', relocationState, true);
                    });
                    this.vacbot.on('DeebotPosition', (deebotPosition) => {
                        this.deebotPosition = deebotPosition;
                        this.setStateConditional('map.deebotPosition', deebotPosition, true);
                        const x = deebotPosition.split(',')[0];
                        this.setStateConditional('map.deebotPosition_x', x, true);
                        const y = deebotPosition.split(',')[1];
                        this.setStateConditional('map.deebotPosition_y', y, true);
                        const a = deebotPosition.split(',')[2];
                        if (a) {
                            this.setStateConditional('map.deebotPosition_angle', a, true);
                        }
                        if (this.getModel().isSupportedFeature('map.chargePosition')) {
                            if (this.deebotPosition && this.chargePosition) {
                                const distance = mapHelper.getDistanceToChargeStation(this.deebotPosition, this.chargePosition);
                                this.setStateConditional('map.deebotDistanceToChargePosition', distance, true);
                            }
                        }
                        if (this.goToPositionArea) {
                            if (mapHelper.positionIsInAreaValueString(x, y, this.goToPositionArea)) {
                                this.vacbot.run('stop');
                                this.setStateConditional('control.extended.goToPosition', '', true);
                                this.goToPositionArea = null;
                            }
                        }
                        const pauseBeforeDockingIfWaterboxInstalled = this.pauseBeforeDockingIfWaterboxInstalled && this.waterboxinfo;
                        if ((this.chargestatus === 'returning') && (this.pauseBeforeDockingChargingStation || pauseBeforeDockingIfWaterboxInstalled)) {
                            let areaSize = 500;
                            if (this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize')) {
                                areaSize = this.getConfigValue('feature.pauseBeforeDockingChargingStation.areasize');
                            }
                            if (mapHelper.positionIsInRectangleForPosition(x, y, this.chargePosition, areaSize)) {
                                if (this.deviceStatus !== 'paused') {
                                    this.commandQueue.run('pause');
                                }
                                this.setStateConditional('control.extended.pauseBeforeDockingChargingStation', false, true);
                                this.pauseBeforeDockingChargingStation = false;
                                this.pauseBeforeDockingIfWaterboxInstalled = false;
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
                            if ((this.deebotPositionCurrentSpotAreaID !== deebotPositionCurrentSpotAreaID) && (this.deviceStatus === 'cleaning')) {
                                const spotAreaChannel = 'map.' + this.currentMapID + '.spotAreas.' + deebotPositionCurrentSpotAreaID;
                                this.getStateAsync(spotAreaChannel + '.cleanSpeed').then((state) => {
                                    if (state && state.val && (state.val !== this.cleanSpeed) && (state.val > 0)) {
                                        this.cleanSpeed = state.val;
                                        this.setStateConditional('control.cleanSpeed', this.cleanSpeed, true);
                                        this.log.info('Set clean speed to ' + this.cleanSpeed + ' for spot area ' + deebotPositionCurrentSpotAreaID);
                                    } else {
                                        this.getStateAsync('control.cleanSpeed_standard').then((state) => {
                                            if (state && state.val && (state.val !== this.cleanSpeed) && (state.val > 0)) {
                                                this.cleanSpeed = state.val;
                                                this.setStateConditional('control.cleanSpeed', this.cleanSpeed, true);
                                                this.log.info('Set clean speed to standard (' + this.cleanSpeed + ') for spot area ' + deebotPositionCurrentSpotAreaID);
                                            }
                                        });
                                    }
                                });
                                if (this.waterboxinfo === true) {
                                    this.getStateAsync(spotAreaChannel + '.waterLevel').then((state) => {
                                        if (state && state.val && (state.val !== this.waterLevel) && (state.val > 0)) {
                                            this.waterLevel = state.val;
                                            this.setStateConditional('control.waterLevel', this.waterLevel, true);
                                            this.log.info('Set water level to ' + this.waterLevel + ' for spot area ' + deebotPositionCurrentSpotAreaID);
                                        } else {
                                            this.getStateAsync('control.waterLevel_standard').then((state) => {
                                                if (state && state.val && (state.val !== this.waterLevel) && (state.val > 0)) {
                                                    this.waterLevel = state.val;
                                                    this.setStateConditional('control.waterLevel', this.waterLevel, true);
                                                    this.log.info('Set water level to standard (' + this.waterLevel + ') for spot area ' + deebotPositionCurrentSpotAreaID);
                                                }
                                            });
                                        }
                                    });
                                }
                            }
                            if (this.deebotPositionCurrentSpotAreaID && this.pauseWhenEnteringSpotArea) {
                                if (parseInt(this.pauseWhenEnteringSpotArea) === parseInt(deebotPositionCurrentSpotAreaID)) {
                                    if (this.deviceStatus !== 'paused') {
                                        this.commandQueue.run('pause');
                                    }
                                    this.pauseWhenEnteringSpotArea = null;
                                    this.setStateConditional('control.extended.pauseWhenEnteringSpotArea', '', true);
                                }
                            }
                            if (this.deebotPositionCurrentSpotAreaID && this.pauseWhenLeavingSpotArea) {
                                if (parseInt(deebotPositionCurrentSpotAreaID) !== parseInt(this.deebotPositionCurrentSpotAreaID)) {
                                    if (parseInt(this.pauseWhenLeavingSpotArea) === parseInt(this.deebotPositionCurrentSpotAreaID)) {
                                        if (this.deviceStatus !== 'paused') {
                                            this.commandQueue.run('pause');
                                        }
                                        this.pauseWhenLeavingSpotArea = null;
                                        this.setStateConditional('control.extended.pauseWhenLeavingSpotArea', '', true);
                                    }
                                }
                            }
                            this.deebotPositionCurrentSpotAreaID = deebotPositionCurrentSpotAreaID;
                            this.setStateConditional('map.deebotPositionCurrentSpotAreaID', deebotPositionCurrentSpotAreaID, true);
                            this.getState('map.' + this.currentMapID + '.spotAreas.' + deebotPositionCurrentSpotAreaID + '.spotAreaName', (err, state) => {
                                if (!err && state) {
                                    const spotAreaName = mapHelper.getAreaName_i18n(this, state.val);
                                    this.setStateConditional('map.deebotPositionCurrentSpotAreaName', spotAreaName);
                                } else {
                                    this.setStateConditional('map.deebotPositionCurrentSpotAreaName', 'unknown');
                                }
                            });
                        }
                    });
                    this.vacbot.on('ChargePosition', (chargePosition) => {
                        this.chargePosition = chargePosition;
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
                        this.cleaningLogAcknowledged = true;
                    });
                    this.vacbot.on('CleanLog_lastImageUrl', (url) => {
                        this.setStateConditional('cleaninglog.lastCleaningMapImageURL', url, true);
                    });
                    this.vacbot.on('CleanLog_lastTimestamp', (timestamp) => {
                        this.setStateConditional('cleaninglog.lastCleaningTimestamp', timestamp, true);
                        const lastCleaningDate = this.formatDate(new Date(timestamp * 1000), 'TT.MM.JJJJ SS:mm:ss');
                        this.setStateConditional('cleaninglog.lastCleaningDate', lastCleaningDate, true);
                    });
                    this.vacbot.on('CleanLog_lastSquareMeters', (value) => {
                        this.setStateConditional('cleaninglog.lastSquareMeters', value, true);
                        if ((this.deviceStatus === 'returning') || (this.deviceStatus === 'charging')) {
                            this.resetCurrentStats();
                        }
                    });
                    this.vacbot.on('CleanLog_lastTotalTimeString', (value) => {
                        this.setStateConditional('cleaninglog.lastTotalTimeString', value, true);
                    });
                    this.vacbot.on('CurrentStats', (obj) => {
                        if (obj.cleanedArea) {
                            this.setStateConditional('cleaninglog.current.cleanedArea', obj.cleanedArea, true);
                        }
                        if (obj.cleanedSeconds) {
                            this.setStateConditional('cleaninglog.current.cleanedSeconds', obj.cleanedSeconds, true);
                            const hours = Math.floor(obj.cleanedSeconds / 3600);
                            const minutes = Math.floor((obj.cleanedSeconds % 3600) / 60);
                            const seconds = Math.floor(obj.cleanedSeconds % 60);
                            const timeString = hours.toString() + 'h ' + ((minutes < 10) ? '0' : '') + minutes.toString() + 'm ' + ((seconds < 10) ? '0' : '') + seconds.toString() + 's';
                            this.setStateConditional('cleaninglog.current.cleanedTime', timeString, true);
                        }
                        if (obj.cleanType) {
                            this.setStateConditional('cleaninglog.current.cleanType', obj.cleanType, true);
                        }
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

    setInitialStateValues() {
        this.resetErrorStates();
        this.resetCurrentStats();
        this.setStateConditional('info.library.debugMessage', '', true);

        this.getState('map.currentMapMID', (err, state) => {
            if (!err && state) {
                this.currentMapID = Number(state.val);
            }
        });
        if (this.config['workaround.batteryValue'] === true) {
            this.setStateConditional('info.battery', '', false);
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
                this.waterboxinfo = (state.val === true);
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
    }

    async setStateConditionalAsync(stateId, value, ack = true, native) {
        await this.getStateAsync(stateId).then((state) => {
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
        });
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
        if (this.getModel().isSupportedFeature('info.ip')) {
            this.commandQueue.add('GetNetInfo');
        }
        if (this.vacbot.hasMoppingSystem()) {
            this.commandQueue.add('GetWaterBoxInfo');
            this.commandQueue.add('GetWaterLevel');
        }
        this.commandQueue.addGetLifespan();
        this.commandQueue.add('GetSleepStatus');
        this.commandQueue.add('GetCleanSpeed');
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
        this.intervalQueue.add('GetCleanSpeed');
        this.intervalQueue.addOnOff();
        if (this.getModel().isSupportedFeature('control.volume')) {
            this.intervalQueue.add('GetVolume');
        }
        if (this.getModel().isSupportedFeature('info.wifiSignal') && (this.deviceStatus === 'cleaning')) {
            this.intervalQueue.add('GetNetInfo');
        }
        if (!this.cleaningLogAcknowledged) {
            this.commandQueue.addGetCleanLogs();
        }

        this.intervalQueue.runAll();

        if (this.currentMapID) {
            mapObjects.processVirtualBoundaryChannels(this, this.currentMapID);
        }
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
        this.setObjectNotExists(id, {
            type: 'channel',
            common: {
                name: name
            },
            native: {}
        });
    }

    async deleteChannelIfExists(id) {
        this.getObjectAsync(id).then(obj => {
            if (obj) {
                this.deleteObjectIfExists(obj._id);
            }
        });
    }

    async deleteObjectIfExists(id) {
        this.getObjectAsync(id).then(obj => {
            if (obj) {
                this.delObjectAsync(id);
            }
        });
    }

    async createObjectNotExists(id, name, type, role, write, def, unit = '') {
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
    }
}

// @ts-ignore parent is a valid property on module
if (module && module.parent) {
    module.exports = (options) => new EcovacsDeebot(options);
} else {
    new EcovacsDeebot();
}
