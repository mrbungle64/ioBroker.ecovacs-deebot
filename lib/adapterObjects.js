'use strict';

const Model = require('./deebotModel');

function createInitialInfoObjects(adapter) {
    adapter.createChannelNotExists('info', 'Information');

    adapter.createObjectNotExists(
        'info.version', 'Adapter version (+ library version)',
        'string', 'text', false, '', '');
    adapter.createObjectNotExists(
        'info.deviceName', 'Name of the device',
        'string', 'text', false, '', '');
    adapter.createObjectNotExists(
        'info.communicationProtocol', 'Communication protocol',
        'string', 'text', false, '', '');
    adapter.createObjectNotExists(
        'info.deviceIs950type', 'Indicates whether the model is detected as Ozmo 950 type',
        'boolean', 'indicator', false, '', '');
    adapter.createObjectNotExists(
        'info.deviceClass', 'Class number of the device',
        'string', 'text', false, '', '');
    adapter.createObjectNotExists(
        'info.deviceModel', 'Model name of the device',
        'string', 'text', false, '', '');
    adapter.createObjectNotExists(
        'info.deviceImageURL', 'URL to picture of the device',
        'string', 'text', false, '', '');
    adapter.createObjectNotExists(
        'info.connection', 'Connection status',
        'boolean', 'indicator.connected', false, false, '');
    adapter.createObjectNotExists(
        'info.error', 'Error messages',
        'string', 'indicator.error', false, '', '');
    adapter.createObjectNotExists(
        'info.errorCode', 'Error code',
        'string', 'indicator.error', false, '0', '');
    adapter.createObjectNotExists(
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
            adapter.deleteObjectIfExists('control.spotArea_cleanings');
        }
    } else {
        buttons.set('spot', 'start spot cleaning');
        buttons.set('edge', 'start edge cleaning');
    }

    if (adapter.vacbot.hasCustomAreas()) {
        await adapter.createObjectNotExists(
            'control.customArea', 'Custom area',
            'string', 'value', true, '', '');
        await adapter.createObjectNotExists(
            'control.customArea_cleanings', 'Custom area cleanings',
            'number', 'value', true, 1, '');
    }

    buttons.set('clean', 'start automatic cleaning');
    buttons.set('stop', 'stop cleaning');
    if (model.isSupportedFeature('control.pause')) {
        buttons.set('pause', 'pause cleaning');
    } else {
        adapter.deleteObjectIfExists('control.pause');
    }
    if (model.isSupportedFeature('control.resume')) {
        buttons.set('resume', 'resume cleaning');
    } else {
        adapter.deleteObjectIfExists('control.resume');
    }
    if (model.isSupportedFeature('control.relocate')) {
        buttons.set('relocate', 'Relocate the bot');
    }
    buttons.set('charge', 'go back to charging station');
    if (model.isSupportedFeature('control.playSound')) {
        buttons.set('playSound', 'play sound for locating the device');
    } else {
        adapter.deleteObjectIfExists('control.playSound');
    }
    if (model.isSupportedFeature('control.playIamHere')) {
        buttons.set('playIamHere', 'play I am here');
    } else {
        adapter.deleteObjectIfExists('control.playIamHere');
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
    moveButtons.set('forward', 'forward');
    moveButtons.set('left', 'spin left');
    moveButtons.set('right', 'spin right');
    moveButtons.set('backward', 'backward');
    moveButtons.set('stop', 'stop');
    // moveButtons.set('turnAround', 'turn around');

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
            adapter.deleteObjectIfExists('control.move.' + objectName);
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
        adapter.deleteObjectIfExists('info.dustbox');
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
        adapter.deleteObjectIfExists('cleaninglog.totalSquareMeters');
        adapter.deleteObjectIfExists('cleaninglog.totalSeconds');
        adapter.deleteObjectIfExists('cleaninglog.totalTime');
        adapter.deleteObjectIfExists('cleaninglog.totalNumber');
        adapter.deleteObjectIfExists('cleaninglog.last20Logs');
    }
    adapter.deleteObjectIfExists('cleaninglog.squareMeters');

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
    }
    if (model.isSupportedFeature('map.deebotPositionIsInvalid')) {
        await adapter.createObjectNotExists(
            'map.deebotPositionIsInvalid', 'Bot position is invalid / unknown',
            'boolean', 'indicator.status', false, false, '');
    }
    if (model.isSupportedFeature('map.deebotPositionCurrentSpotAreaID')) {
        await adapter.createObjectNotExists(
            'map.deebotPositionCurrentSpotAreaID', 'ID of the SpotArea the bot is currently in',
            'string', 'text', false, 'unknown', '');
    }
    if (model.isSupportedFeature('map.chargePosition')) {
        await adapter.createObjectNotExists(
            'map.chargePosition', 'Charge position (x, y, angle)',
            'string', 'text', false, '', '');
    }
    adapter.deleteObjectIfExists('map.lastUsedAreaValues');
    adapter.deleteObjectIfExists('map.lastUsedAreaValues_rerun');
    adapter.deleteObjectIfExists('map.lastUsedAreaValues_save');
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
    }
}

module.exports = {
    createInitialObjects,
    createInitialInfoObjects,
    createExtendedObjects
};
