'use strict';

const Model = require('./deebotModel');

async function createInitialInfoObjects(adapter) {
    await adapter.createChannelNotExists('info', 'Information');

    await adapter.createObjectNotExists(
        'info.version', 'Adapter version (+ library version)',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.canvasModuleIsInstalled', 'Indicates whether node-canvas module is installed',
        'boolean', 'value', false, false, '');
    await adapter.createObjectNotExists(
        'info.deviceName', 'Name of the device',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.communicationProtocol', 'Communication protocol',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.deviceIs950type', 'Indicates whether the model is detected as Ozmo 950 type',
        'boolean', 'indicator', false, '', '');
    await adapter.createObjectNotExists(
        'info.deviceClass', 'Class number of the device',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.deviceModel', 'Model name of the device',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.deviceImageURL', 'URL to picture of the device',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.connection', 'Connection status',
        'boolean', 'indicator.connected', false, false, '');
    await adapter.createObjectNotExists(
        'info.error', 'Error messages',
        'string', 'indicator.error', false, '', '');
    await adapter.createObjectNotExists(
        'info.errorCode', 'Error code',
        'string', 'indicator.error', false, '0', '');
    await adapter.createObjectNotExists(
        'info.debugMessage', 'Debug messages from library',
        'string', 'text', false, '', '');
}

async function createInitialObjects(adapter) {
    const model = new Model(adapter.vacbot.deviceClass, adapter.config);

    // Status channel
    await adapter.createChannelNotExists('status', 'Status');

    await adapter.createObjectNotExists(
        'status.device', 'Device status',
        'string', 'indicator.status', false, '', '');

    // Control channel
    await adapter.createChannelNotExists('control', 'Control');
    const buttons = new Map();

    if (adapter.vacbot.hasSpotAreas()) {
        await adapter.createObjectNotExists(
            'control.spotArea', 'Cleaning multiple spot areas (comma-separated list)',
            'string', 'value', true, '', '');
        if (model.isSupportedFeature('control.spotArea_cleanings')) {
            await adapter.createObjectNotExists(
                'control.spotArea_cleanings', 'Spot area cleanings',
                'number', 'value', true, 1, '');
        } else {
            await adapter.deleteObjectIfExists('control.spotArea_cleanings');
        }
    } else {
        buttons.set('spot', 'start spot cleaning');
        buttons.set('edge', 'start edge cleaning');
    }

    let createExtendedChannel = false;

    if (adapter.vacbot.hasCustomAreas()) {
        if (model.isSupportedFeature('control.goToPosition')) {
            await adapter.createObjectNotExists(
                'control.extended.goToPosition', 'Go to position',
                'string', 'value', true, '', '');
            createExtendedChannel = true;
        } else {
            await adapter.deleteObjectIfExists('control.extended.goToPosition');
        }
        if (model.isSupportedFeature('control.pauseWhenEnteringSpotArea')) {
            await adapter.createObjectNotExists(
                'control.extended.pauseWhenEnteringSpotArea', 'Pause when entering the specified spotArea',
                'string', 'value', true, '', '');
            createExtendedChannel = true;
        } else {
            await adapter.deleteObjectIfExists('control.extended.pauseWhenEnteringSpotArea');
        }
        if (model.isSupportedFeature('control.pauseWhenLeavingSpotArea')) {
            await adapter.createObjectNotExists(
                'control.extended.pauseWhenLeavingSpotArea', 'Pause when leaving the specified spotArea',
                'string', 'value', true, '', '');
            createExtendedChannel = true;
        } else {
            await adapter.deleteObjectIfExists('control.extended.pauseWhenLeavingSpotArea');
        }
        if (model.isSupportedFeature('control.pauseBeforeDockingChargingStation')) {
            await adapter.createObjectNotExists(
                'control.extended.pauseBeforeDockingChargingStation', 'Pause before docking onto charging station',
                'boolean', 'value', true, false, '');
            if (adapter.vacbot.hasMoppingSystem()) {
                await adapter.createObjectNotExists(
                    'control.extended.pauseBeforeDockingIfWaterboxInstalled', 'Always pause before docking onto charging station if waterbox installed',
                    'boolean', 'value', true, false, '');
            }
            createExtendedChannel = true;
        } else {
            await adapter.deleteObjectIfExists('control.extended.pauseBeforeDockingIfWaterboxInstalled');
            await adapter.deleteObjectIfExists('control.extended.pauseBeforeDockingChargingStation');
        }
        await adapter.createObjectNotExists(
            'control.customArea', 'Custom area',
            'string', 'value', true, '', '');
        await adapter.createObjectNotExists(
            'control.customArea_cleanings', 'Custom area cleanings',
            'number', 'value', true, 1, '');
    }

    if (model.isSupportedFeature('control.doNotDisturb')) {
        await adapter.createObjectNotExists(
            'control.extended.doNotDisturb', 'Do not disturb mode',
            'boolean', 'value', true, false, '');
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.doNotDisturb');
    }
    if (model.isSupportedFeature('control.continuousCleaning')) {
        await adapter.createObjectNotExists(
            'control.extended.continuousCleaning', 'Continuous cleaning',
            'boolean', 'value', true, false, '');
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.continuousCleaning');
    }
    if (model.isSupportedFeature('control.volume')) {
        await adapter.createObjectNotExists(
            'control.extended.volume', 'Volume for voice and sounds (1-10)',
            'number', 'value', true, '', '');
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.volume');
    }

    if (createExtendedChannel) {
        await adapter.createChannelNotExists('control.extended', 'Extended controls');
    } else {
        await adapter.deleteChannelIfExists('control.extended');
    }

    buttons.set('clean', 'Start automatic cleaning');
    buttons.set('stop', 'Stop cleaning');
    if (model.isSupportedFeature('control.pause')) {
        buttons.set('pause', 'Pause cleaning');
    } else {
        await adapter.deleteObjectIfExists('control.pause');
    }
    if (model.isSupportedFeature('control.resume')) {
        buttons.set('resume', 'Resume cleaning');
    } else {
        await adapter.deleteObjectIfExists('control.resume');
    }
    if (model.isSupportedFeature('control.relocate')) {
        buttons.set('relocate', 'Relocate the bot');
    }
    buttons.set('charge', 'Go back to charging station');
    if (model.isSupportedFeature('control.playSound')) {
        buttons.set('playSound', 'Play sound for locating the device');
    } else {
        await adapter.deleteObjectIfExists('control.playSound');
    }
    if (model.isSupportedFeature('control.playIamHere')) {
        buttons.set('playIamHere', 'Play "I am here" for locating the device');
    } else {
        await adapter.deleteObjectIfExists('control.playIamHere');
    }
    for (const [objectName, name] of buttons) {
        await adapter.createObjectNotExists(
            'control.' + objectName, name,
            'boolean', 'button', true, false, '');
    }

    if (adapter.vacbot.hasMoppingSystem()) {
        await adapter.setObjectNotExists('control.waterLevel', {
            type: 'state',
            common: {
                name: 'Water level',
                type: 'number',
                role: 'level',
                read: true,
                write: true,
                'min': 1,
                'max': 4,
                'states': {
                    1: 'low',
                    2: 'medium',
                    3: 'high',
                    4: 'max'
                }
            },
            native: {}
        });
    }
    if (model.isSupportedFeature('control.cleanSpeed')) {
        await adapter.setObjectNotExists('control.cleanSpeed', {
            type: 'state',
            common: {
                name: 'Clean Speed',
                type: 'number',
                role: 'level',
                read: true,
                write: true,
                'min': 1,
                'max': 4,
                'states': {
                    1: 'silent',
                    2: 'normal',
                    3: 'high',
                    4: 'veryhigh'
                }
            },
            native: {}
        });
    }
    const moveButtons = new Map();
    moveButtons.set('forward', 'Move forward');
    moveButtons.set('left', 'Rotate left');
    moveButtons.set('right', 'Rotate right');
    moveButtons.set('backward', 'Move backward');
    moveButtons.set('stop', 'Stop');

    // Move control channel
    if (model.isSupportedFeature('control.move')) {
        await adapter.createChannelNotExists('control.move', 'Move commands');
        for (const [objectName, name] of moveButtons) {
            await adapter.createObjectNotExists(
                'control.move.' + objectName, name,
                'boolean', 'button', true, false, '');
        }
    } else {
        for (const [objectName] of moveButtons) {
            await adapter.deleteObjectIfExists('control.move.' + objectName);
        }
    }

    // Information channel
    await adapter.createObjectNotExists(
        'info.battery', 'Battery status',
        'number', 'value.battery', false, '', '%');
    await adapter.createObjectNotExists(
        'info.deviceStatus', 'Device status',
        'string', 'indicator.status', false, '', '');
    await adapter.createObjectNotExists(
        'info.cleanstatus', 'Clean status',
        'string', 'indicator.status', false, '', '');
    await adapter.createObjectNotExists(
        'info.chargestatus', 'Charge status',
        'string', 'indicator.status', false, '', '');

    // Timestamps
    await adapter.createChannelNotExists('history', 'History');

    await adapter.createObjectNotExists(
        'history.timestampOfLastStateChange', 'Timestamp of last state change',
        'number', 'value.datetime', false, '', '');
    await adapter.createObjectNotExists(
        'history.dateOfLastStateChange', 'Human readable timestamp of last state change',
        'string', 'value.datetime', false, '', '');

    await adapter.createObjectNotExists(
        'history.timestampOfLastStartCleaning', 'Timestamp of last start cleaning',
        'number', 'value.datetime', false, '', '');
    await adapter.createObjectNotExists(
        'history.dateOfLastStartCleaning', 'Human readable timestamp of last start cleaning',
        'string', 'value.datetime', false, '', '');

    await adapter.createObjectNotExists(
        'history.timestampOfLastStartCharging', 'Timestamp of last start charging',
        'number', 'value.datetime', false, '', '');
    await adapter.createObjectNotExists(
        'history.dateOfLastStartCharging', 'Human readable timestamp of last start charging',
        'string', 'value.datetime', false, '', '');

    // Consumable lifespan
    await adapter.createChannelNotExists('consumable', 'Consumable');

    await adapter.createObjectNotExists(
        'consumable.filter', 'Filter lifespan',
        'number', 'level', false, '', '%');
    if (adapter.vacbot.hasMainBrush()) {
        await adapter.createObjectNotExists(
            'consumable.main_brush', 'Main brush lifespan',
            'number', 'level', false, '', '%');
    }
    await adapter.createObjectNotExists(
        'consumable.side_brush', 'Side brush lifespan',
        'number', 'level', false, '', '%');

    // Reset buttons
    if (model.isSupportedFeature('consumable.reset')) {
        await adapter.createObjectNotExists(
            'consumable.filter_reset', 'Reset filter to 100%',
            'boolean', 'button', true, false, '');
        if (adapter.vacbot.hasMainBrush()) {
            await adapter.createObjectNotExists(
                'consumable.main_brush_reset', 'Reset main brush to 100%',
                'boolean', 'button', true, false, '');
        }
        await adapter.createObjectNotExists(
            'consumable.side_brush_reset', 'Reset side brush to 100%',
            'boolean', 'button', true, false, '');
    }
}

async function createExtendedObjects(adapter) {
    const model = new Model(adapter.vacbot.deviceClass, adapter.config);

    if (adapter.vacbot.hasMoppingSystem()) {
        await adapter.createObjectNotExists(
            'info.waterbox', 'Waterbox status',
            'boolean', 'value', false, false, '');
    }
    if (model.isSupportedFeature('info.dustbox')) {
        await adapter.createObjectNotExists(
            'info.dustbox', 'Dustbox status',
            'boolean', 'value', false, true, '');
    } else {
        await adapter.deleteObjectIfExists('info.dustbox');
    }
    if (model.isSupportedFeature('info.ip')) {
        await adapter.createObjectNotExists(
            'info.ip', 'IP address',
            'string', 'text', false, '', '');
    }
    if (model.isSupportedFeature('info.wifiSSID')) {
        await adapter.createObjectNotExists(
            'info.wifiSSID', 'WiFi SSID',
            'string', 'text', false, '', '');
    }
    if (model.isSupportedFeature('info.wifiSignal')) {
        await adapter.createObjectNotExists(
            'info.wifiSignal', 'WiFi signal strength in dBm',
            'number', 'level', false, '', 'dBm');
    }
    if (model.isSupportedFeature('info.mac')) {
        await adapter.createObjectNotExists(
            'info.mac', 'MAC address',
            'string', 'text', false, '', '');
    }
    if (model.isSupportedFeature('info.sleepStatus')) {
        await adapter.createObjectNotExists(
            'info.sleepStatus', 'Sleep status',
            'boolean', 'value', false, false, '');
    }

    // cleaning log
    if (model.isSupportedFeature('cleaninglog.channel')) {
        await adapter.createChannelNotExists('cleaninglog', 'Cleaning logs');
    }

    if (model.isSupportedFeature('cleaninglog.channel')) {
        await adapter.createObjectNotExists(
            'cleaninglog.totalSquareMeters', 'Total square meters',
            'number', 'value', false, '', 'm²');
        await adapter.createObjectNotExists(
            'cleaninglog.totalSeconds', 'Total seconds',
            'number', 'value', false, '', '');
        await adapter.createObjectNotExists(
            'cleaninglog.totalTime', 'Total time',
            'number', 'value', false, '', '');
        await adapter.createObjectNotExists(
            'cleaninglog.totalNumber', 'Total number of cleanings',
            'number', 'value', false, '', '');
        await adapter.createObjectNotExists(
            'cleaninglog.last20Logs', 'Last 20 cleaning logs',
            'object', 'history', false, '', '');
    } else {
        await adapter.deleteObjectIfExists('cleaninglog.totalSquareMeters');
        await adapter.deleteObjectIfExists('cleaninglog.totalSeconds');
        await adapter.deleteObjectIfExists('cleaninglog.totalTime');
        await adapter.deleteObjectIfExists('cleaninglog.totalNumber');
        await adapter.deleteObjectIfExists('cleaninglog.last20Logs');
    }
    await adapter.deleteObjectIfExists('cleaninglog.squareMeters');

    if (model.isSupportedFeature('cleaninglog.lastCleaningMap')) {
        await adapter.createObjectNotExists(
            'cleaninglog.lastCleaningMapImageURL', 'Image URL of the last cleaning',
            'string', 'value', false, '', '');
        await adapter.createObjectNotExists(
            'cleaninglog.lastCleaningTimestamp', 'Timestamp of the last cleaning',
            'string', 'value', false, '', '');
    }

    // Map
    if (model.isSupportedFeature('map')) {
        await adapter.createChannelNotExists('map', 'Map');
    }

    if (model.isSupportedFeature('map.currentMapName')) {
        await adapter.createObjectNotExists(
            'map.currentMapName', 'Name of current active map',
            'string', 'text', false, '', '');
    }
    if (model.isSupportedFeature('map.currentMapIndex')) {
        await adapter.createObjectNotExists(
            'map.currentMapIndex', 'Index of current active map',
            'number', 'value', false, '', '');
    }
    if (model.isSupportedFeature('map.currentMapMID')) {
        await adapter.createObjectNotExists(
            'map.currentMapMID', 'MID of current active map',
            'string', 'text', false, '', '');
    }
    if (model.isSupportedFeature('map.relocationState')) {
        await adapter.createObjectNotExists(
            'map.relocationState', 'Relocation status',
            'string', 'text', false, '', '');
    }
    if (model.isSupportedFeature('map.deebotPosition')) {
        await adapter.createObjectNotExists(
            'map.deebotPosition', 'Bot position (x, y, angle)',
            'string', 'text', false, '', '');
        await adapter.createObjectNotExists(
            'map.deebotPosition_x', 'Bot position (x)',
            'number', 'value', false, '', '');
        await adapter.createObjectNotExists(
            'map.deebotPosition_y', 'Bot position (y)',
            'number', 'value', false, '', '');
        await adapter.createObjectNotExists(
            'map.deebotPosition_angle', 'Bot position (angle)',
            'number', 'value', false, '', '');
        if (model.isSupportedFeature('map.chargePosition')) {
            await adapter.createObjectNotExists(
                'map.deebotDistanceToChargePosition', 'Approximate distance between bot and charging station',
                'number', 'value', false, '', 'm');
        }
    }
    if (model.isSupportedFeature('map.deebotPositionIsInvalid')) {
        await adapter.createObjectNotExists(
            'map.deebotPositionIsInvalid', 'Bot position is invalid / unknown',
            'boolean', 'indicator.status', false, false, '');
    }
    if (model.isSupportedFeature('map.deebotPositionCurrentSpotAreaID') && adapter.canvasModuleIsInstalled) {
        await adapter.createObjectNotExists(
            'map.deebotPositionCurrentSpotAreaID', 'ID of the SpotArea the bot is currently in',
            'string', 'text', false, 'unknown', '');
        await adapter.createObjectNotExists(
            'map.deebotPositionCurrentSpotAreaName', 'Name of the SpotArea the bot is currently in',
            'string', 'text', false, 'unknown', '');
    }
    if (model.isSupportedFeature('map.chargePosition')) {
        await adapter.createObjectNotExists(
            'map.chargePosition', 'Charge position (x, y, angle)',
            'string', 'text', false, '', '');
    }
    if (model.isSupportedFeature('map.lastUsedAreaValues')) {
        await adapter.createObjectNotExists(
            'map.lastUsedCustomAreaValues', 'Last used area values',
            'string', 'text', false, '', '');
        await adapter.createObjectNotExists(
            'map.lastUsedCustomAreaValues_rerun', 'Rerun cleaning with the last area values used',
            'boolean', 'button', true, false, '');
        await adapter.createObjectNotExists(
            'map.lastUsedCustomAreaValues_save', 'Save the last area values used',
            'boolean', 'button', true, false, '');
    } else {
        await adapter.deleteObjectIfExists('map.lastUsedAreaValues');
        await adapter.deleteObjectIfExists('map.lastUsedAreaValues_rerun');
        await adapter.deleteObjectIfExists('map.lastUsedAreaValues_save');
    }
}

module.exports = {
    createInitialObjects,
    createInitialInfoObjects,
    createExtendedObjects
};
