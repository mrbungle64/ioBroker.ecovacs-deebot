/* eslint-disable quotes */

const SUPPORTED_STATES = {
    "115": {
        "name": "DEEBOT OZMO/PRO 930 Series",
        "control.cleanSpeed": false,
        "info.dustbox": true,
        "map.deebotPosition": true,
        "map.chargePosition": true
    },
    "yna5xi": {
        "name": "DEEBOT OZMO 950 Series",
        "control.resume": true,
        "control.cleanSpeed": true,
        "control.relocate": true,
        "info.dustbox": false,
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
        "map.chargePosition": true
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
        "info.dustbox": true
    }
};

class Model {
    constructor(deviceClass) {
        this.deviceClass = deviceClass;
    }

    isSupportedFeature(state) {
        if (this.deviceClass) {
            if (SUPPORTED_STATES[this.deviceClass]) {
                const features = SUPPORTED_STATES[this.deviceClass];
                if (features[state]) {
                    return features[state];
                }
            }
        }
        return false;
    }
}

module.exports = Model;
