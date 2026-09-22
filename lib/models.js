/* eslint-disable quotes */

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

// States common to every device category
const COMMON_DEFAULT_STATES = [
    "info.network",
];

// Default states per deviceCategory (as returned by the library's getDeviceCategory()).
// Only states that make functional sense for a category belong here.
// SUPPORTED_STATES can still override any of these per device class.
const CATEGORY_DEFAULT_STATES = {
    'Vacuum Cleaner': [
        ...COMMON_DEFAULT_STATES,
        "consumable.reset",
        "control.pause",
        "control.resume",
        "control.playSound",
        "control.cleanSpeed",
        "control.volume",
        "cleaninglog.channel",
        "info.sleepStatus"
    ],
    'Air Purifier': [
        ...COMMON_DEFAULT_STATES,
        "control.pause",
        "control.resume",
        "control.volume",
        "info.sleepStatus"
    ],
    'Lawn Mower': [
        ...COMMON_DEFAULT_STATES,
        "info.sleepStatus"
    ],
    'Air Quality Monitor': [
        ...COMMON_DEFAULT_STATES,
    ],
};

// Fallback used when the category is not listed above (or device is unknown)
const DEFAULT_STATES = CATEGORY_DEFAULT_STATES['Vacuum Cleaner'];

// Map attributes that are implicitly 'true' when 'map: true' is set for a device class.
// Exceptions must be declared explicitly (e.g. with 'false') in SUPPORTED_STATES.
const MAP_DEFAULT_STATES = [
    "map.chargePosition",
    "map.deebotPosition",
    "map.deebotPositionCurrentSpotAreaID",
    "map.deebotPositionIsInvalid",
    "map.lastUsedAreaValues",
    "map.spotAreas"
];

// Supported DEEBOT vacuum/robot models with their feature configurations
const SupportedDeebotModels = {
    "yna5xi": {
        "name": "DEEBOT OZMO 950 Series",
        "cleaninglog.lastCleaningMap": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "control.relocate": true,
        "map": true,
        "map.mapImage": true,
        "map.relocationState": true
    },
    "vi829v": {
        "name": "DEEBOT OZMO 920",
        "deviceClassLink": "yna5xi" // DEEBOT OZMO 950 Series
    },
    "x5d34r": {
        "name": "DEEBOT OZMO T8 AIVI",
        "cleaninglog.lastCleaningMap": true,
        "control.cleanCount": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "control.relocate": true,
        "map": true,
        "map.relocationState": true,
        "technology.trueDetect": true
    },
    "2o4lnm": {
        "name": "DEEBOT X1",
        "cleaninglog.lastCleaningMap": true,
        "control.cleanCount": true,
        "control.continuousCleaning": true,
        "control.relocate": true,
        "map": true,
        "map.relocationState": true,
        "technology.trueDetect": true
    },
    "ty84oi": {
        "name": "DEEBOT N8",
        "cleaninglog.lastCleaningMap": true,
        "control.cleanCount": true,
        "control.continuousCleaning": true,
        "control.doNotDisturb": true,
        "control.relocate": true,
        "map": true,
        "map.relocationState": true,
    },
    "ipohi5": {
        "name": "DEEBOT T9",
        "deviceClassLink": "x5d34r" // DEEBOT OZMO T8
    },
    "lhbd50": {
        "name": "DEEBOT T9+",
        "deviceClassLink": "x5d34r" // DEEBOT OZMO T8
    },
    "um2ywg": {
        "name": "DEEBOT T9+",
        "deviceClassLink": "x5d34r" // DEEBOT OZMO T8
    },
    "p95mgv": {
        "name": "DEEBOT T10 PLUS",
        "deviceClassLink": "x5d34r" // DEEBOT OZMO T8
    },
    "p1jij8": {
        "name": "DEEBOT T20 OMNI",
        "deviceClassLink": "2o4lnm" // DEEBOT X1
    },
    "9eamof": {
        "name": "DEEBOT T80 OMNI",
        "deviceClassLink": "2o4lnm" // DEEBOT X1
    },
};

// Supported air purifier models (e.g. AIRBOT Z1) with their feature configurations
const SupportedAirPurifierModels = {
    "sdp1y1": {
        "name": "AIRBOT Z1",
        "map": true,
        "map.deebotPositionIsInvalid": false,
        "map.lastUsedAreaValues": false,
        "map.relocationState": false
    },
    "20anby": {
        "name": "Z1 Air Quality Monitor"
    },
    "99fqkn": {
        "name": "Z1 Air Quality Monitor"
    },
};

// Lookup table for supported features that are enabled by default
const SUPPORTED_STATES = {
    ...SupportedDeebotModels,
    ...SupportedAirPurifierModels,
};

/**
 * Device capability model resolving features and configurations for a vacbot.
 */
class Model {
    /**
     * @param {object} vacbot The VacBot instance from the ecovacs-deebot library
     * @param {ioBroker.AdapterConfig} adapterConfig The ioBroker adapter configuration
     */
    constructor(vacbot, adapterConfig) {
        this.vacbot = vacbot;
        this.adapterConfig = adapterConfig;
    }

    getDeviceClass() {
        return this.vacbot.deviceClass;
    }

    /**
     * Returns the canonical device class, resolving a `deviceClassLink` alias if present.
     * Use this when you need the authoritative class for feature lookups.
     * For the raw value from the protocol, use {@link getDeviceClass}.
     * @returns {string}
     */
    getCanonicalDeviceClass() {
        if (SUPPORTED_STATES[this.getDeviceClass()]) {
            if (Object.prototype.hasOwnProperty.call(SUPPORTED_STATES[this.getDeviceClass()], 'deviceClassLink')) {
                return SUPPORTED_STATES[this.getDeviceClass()].deviceClassLink;
            }
        }
        return this.getDeviceClass();
    }

    getProductName() {
        if (SUPPORTED_STATES[this.getDeviceClass()]) {
            return SUPPORTED_STATES[this.getDeviceClass()].name;
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

    /**
     * Returns the technical platform/architecture type (e.g. '950', 'T8', 'T20', 'airbot').
     * @returns {string}
     */
    getPlatformType() {
        return this.vacbot ? this.vacbot.getPlatformType() : '';
    }

    /**
     * @deprecated Use getPlatformType() instead.
     * @returns {string}
     */
    getModelType() {
        return this.getPlatformType();
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

    isModelTypeAqMonitor() {
        return this.vacbot.isModelTypeAqMonitor();
    }

    /**
     * Returns true if the device supports OTA (Over The Air) firmware updates
     * Only AQ monitors do not support OTA
     * @returns {boolean}
     */
    hasOtaSupport() {
        return !this.isModelTypeAqMonitor();
    }

    /**
     * Returns the default states array for this device's category.
     * Falls back to the Vacuum Cleaner defaults for unknown categories.
     * @returns {string[]}
     */
    _getDefaultStates() {
        const category = this.getDeviceCategory();
        return CATEGORY_DEFAULT_STATES[category] ?? DEFAULT_STATES;
    }

    isSupportedFeature(state) {
        // Guard clause: without a known device class or config, only category defaults apply
        if (!this.getCanonicalDeviceClass() || !this.adapterConfig) {
            return this._getDefaultStates().includes(state);
        }
        // Config overrides always take precedence, regardless of whether the device is listed
        const configOverride = this.getConfigOverride(state);
        if (configOverride !== null) {
            return parseInt(configOverride) === 1;
        }
        // Models not explicitly listed in SUPPORTED_STATES always get their category defaults.
        // Map states are enabled when the library reports mapping capabilities.
        const isListed = Object.hasOwn(SUPPORTED_STATES, this.getDeviceClass())
            || Object.hasOwn(SUPPORTED_STATES, this.getCanonicalDeviceClass());
        if (!isListed) {
            if (MAP_DEFAULT_STATES.includes(state) && this.isMappingSupported()) {
                return true;
            }
            return this._getDefaultStates().includes(state);
        }
        const featureValue = this.lookupInSupportedStates(state);
        if (featureValue !== undefined) {
            return featureValue;
        }
        // Implicit map defaults: attributes in MAP_DEFAULT_STATES are true
        // when 'map: true' is set, unless explicitly overridden above
        if (MAP_DEFAULT_STATES.includes(state) && this.isSupportedFeature('map')) {
            return true;
        }
        return this._getDefaultStates().includes(state);
    }

    /**
     * Returns the raw config override value for a state if the user has configured it,
     * or `null` if no override is set.
     * @param {string} state
     * @returns {string|null}
     */
    getConfigOverride(state) {
        if (Object.hasOwn(CONFIG_FEATURE_STATES, state)) {
            const configOptionName = 'feature.' + CONFIG_FEATURE_STATES[state];
            if (this.adapterConfig[configOptionName]) {
                return this.adapterConfig[configOptionName];
            }
        }
        return null;
    }

    /**
     * Looks up `state` in `SUPPORTED_STATES` for the raw and canonical device class.
     * Returns the feature value if found, or `undefined` if the state is not declared.
     * @param {string} state
     * @returns {boolean|undefined}
     */
    lookupInSupportedStates(state) {
        // Using a Set avoids a redundant iteration when raw and canonical class are equal.
        const classes = [...new Set([this.getDeviceClass(), this.getCanonicalDeviceClass()])];
        for (const cls of classes) {
            if (Object.hasOwn(SUPPORTED_STATES, cls)) {
                const features = SUPPORTED_STATES[cls];
                if (Object.hasOwn(features, state)) {
                    return features[state];
                }
            }
        }
        return undefined;
    }

    hasMappingCapabilities() {
        return this.vacbot.hasMappingCapabilities() || this.isModelTypeAirbot();
    }

    /**
     * Get user-friendly device category classification.
     * Delegates to the library's `deviceCategory` property (defined in `modelTypes.js`).
     * @returns {string} User-friendly device category (e.g. 'Vacuum Cleaner', 'Air Purifier')
     */
    getDeviceCategory() {
        return this.vacbot ? this.vacbot.getDeviceCategory() : '';
    }

    /**
     * Get smart type.
     * Delegates to the library's `getSmartType` method.
     * @returns {string} Smart type of the device
     */
    getSmartType() {
        return this.vacbot && typeof this.vacbot.getSmartType === 'function' ? this.vacbot.getSmartType() : '';
    }

    /**
     * Get device capabilities for enhanced device information
     * @returns {object} Device capabilities object
     */
    getDeviceCapabilities() {
        return {
            type: this.getDeviceCategory(),
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
