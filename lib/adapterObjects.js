'use strict';

const helper = require('./adapterHelper');

async function createInitialInfoObjects(adapter) {

    //
    // info channel
    //
    await adapter.createChannelNotExists('info', 'Information');
    await adapter.createObjectNotExists(
        'info.version', 'Adapter version',
        'string', 'text', false, '', '');

    await adapter.createChannelNotExists('info.library', 'Library information');
    await adapter.createObjectNotExists(
        'info.library.version', 'Library version',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.library.canvasModuleIsInstalled', 'Indicates whether node-canvas module is installed',
        'boolean', 'value', false, false, '');
    await adapter.createObjectNotExists(
        'info.library.communicationProtocol', 'Communication protocol',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.library.deviceIs950type', 'Indicates whether the model is detected as Ozmo 950 type',
        'boolean', 'indicator', false, false, '');
    await adapter.createObjectNotExists(
        'info.library.debugMessage', 'Debug messages from library',
        'string', 'text', false, '', '');

    // Deprecated
    await adapter.deleteObjectIfExists('info.canvasModuleIsInstalled');
    await adapter.deleteObjectIfExists('info.communicationProtocol');
    await adapter.deleteObjectIfExists('info.deviceIs950type');
    await adapter.deleteObjectIfExists('info.debugMessage');

    await adapter.createObjectNotExists(
        'info.deviceName', 'Name of the device',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.deviceClass', 'Class number of the device',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.deviceModel', 'Model name of the device',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.modelType', 'Type of the model (as classified in the library)',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.deviceImageURL', 'URL to picture of the device',
        'string', 'text', false, '', '');
    await adapter.createObjectNotExists(
        'info.connection', 'Connection status',
        'boolean', 'indicator.connected', false, false, '');
    await adapter.createObjectNotExists(
        'info.connectionUptime', 'Connection uptime in minutes',
        'number', 'value', false, 0, '');
    await adapter.createObjectNotExists(
        'info.error', 'Error messages',
        'string', 'indicator.error', false, '', '');
    await adapter.createObjectNotExists(
        'info.errorCode', 'Error code',
        'string', 'indicator.error', false, '0', '');
}

async function createInitialObjects(adapter) {

    // Status channel
    await adapter.createChannelNotExists('status', 'Status');

    await adapter.createObjectNotExists(
        'status.device', 'Device status',
        'string', 'indicator.status', false, '', '');

    if (adapter.getModel().isSupportedFeature('cleaninglog.channel')) {
        await adapter.createChannelNotExists('cleaninglog.current', 'Current cleaning stats');
        await adapter.createObjectNotExists(
            'cleaninglog.current.cleanedArea', 'Current cleaned area (m²)',
            'number', 'value', false, 0, 'm²');
        await adapter.createObjectNotExists(
            'cleaninglog.current.cleanedSeconds', 'Current cleaning time (seconds)',
            'number', 'value', false, 0, '');
        await adapter.createObjectNotExists(
            'cleaninglog.current.cleanedTime', 'Current cleaning time',
            'string', 'value', false, '0h 00m 00s', '');
        await adapter.createObjectNotExists(
            'cleaninglog.current.cleanType', 'Current clean type',
            'string', 'value', false, '', '');
    }

    //
    // control channel
    //
    await adapter.createChannelNotExists('control', 'Control');
    const buttons = new Map();

    if (adapter.vacbot.hasSpotAreaCleaningMode()) {
        await adapter.createObjectNotExists(
            'control.spotArea', 'Start cleaning multiple spot areas (comma-separated list)',
            'string', 'value', true, '', '');
        await adapter.createObjectNotExists(
            'control.spotArea_cleanings', 'Spot area cleanings',
            'number', 'value', true, 1, '');
        if (adapter.getDevice().useNativeGoToPosition()) {
            await adapter.createObjectNotExists(
                'control.spotArea_silentApproach', 'Start cleaning multiple spot areas with silent approach (comma-separated list)',
                'string', 'value', true, '', '');
        } else {
            await adapter.deleteObjectIfExists('control.spotArea_silentApproach');
        }
    } else {
        await adapter.deleteObjectIfExists('control.spotArea');
        await adapter.deleteObjectIfExists('control.spotArea_cleanings');
        buttons.set('spot', 'start spot cleaning');
        buttons.set('edge', 'start edge cleaning');
    }

    //
    // extended (control) sub channel
    //
    let createExtendedChannel = false;

    if (adapter.vacbot.hasCustomAreaCleaningMode()) {
        if (adapter.getModel().isSupportedFeature('control.goToPosition')) {
            await adapter.createObjectNotExists(
                'control.extended.goToPosition', 'Go to position',
                'string', 'value', true, '', '');
            await adapter.createObjectNotExists(
                'control.extended.goToPosition_saveNextUsedValues', 'Save the next used go to position values',
                'boolean', 'value', true, false, '');
            await adapter.createObjectNotExists(
                'control.extended.goToPosition_saveCurrentDeebotPosition', 'Save the current position of the bot in "savedGoToPositionValues"',
                'boolean', 'value', true, false, '');
            createExtendedChannel = true;
        } else {
            await adapter.deleteObjectIfExists('control.extended.goToPosition');
            await adapter.deleteObjectIfExists('control.extended.goToPosition_saveNextUsedValues');
            await adapter.deleteObjectIfExists('control.extended.goToPosition_saveCurrentDeebotPosition');
        }
        if (adapter.getModel().isSupportedFeature('control.pauseWhenEnteringSpotArea')) {
            await adapter.createObjectNotExists(
                'control.extended.pauseWhenEnteringSpotArea', 'Pause when entering the specified spotArea',
                'string', 'value', true, '', '');
            createExtendedChannel = true;
        } else {
            await adapter.deleteObjectIfExists('control.extended.pauseWhenEnteringSpotArea');
        }
        if (adapter.getModel().isSupportedFeature('control.pauseWhenLeavingSpotArea')) {
            await adapter.createObjectNotExists(
                'control.extended.pauseWhenLeavingSpotArea', 'Pause when leaving the specified spotArea',
                'string', 'value', true, '', '');
            createExtendedChannel = true;
        } else {
            await adapter.deleteObjectIfExists('control.extended.pauseWhenLeavingSpotArea');
        }
        if (adapter.getModel().isSupportedFeature('control.pauseBeforeDockingChargingStation')) {
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
        if (adapter.getModel().isSupportedFeature('control.autoEmptyStation')) {
            await adapter.createObjectNotExists(
                'control.extended.autoEmpty', 'Auto empty status of the auto empty station',
                'boolean', 'value', true, false, '');
            await adapter.createObjectNotExists(
                'control.extended.emptyDustBin', 'Empty dust bin of the auto empty station',
                'boolean', 'button', true, false, '');
            await adapter.createChannelNotExists('info.autoEmptyStation', 'Information about the auto empty station');
            await adapter.createObjectNotExists(
                'info.autoEmptyStation.autoEmptyEnabled', 'Indicates if the auto empty mode is enabled',
                'boolean', 'value', false, false, '');
            await adapter.createObjectNotExists(
                'info.autoEmptyStation.stationActive', 'Indicates if the dust bag is emptied at this moment',
                'boolean', 'value', false, false, '');
            await adapter.createObjectNotExists(
                'info.autoEmptyStation.dustBagFull', 'Indicates if the dust bag is full',
                'boolean', 'value', false, false, '');
        } else {
            await adapter.deleteObjectIfExists('control.extended.autoEmpty');
            await adapter.deleteObjectIfExists('control.extended.emptyDustBin');
            await adapter.deleteObjectIfExists('info.autoEmptyStation.autoEmptyEnabled');
            await adapter.deleteObjectIfExists('info.autoEmptyStation.stationActive');
            await adapter.deleteObjectIfExists('info.autoEmptyStation.dustBagFull');
            await adapter.deleteChannelIfExists('info.autoEmptyStation');
        }
        if (!adapter.getModel().isSupportedFeature('control.autoBoostSuction')) {
            await adapter.deleteObjectIfExists('control.extended.autoBoostSuction');
        }
        if (adapter.getModel().isSupportedFeature('control.resetCleanSpeedToStandardOnReturn') &&
            adapter.getModel().isSupportedFeature('control.cleanSpeed')) {
            await adapter.createObjectNotExists(
                'control.extended.resetCleanSpeedToStandardOnReturn', 'Always reset clean speed to standard on return',
                'boolean', 'value', true, false, '');
        } else {
            await adapter.deleteObjectIfExists('control.extended.resetCleanSpeedToStandardOnReturn');
        }
        await adapter.createObjectNotExists(
            'control.customArea', 'Start cleaning a custom area',
            'string', 'value', true, '', '');
        await adapter.createObjectNotExists(
            'control.customArea_cleanings', 'Custom area cleanings',
            'number', 'value', true, 1, '');
    }

    if (adapter.getModel().isSupportedFeature('control.doNotDisturb')) {
        await adapter.createObjectNotExists(
            'control.extended.doNotDisturb', 'Do not disturb mode',
            'boolean', 'value', true, false, '');
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.doNotDisturb');
    }
    if (adapter.getModel().isSupportedFeature('control.continuousCleaning')) {
        await adapter.createObjectNotExists(
            'control.extended.continuousCleaning', 'Continuous cleaning',
            'boolean', 'value', true, false, '');
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.continuousCleaning');
    }
    if (adapter.getModel().isSupportedFeature('control.volume')) {
        await adapter.createObjectNotExists(
            'control.extended.volume', 'Volume for voice and sounds (1-10)',
            'number', 'value', true, 0, '');
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.volume');
    }
    if (adapter.getModel().is950type() && adapter.getModel().isMappingSupported()) {
        await adapter.createObjectNotExists(
            'control.extended.advancedMode', 'Advanced Mode',
            'boolean', 'value', true, false, '');
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.advancedMode');
    }
    if (adapter.getModel().isSupportedFeature('technology.trueDetect')) {
        await adapter.createObjectNotExists(
            'control.extended.trueDetect', 'True Detect',
            'boolean', 'value', true, false, '');
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.trueDetect');
    }
    if (adapter.getModel().isSupportedFeature('control.cleanCount')) {
        await adapter.createObjectNotExists(
            'control.extended.cleanCount', 'Permanent clean count value (1-2)',
            'number', 'value', true, 1, '');
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.cleanCount');
    }
    if (adapter.getModel().isSupportedFeature('map.spotAreas')) {
        await adapter.createObjectNotExists(
            'control.extended.cleanMarkedSpotAreas', 'Start cleaning the marked spot areas (see spot areas in map channel)',
            'boolean', 'button', true, false);
        createExtendedChannel = true;
    } else {
        await adapter.deleteObjectIfExists('control.extended.cleanMarkedSpotAreas');
    }

    if (createExtendedChannel) {
        await adapter.createChannelNotExists('control.extended', 'Extended controls');
    } else {
        await adapter.deleteChannelIfExists('control.extended');
    }

    buttons.set('clean', 'Start automatic cleaning');
    buttons.set('clean_home', 'Start automatic cleaning / return to charging station');
    buttons.set('stop', 'Stop cleaning');
    if (adapter.getModel().isSupportedFeature('control.pause')) {
        buttons.set('pause', 'Pause cleaning');
    } else {
        await adapter.deleteObjectIfExists('control.pause');
    }
    if (adapter.getModel().isSupportedFeature('control.resume')) {
        buttons.set('resume', 'Resume cleaning');
    } else {
        await adapter.deleteObjectIfExists('control.resume');
    }
    if (adapter.getModel().isSupportedFeature('control.relocate')) {
        buttons.set('relocate', 'Relocate the bot');
    }
    buttons.set('charge', 'Go back to charging station');
    if (adapter.getModel().isSupportedFeature('control.playSound')) {
        buttons.set('playSound', 'Play sound for locating the device');
        await adapter.createObjectNotExists(
            'control.playSoundId', 'Play sound by id of the message',
            'number', 'value', true, 0, '');
    } else {
        await adapter.deleteObjectIfExists('control.playSound');
        await adapter.deleteObjectIfExists('control.playSoundId');
    }
    if (adapter.getModel().isSupportedFeature('control.playIamHere')) {
        buttons.set('playIamHere', 'Play "I am here" for locating the device');
    } else {
        await adapter.deleteObjectIfExists('control.playIamHere');
    }
    for (const [objectName, name] of buttons) {
        await adapter.createObjectNotExists(
            'control.' + objectName, name,
            'boolean', 'button', true, false, '');
    }

    //
    // move (control) sub channel
    //
    const moveButtons = new Map();
    moveButtons.set('forward', 'Move forward');
    moveButtons.set('left', 'Rotate left');
    moveButtons.set('right', 'Rotate right');
    moveButtons.set('backward', 'Move backward');

    if (adapter.getModel().isSupportedFeature('control.move')) {
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
    await adapter.deleteObjectIfExists('control.move.stop');

    await adapter.createObjectNotExists(
        'control.reconnect', 'Reconnect Ecovacs API',
        'boolean', 'button', true, false, '');

    //
    // info channel
    //
    await adapter.createObjectNotExists(
        'info.battery', 'Battery status',
        'number', 'value.battery', false, 100, '%');
    await adapter.createObjectNotExists(
        'info.deviceStatus', 'Device status',
        'string', 'indicator.status', false, '', '');
    await adapter.createObjectNotExists(
        'info.cleanstatus', 'Clean status',
        'string', 'indicator.status', false, '', '');
    await adapter.createObjectNotExists(
        'info.chargestatus', 'Charge status',
        'string', 'indicator.status', false, '', '');

    //
    // history channel
    //
    await adapter.createChannelNotExists('history', 'History');

    await adapter.createObjectNotExists(
        'history.last20Errors', 'Last 20 errors',
        'json', 'history', false, '[]', '');

    await adapter.createObjectNotExists(
        'history.timestampOfLastStateChange', 'Timestamp of last state change',
        'number', 'value.datetime', false, helper.getUnixTimestamp(), '');
    await adapter.createObjectNotExists(
        'history.dateOfLastStateChange', 'Human readable timestamp of last state change',
        'string', 'value.datetime', false, adapter.getCurrentDateAndTimeFormatted(), '');

    await adapter.deleteObjectIfExists('history.timestampOfLastStartCleaning');
    await adapter.deleteObjectIfExists('history.dateOfLastStartCleaning');

    await adapter.createObjectNotExists(
        'history.timestampOfLastStartCharging', 'Timestamp of last start charging',
        'number', 'value.datetime', false, 0, '');
    await adapter.createObjectNotExists(
        'history.dateOfLastStartCharging', 'Human readable timestamp of last start charging',
        'string', 'value.datetime', false, '', '');

    await adapter.createObjectNotExists(
        'history.timestampOfLastMessageReceived', 'Timestamp of last message received from Ecovacs API',
        'number', 'value.datetime', false, 0, '');
    await adapter.createObjectNotExists(
        'history.dateOfLastMessageReceived', 'Human readable timestamp of last message received from Ecovacs API',
        'string', 'value.datetime', false, '', '');

    if (adapter.getModel().isSupportedFeature('info.dustbox')) {
        await adapter.createObjectNotExists(
            'history.timestampOfLastTimeDustboxRemoved', 'Timestamp of last time dustbox was removed',
            'number', 'value.datetime', false, 0, '');
        await adapter.createObjectNotExists(
            'history.dateOfLastTimeDustboxRemoved', 'Human readable timestamp of last time dustbox was removed',
            'string', 'value.datetime', false, '', '');
        await adapter.createObjectNotExists(
            'history.triggerDustboxRemoved', 'Manually trigger that the dustbox was removed',
            'boolean', 'button', true, false, '');

        await adapter.createObjectNotExists(
            'history.cleaningTimeSinceLastDustboxRemoved', 'Time since last dustbox removal (seconds)',
            'number', 'value', false, 0, '');
        await adapter.createObjectNotExists(
            'history.cleaningTimeSinceLastDustboxRemovedString', 'Time since last dustbox removal',
            'string', 'value.datetime', false, '', '');
        await adapter.createObjectNotExists(
            'history.squareMetersSinceLastDustboxRemoved', 'Square meters since last dustbox removal',
            'number', 'value', false, 0, 'm²');
    } else {
        await adapter.deleteObjectIfExists('history.timestampOfLastTimeDustboxRemoved');
        await adapter.deleteObjectIfExists('history.dateOfLastTimeDustboxRemoved');

        await adapter.deleteObjectIfExists('history.cleaningsSinceLastDustboxRemoved');
        await adapter.deleteObjectIfExists('history.cleaningTimeSinceLastDustboxRemoved');
        await adapter.deleteObjectIfExists('history.cleaningTimeSinceLastDustboxRemovedString');
        await adapter.deleteObjectIfExists('history.squareMetersSinceLastDustboxRemoved');
    }

    //
    // consumable channel (life span)
    //
    await adapter.createChannelNotExists('consumable', 'Consumable');

    await adapter.createObjectNotExists(
        'consumable.filter', 'Filter life span',
        'number', 'level', false, 100, '%');
    if (adapter.vacbot.hasMainBrush()) {
        await adapter.createObjectNotExists(
            'consumable.main_brush', 'Main brush life span',
            'number', 'level', false, 100, '%');
    }
    await adapter.createObjectNotExists(
        'consumable.side_brush', 'Side brush life span',
        'number', 'level', false, 100, '%');

    if (adapter.vacbot.hasUnitCareInfo()) {
        await adapter.createObjectNotExists(
            'consumable.unit_care', 'Unit care life span',
            'number', 'level', false, 100, '%');
    }

    if (adapter.vacbot.hasRoundMopInfo()) {
        await adapter.createObjectNotExists(
            'consumable.round_mop', 'Round mops life span',
            'number', 'level', false, 100, '%');
    }

    // Reset buttons
    if (adapter.getModel().isSupportedFeature('consumable.reset')) {
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
        if (adapter.vacbot.hasUnitCareInfo()) {
            await adapter.createObjectNotExists(
                'consumable.unit_care_reset', 'Reset unit care to 100%',
                'boolean', 'button', true, false, '');
        }
    }
}

async function createControlWaterLevelIfNotExists(adapter, def = 2, id = 'control.waterLevel', name = 'Water level') {
    if (!adapter.vacbot.hasMoppingSystem()) {
        return;
    }
    if (id !== 'control.waterLevel') {
        if (!adapter.getModel().isSupportedFeature('map.spotAreas.waterLevel') || !adapter.canvasModuleIsInstalled) {
            return;
        }
    }
    let min = 1;
    const states = {
        1: 'low',
        2: 'medium',
        3: 'high',
        4: 'max'
    };
    if ((id !== 'control.waterLevel') && (def === 0)) {
        min = 0;
        Object.assign(states,
            {
                0: 'standard / no change'
            });
    }
    await adapter.setObjectNotExists(id, {
        'type': 'state',
        'common': {
            'name': name,
            'type': 'number',
            'role': 'level',
            'read': true,
            'write': true,
            'min': min,
            'max': 4,
            'def': def,
            'states': states
        },
        native: {}
    });
    if (id === 'control.waterLevel_standard') {
        await adapter.createObjectNotExists(
            'control.waterLevel_reset', 'Reset water level for all spot areas',
            'boolean', 'button', true, false, '');
    }
}

async function createControlScrubbingPatternIfNotExists(adapter, def = 1, id = 'control.extended.scrubbingPattern', name = 'Scrubbing pattern (OZMO Pro)') {
    if (!adapter.vacbot.hasMoppingSystem()) {
        return;
    }
    const states = {
        1: 'quick scrubbing',
        2: 'deep scrubbing'
    };
    await adapter.setObjectNotExists(id, {
        'type': 'state',
        'common': {
            'name': name,
            'type': 'number',
            'role': 'level',
            'read': true,
            'write': true,
            'min': 1,
            'max': 2,
            'def': def,
            'states': states
        },
        native: {}
    });
}

async function createControlCleanSpeedIfNotExists(adapter, def = 2, id = 'control.cleanSpeed', name = 'Clean speed') {
    if (id !== 'control.cleanSpeed') {
        if (!adapter.getModel().isSupportedFeature('map.spotAreas.cleanSpeed') || !adapter.canvasModuleIsInstalled) {
            return;
        }
    }
    const states = {
        1: 'silent',
        2: 'normal',
        3: 'high',
        4: 'veryhigh'
    };
    if ((id !== 'control.cleanSpeed') && (def === 0)) {
        Object.assign(states,
            {
                0: 'standard / no change'
            });
    }
    await adapter.setObjectNotExists(id, {
        'type': 'state',
        'common': {
            'name': name,
            'type': 'number',
            'role': 'level',
            'read': true,
            'write': true,
            'min': 0,
            'max': 4,
            'def': def,
            'states': states
        },
        'native': {}
    });
    if (id === 'control.cleanSpeed_standard') {
        await adapter.createObjectNotExists(
            'control.cleanSpeed_reset', 'Reset clean speed for all spot areas',
            'boolean', 'button', true, false, '');
    }
}

async function createAdditionalObjects(adapter) {

    if (adapter.vacbot.hasMoppingSystem()) {
        await adapter.createObjectNotExists(
            'info.waterbox', 'Waterbox status',
            'boolean', 'value', false, false, '');
    }
    if (adapter.getModel().isSupportedFeature('info.dustbox')) {
        await adapter.createObjectNotExists(
            'info.dustbox', 'Dustbox status',
            'boolean', 'value', false, true, '');
    } else {
        await adapter.deleteObjectIfExists('info.dustbox');
    }
    if (adapter.getModel().isSupportedFeature('info.network.ip')) {
        await adapter.createChannelNotExists('info.network', 'Network information');
        await adapter.createObjectNotExists(
            'info.network.ip', 'IP address',
            'string', 'text', false, '', '');
        if (adapter.getModel().isSupportedFeature('info.network.wifiSSID')) {
            await adapter.createObjectNotExists(
                'info.network.wifiSSID', 'WiFi SSID',
                'string', 'text', false, '', '');
        }
        if (adapter.getModel().isSupportedFeature('info.network.wifiSignal')) {
            await adapter.createObjectNotExists(
                'info.network.wifiSignal', 'WiFi signal strength in dBm',
                'number', 'level', false, 0, 'dBm');
        }
        if (adapter.getModel().isSupportedFeature('info.network.mac')) {
            await adapter.createObjectNotExists(
                'info.network.mac', 'MAC address',
                'string', 'text', false, '', '');
        }
    } else {
        await adapter.deleteObjectIfExists('info.network.ip');
        await adapter.deleteObjectIfExists('info.network.wifiSSID');
        await adapter.deleteObjectIfExists('info.network.wifiSignal');
        await adapter.deleteObjectIfExists('info.network.mac');
    }
    // Deprecated
    await adapter.deleteObjectIfExists('info.ip');
    await adapter.deleteObjectIfExists('info.wifiSSID');
    await adapter.deleteObjectIfExists('info.wifiSignal');
    await adapter.deleteObjectIfExists('info.mac');

    if (adapter.getModel().isSupportedFeature('info.sleepStatus')) {
        await adapter.createObjectNotExists(
            'info.sleepStatus', 'Sleep status',
            'boolean', 'value', false, false, '');
    } else {
        await adapter.deleteObjectIfExists('info.sleepStatus');
    }

    //
    // cleaning log channel
    //
    if (adapter.getModel().isSupportedFeature('cleaninglog.channel')) {
        await adapter.createChannelNotExists('cleaninglog', 'Cleaning logs');
    }

    if (adapter.getModel().isSupportedFeature('cleaninglog.channel')) {
        await adapter.createObjectNotExists(
            'cleaninglog.totalSquareMeters', 'Total square meters',
            'number', 'value', false, 0, 'm²');
        await adapter.createObjectNotExists(
            'cleaninglog.totalSeconds', 'Total seconds',
            'number', 'value', false, 0, '');
        await adapter.createObjectNotExists(
            'cleaninglog.totalTime', 'Total time',
            'string', 'value', false, '', '');
        await adapter.createObjectNotExists(
            'cleaninglog.totalNumber', 'Total number of cleanings',
            'number', 'value', false, 0, '');
        await adapter.createObjectNotExists(
            'cleaninglog.last20Logs', 'Last 20 cleaning logs',
            'json', 'history', false, '[]', '');
        await adapter.createObjectNotExists(
            'cleaninglog.lastCleaningTimestamp', 'Timestamp of the last cleaning',
            'number', 'value', false, 0, '');
        await adapter.createObjectNotExists(
            'cleaninglog.lastCleaningDate', 'Date of the last cleaning',
            'string', 'value', false, '', '');
        await adapter.createObjectNotExists(
            'cleaninglog.lastSquareMeters', 'Total square meters of the last cleaning',
            'number', 'value', false, 0, 'm²');
        await adapter.createObjectNotExists(
            'cleaninglog.lastTotalSeconds', 'Total time of the last cleaning (seconds)',
            'number', 'value', false, 0, '');
        await adapter.createObjectNotExists(
            'cleaninglog.lastTotalTimeString', 'Total time of the last cleaning',
            'string', 'value', false, '', '');
    } else {
        await adapter.deleteObjectIfExists('cleaninglog.totalSquareMeters');
        await adapter.deleteObjectIfExists('cleaninglog.totalSeconds');
        await adapter.deleteObjectIfExists('cleaninglog.totalTime');
        await adapter.deleteObjectIfExists('cleaninglog.totalNumber');
        await adapter.deleteObjectIfExists('cleaninglog.last20Logs');
        await adapter.deleteObjectIfExists('cleaninglog.lastCleaningTimestamp');
        await adapter.deleteObjectIfExists('cleaninglog.lastCleaningDate');
        await adapter.deleteObjectIfExists('cleaninglog.lastSquareMeters');
        await adapter.deleteObjectIfExists('cleaninglog.lastTotalSeconds');
        await adapter.deleteObjectIfExists('cleaninglog.lastTotalTimeString');
    }
    await adapter.deleteObjectIfExists('cleaninglog.squareMeters');

    if (adapter.getModel().isSupportedFeature('cleaninglog.lastCleaningMap')) {
        await adapter.createObjectNotExists(
            'cleaninglog.lastCleaningMapImageURL', 'Image URL of the last cleaning',
            'string', 'value', false, '', '');
    }

    //
    // map channel
    //
    if (adapter.getModel().isSupportedFeature('map')) {
        await adapter.createChannelNotExists('map', 'Map');
        await adapter.createObjectNotExists(
            'map.currentMapName', 'Name of current active map',
            'string', 'text', false, '', '');
        await adapter.createObjectNotExists(
            'map.currentMapIndex', 'Index of current active map',
            'number', 'value', false, 0, '');
        await adapter.createObjectNotExists(
            'map.currentMapMID', 'MID of current active map',
            'string', 'text', false, '', '');
    }

    if (adapter.getModel().isSupportedFeature('map.relocationState')) {
        await adapter.createObjectNotExists(
            'map.relocationState', 'Relocation status',
            'string', 'text', false, '', '');
    }
    if (adapter.getModel().isSupportedFeature('map.deebotPosition')) {
        await adapter.createObjectNotExists(
            'map.deebotPosition', 'Bot position (x, y, angle)',
            'string', 'text', false, '', '');
        await adapter.createObjectNotExists(
            'map.deebotPosition_x', 'Bot position (x)',
            'number', 'value', false, 0, '');
        await adapter.createObjectNotExists(
            'map.deebotPosition_y', 'Bot position (y)',
            'number', 'value', false, 0, '');
        await adapter.createObjectNotExists(
            'map.deebotPosition_angle', 'Bot position (angle)',
            'number', 'value', false, 0, '');
        if (adapter.getModel().isSupportedFeature('map.chargePosition')) {
            await adapter.createObjectNotExists(
                'map.deebotDistanceToChargePosition', 'Approximate distance between bot and charging station',
                'number', 'value', false, 0.0, 'm');
        }
    }
    if (adapter.getModel().isSupportedFeature('map.deebotPositionIsInvalid')) {
        await adapter.createObjectNotExists(
            'map.deebotPositionIsInvalid', 'Bot position is invalid / unknown',
            'boolean', 'indicator.status', false, false, '');
    }
    if (adapter.getModel().isSupportedFeature('map.deebotPositionCurrentSpotAreaID') && adapter.canvasModuleIsInstalled) {
        await adapter.createObjectNotExists(
            'map.deebotPositionCurrentSpotAreaID', 'ID of the SpotArea the bot is currently in',
            'string', 'text', false, 'unknown', '');
        await adapter.createObjectNotExists(
            'map.deebotPositionCurrentSpotAreaName', 'Name of the SpotArea the bot is currently in',
            'string', 'text', false, 'unknown', '');
    }
    if (adapter.getModel().isSupportedFeature('map.chargePosition')) {
        await adapter.createObjectNotExists(
            'map.chargePosition', 'Charge position (x, y, angle)',
            'string', 'text', false, '', '');
    }
    if (adapter.getModel().isSupportedFeature('map.lastUsedAreaValues')) {
        await adapter.createObjectNotExists(
            'map.currentUsedCustomAreaValues', 'Current used custom area values',
            'string', 'text', false, '', '');
        await adapter.createObjectNotExists(
            'map.currentUsedSpotAreas', 'Current used spot areas',
            'string', 'text', false, '', '');
        await adapter.createObjectNotExists(
            'map.lastUsedCustomAreaValues', 'Last used area values',
            'string', 'text', false, '', '');
        await adapter.createObjectNotExists(
            'map.lastUsedCustomAreaValues_rerun', 'Rerun cleaning with the last area values used',
            'boolean', 'button', true, false, '');
        await adapter.createObjectNotExists(
            'map.lastUsedCustomAreaValues_save', 'Save the last used custom area values',
            'boolean', 'button', true, false, '');
        await adapter.createObjectNotExists(
            'map.currentSpotAreaValues_save', 'Save the current spot area values',
            'boolean', 'button', true, false, '');
    } else {
        await adapter.deleteObjectIfExists('map.currentUsedCustomAreaValues');
        await adapter.deleteObjectIfExists('map.currentUsedSpotAreas');
        await adapter.deleteObjectIfExists('map.lastUsedCustomAreaValues');
        await adapter.deleteObjectIfExists('map.lastUsedCustomAreaValues_rerun');
        await adapter.deleteObjectIfExists('map.lastUsedCustomAreaValues_save');
        await adapter.deleteObjectIfExists('map.lastUsedSpotAreaValues_save');
    }
}

module.exports = {
    createInitialObjects,
    createInitialInfoObjects,
    createAdditionalObjects,
    createControlCleanSpeedIfNotExists,
    createControlScrubbingPatternIfNotExists,
    createControlWaterLevelIfNotExists
};
