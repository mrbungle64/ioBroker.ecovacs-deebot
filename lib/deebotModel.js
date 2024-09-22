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
    "yinacl": {
        "name": "DEEBOT N20e PLUS",
        "deviceClassLink": "h18jkh"
    },
    "qhe2o2": {
        "name": "DEEBOT N20 PRO PLUS",
        "deviceClassLink": "h18jkh"
    },
    "p0l0af": {
        "name": "DEEBOT N20 PRO PLUS",
        "deviceClassLink": "h18jkh"
    },
    "aavvfb": {
        "name": "DEEBOT N20 PRO",
        "deviceClassLink": "h18jkh"
    },
    "buom7k": {
        "name": "DEEBOT N20 PLUS",
        "deviceClassLink": "h18jkh"
    },
    "kr0277": {
        "name": "DEEBOT N20",
        "deviceClassLink": "h18jkh"
    },
    "edoodo": {
        "name": "DEEBOT N20",
        "deviceClassLink": "h18jkh"
    },
    "zgsvkq": {
        "name": " DEEBOT N20e",
        "deviceClassLink": "h18jkh"
    },
    "ruhc0q": {
        "name": "DEEBOT N20e",
        "deviceClassLink": "h18jkh"
    },
    "i35yb6": {
        "name": "DEEBOT N20 PLUS",
        "deviceClassLink": "h18jkh"
    },
    "9kpees": {
        "name": "DEEBOT N20 PLUS",
        "deviceClassLink": "h18jkh"
    },
    "gwtll7": {
        "name": "DEEBOT N20 PRO PLUS",
        "deviceClassLink": "h18jkh"
    },
    "c8gerr": {
        "name": "DEEBOT N20 PRO",
        "deviceClassLink": "h18jkh"
    },
    "7piq03": {
        "name": " DEEBOT N20e PLUS",
        "deviceClassLink": "h18jkh"
    },
    "zwkcqc": {
        "name": "DEEBOT N30 OMNI",
        "deviceClassLink": "h18jkh"
    },
    "dlrbzq": {
        "name": " DEEBOT N30 PRO OMNI",
        "deviceClassLink": "h18jkh"
    },
    "87swps": {
        "name": " DEEBOT N30 PRO OMNI",
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
    "9s1s80": {
        "name": "DEEBOT T10 TURBO",
        "deviceClassLink": "h18jkh"
    },
    "p1jij8": {
        "name": "DEEBOT T20 OMNI",
        "deviceClassLink": "3yqsch"
    },
    "z4lvk7": {
        "name": "DEEBOT T30 OMNI",
        "deviceClassLink": "3yqsch"
    },
    "4vhygi": {
        "name": "DEEBOT T30 PRO OMNI",
        "deviceClassLink": "3yqsch"
    },
    "3w7j5e": {
        "name": "DEEBOT T30 PRO OMNI",
        "deviceClassLink": "3yqsch"
    },
    "tlthqk": {
        "name": "DEEBOT T30 PRO OMNI",
        "deviceClassLink": "3yqsch"
    },
    "822x8d": {
        "name": "DEEBOT T30 OMNI",
        "deviceClassLink": "3yqsch"
    },
    "4bdkrs": {
        "name": "DEEBOT T30S COMBO",
        "deviceClassLink": "3yqsch"
    },
    "ue8kcc": {
        "name": "DEEBOT T30S COMBO",
        "deviceClassLink": "3yqsch"
    },
    "8tyt2y": {
        "name": "DEEBOT T30S",
        "deviceClassLink": "3yqsch"
    },
    "eqmf84": {
        "name": "DEEBOT T30S",
        "deviceClassLink": "3yqsch"
    },
    "9gqyaq": {
        "name": "DEEBOT T30S COMBO",
        "deviceClassLink": "3yqsch"
    },
    "kr9c86": {
        "name": "DEEBOT T30S COMBO",
        "deviceClassLink": "3yqsch"
    },
    "ee23uv": {
        "name": "DEEBOT T30S COMBO COMPLETE",
        "deviceClassLink": "3yqsch"
    },
    "xco2fc": {
        "name": "DEEBOT T30S PRO",
        "deviceClassLink": "3yqsch"
    },
    "cb69w5": {
        "name": "DEEBOT T30S PRO",
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
    "lr4qcs": {
        "name": "DEEBOT X5 PRO OMNI",
        "deviceClassLink": "3yqsch"
    },
    "o0a4ju": {
        "name": "DEEBOT X5 PRO OMNI",
        "deviceClassLink": "3yqsch"
    },
    "e6yxdm": {
        "name": "DEEBOT X5 OMNI",
        "deviceClassLink": "3yqsch"
    },
    "4jd37g": {
        "name": "DEEBOT X5 OMNI",
        "deviceClassLink": "3yqsch"
    },
    "rvflzn": {
        "name": "DEEBOT X5 PRO OMNI",
        "deviceClassLink": "3yqsch"
    },
    "w7k3yc": {
        "name": "DEEBOT X5 PRO OMNI",
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
        "cleaninglog.channel": true,
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
    },
    "2ap5uq": {
        "name": "GOAT GX-600",
        "deviceClassLink": "5xu9h3"
    },
    "ao7fpw": {
        "name": " GOAT GX-600",
        "deviceClassLink": "5xu9h3"
    }
};

class Model {
    constructor(vacbot, config) {
        this.vacbot = vacbot;
        this.config = config;
    }

    isMappingSupported() {
        return this.hasMappingCapabilities() && this.isSupportedFeature('map');
    }

    hasMappingCapabilities() {
        return this.vacbot.hasMappingCapabilities() || this.isModelTypeAirbot();
    }

    hasCustomAreaCleaningMode() {
        return this.vacbot.hasCustomAreaCleaningMode();
    }

    hasAirDrying() {
        return this.vacbot.hasAirDrying();
    }

    hasAdvancedMode() {
        return Boolean(this.is950type() &&
            this.isMappingSupported() &&
            !this.isModelTypeT20() &&
            !this.isModelTypeX1() &&
            !this.isModelTypeX2() &&
            !this.isModelTypeAirbot());
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
}

module.exports = Model;
