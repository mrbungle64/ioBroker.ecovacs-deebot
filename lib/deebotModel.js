/* eslint-disable quotes */

const DEFAULT_VALUES = {
    "control.pause": true,
    "control.playSound": true,
    "control.playIamHere": true
};

const CONFIG_FEATURE_STATES = {
    "info.dustbox": "info.dustbox",
    "cleaninglog.channel": "cleaninglog.channel",
    "control.pause": "control.pause",
    "control.playSound": "control.playSound",
    "control.playIamHere": "control.playIamHere"
};

const SUPPORTED_STATES = {
    "115": {
        "name": "DEEBOT OZMO/PRO 930 Series",
        "control.resume": true,
        "control.cleanSpeed": false,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map.deebotPosition": true,
        "map.chargePosition": true,
        "cleaninglog.channel": true
    },
    "yna5xi": {
        "name": "DEEBOT OZMO 950 Series",
        "control.resume": true,
        "control.cleanSpeed": true,
        "control.relocate": true,
        "info.dustbox": false,
        "info.sleepStatus": true,
        "info.ip": true,
        "info.wifiSSID": true,
        "info.wifiSignal": true,
        "info.mac": true,
        "map": true,
        "map.currentMapName": true,
        "map.currentMapIndex": true,
        "map.currentMapMID": true,
        "map.relocationState": true,
        "map.deebotPosition": true,
        "map.chargePosition": true,
        "cleaninglog.channel": true
    },
    "123": {
        "name": "DEEBOT Slim2 Series",
        "control.pause": false,
        "control.playSound": false,
        "control.playIamHere": false,
        "info.dustbox": false,
        "info.ip": true,
        "info.wifiSSID": true,
        "control.cleanSpeed": false,
        "map": false
    },
    "uv242z": {
        "name": "DEEBOT 710",
        "info.dustbox": true,
        "map.deebotPosition": true
    }
};

class Model {
    constructor(deviceClass, config) {
        this.deviceClass = deviceClass;
        this.config = config;
    }

    isSupportedFeature(state) {
        if ((this.deviceClass) && (this.config)) {
            let configOptionName = state;
            let configOptionVal = '';
            if (Object.prototype.hasOwnProperty.call(CONFIG_FEATURE_STATES, state)) {
                configOptionName = CONFIG_FEATURE_STATES[state];
                configOptionVal = this.config['feature.' + configOptionName];
            }
            if ((configOptionVal === '') && (Object.prototype.hasOwnProperty.call(SUPPORTED_STATES, this.deviceClass))) {
                const features = SUPPORTED_STATES[this.deviceClass];
                if (Object.prototype.hasOwnProperty.call(features, state)) {
                    return features[state];
                }
            }
            else if (parseInt(configOptionVal) === 1) {
                return true;
            }
        }
        if (Object.prototype.hasOwnProperty.call(DEFAULT_VALUES, state)) {
            return DEFAULT_VALUES[state];
        }
        return false;
    }
}

module.exports = Model;
