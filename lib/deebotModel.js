/* eslint-disable quotes */

// Useful for features that are implemented in most models
// but should be disabled on some models
const DEFAULT_VALUES = {
    "control.pause": true,
    "control.playSound": true,
    "control.playIamHere": true
};

// Lookup table for features that can be enabled or disabled in adapter config
// It is possible to group them
const CONFIG_FEATURE_STATES = {
    "info.dustbox": "info.dustbox",
    "cleaninglog.channel": "cleaninglog.channel",
    "control.pause": "control.pause",
    "control.playSound": "control.playSound",
    "control.playIamHere": "control.playIamHere",
    "control.resume": "control.resume",
    "control.move": "control.move",
    "control.spotArea_cleanings": "control.spotArea_cleanings"
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
        "cleaninglog.channel": true,
        "map": true,
        "map.currentMapName": true,
        "map.currentMapIndex": true,
        "map.currentMapMID": true,
        "map.spotAreas": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.lastUsedAreaValues" : true,
        "consumable.reset": true,
        "control.goToPosition": true
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
        "map.deebotPositionIsInvalid": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.chargePosition": true,
        "map.spotAreas": true,
        "map.virtualBoundaries": true,
        "map.deleteVirtualBoundary": true,
        "cleaninglog.channel": true,
        "cleaninglog.lastCleaningMap": true,
        "map.lastUsedAreaValues" : true,
        "control.goToPosition": true
    },
    "vi829v": {
        "name": "DEEBOT OZMO 920",
        "deviceClassLink": "yna5xi"
    },
    "x5d34r": {
        "name": "DEEBOT OZMO T8 AIVI",
        "deviceClassLink": "yna5xi"
    },
    "h18jkh": {
        "name": "DEEBOT OZMO T8",
        "deviceClassLink": "yna5xi"
    },
    "b742vd": {
        "name": "DEEBOT OZMO T8",
        "deviceClassLink": "yna5xi"
    },
    "fqxoiu": {
        "name": "DEEBOT OZMO T8+",
        "deviceClassLink": "yna5xi"
    },
    "55aiho": {
        "name": "DEEBOT OZMO T8+",
        "deviceClassLink": "yna5xi"
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
    "126": {
        "name": "DEEBOT N79",
        "cleaninglog.channel": false
    },
    "155": {
        "name": "DEEBOT N79S/SE",
        "control.cleanSpeed": true
    },
    "165": {
        "name": "DEEBOT N79T/W",
        "control.cleanSpeed": true,
        "cleaninglog.channel": false
    },
    "uv242z": {
        "name": "DEEBOT 710",
        "control.pause": false,
        "info.dustbox": true,
        "map.deebotPosition": true
    },
    "ls1ok3": {
        "name": "DEEBOT 900 Series",
        "control.resume": true,
        "map.deebotPosition": true,
        "map.chargePosition": true,
        "map": true,
        "map.currentMapName": true,
        "map.currentMapIndex": true,
        "map.currentMapMID": true,
        "map.spotAreas": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.lastUsedAreaValues" : true,
        "control.cleanSpeed": true,
        "cleaninglog.channel": true,
        "cleaninglog.lastCleaningMap": true,
        "info.dustbox": false,
        "info.sleepStatus": true,
        "consumable.reset": true,
        "control.goToPosition": true
    },
    "y79a7u": {
        "name": "DEEBOT OZMO 900 Series",
        "cleaninglog.channel": true,
        "cleaninglog.lastCleaningMap": true
    },
    "ipzjy0": {
        "name": "DEEBOT U2",
        "control.cleanSpeed": true
    },
    "rvo6ev": {
        "deviceClassLink": "ipzjy0"
    },
    "wlqdkp": {
        "deviceClassLink": "ipzjy0"
    },
    "nq9yhl": {
        "name": "DEEBOT U2 PRO"
    },
    "y2qy3m": {
        "deviceClassLink": "nq9yhl"
    },
    "7j1tu6": {
        "deviceClassLink": "nq9yhl"
    },
    "ts2ofl": {
        "deviceClassLink": "nq9yhl"
    },
    "c0lwyn": {
        "deviceClassLink": "nq9yhl"
    },
    "d4v1pm": {
        "deviceClassLink": "nq9yhl"
    },
    "u6eqoa": {
        "deviceClassLink": "nq9yhl"
    },
    "12baap": {
        "deviceClassLink": "nq9yhl"
    },
    "u4h1uk": {
        "deviceClassLink": "nq9yhl"
    },
    "1zqysa": {
        "name": "DEEBOT U2 POWER"
    },
    "chmi0g": {
        "deviceClassLink": "1zqysa"
    }
};

class Model {
    constructor(deviceClass, config) {
        this.deviceClass = deviceClass;
        this.config = config;
    }

    getDeviceClass() {
        if (SUPPORTED_STATES[this.deviceClass]) {
            if (Object.prototype.hasOwnProperty.call(SUPPORTED_STATES[this.deviceClass], 'deviceClassLink')) {
                return SUPPORTED_STATES[this.deviceClass].deviceClassLink;
            }
        }
        return this.deviceClass;
    }

    isSupportedFeature(state) {
        if (this.getDeviceClass() && this.config) {
            let configOptionName = state;
            let configOptionVal = '';
            if (Object.prototype.hasOwnProperty.call(CONFIG_FEATURE_STATES, state)) {
                configOptionName = CONFIG_FEATURE_STATES[state];
                if (this.config['feature.' + configOptionName]) {
                    configOptionVal = this.config['feature.' + configOptionName];
                }
            }
            if ((configOptionVal === '') && Object.prototype.hasOwnProperty.call(SUPPORTED_STATES, this.getDeviceClass())) {
                const features = SUPPORTED_STATES[this.getDeviceClass()];
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
