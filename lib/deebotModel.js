/* eslint-disable quotes */

const CONFIG_FEATURE_STATES = {
    "info.dustbox": "info.dustbox",
    "cleaninglog.squareMeters": "cleaninglog.channel",
    "cleaninglog.totalSeconds": "cleaninglog.channel",
    "cleaninglog.totalNumber": "cleaninglog.channel"
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
            let name = state;
            if (CONFIG_FEATURE_STATES[state]) {
                name = CONFIG_FEATURE_STATES[state];
            }
            const configVal = this.config['feature.' + name];
            if ((configVal === '') && (SUPPORTED_STATES[this.deviceClass])) {
                const features = SUPPORTED_STATES[this.deviceClass];
                if (features[state]) {
                    return features[state];
                }
            }
            else if (configVal == 1) {
                return true;
            }
        }
        return false;
    }
}

module.exports = Model;
