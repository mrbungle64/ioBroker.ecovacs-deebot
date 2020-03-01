/* eslint-disable quotes */

const SUPPORTED_STATES = {
    "115": {
        "name": "DEEBOT OZMO/PRO 930 Series",
        "info.dustbox": true
    },
    "yna5xi": {
        "name": "DEEBOT OZMO 950 Series",
        "info.dustbox": false
    },
    "123": {
        "name": "DEEBOT Slim2 Series",
        "info.dustbox": false
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
