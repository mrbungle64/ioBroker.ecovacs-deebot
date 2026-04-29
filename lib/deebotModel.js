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
    "1vxt52": {
        "name": "DEEBOT OZMO 900",
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
        "map.spotAreas": true
    },
    "y79a7u": {
        "name": "DEEBOT OZMO 905",
        "deviceClassLink": "1vxt52"
    },
    "4uordy": {
        "name": "DEEBOT OZMO 920",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true
    },
    "yna5xi": {
        "name": "DEEBOT OZMO 930",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true
    },
    "vi829v": {
        "name": "DEEBOT OZMO 950",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true,
        "map.virtualBoundaries": true,
        "map.virtualBoundaries.save": true,
        "map.virtualBoundaries.delete": true,
        "map.mapImage": true,
        "map.spotAreas.cleanSpeed": true,
        "map.spotAreas.waterLevel": true
    },
    "xb8zrv": {
        "name": "DEEBOT OZMO 950",
        "deviceClassLink": "vi829v"
    },
    "4v8l8m": {
        "name": "DEEBOT OZMO 950",
        "deviceClassLink": "vi829v"
    },
    "3yqsch": {
        "name": "DEEBOT T8 AIVI",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true,
        "map.virtualBoundaries": true,
        "map.virtualBoundaries.save": true,
        "map.virtualBoundaries.delete": true,
        "map.mapImage": true,
        "map.spotAreas.cleanSpeed": true,
        "map.spotAreas.waterLevel": true,
        "technology.trueDetect": true
    },
    "h18jkh": {
        "name": "DEEBOT T8/T9/T10 Series",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true,
        "map.virtualBoundaries": true,
        "map.virtualBoundaries.save": true,
        "map.virtualBoundaries.delete": true,
        "map.mapImage": true,
        "map.spotAreas.cleanSpeed": true,
        "map.spotAreas.waterLevel": true,
        "technology.trueDetect": true,
        "control.autoEmptyStation": true
    },
    "p95mgv": {
        "name": "DEEBOT T10 PLUS",
        "deviceClassLink": "h18jkh"
    },
    "9eamof": {
        "name": "DEEBOT T80 OMNI",
        "deviceClassLink": "h18jkh",
        "modelType": "T80"
    },
    "p1jij8": {
        "name": "DEEBOT T20 OMNI",
        "deviceClassLink": "h18jkh"
    },
    "55aiho": {
        "name": "DEEBOT T8 AIVI",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true,
        "map.virtualBoundaries": true,
        "map.virtualBoundaries.save": true,
        "map.virtualBoundaries.delete": true,
        "map.mapImage": true,
        "map.spotAreas.cleanSpeed": true,
        "map.spotAreas.waterLevel": true,
        "technology.trueDetect": true
    },
    "ipzjy0": {
        "name": "DEEBOT U2 Series",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true,
        "map.virtualBoundaries": true,
        "map.virtualBoundaries.save": true,
        "map.virtualBoundaries.delete": true,
        "map.mapImage": true,
        "map.spotAreas.cleanSpeed": true,
        "map.spotAreas.waterLevel": true
    },
    "p5nx9u": {
        "name": "yeedi vac station",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true,
        "map.virtualBoundaries": true,
        "map.virtualBoundaries.save": true,
        "map.virtualBoundaries.delete": true,
        "map.mapImage": true,
        "map.spotAreas.cleanSpeed": true,
        "map.spotAreas.waterLevel": true,
        "technology.trueDetect": true,
        "control.autoEmptyStation": true
    },
    "vthpeg": {
        "name": "yeedi mop station pro",
        "cleaninglog.lastCleaningMap": true,
        "consumable.reset": true,
        "control.cleanSpeed": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "info.dustbox": true,
        "info.sleepStatus": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true,
        "map.virtualBoundaries": true,
        "map.virtualBoundaries.save": true,
        "map.virtualBoundaries.delete": true,
        "map.mapImage": true,
        "map.spotAreas.cleanSpeed": true,
        "map.spotAreas.waterLevel": true,
        "technology.trueDetect": true,
        "control.autoEmptyStation": true
    },
    "5xu9h3": {
        "name": "GOAT GX-600",
        "control.cleanSpeed": false,
        "control.pause": false,
        "control.resume": false,
        "control.playIamHere": false,
        "control.playSound": false,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.wifiSSID": true
    },
    "xmp9ds": {
        "name": "GOAT A1600 RTK",
        "deviceClassLink": "5xu9h3"
    },
    "0b5f6y": {
        "name": "Airbot Z1",
        "control.cleanSpeed": false,
        "control.pause": false,
        "control.resume": false,
        "control.playIamHere": false,
        "control.playSound": false,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.wifiSSID": true,
        "map": true,
        "map.chargePosition": true,
        "map.deebotPosition": true,
        "map.deebotPositionCurrentSpotAreaID": true,
        "map.spotAreas": true,
        "map.virtualBoundaries": true,
        "map.virtualBoundaries.save": true,
        "map.virtualBoundaries.delete": true,
        "map.mapImage": true
    },
    "1b5f6y": {
        "name": "Airbot Z1",
        "deviceClassLink": "0b5f6y"
    },
    "2b5f6y": {
        "name": "Airbot Z1",
        "deviceClassLink": "0b5f6y"
    },
    "3b5f6y": {
        "name": "Airbot Z1",
        "deviceClassLink": "0b5f6y"
    },
    "4b5f6y": {
        "name": "Airbot Z1",
        "deviceClassLink": "0b5f6y"
    },
    "5b5f6y": {
        "name": "Airbot Z1",
        "deviceClassLink": "0b5f6y"
    },
    "6b5f6y": {
        "name": "Airbot Z1",
        "deviceClassLink": "0b5f6y"
    },
    "7b5f6y": {
        "name": "Airbot Z1",
        "deviceClassLink": "0b5f6y"
    },
    "8b5f6y": {
        "name": "Airbot Z1",
        "deviceClassLink": "0b5f6y"
    },
    "9b5f6y": {
        "name": "Airbot Z1",
        "deviceClassLink": "0b5f6y"
    },
    "1a2b3c": {
        "name": "Airbot AVA",
        "deviceClassLink": "0b5f6y"
    },
    "2a3b4c": {
        "name": "Airbot ANDY",
        "deviceClassLink": "0b5f6y"
    },
    "sdp1y1": {
        "name": "AIRBOT Z1",
        "deviceClassLink": "0b5f6y"
    },
    "20anby": {
        "name": "Z1 Air Quality Monitor",
        "control.cleanSpeed": false,
        "control.pause": false,
        "control.resume": false,
        "control.playIamHere": false,
        "control.playSound": false,
        "info.dustbox": false,
        "info.network.ip": true,
        "info.network.wifiSSID": true
    }
};

// Device type mapping for user-friendly classification
const DEVICE_TYPE_MAPPING = {
    'airbot': 'Air Purifier',
    'goat': 'Lawn Mower',
    'aqMonitor': 'Air Quality Monitor',
    'yeedi': 'Yeedi Vacuum',
    'legacy': 'Vacuum Cleaner',
    '950': 'Vacuum Cleaner',
    'T8': 'Vacuum Cleaner',
    'T9': 'Vacuum Cleaner',
    'T10': 'Vacuum Cleaner',
    'T20': 'Vacuum Cleaner',
    'T80': 'Vacuum Cleaner',
    'T30': 'Vacuum Cleaner',
    'N8': 'Vacuum Cleaner',
    'X1': 'Vacuum Cleaner',
    'X2': 'Vacuum Cleaner',
    'U2': 'Vacuum Cleaner'
};

class Model {
    constructor(vacbot, config) {
        this.vacbot = vacbot;
        this.config = config;
    }

    getDeviceClass() {
        return this.vacbot.deviceClass;
    }

    getProductName() {
        if (SUPPORTED_STATES[this.getClass()]) {
            return SUPPORTED_STATES[this.getClass()].name;
        }
        return this.getDeviceClass();
    }

    getProductImageURL() {
        return this.vacbot.getProductImageURL();
    }

    getProtocol() {
        return this.vacbot.getProtocol();
    }

    is950type() {
        return this.vacbot.is950type();
    }

    is950type_V2() {
        return this.vacbot.is950type_V2();
    }

    isNot950type() {
        return !this.is950type();
    }

    isNot950type_V2() {
        return !this.is950type_V2();
    }

    usesXmpp() {
        return this.getProtocol() === 'XMPP';
    }

    usesMqtt() {
        return this.getProtocol() === 'MQTT';
    }

    isMappingSupported() {
        return this.vacbot.hasMappingCapabilities();
    }

    hasMainBrush() {
        return this.vacbot.hasMainBrush();
    }

    hasSideBrush() {
        return this.vacbot.hasSideBrush();
    }

    hasFilter() {
        return this.vacbot.hasFilter();
    }

    hasAirDrying() {
        return this.vacbot.hasAirDrying();
    }

    hasCleaningStation() {
        return this.hasAirDrying();
    }

    hasFloorWashing() {
        if (typeof this.vacbot.hasMoppingSystem === 'function') {
            return this.vacbot.hasMoppingSystem() && this.hasCleaningStation();
        }
        return false;
    }

    hasAdvancedMode() {
        if (typeof this.vacbot.hasAdvancedMode === 'function') {
            return this.vacbot.hasAdvancedMode();
        }
        return false;
    }

    hasCustomAreaCleaningMode() {
        if (typeof this.vacbot.hasCustomAreaCleaningMode === 'function') {
            return this.vacbot.hasCustomAreaCleaningMode();
        }
        return false;
    }

    getModelType() {
        // Check for explicit model type override per device class
        const deviceClass = this.getDeviceClass();
        if (SUPPORTED_STATES[deviceClass] && SUPPORTED_STATES[deviceClass].modelType) {
            return SUPPORTED_STATES[deviceClass].modelType;
        }
        return this.vacbot.getModelType();
    }

    isModelTypeT8Based() {
        return this.isModelTypeT8() || this.isModelTypeN8();
    }

    isModelTypeT9Based() {
        return this.isModelTypeT9() || this.isModelTypeT10() || this.isModelTypeT20() || this.isModelTypeX1() || this.isModelTypeX2();
    }

    isModelTypeN8() {
        return this.vacbot.isModelTypeN8();
    }

    isModelTypeT8() {
        return this.vacbot.isModelTypeT8();
    }

    isModelTypeT9() {
        return this.vacbot.isModelTypeT9();
    }

    isModelTypeT10() {
        return this.vacbot.isModelTypeT10();
    }

    isModelTypeT20() {
        return this.vacbot.isModelTypeT20();
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

    /**
     * Check if the device supports OTA (Over The Air) firmware updates
     * OTA is supported by 950type devices (MQTT/JSON protocol)
     * @returns {boolean}
     */
    hasOtaSupport() {
        return this.is950type();
    }

    isModel900Series() {
        return this.getClass() === 'ls1ok3';
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

    hasMappingCapabilities() {
        return this.vacbot.hasMappingCapabilities() || this.isModelTypeAirbot();
    }

    getWaterLevel() {
        if (this.isModelTypeT20() || this.isModelTypeX2()) {
            return 6;
        } else if (this.isModelTypeX1()) {
            return 4;
        } else if (this.is950type()) {
            return 4;
        } else {
            return 3;
        }
    }

    getCleanSpeed() {
        if (this.isModelTypeT20() || this.isModelTypeX2()) {
            return 4;
        } else if (this.isModelTypeX1()) {
            return 4;
        } else if (this.is950type()) {
            return 4;
        } else {
            return 3;
        }
    }

    getVolume() {
        if (this.isModelTypeT20() || this.isModelTypeX2()) {
            return 10;
        } else if (this.isModelTypeX1()) {
            return 10;
        } else if (this.is950type()) {
            return 10;
        } else {
            return 4;
        }
    }

    getWashInterval() {
        if (this.isModelTypeT20() || this.isModelTypeX2()) {
            return 6;
        } else if (this.isModelTypeX1()) {
            return 10;
        } else {
            return 10;
        }
    }

    getDustBagReminder() {
        if (this.isModelTypeT20() || this.isModelTypeX2()) {
            return 350;
        } else if (this.isModelTypeX1()) {
            return 420;
        } else {
            return 420;
        }
    }

    getHoursUntilDustBagEmptyReminder() {
        if (this.isSupportedFeature('info.dustbox')) {
            return this.getDustBagReminder();
        }
        return 0;
    }

    getCleanCount() {
        if (this.isModelTypeT20() || this.isModelTypeX2()) {
            return 3;
        } else if (this.isModelTypeX1()) {
            return 3;
        } else if (this.is950type()) {
            return 3;
        } else {
            return 1;
        }
    }

    getRelocationState() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'standard';
        } else if (this.is950type()) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoToPosition() {
        if (this.isModelTypeAirbot()) {
            return 'native';
        } else if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'native';
        } else if (this.is950type()) {
            return 'native';
        } else {
            return 'none';
        }
    }

    getAreaCleaningMode() {
        if (this.isModelTypeAirbot()) {
            return 'custom';
        } else if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'custom';
        } else if (this.is950type()) {
            return 'custom';
        } else {
            return 'none';
        }
    }

    getSpotAreaCleaningMode() {
        if (this.isModelTypeAirbot()) {
            return 'none';
        } else if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'advanced';
        } else {
            return 'basic';
        }
    }

    getAutoEmptyStation() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getAirDryingLevel() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getTrueDetect() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getCleanPreference() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getAdvancedMode() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getWorkMode() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getCarpetPressure() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getCleanCountLevel() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getWashIntervalLevel() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getVolumeLevel() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getDoNotDisturb() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getContinuousCleaning() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getAutoEmpty() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getLifeSpan() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getNetworkInfo() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'basic';
        }
    }

    getSleepStatus() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getErrorCode() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'basic';
        }
    }

    getChargeState() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'basic';
        }
    }

    getCleanState() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'basic';
        }
    }

    getBatteryInfo() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'basic';
        }
    }

    getSoundControl() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'basic';
        }
    }

    getMovementControl() {
        if (this.isModelTypeT20() || this.isModelTypeX2() || this.isModelTypeX1()) {
            return 'advanced';
        } else if (this.is950type()) {
            return 'standard';
        } else {
            return 'none';
        }
    }

    getVoiceAssistant() {
        if (this.vacbot.getDeviceProperty('yiko')) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getHostedMode() {
        if (this.vacbot.getDeviceProperty('hosted_mode')) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getAirFreshener() {
        if (this.isSupportedFeature('consumable.airFreshener')) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getDustBox() {
        if (this.isSupportedFeature('info.dustbox')) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getThreeModuleStatus() {
        if (this.isModelTypeAirbot()) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getJCYAirQuality() {
        if (this.getModelType() === 'aqMonitor') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getAirQuality() {
        if (this.isModelTypeAirbot()) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getThreeModule() {
        if (this.isModelTypeAirbot()) {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatInfo() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatBlade() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMotor() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatBattery() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatChargeState() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatErrorCode() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatWorkMode() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatWorkState() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatPosition() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingInfo() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingState() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingPattern() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingArea() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingTime() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingDistance() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingHeight() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingWidth() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingLength() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingVolume() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingWeight() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingTemperature() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingHumidity() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingPressure() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingAltitude() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingLatitude() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingLongitude() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingAccuracy() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingSatellites() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingFix() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingHdop() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingVdop() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingPdop() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingGdop() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingTdop() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingXdop() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingYdop() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingZdop() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingEcefX() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingEcefY() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingEcefZ() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingEcefVX() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingEcefVY() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingEcefVZ() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingEcefAX() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingEcefAY() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingEcefAZ() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingGeoidHeight() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingSep() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingDgpsAge() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingDgpsId() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingUtc() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingCourse() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingSpeed() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingClimb() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingTrack() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingStatus() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    getGoatMowingMode() {
        if (this.getModelType() === 'goat') {
            return 'advanced';
        } else {
            return 'none';
        }
    }

    // NEW DEVICE TYPE CLASSIFICATION METHODS
    /**
     * Get user-friendly device type classification
     * @returns {string} User-friendly device type name
     */
    getDeviceType() {
        const modelType = this.getModelType();
        if (DEVICE_TYPE_MAPPING[modelType]) {
            return DEVICE_TYPE_MAPPING[modelType];
        }
        // Fallback: check the adapter's own SUPPORTED_STATES for name-based classification
        const resolvedType = this.getDeviceTypeFromClass(this.getDeviceClass());
        if (resolvedType && DEVICE_TYPE_MAPPING[resolvedType]) {
            return DEVICE_TYPE_MAPPING[resolvedType];
        }
        return 'Unknown Device';
    }

    /**
     * Get device type from device class for device discovery
     * @param {string} deviceClass - The device class from API
     * @returns {string} Device type classification
     */
    getDeviceTypeFromClass(deviceClass) {
        // First check if we have direct mapping for this class
        if (SUPPORTED_STATES[deviceClass]) {
            const deviceInfo = SUPPORTED_STATES[deviceClass];
            // Check for known device patterns in the name
            if (deviceInfo.name) {
                if (deviceInfo.name.includes('Airbot') || deviceInfo.name.includes('AVA') || deviceInfo.name.includes('ANDY')) {
                    return 'airbot';
                }
                if (deviceInfo.name.includes('GOAT') || deviceInfo.name.includes('Goat')) {
                    return 'goat';
                }
                if (deviceInfo.name.includes('WINBOT') || deviceInfo.name.includes('Winbot')) {
                    return 'winbot';
                }
            }
        }
        
        // Fallback to current model type detection
        return this.getModelType();
    }

    /**
     * Get device capabilities for enhanced device information
     * @returns {object} Device capabilities object
     */
    getDeviceCapabilities() {
        return {
            type: this.getDeviceType(),
            hasMapping: this.isMappingSupported(),
            hasWaterBox: this.isSupportedFeature('info.waterbox'),
            hasAirDrying: this.hasAirDrying(),
            hasAutoEmpty: this.isSupportedFeature('control.autoEmptyStation'),
            hasSpotAreas: this.isSupportedFeature('map.spotAreas'),
            hasVirtualBoundaries: this.isSupportedFeature('map.virtualBoundaries'),
            hasContinuousCleaning: this.isSupportedFeature('control.continuousCleaning'),
            hasDoNotDisturb: this.isSupportedFeature('control.doNotDisturb'),
            hasVoiceAssistant: this.vacbot.getDeviceProperty('yiko') || false,
            hasCleaningStation: this.hasCleaningStation(),
            hasFloorWashing: this.hasFloorWashing()
        };
    }
}

module.exports = Model;