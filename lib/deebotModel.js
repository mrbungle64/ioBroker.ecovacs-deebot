/* eslint-disable quotes */

// Useful for features that are implemented in most models
// but should be disabled on some models
const DEFAULT_VALUES = {
    "control.pause": true,
    "control.resume": true,
    "control.playSound": true,
    "control.playIamHere": true,
    "cleaninglog.channel": true
};

// Lookup table for features that can be enabled or disabled in adapter config
// It is possible to group them
const CONFIG_FEATURE_STATES = {
    "control.autoBoostSuction": "control.autoBoostSuction",
    "control.autoEmptyStation": "control.autoEmptyStation",
    "control.goToPosition": "control.experimental",
    "control.pauseBeforeDockingChargingStation": "control.experimental",
    "control.pauseWhenEnteringSpotArea": "control.experimental",
    "control.pauseWhenLeavingSpotArea": "control.experimental",
    "control.resetCleanSpeedToStandardOnReturn": "control.experimental",
    "control.move": "control.move",
    "consumable.airFreshener": "consumable.airFreshener",
    "info.dustbox": "info.dustbox",
    "map.mapImage": "map.mapImage",
    "map.spotAreas.cleanSpeed": "map.spotAreas.cleanSpeed",
    "map.spotAreas.waterLevel": "map.spotAreas.waterLevel",
    "map.virtualBoundaries": "map.virtualBoundaries",
    "map.virtualBoundaries.delete": "map.virtualBoundaries.write",
    "map.virtualBoundaries.save": "map.virtualBoundaries.write"
};

// Lookup table for supported features that are enabled by default
const SUPPORTED_STATES = {
    "123": {
        "name": "DEEBOT Slim2 Series",
        "control.cleanSpeed": false,
        "control.pause": false,
        "control.resume": false,
        "control.playIamHere": false,
        "control.playSound": false,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.wifiSSID": true
    },
    "126": {
        "name": "DEEBOT N79",
        "cleaninglog.channel": false,
        "control.resume": false
    },
    "155": {
        "name": "DEEBOT N79S/SE",
        "control.cleanSpeed": true,
        "cleaninglog.channel": false,
        "control.resume": false
    },
    "165": {
        "name": "DEEBOT N79T/W",
        "control.cleanSpeed": true,
        "control.resume": false,
        "cleaninglog.channel": false
    },
    "vsc5ia": {
        "name": "DEEBOT 500",
        "control.cleanSpeed": true
    },
    "dl8fht": {
        "name": "DEEBOT 600 Series",
        "control.cleanSpeed": true
    },
    "uv242z": {
        "name": "DEEBOT 710",
        "control.pause": false,
        "control.resume": false,
        "info.dustbox": true,
        "map.deebotPosition": true
    },
    "ls1ok3": {
        "name": "DEEBOT 900 Series",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": false,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.lastUsedAreaValues" : true,
        "map.spotAreas": true
    },
    "02uwxm": {
        "name": "DEEBOT OZMO Slim10 Series",
        "control.playIamHere": false
    },
    "130": {
        "name": "DEEBOT OZMO 610 Series",
        "control.cleanSpeed": true
    },
    "y79a7u": {
        "name": "DEEBOT OZMO 900 Series",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.deebotPositionIsInvalid": true,
        "map.lastUsedAreaValues" : true,
        "map.spotAreas": true
    },
    "2pv572": {
        "name": "DEEBOT OZMO 905",
        "deviceClassLink": "y79a7u"
    },
    "115": {
        "name": "DEEBOT OZMO/PRO 930 Series",
        "consumable.reset": true,
        "control.cleanSpeed": false,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.lastUsedAreaValues": true,
        "map.spotAreas": true
    },
    "yna5xi": {
        "name": "DEEBOT OZMO 950 Series",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "control.relocate": true,
        "control.volume": true,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.mac": true,
        "info.network.wifiSSID": true,
        "info.network.wifiSignal": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.deebotPositionIsInvalid": true,
        "map.lastUsedAreaValues" : true,
        "map.mapImage": true,
        "map.relocationState": true,
        "map.spotAreas": true
    },
    "h18jkh": {
        "name": "DEEBOT OZMO T8",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanCount": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "control.relocate": true,
        "control.volume": true,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.mac": true,
        "info.network.wifiSSID": true,
        "info.network.wifiSignal": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.deebotPositionIsInvalid": true,
        "map.lastUsedAreaValues" : true,
        "map.relocationState": true,
        "map.spotAreas": true,
        "technology.trueDetect": true
    },
    "55aiho": {
        "name": "DEEBOT OZMO T8 AIVI",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanCount": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "control.relocate": true,
        "control.volume": true,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.mac": true,
        "info.network.wifiSSID": true,
        "info.network.wifiSignal": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.deebotPositionIsInvalid": true,
        "map.lastUsedAreaValues" : true,
        "map.relocationState": true,
        "map.spotAreas": true,
        "technology.trueDetect": true
    },
    "ipzjy0": {
        "name": "DEEBOT U2",
        "control.cleanSpeed": true,
        "control.playSound": false
    },
    "emzppx": {
        "name": "DEEBOT 501",
        "deviceClassLink": "vsc5ia"
    },
    "r8ead0": {
        "name": "DEEBOT 502",
        "deviceClassLink": "vsc5ia"
    },
    "jr3pqa": {
        "name": "DEEBOT 711",
        "deviceClassLink": "uv242z"
    },
    "d0cnel": {
        "name": "DEEBOT 711s",
        "deviceClassLink": "uv242z"
    },
    "vi829v": {
        "name": "DEEBOT OZMO 920",
        "deviceClassLink": "yna5xi"
    },
    "jffnlf": {
        "name": "DEEBOT N3 MAX",
        "deviceClassLink": "h18jkh"
    },
    "r5zxjr": {
        "name": "DEEBOT N7",
        "deviceClassLink": "h18jkh"
    },
    "n6cwdb": {
        "name": "DEEBOT N8",
        "deviceClassLink": "h18jkh"
    },
    "r5y7re": {
        "name": "DEEBOT N8",
        "deviceClassLink": "h18jkh"
    },
    "ty84oi": {
        "name": "DEEBOT N8",
        "deviceClassLink": "h18jkh"
    },
    "36xnxf": {
        "name": "DEEBOT N8",
        "deviceClassLink": "h18jkh"
    },
    "snxbvc": {
        "name": "DEEBOT N8 PRO",
        "deviceClassLink": "h18jkh"
    },
    "yu362x": {
        "name": "DEEBOT N8 PRO",
        "deviceClassLink": "h18jkh"
    },
    "7bryc5": {
        "name": "DEEBOT N8+",
        "deviceClassLink": "h18jkh"
    },
    "b2jqs4": {
        "name": "DEEBOT N8+",
        "deviceClassLink": "h18jkh"
    },
    "ifbw08": {
        "name": "DEEBOT N8 PRO+",
        "deviceClassLink": "h18jkh"
    },
    "85as7h": {
        "name": "DEEBOT N8 PRO+",
        "deviceClassLink": "h18jkh"
    },
    "c2of2s": {
        "name": "DEEBOT N9+",
        "deviceClassLink": "h18jkh"
    },
    "m1wkuw": {
        "name": "DEEBOT N10",
        "deviceClassLink": "h18jkh"
    },
    "umwv6z": {
        "name": "DEEBOT N10 PLUS",
        "deviceClassLink": "h18jkh"
    },
    "9rft3c": {
        "name": "DEEBOT OZMO T5",
        "deviceClassLink": "yna5xi"
    },
    "x5d34r": {
        "name": "DEEBOT OZMO T8 AIVI",
        "deviceClassLink": "55aiho"
    },
    "bs40nz": {
        "name": "DEEBOT T8 AIVI",
        "deviceClassLink": "55aiho"
    },
    "5089oy": {
        "name": "DEEBOT T8 AIVI",
        "deviceClassLink": "55aiho"
    },
    "tpnwyu": {
        "name": "DEEBOT OZMO T8 AIVI +",
        "deviceClassLink": "55aiho"
    },
    "34vhpm": {
        "name": "DEEBOT OZMO T8 AIVI +",
        "deviceClassLink": "55aiho"
    },
    "w16crm": {
        "name": "DEEBOT OZMO T8 AIVI +",
        "deviceClassLink": "55aiho"
    },
    "vdehg6": {
        "name": "DEEBOT T8 AIVI +",
        "deviceClassLink": "55aiho"
    },
    "b742vd": {
        "name": "DEEBOT OZMO T8",
        "deviceClassLink": "h18jkh"
    },
    "0bdtzz": {
        "name": "DEEBOT OZMO T8 PURE",
        "deviceClassLink": "h18jkh"
    },
    "fqxoiu": {
        "name": "DEEBOT OZMO T8+",
        "deviceClassLink": "h18jkh"
    },
    "wgxm70": {
        "name": "DEEBOT T8",
        "deviceClassLink": "h18jkh"
    },
    "a1nNMoAGAsH": {
        "name": "DEEBOT T8 MAX",
        "deviceClassLink": "h18jkh"
    },
    "no61kx": {
        "name": "DEEBOT T8 POWER",
        "deviceClassLink": "h18jkh"
    },
    "ucn2xe": {
        "name": "DEEBOT T9",
        "deviceClassLink": "h18jkh"
    },
    "ipohi5": {
        "name": "DEEBOT T9",
        "deviceClassLink": "h18jkh"
    },
    "lhbd50": {
        "name": "DEEBOT T9+",
        "deviceClassLink": "h18jkh"
    },
    "um2ywg": {
        "name": "DEEBOT T9+",
        "deviceClassLink": "h18jkh"
    },
    "8kwdb4": {
        "name": "DEEBOT T9 AIVI",
        "deviceClassLink": "55aiho"
    },
    "659yh8": {
        "name": "DEEBOT T9 AIVI",
        "deviceClassLink": "55aiho"
    },
    "kw9ayx": {
        "name": "DEEBOT T9 AIVI Plus",
        "deviceClassLink": "55aiho"
    },
    "jtmf04": {
        "name": "DEEBOT T10",
        "deviceClassLink": "h18jkh"
    },
    "rss8xk": {
        "name": "DEEBOT T10 PLUS",
        "deviceClassLink": "h18jkh"
    },
    "p95mgv": {
        "name": "DEEBOT T10 PLUS",
        "deviceClassLink": "h18jkh"
    },
    "p1jij8": {
        "name": "DEEBOT T20 OMNI",
        "deviceClassLink": "3yqsch"
    },
    "rvo6ev": {
        "name": "DEEBOT U2",
        "deviceClassLink": "ipzjy0"
    },
    "wlqdkp": {
        "name": "DEEBOT U2",
        "deviceClassLink": "ipzjy0"
    },
    "nq9yhl": {
        "name": "DEEBOT U2 PRO",
        "deviceClassLink": "ipzjy0"
    },
    "y2qy3m": {
        "name": "DEEBOT U2 PRO",
        "deviceClassLink": "ipzjy0"
    },
    "7j1tu6": {
        "name": "DEEBOT U2 PRO",
        "deviceClassLink": "ipzjy0"
    },
    "ts2ofl": {
        "name": "DEEBOT U2 PRO",
        "deviceClassLink": "ipzjy0"
    },
    "c0lwyn": {
        "name": "DEEBOT U2 PRO",
        "deviceClassLink": "ipzjy0"
    },
    "d4v1pm": {
        "name": "DEEBOT U2 PRO",
        "deviceClassLink": "ipzjy0"
    },
    "u6eqoa": {
        "name": "DEEBOT U2 PRO",
        "deviceClassLink": "ipzjy0"
    },
    "12baap": {
        "name": "DEEBOT U2 PRO",
        "deviceClassLink": "ipzjy0"
    },
    "u4h1uk": {
        "name": "DEEBOT U2 PRO",
        "deviceClassLink": "ipzjy0"
    },
    "1zqysa": {
        "name": "DEEBOT U2 POWER",
        "deviceClassLink": "ipzjy0"
    },
    "chmi0g": {
        "name": "DEEBOT U2 POWER",
        "deviceClassLink": "ipzjy0"
    },
    "3yqsch": {
        "name": "DEEBOT X1",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanCount": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.relocate": true,
        "control.volume": true,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.mac": true,
        "info.network.wifiSSID": true,
        "info.network.wifiSignal": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.deebotPositionIsInvalid": true,
        "map.lastUsedAreaValues" : true,
        "map.relocationState": true,
        "map.spotAreas": true,
        "technology.trueDetect": true
    },
    "8bja83": {
        "name": "DEEBOT X1 Omni",
        "deviceClassLink": "3yqsch"
    },
    "1b23du": {
        "name": "DEEBOT X1 OMNI",
        "deviceClassLink": "3yqsch"
    },
    "1vxt52": {
        "name": "DEEBOT X1 OMNI",
        "deviceClassLink": "3yqsch"
    },
    "2o4lnm": {
        "name": "DEEBOT X1 TURBO",
        "deviceClassLink": "3yqsch"
    },
    "n4gstt": {
        "name": "DEEBOT X1 PLUS",
        "deviceClassLink": "3yqsch"
    },
    "e6ofmn": {
        "name": "DEEBOT X2",
        "deviceClassLink": "3yqsch"
    },
    "lf3bn4": {
        "name": "DEEBOT X2",
        "deviceClassLink": "3yqsch"
    },
    "p5nx9u": {
        "name": "yeedi 2 hybrid",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.relocate": true,
        "info.dustbox": false,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.deebotPositionIsInvalid": true,
        "map.lastUsedAreaValues" : true,
        "map.mapImage": true,
        "map.relocationState": true,
        "map.spotAreas": true
    },
    "aaxesz": {
        "name": "yeedi vac 2 pro",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "control.relocate": true,
        "control.volume": true,
        "info.dustbox": true,
        "info.network.ip": true,
        "info.network.mac": true,
        "info.network.wifiSSID": true,
        "info.network.wifiSignal": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.deebotPositionIsInvalid": true,
        "map.lastUsedAreaValues" : true,
        "map.mapImage": true,
        "map.relocationState": true,
        "map.spotAreas": true
    },
    "mnx7f4": {
        "name": "yeedi vac station",
        "deviceClassLink": "p5nx9u"
    },
    "u5vcmk": {
        "name": "yeedi vac",
        "deviceClassLink": "p5nx9u"
    },
    "9t30w8": {
        "name": "yeedi vac 2",
        "deviceClassLink": "p5nx9u"
    },
    "h041es": {
        "name": "yeedi vac hybrid",
        "deviceClassLink": "p5nx9u"
    },
    "04z443": {
        "name": "yeedi vac max",
        "deviceClassLink": "p5nx9u"
    },
    "vthpeg": {
        "name": "yeedi mop station",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.mac": true,
        "info.network.wifiSSID": true,
        "info.network.wifiSignal": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.deebotPositionIsInvalid": true,
        "map.lastUsedAreaValues" : true,
        "map.spotAreas": true
    },
    "zwvyi2": {
        "name": "yeedi mop station pro",
        "deviceClassLink": "vthpeg"
    },
    "t5e5o6": {
        "name": "yeedi Floor 3 Station",
        "deviceClassLink": "vthpeg"
    },
    "kd0una": {
        "name": "yeedi Floor 3 Station",
        "deviceClassLink": "vthpeg"
    },
    "6r6dbt": {
        "name": "yeedi cube",
        "control.cleanSpeed": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.deebotPositionIsInvalid": true,
        "map.lastUsedAreaValues" : true,
        "map.spotAreas": true
    },
    "sdp1y1": {
        "name": "AIRBOT Z1",
        "cleaninglog.channel": false,
        "control.cleanSpeed": false,
        "control.playIamHere": false,
        "control.volume": true,
        "info.dustbox": false,
        "info.sleepStatus": true,
        "control.relocate": false,
        "info.network.ip": true,
        "info.network.mac": true,
        "info.network.wifiSSID": true,
        "info.network.wifiSignal": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.relocationState": false,
        "map.spotAreas": true
    },
    "20anby": {
        "name": "Z1 Air Quality Monitor",
        "control.pause": false,
        "control.resume": false,
        "control.playSound": false,
        "control.playIamHere": false,
        "cleaninglog.channel": false,
        "control.cleanSpeed": false,
        "control.volume": false,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.mac": true,
        "info.network.wifiSSID": true,
        "info.network.wifiSignal": true
    },
    "5xu9h3": {
        "name": "GOAT",
        "control.cleanSpeed": false,
        "consumable.reset": false,
        "info.dustbox": false,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "info.network.ip": true,
        "info.network.mac": true,
        "info.network.wifiSSID": true,
        "info.network.wifiSignal": true,
        "info.sleepStatus": true,
    }
};

class Model {
    constructor(vacbot, config) {
        this.vacbot = vacbot;
        this.config = config;
    }

    isMappingSupported() {
        if (this.getModelType() === 'airbot') return true;
        return this.vacbot.hasMappingCapabilities() && this.isSupportedFeature('map');
    }

    hasAirDrying() {
        return this.vacbot.hasAirDrying();
    }

    is950type() {
        return this.vacbot.is950type();
    }

    isNot950type() {
        return this.vacbot.isNot950type();
    }

    is950type_V2() {
        return this.vacbot.is950type_V2();
    }

    isNot950type_V2() {
        return this.vacbot.isNot950type_V2();
    }

    getProtocol() {
        return this.vacbot.getProtocol();
    }

    usesMqtt() {
        return this.getProtocol() === 'MQTT';
    }

    usesXmpp() {
        return this.getProtocol() === 'XMPP';
    }

    getDeviceClass() {
        return this.vacbot.deviceClass;
    }

    getProductName() {
        return this.vacbot.getProductName();
    }

    getProductImageURL() {
        return this.vacbot.getProductImageURL();
    }

    getModelType() {
        return this.vacbot.getModelType();
    }

    isModelTypeT9() {
        return this.vacbot.isModelTypeT9();
    }

    /**
     * Todo: Use isModelTypeT20() function when it's available
     * @returns {boolean}
     */
    isModelTypeT20() {
        return this.vacbot.getModelType() === 'T20';
    }

    isModelTypeX1() {
        return this.vacbot.isModelTypeX1();
    }

    isModelTypeX2() {
        return this.vacbot.isModelTypeX2();
    }

    isModelTypeAirbot() {
        return this.vacbot.isModelTypeAirbot();
    }

    getClass() {
        if (SUPPORTED_STATES[this.getDeviceClass()]) {
            if (Object.prototype.hasOwnProperty.call(SUPPORTED_STATES[this.getDeviceClass()], 'deviceClassLink')) {
                return SUPPORTED_STATES[this.getDeviceClass()].deviceClassLink;
            }
        }
        return this.getDeviceClass();
    }

    isSupportedFeature(state) {
        if (this.getClass() && this.config) {
            let configOptionName = state;
            let configOptionVal = '';
            if (Object.prototype.hasOwnProperty.call(CONFIG_FEATURE_STATES, state)) {
                configOptionName = 'feature.' + CONFIG_FEATURE_STATES[state];
                if (this.config[configOptionName]) {
                    configOptionVal = this.config[configOptionName];
                }
            }
            if ((configOptionVal === '') && Object.prototype.hasOwnProperty.call(SUPPORTED_STATES, this.getClass())) {
                const features = SUPPORTED_STATES[this.getClass()];
                if (Object.prototype.hasOwnProperty.call(features, state)) {
                    return features[state];
                }
            } else if (parseInt(configOptionVal) === 1) {
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
