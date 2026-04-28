'use strict';

const helper = require('./adapterHelper');

async function createInitialInfoObjects(adapter, ctx) {

    //
    // info channel
    //
    await ctx.adapterProxy.createChannelNotExists('info', 'Information');
    await ctx.adapterProxy.createObjectNotExists(
        'info.version', 'Adapter version',
        'string', 'text', false, '', '');

    await ctx.adapterProxy.createChannelNotExists('info.library', 'Library information');
    await ctx.adapterProxy.createObjectNotExists(
        'info.library.version', 'Library version',
        'string', 'text', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.library.canvasModuleIsInstalled', 'Indicates whether node-canvas module is installed',
        'boolean', 'value', false, false, '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.library.communicationProtocol', 'Communication protocol',
        'string', 'text', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.library.deviceIs950type', 'Indicates whether the model is detected as 950 type (MQTT/JSON)',
        'boolean', 'indicator', false, false, '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.library.debugMessage', 'Debug messages from library',
        'string', 'text', false, '', '');

    // Deprecated
    await ctx.adapterProxy.deleteObjectIfExists('info.canvasModuleIsInstalled');
    await ctx.adapterProxy.deleteObjectIfExists('info.communicationProtocol');
    await ctx.adapterProxy.deleteObjectIfExists('info.deviceIs950type');
    await ctx.adapterProxy.deleteObjectIfExists('info.debugMessage');

    await ctx.adapterProxy.createObjectNotExists(
        'info.deviceName', 'Name of the device',
        'string', 'text', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.deviceClass', 'Class number of the device',
        'string', 'text', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.deviceModel', 'Model name of the device',
        'string', 'text', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.modelType', 'Type of the model (as classified in the library)',
        'string', 'text', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.deviceType', 'User-friendly device type classification',
        'string', 'text', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.deviceCapabilities', 'Device capabilities and features',
        'string', 'json', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.deviceDiscovery', 'Device discovery information for admin interface',
        'string', 'json', true, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.deviceImageURL', 'URL to picture of the device',
        'string', 'text', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.connection', 'Connection status',
        'boolean', 'indicator.connected', false, false, '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.connectionUptime', 'Connection uptime in minutes',
        'number', 'value', false, 0, '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.error', 'Error messages',
        'string', 'indicator.error', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.errorCode', 'Error code',
        'string', 'indicator.error', false, '0', '');
}

async function createInitialObjects(adapter, ctx) {
    // Create history objects for all device types (including aqMonitor/sensors)
    // since messageReceived and error events fire for all devices
    await ctx.adapterProxy.createChannelNotExists('history', 'History');
    await ctx.adapterProxy.createObjectNotExists(
        'history.last20Errors', 'Last 20 errors',
        'json', 'history', false, '[]', '');
    await ctx.adapterProxy.createObjectNotExists(
        'history.timestampOfLastStateChange', 'Timestamp of last state change',
        'number', 'value.datetime', false, helper.getUnixTimestamp(), '');
    await ctx.adapterProxy.createObjectNotExists(
        'history.dateOfLastStateChange', 'Human readable timestamp of last state change',
        'string', 'value.datetime', false, ctx.adapter.getCurrentDateAndTimeFormatted(), '');
    await ctx.adapterProxy.createObjectNotExists(
        'history.timestampOfLastMessageReceived', 'Timestamp of last message received from Ecovacs API',
        'number', 'value.datetime', false, 0, '');
    await ctx.adapterProxy.createObjectNotExists(
        'history.dateOfLastMessageReceived', 'Human readable timestamp of last message received from Ecovacs API',
        'string', 'value.datetime', false, '', '');

    if (ctx.getModelType() === 'aqMonitor') {
        return;
    }

    await ctx.adapterProxy.createObjectNotExists(
        'info.battery', 'Battery status',
        'number', 'value.battery', false, 100, '%');
    await ctx.adapterProxy.createObjectNotExists(
        'info.deviceStatus', 'Device status',
        'string', 'indicator.status', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.cleanstatus', 'Clean status',
        'string', 'indicator.status', false, '', '');
    await ctx.adapterProxy.createObjectNotExists(
        'info.chargestatus', 'Charge status',
        'string', 'indicator.status', false, '', '');

    // Status channel
    await ctx.adapterProxy.createChannelNotExists('status', 'Status');
    await ctx.adapterProxy.createObjectNotExists(
        'status.device', 'Device status',
        'string', 'indicator.status', false, '', '');

    if (ctx.getModel().isSupportedFeature('cleaninglog.channel')) {
        await ctx.adapterProxy.createChannelNotExists('cleaninglog.current', 'Current cleaning stats');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.current.cleanedArea', 'Current cleaned area (m²)',
            'number', 'value', false, 0, 'm²');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.current.cleanedSeconds', 'Current cleaning time (seconds)',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.current.cleanedTime', 'Current cleaning time',
            'string', 'value', false, '0h 00m 00s', '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.current.cleanType', 'Current clean type',
            'string', 'value', false, '', '');
    }

    //
    // control channel
    //
    await ctx.adapterProxy.createChannelNotExists('control', 'Control');
    const buttons = new Map();

    if (ctx.vacbot.hasSpotAreaCleaningMode()) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.spotArea', 'Start cleaning multiple spot areas (comma-separated list)',
            'string', 'value', true, '', '');
        if ((ctx.getModelType() === 'legacy') || (ctx.getModelType() === '950')) {
            await ctx.adapterProxy.createObjectNotExists(
                'control.spotArea_cleanings', 'Spot area cleanings',
                'number', 'value', true, 1, '');
        } else {
            await ctx.adapterProxy.deleteObjectIfExists('control.spotArea_cleanings');
        }
        if (ctx.getModel().isSupportedFeature('control.goToPosition') && ctx.getDevice().useNativeGoToPosition()) {
            await ctx.adapterProxy.createObjectNotExists(
                'control.spotArea_silentApproach', 'Start cleaning multiple spot areas with silent approach (comma-separated list)',
                'string', 'value', true, '', '');
        } else {
            await ctx.adapterProxy.deleteObjectIfExists('control.spotArea_silentApproach');
        }
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.spotArea');
        await ctx.adapterProxy.deleteObjectIfExists('control.spotArea_cleanings');
        if (ctx.getModelType() !== 'airbot' && ctx.getModelType() !== 'goat') {
            buttons.set('spot', 'start spot cleaning');
            buttons.set('edge', 'start edge cleaning');
        }
    }

    if (ctx.getModel().isModelTypeAirbot()) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.basicPurification', 'Start Basic purification',
            'boolean', 'button', true, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            'control.mobilePurification', 'Start Mobile purification',
            'boolean', 'button', true, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            'control.spotPurification', 'Start Spot purification',
            'string', 'value', true, '', '');
    }

    //
    // extended (control) sub channel
    //
    await ctx.adapterProxy.createChannelNotExists('control.extended', 'Extended controls');

    if (ctx.getModel().hasCustomAreaCleaningMode() || ctx.getModel().isModelTypeAirbot()) {
        if (ctx.getModel().isSupportedFeature('control.goToPosition') || ctx.getDevice().useNativeGoToPosition()) {
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.goToPosition', 'Go to position',
                'string', 'value', true, '', '');
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.goToPosition_saveNextUsedValues', 'Save the next used go to position values',
                'boolean', 'value', true, false, '');
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.goToPosition_saveCurrentDeebotPosition', 'Save the current position of the bot in "savedGoToPositionValues"',
                'boolean', 'value', true, false, '');
        } else {
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.goToPosition');
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.goToPosition_saveNextUsedValues');
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.goToPosition_saveCurrentDeebotPosition');
        }
    }

    if (ctx.getModel().hasCustomAreaCleaningMode()) {
        if (ctx.getModel().isSupportedFeature('control.pauseWhenEnteringSpotArea')) {
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.pauseWhenEnteringSpotArea', 'Pause when entering the specified spotArea',
                'string', 'value', true, '', '');
        } else {
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.pauseWhenEnteringSpotArea');
        }
        if (ctx.getModel().isSupportedFeature('control.pauseWhenLeavingSpotArea')) {
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.pauseWhenLeavingSpotArea', 'Pause when leaving the specified spotArea',
                'string', 'value', true, '', '');
        } else {
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.pauseWhenLeavingSpotArea');
        }
        if (ctx.getModel().isSupportedFeature('control.pauseBeforeDockingChargingStation')) {
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.pauseBeforeDockingChargingStation', 'Pause before docking onto charging station',
                'boolean', 'value', true, false, '');
            if (ctx.vacbot.hasMoppingSystem()) {
                await ctx.adapterProxy.createObjectNotExists(
                    'control.extended.pauseBeforeDockingIfWaterboxInstalled', 'Always pause before docking onto charging station if waterbox installed',
                    'boolean', 'value', true, false, '');
            }
        } else {
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.pauseBeforeDockingIfWaterboxInstalled');
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.pauseBeforeDockingChargingStation');
        }
        if (ctx.getModel().isSupportedFeature('control.autoEmptyStation')) {
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.autoEmpty', 'Auto empty status of the auto empty station',
                'boolean', 'value', true, false, '');
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.emptyDustBin', 'Empty dust bin of the auto empty station',
                'boolean', 'button', true, false, '');
            await ctx.adapterProxy.createChannelNotExists('info.autoEmptyStation', 'Information about the auto empty station');
            await ctx.adapterProxy.createObjectNotExists(
                'info.autoEmptyStation.autoEmptyEnabled', 'Indicates if the auto empty mode is enabled',
                'boolean', 'value', false, false, '');
            await ctx.adapterProxy.createObjectNotExists(
                'info.autoEmptyStation.stationActive', 'Indicates if the dust bag is emptied at this moment',
                'boolean', 'value', false, false, '');
            await ctx.adapterProxy.createObjectNotExists(
                'info.autoEmptyStation.dustBagFull', 'Indicates if the dust bag is full',
                'boolean', 'value', false, false, '');
        } else {
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.autoEmpty');
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.emptyDustBin');
            await ctx.adapterProxy.deleteObjectIfExists('info.autoEmptyStation.autoEmptyEnabled');
            await ctx.adapterProxy.deleteObjectIfExists('info.autoEmptyStation.stationActive');
            await ctx.adapterProxy.deleteObjectIfExists('info.autoEmptyStation.dustBagFull');
            await ctx.adapterProxy.deleteChannelIfExists('info.autoEmptyStation');
        }
        if (!ctx.getModel().isSupportedFeature('control.autoBoostSuction')) {
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.autoBoostSuction');
        }
        if (ctx.getModel().isSupportedFeature('control.resetCleanSpeedToStandardOnReturn') &&
            ctx.getModel().isSupportedFeature('control.cleanSpeed')) {
            await ctx.adapterProxy.createObjectNotExists(
                'control.extended.resetCleanSpeedToStandardOnReturn', 'Always reset clean speed to standard on return',
                'boolean', 'value', true, false, '');
        } else {
            await ctx.adapterProxy.deleteObjectIfExists('control.extended.resetCleanSpeedToStandardOnReturn');
        }
        await ctx.adapterProxy.createObjectNotExists(
            'control.customArea', 'Start cleaning a custom area',
            'string', 'value', true, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'control.customArea_cleanings', 'Custom area cleanings',
            'number', 'value', true, 1, '');
    }

    if (ctx.getModel().isSupportedFeature('control.doNotDisturb')) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.doNotDisturb', 'Do not disturb mode',
            'boolean', 'value', true, false, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.doNotDisturb');
    }
    if (ctx.getModel().isSupportedFeature('control.continuousCleaning')) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.continuousCleaning', 'Continuous/Resumed cleaning',
            'boolean', 'value', true, false, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.continuousCleaning');
    }
    if ((ctx.getModel().isSupportedFeature('control.volume')) && (ctx.getModelType() !== 'airbot')) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.volume', 'Volume for voice and sounds (0-10)',
            'number', 'value', true, 0, '');
        // TODO: Remove again after some time
        // Correct name for objects that already exist ("1-10" => "0-10")
        await changeObjName(adapter, ctx, 'control.extended.volume', 'Volume for voice and sounds (0-10)');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.volume');
    }
    if (ctx.getModel().hasAdvancedMode()) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.advancedMode', 'Advanced Mode',
            'boolean', 'value', true, false, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.advancedMode');
    }
    if (ctx.getModel().isSupportedFeature('technology.trueDetect')) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.trueDetect', 'True Detect / AIVI 3D',
            'boolean', 'value', true, false, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.trueDetect');
    }
    if (ctx.getModel().isSupportedFeature('control.cleanCount')) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.cleanCount', 'Permanent clean count value (1-2)',
            'number', 'value', true, 1, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.cleanCount');
    }
    if (ctx.getModel().isSupportedFeature('map.spotAreas')) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.cleanMarkedSpotAreas', 'Start cleaning the marked spot areas (see spot areas in map channel)',
            'boolean', 'button', true, false);
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.cleanMarkedSpotAreas');
    }

    if (ctx.getModel().vacbot.getDeviceProperty('hosted_mode')) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.hostedCleanMode', 'Hosted clean mode',
            'boolean', 'button', true, false, '');
    }

    buttons.set('clean', 'Start automatic cleaning');
    buttons.set('clean_home', 'Start automatic cleaning / return to charging station');
    buttons.set('stop', 'Stop cleaning');
    if (ctx.getModel().isSupportedFeature('control.pause')) {
        buttons.set('pause', 'Pause cleaning');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.pause');
    }
    if (ctx.getModel().isSupportedFeature('control.resume')) {
        buttons.set('resume', 'Resume cleaning');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.resume');
    }
    if (ctx.getModel().isSupportedFeature('control.relocate')) {
        buttons.set('relocate', 'Relocate the bot');
    }
    buttons.set('charge', 'Go back to charging station');
    if (ctx.getModel().isSupportedFeature('control.playSound')) {
        buttons.set('playSound', 'Play sound for locating the device');
        await ctx.adapterProxy.createObjectNotExists(
            'control.playSoundId', 'Play sound by id of the message',
            'number', 'value', true, 0, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.playSound');
        await ctx.adapterProxy.deleteObjectIfExists('control.playSoundId');
    }
    if (ctx.getModel().isSupportedFeature('control.playIamHere')) {
        buttons.set('playIamHere', 'Play "I am here" for locating the device');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('control.playIamHere');
    }
    for (const [objectName, name] of buttons) {
        await ctx.adapterProxy.createObjectNotExists(
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

    if (ctx.getModel().isSupportedFeature('control.move')) {
        await ctx.adapterProxy.createChannelNotExists('control.move', 'Move commands');
        for (const [objectName, name] of moveButtons) {
            await ctx.adapterProxy.createObjectNotExists(
                'control.move.' + objectName, name,
                'boolean', 'button', true, false, '');
        }
    } else {
        for (const [objectName] of moveButtons) {
            await ctx.adapterProxy.deleteObjectIfExists('control.move.' + objectName);
        }
    }
    await ctx.adapterProxy.deleteObjectIfExists('control.move.stop');

    await ctx.adapterProxy.createObjectNotExists(
        'control.reconnect', 'Reconnect Ecovacs API',
        'boolean', 'button', true, false, '');

    //
    // Generic command (Experienced users only!)
    //

    await ctx.adapterProxy.createChannelNotExists('control.extended.genericCommand', 'Run generic command (Experienced users only!)');
    await ctx.adapterProxy.createObjectNotExists(
        'control.extended.genericCommand.command', 'Name of the command',
        'string', 'value', true, '');
    await ctx.adapterProxy.createObjectNotExists(
        'control.extended.genericCommand.payload', 'Payload for the command (optional)',
        'json', 'value', true, '');
    await ctx.adapterProxy.createObjectNotExists(
        'control.extended.genericCommand.run', 'Caution! Use at your own risk!',
        'boolean', 'button', true, false);
    await ctx.adapterProxy.createObjectNotExists(
        'control.extended.genericCommand.responsePayload', 'Response payload',
        'json', 'value', false, '');

    //
    // history channel (charging, dustbox, map - robot-specific states)
    //
    await ctx.adapterProxy.deleteObjectIfExists('history.timestampOfLastStartCleaning');
    await ctx.adapterProxy.deleteObjectIfExists('history.dateOfLastStartCleaning');

    await ctx.adapterProxy.createObjectNotExists(
        'history.timestampOfLastStartCharging', 'Timestamp of last start charging',
        'number', 'value.datetime', false, 0, '');
    await ctx.adapterProxy.createObjectNotExists(
        'history.dateOfLastStartCharging', 'Human readable timestamp of last start charging',
        'string', 'value.datetime', false, '', '');

    if (ctx.getModel().isSupportedFeature('info.dustbox') &&
        ctx.adapter.getHoursUntilDustBagEmptyReminderFlagIsSet() > 0) {
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.dustBagEmptyReminder', 'Dust bag empty reminder',
            'boolean', 'value', true, false, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.dustBagEmptyReminder');
    }

    if (ctx.getModel().isSupportedFeature('info.dustbox')) {
        await ctx.adapterProxy.createObjectNotExists(
            'history.timestampOfLastTimeDustboxRemoved', 'Timestamp of last time dustbox was removed',
            'number', 'value.datetime', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'history.dateOfLastTimeDustboxRemoved', 'Human readable timestamp of last time dustbox was removed',
            'string', 'value.datetime', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'history.triggerDustboxRemoved', 'Manually trigger that the dustbox was removed',
            'boolean', 'button', true, false, '');

        await ctx.adapterProxy.createObjectNotExists(
            'history.cleaningTimeSinceLastDustboxRemoved', 'Time since last dustbox removal (seconds)',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'history.cleaningTimeSinceLastDustboxRemovedString', 'Time since last dustbox removal',
            'string', 'value.datetime', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'history.squareMetersSinceLastDustboxRemoved', 'Square meters since last dustbox removal',
            'number', 'value', false, 0, 'm²');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('history.timestampOfLastTimeDustboxRemoved');
        await ctx.adapterProxy.deleteObjectIfExists('history.dateOfLastTimeDustboxRemoved');

        await ctx.adapterProxy.deleteObjectIfExists('history.cleaningsSinceLastDustboxRemoved');
        await ctx.adapterProxy.deleteObjectIfExists('history.cleaningTimeSinceLastDustboxRemoved');
        await ctx.adapterProxy.deleteObjectIfExists('history.cleaningTimeSinceLastDustboxRemovedString');
        await ctx.adapterProxy.deleteObjectIfExists('history.squareMetersSinceLastDustboxRemoved');
    }

    //
    // consumable channel (life span)
    //
    if ((ctx.getModelType() !== 'goat') && (ctx.getModelType() !== 'aqMonitor')) {
        await ctx.adapterProxy.createChannelNotExists('consumable', 'Consumable');

        if (ctx.getModelType() !== 'airbot') {
            await ctx.adapterProxy.createObjectNotExists(
                'consumable.filter', 'Filter life span',
                'number', 'level', false, 100, '%');
            if (ctx.vacbot.hasMainBrush()) {
                await ctx.adapterProxy.createObjectNotExists(
                    'consumable.main_brush', 'Main brush life span',
                    'number', 'level', false, 100, '%');
            }
            await ctx.adapterProxy.createObjectNotExists(
                'consumable.side_brush', 'Side brush life span',
                'number', 'level', false, 100, '%');
            if (ctx.vacbot.hasUnitCareInfo()) {
                await ctx.adapterProxy.createObjectNotExists(
                    'consumable.unit_care', 'Unit care life span',
                    'number', 'level', false, 100, '%');
            }
            if (ctx.vacbot.hasRoundMopInfo()) {
                await ctx.adapterProxy.createObjectNotExists(
                    'consumable.round_mop', 'Round mops life span',
                    'number', 'level', false, 100, '%');
            }
            if (ctx.getModel().isSupportedFeature('consumable.airFreshener')) {
                await ctx.adapterProxy.createObjectNotExists(
                    'consumable.airFreshener', 'Air freshener life span',
                    'number', 'level', false, 100, '%');
            }
        }

        // Reset buttons
        if (ctx.getModel().isSupportedFeature('consumable.reset')) {
            await ctx.adapterProxy.createObjectNotExists(
                'consumable.filter_reset', 'Reset filter to 100%',
                'boolean', 'button', true, false, '');
            if (ctx.vacbot.hasMainBrush()) {
                await ctx.adapterProxy.createObjectNotExists(
                    'consumable.main_brush_reset', 'Reset main brush to 100%',
                    'boolean', 'button', true, false, '');
            }
            await ctx.adapterProxy.createObjectNotExists(
                'consumable.side_brush_reset', 'Reset side brush to 100%',
                'boolean', 'button', true, false, '');
            if (ctx.vacbot.hasUnitCareInfo()) {
                await ctx.adapterProxy.createObjectNotExists(
                    'consumable.unit_care_reset', 'Reset unit care to 100%',
                    'boolean', 'button', true, false, '');
            }
            if (ctx.vacbot.hasRoundMopInfo()) {
                await ctx.adapterProxy.createObjectNotExists(
                    'consumable.round_mop_reset', 'Reset round mop to 100%',
                    'boolean', 'button', true, false, '');
            }
            if (ctx.getModel().isSupportedFeature('consumable.airFreshener')) {
                await ctx.adapterProxy.createObjectNotExists(
                    'consumable.airFreshener_reset', 'Reset air freshener to 100%',
                    'boolean', 'button', true, false, '');
            }
        }
    }
}

async function createControlWaterLevelIfNotExists(adapter, ctx, def = 2, id = 'control.waterLevel', name = 'Water level') {
    if (!ctx.vacbot.hasMoppingSystem()) {
        return;
    }
    if (id !== 'control.waterLevel') {
        if (!ctx.getModel().isSupportedFeature('map.spotAreas.waterLevel') || !ctx.adapter.canvasModuleIsInstalled) {
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
    await ctx.adapterProxy.setObjectNotExistsAsync(id, {
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
        await ctx.adapterProxy.createObjectNotExists(
            'control.waterLevel_reset', 'Reset water level for all spot areas',
            'boolean', 'button', true, false, '');
    }
}

async function createControlSweepModeIfNotExists(adapter, ctx, states) {
    if (!ctx.vacbot.hasMoppingSystem()) {
        return;
    }
    await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.moppingMode', {
        'type': 'state',
        'common': {
            'name': 'Mopping mode',
            'type': 'number',
            'role': 'level',
            'read': true,
            'write': true,
            'min': 0,
            'max': 2,
            'def': 0,
            'states': states
        },
        native: {}
    });
}

async function createControlScrubbingPatternIfNotExists(adapter, ctx, states) {
    if (!ctx.vacbot.hasMoppingSystem() || !ctx.vacbot.hasRoundMopInfo()) {
        return;
    }
    await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.scrubbingPattern', {
        'type': 'state',
        'common': {
            'name': '`Scrubbing pattern (OZMO Pro)`',
            'type': 'number',
            'role': 'level',
            'read': true,
            'write': true,
            'min': 1,
            'max': 2,
            'def': 1,
            'states': states
        },
        native: {}
    });
}

async function createControlCleanSpeedIfNotExists(adapter, ctx, def = 2, id = 'control.cleanSpeed', name = 'Clean speed') {
    if (id !== 'control.cleanSpeed') {
        if (!ctx.getModel().isSupportedFeature('map.spotAreas.cleanSpeed') || !ctx.adapter.canvasModuleIsInstalled) {
            return;
        }
    }
    let states = {
        1: 'silent',
        2: 'normal',
        3: 'high',
        4: 'very high'
    };
    if (ctx.getModel().isModelTypeAirbot()) {
        states = {
            1: 'quiet',
            2: 'standard',
            3: 'strong',
            4: 'smart'
        };
    }
    if ((id !== 'control.cleanSpeed') && (def === 0)) {
        Object.assign(states,
            {
                0: 'standard / no change'
            });
    }
    await ctx.adapterProxy.setObjectNotExistsAsync(id, {
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
        await ctx.adapterProxy.createObjectNotExists(
            'control.cleanSpeed_reset', 'Reset clean speed for all spot areas',
            'boolean', 'button', true, false, '');
    }
}

async function createControlWashIntervalIfNotExists(adapter, ctx) {
    const isT20Type = ctx.getModel().isModelTypeT20() || ctx.getModel().isModelTypeX2();
    const deep = isT20Type ? 6 : 10;
    const daily = isT20Type ? 10 : 15;
    const efficient = isT20Type ? 15 : 25;
    const states = {};
    states[deep] = 'deep';
    states[daily] = 'daily';
    states[efficient] = 'efficient';
    await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.washInterval', {
        'type': 'state',
        'common': {
            'name': 'Wash interval',
            'type': 'number',
            'role': 'level',
            'read': true,
            'write': true,
            'min': deep,
            'max': efficient,
            'def': daily,
            'states': states
        },
        native: {}
    });
}

async function createAdditionalObjects(adapter, ctx) {
    const modelType = ctx.getModelType();

    // aqMonitor devices have no vacuum/robot-specific features
    if (modelType === 'aqMonitor') {
        return;
    }

    if (ctx.vacbot.hasMoppingSystem()) {
        await ctx.adapterProxy.createObjectNotExists(
            'info.waterbox', 'Waterbox status',
            'boolean', 'value', false, false, '');
    }
    if (ctx.getModel().isSupportedFeature('info.dustbox')) {
        await ctx.adapterProxy.createObjectNotExists(
            'info.dustbox', 'Dustbox status',
            'boolean', 'value', false, true, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('info.dustbox');
    }
    if (ctx.getModel().isSupportedFeature('info.network.ip')) {
        await ctx.adapterProxy.createChannelNotExists('info.network', 'Network information');
        await ctx.adapterProxy.createObjectNotExists(
            'info.network.ip', 'IP address',
            'string', 'text', false, '', '');
        if (ctx.getModel().isSupportedFeature('info.network.wifiSSID')) {
            await ctx.adapterProxy.createObjectNotExists(
                'info.network.wifiSSID', 'WiFi SSID',
                'string', 'text', false, '', '');
        }
        if (ctx.getModel().isSupportedFeature('info.network.wifiSignal')) {
            await ctx.adapterProxy.createObjectNotExists(
                'info.network.wifiSignal', 'WiFi signal strength in dBm',
                'number', 'level', false, 0, 'dBm');
        }
        if (ctx.getModel().isSupportedFeature('info.network.mac')) {
            await ctx.adapterProxy.createObjectNotExists(
                'info.network.mac', 'MAC address',
                'string', 'text', false, '', '');
        }
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('info.network.ip');
        await ctx.adapterProxy.deleteObjectIfExists('info.network.wifiSSID');
        await ctx.adapterProxy.deleteObjectIfExists('info.network.wifiSignal');
        await ctx.adapterProxy.deleteObjectIfExists('info.network.mac');
    }
    // Deprecated
    await ctx.adapterProxy.deleteObjectIfExists('info.ip');
    await ctx.adapterProxy.deleteObjectIfExists('info.wifiSSID');
    await ctx.adapterProxy.deleteObjectIfExists('info.wifiSignal');
    await ctx.adapterProxy.deleteObjectIfExists('info.mac');

    if (ctx.getModel().isSupportedFeature('info.sleepStatus')) {
        await ctx.adapterProxy.createObjectNotExists(
            'info.sleepStatus', 'Sleep status',
            'boolean', 'value', false, false, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('info.sleepStatus');
    }

    //
    // cleaning log channel
    //
    if (ctx.getModel().isSupportedFeature('cleaninglog.channel')) {
        await ctx.adapterProxy.createChannelNotExists('cleaninglog', 'Cleaning logs');

        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.totalSquareMeters', 'Total square meters',
            'number', 'value', false, 0, 'm²');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.totalSeconds', 'Total seconds',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.totalTime', 'Total time',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.totalNumber', 'Total number of cleanings',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.last20Logs', 'Last 20 cleaning logs',
            'json', 'history', false, '[]', '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.lastCleaningTimestamp', 'Timestamp of the last cleaning',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.lastCleaningDate', 'Date of the last cleaning',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.lastSquareMeters', 'Total square meters of the last cleaning',
            'number', 'value', false, 0, 'm²');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.lastTotalSeconds', 'Total time of the last cleaning (seconds)',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.lastTotalTimeString', 'Total time of the last cleaning',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.requestCleaningLog', 'Manually request the cleaning log',
            'boolean', 'button', true, false, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.last20Logs');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.lastCleaningDate');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.lastCleaningTimestamp');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.lastSquareMeters');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.lastTotalSeconds');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.lastTotalTimeString');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.requestCleaningLog');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.totalNumber');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.totalSeconds');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.totalSquareMeters');
        await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.totalTime');
    }
    await ctx.adapterProxy.deleteObjectIfExists('cleaninglog.squareMeters');

    if (ctx.getModel().isSupportedFeature('cleaninglog.lastCleaningMap')) {
        await ctx.adapterProxy.createObjectNotExists(
            'cleaninglog.lastCleaningMapImageURL', 'Image URL of the last cleaning',
            'string', 'value', false, '', '');
    }

    //
    // map channel
    //
    if (ctx.getModel().isSupportedFeature('map')) {
        await ctx.adapterProxy.createChannelNotExists('map', 'Map');
        await ctx.adapterProxy.createObjectNotExists(
            'map.currentMapName', 'Name of current active map',
            'string', 'text', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.currentMapIndex', 'Index of current active map',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.currentMapMID', 'MID of current active map',
            'string', 'text', false, '', '');
    }

    if (ctx.getModel().isSupportedFeature('map.relocationState')) {
        await ctx.adapterProxy.createObjectNotExists(
            'map.relocationState', 'Relocation status',
            'string', 'text', false, '', '');
    }
    if (ctx.getModel().isSupportedFeature('map.deebotPosition')) {
        await ctx.adapterProxy.createObjectNotExists(
            'map.deebotPosition', 'Bot position (x, y, angle)',
            'string', 'text', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.deebotPosition_x', 'Bot position (x)',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.deebotPosition_y', 'Bot position (y)',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.deebotPosition_angle', 'Bot position (angle)',
            'number', 'value', false, 0, '');
        if (ctx.getModel().isSupportedFeature('map.chargePosition')) {
            await ctx.adapterProxy.createObjectNotExists(
                'map.deebotDistanceToChargePosition', 'Approximate distance between bot and charging station',
                'number', 'value', false, 0.0, 'm');
        }
    }
    if (ctx.getModel().isSupportedFeature('map.deebotPositionIsInvalid')) {
        await ctx.adapterProxy.createObjectNotExists(
            'map.deebotPositionIsInvalid', 'Bot position is invalid / unknown',
            'boolean', 'indicator.status', false, false, '');
    }
    if (ctx.getModel().isSupportedFeature('map.deebotPositionCurrentSpotAreaID') && ctx.adapter.canvasModuleIsInstalled) {
        await ctx.adapterProxy.createObjectNotExists(
            'map.deebotPositionCurrentSpotAreaID', 'ID of the SpotArea the bot is currently in',
            'string', 'text', false, 'unknown', '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.deebotPositionCurrentSpotAreaName', 'Name of the SpotArea the bot is currently in',
            'string', 'text', false, 'unknown', '');
    }
    if (ctx.getModel().isSupportedFeature('map.chargePosition')) {
        await ctx.adapterProxy.createObjectNotExists(
            'map.chargePosition', 'Charge position (x, y, angle)',
            'string', 'text', false, '', '');
    }
    if (ctx.getModel().isSupportedFeature('map.lastUsedAreaValues')) {
        await ctx.adapterProxy.createObjectNotExists(
            'map.currentUsedCustomAreaValues', 'Current used custom area values',
            'string', 'text', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.currentUsedSpotAreas', 'Current used spot areas',
            'string', 'text', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.lastUsedCustomAreaValues', 'Last used area values',
            'string', 'text', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.lastUsedCustomAreaValues_rerun', 'Rerun cleaning with the last area values used',
            'boolean', 'button', true, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.lastUsedCustomAreaValues_save', 'Save the last used custom area values',
            'boolean', 'button', true, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            'map.currentSpotAreaValues_save', 'Save the current spot area values',
            'boolean', 'button', true, false, '');
    } else {
        await ctx.adapterProxy.deleteObjectIfExists('map.currentUsedCustomAreaValues');
        await ctx.adapterProxy.deleteObjectIfExists('map.currentUsedSpotAreas');
        await ctx.adapterProxy.deleteObjectIfExists('map.lastUsedCustomAreaValues');
        await ctx.adapterProxy.deleteObjectIfExists('map.lastUsedCustomAreaValues_rerun');
        await ctx.adapterProxy.deleteObjectIfExists('map.lastUsedCustomAreaValues_save');
        await ctx.adapterProxy.deleteObjectIfExists('map.lastUsedSpotAreaValues_save');
    }

    //
    // Pre-create extended control and info objects based on device capabilities
    // so they appear in the object tree even before the first event arrives
    //

    // Cleaning station wash info
    if (ctx.getModel().hasCleaningStation()) {
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.washInfo', 'Wash mode of the cleaning station',
            'number', 'value', false, 0, '');
    }

    // Firmware info (available for all 950type devices)
    if (ctx.getModel().is950type()) {
        await ctx.adapterProxy.createObjectNotExists(
            'info.firmwareVersion', 'Firmware version',
            'string', 'text', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'info.chargemode', 'Charge mode',
            'string', 'value', false, '', '');
    }

    // Schedule
    if (ctx.getModel().is950type()) {
        await ctx.adapterProxy.createChannelNotExists('info.extended', 'Extended information');
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.currentSchedule', 'Scheduling information (read-only)',
            'json', 'json', false, '[]', '');
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.currentSchedule_refresh', 'Refresh scheduling information',
            'boolean', 'button', true, false, '');
    }

    // Mopping system related objects
    if (ctx.vacbot.hasMoppingSystem()) {
        await createControlWaterLevelIfNotExists(adapter, ctx);
        await createControlWaterLevelIfNotExists(adapter, ctx, 0, 'control.waterLevel_standard', 'Water level if no other value is set');
        await ctx.adapterProxy.createObjectNotExists(
            'info.waterbox_moppingType', 'Mopping type',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.moppingMode', 'Mopping mode',
            'string', 'value', false, '', '');
        await createControlSweepModeIfNotExists(adapter, ctx);
        if (ctx.vacbot.hasRoundMopInfo()) {
            await createControlScrubbingPatternIfNotExists(adapter, ctx);
            await ctx.adapterProxy.createObjectNotExists(
                'info.waterbox_scrubbingPattern', 'Scrubbing pattern',
                'string', 'value', false, '', '');
        }
    }

    // Clean speed (available for all vacuums with power adjustment)
    if (ctx.vacbot.hasVacuumPowerAdjustment()) {
        await createControlCleanSpeedIfNotExists(adapter, ctx);
        await createControlCleanSpeedIfNotExists(adapter, ctx, 0, 'control.cleanSpeed_standard', 'Clean speed if no other value is set');
    }

    // Extended control objects for supported features
    if (ctx.getModel().isSupportedFeature('control.autoBoostSuction')) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.autoBoostSuction', 'Auto boost suction',
            'boolean', 'value', true, false, '');
    }

    if (ctx.getModel().is950type_V2() && modelType !== 'goat') {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.cleanPreference', 'Clean preference',
            'boolean', 'value', true, false, '');
    }

    if (ctx.vacbot.getDeviceProperty('yiko')) {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.voiceAssistant', 'Indicates whether YIKO voice assistant is enabled',
            'boolean', 'value', true, false, '');
    }

    // T20/X2 specific objects
    if (ctx.getModel().isModelTypeT20() || ctx.getModel().isModelTypeX2()) {
        await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.cleaningMode', {
            'type': 'state',
            'common': {
                'name': 'Cleaning Mode',
                'type': 'number',
                'role': 'level',
                'read': true,
                'write': true,
                'min': 0,
                'max': 3,
                'def': 0,
                'unit': '',
                'states': {
                    0: 'vacuum and mop',
                    1: 'vacuum only',
                    2: 'mop only',
                    3: 'mop after vacuum'
                }
            },
            'native': {}
        });
        await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.carpetCleaningStrategy', {
            'type': 'state',
            'common': {
                'name': 'Carpet cleaning strategy',
                'type': 'number',
                'role': 'level',
                'read': true,
                'write': true,
                'min': 0,
                'max': 2,
                'def': 0,
                'unit': '',
                'states': {
                    0: 'auto',
                    1: 'bypass',
                    2: 'include'
                }
            },
            'native': {}
        });
    }

    // Edge deep cleaning and mop only mode (950type_V2 with mopping)
    if (ctx.getModel().is950type_V2() && ctx.vacbot.hasMoppingSystem() && modelType !== 'goat') {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.edgeDeepCleaning', 'Enable and disable edge deep cleaning',
            'boolean', 'value', true, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.mopOnlyMode', 'Enable and disable mop only mode',
            'boolean', 'value', true, false, '');
    }

    // Cleaning cloth reminder (950type with mopping but not V2, or with duster remind)
    if (ctx.getModel().is950type() && ctx.vacbot.hasMoppingSystem() && modelType !== 'goat') {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.cleaningClothReminder', 'Cleaning cloth reminder',
            'boolean', 'value', true, false, '');
        await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.cleaningClothReminder_period', {
            'type': 'state',
            'common': {
                'name': 'Cleaning cloth reminder period',
                'type': 'number',
                'role': 'value',
                'read': true,
                'write': true,
                'min': 15,
                'max': 60,
                'def': 30,
                'unit': 'min',
                'states': { 15: '15', 30: '30', 45: '45', 60: '60' }
            },
            'native': {}
        });
    }

    // OTA firmware update states
    if (ctx.getModel().hasOtaSupport()) {
        await ctx.adapterProxy.createChannelNotExists('info.ota', 'OTA firmware update');
        await ctx.adapterProxy.createObjectNotExists(
            'info.ota.status', 'OTA update status',
            'string', 'text', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'info.ota.progress', 'OTA update progress',
            'number', 'value', false, 0, '%');
        await ctx.adapterProxy.createObjectNotExists(
            'info.ota.version', 'Available firmware version',
            'string', 'text', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'info.ota.result', 'OTA update result',
            'string', 'text', false, '', '');
        await ctx.adapterProxy.createObjectNotExists(
            'info.ota.supportsAutoUpdate', 'Supports auto update',
            'boolean', 'indicator', false, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            'info.ota.isForced', 'Is forced update',
            'boolean', 'indicator', false, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            'control.ota.autoUpdate', 'Enable/disable auto updates',
            'boolean', 'switch', true, false, '');
    }

    // AI Clean Item State (T9-based models and newer)
    if (ctx.getModel().isModelTypeT9Based() && modelType !== 'goat') {
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.particleRemoval', 'Indicates whether the particle removal mode is enabled',
            'boolean', 'value', false, false, '');
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.petPoopAvoidance', 'Indicates whether the pet poop avoidance mode is enabled',
            'boolean', 'value', false, false, '');
    }

    // Child lock (available for T20/X2/X1)
    if ((ctx.getModel().isModelTypeT20() || ctx.getModel().isModelTypeX2() || ctx.getModel().isModelTypeX1()) && modelType !== 'goat') {
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.childLock', 'Enable/disable child lock',
            'boolean', 'switch', true, false, '');
    }

    // Wash mode control for cleaning station (to SET wash mode)
    if (ctx.getModel().hasCleaningStation()) {
        await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.washMode', {
            'type': 'state',
            'common': {
                'name': 'Wash mode of the cleaning station',
                'type': 'number',
                'role': 'level',
                'read': true,
                'write': true,
                'min': 0,
                'max': 2,
                'def': 0,
                'unit': '',
                'states': {
                    0: 'standard',
                    1: 'strong',
                    2: 'deep'
                }
            },
            'native': {}
        });
    }
}

async function changeObjName(adapter, ctx, objId, name) {
    const obj = await ctx.adapterProxy.getObjectAsync(objId);
    if (obj && obj.common) {
        obj.common.name = name;
        await ctx.adapterProxy.extendObjectAsync(objId, obj);
    }
}

async function createDeviceCapabilityObjects(adapter, ctx) {
    await ctx.adapterProxy.createChannelNotExists('info.deviceCapabilities', 'Device capabilities');

    const capabilities = ctx.getModel().getDeviceCapabilities();

    await ctx.adapterProxy.createObjectNotExists(
        'info.deviceCapabilities.type', 'Capability: type',
        'string', 'text', false, capabilities.type || '', '');
    await ctx.adapterProxy.setStateConditionalAsync('info.deviceCapabilities.type', capabilities.type || '', true);

    const booleanCapabilities = [
        'hasMapping',
        'hasWaterBox',
        'hasAirDrying',
        'hasAutoEmpty',
        'hasSpotAreas',
        'hasVirtualBoundaries',
        'hasContinuousCleaning',
        'hasDoNotDisturb',
        'hasVoiceAssistant',
        'hasCleaningStation',
        'hasFloorWashing'
    ];

    for (const cap of booleanCapabilities) {
        await ctx.adapterProxy.createObjectNotExists(
            'info.deviceCapabilities.' + cap, 'Capability: ' + cap,
            'boolean', 'indicator', false, Boolean(capabilities[cap]), '');
        await ctx.adapterProxy.setStateConditionalAsync('info.deviceCapabilities.' + cap, Boolean(capabilities[cap]), true);
    }
}
async function createStationObjects(adapter, ctx) {
    if (ctx.getModel().hasCleaningStation()) {
        await ctx.adapterProxy.createChannelNotExists('info.extended.cleaningStation', 'Information about the cleaning station');
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.cleaningStation.state', 'State of the cleaning station',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.cleaningStation.state', 0, true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.cleaningStation.name', 'Name of the cleaning station',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.cleaningStation.name', '', true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.cleaningStation.model', 'Model of the cleaning station',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.cleaningStation.model', '', true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.cleaningStation.serialNumber', 'Serial number of the cleaning station',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.cleaningStation.serialNumber', '', true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.cleaningStation.firmwareVersion', 'Firmware version of the cleaning station',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.cleaningStation.firmwareVersion', '', true);

        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.airDrying', 'Start and stop air-drying mopping pads',
            'boolean', 'button', true, false, '');
        await ctx.adapterProxy.setStateConditionalAsync('control.extended.airDrying', false, true);
        await ctx.adapterProxy.createObjectNotExists(
            'control.extended.selfCleaning', 'Start and stop cleaning mopping pads',
            'boolean', 'button', true, false, '');
        await ctx.adapterProxy.setStateConditionalAsync('control.extended.selfCleaning', false, true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.selfCleaningActive', 'Indicates whether the self-cleaning process is active',
            'boolean', 'value', false, false, '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.selfCleaningActive', false, true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.cleaningStationActive', 'Indicates whether the self cleaning process is active',
            'boolean', 'value', false, false, '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.cleaningStationActive', false, true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingState', 'Air drying state',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingState', '', true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.washInterval', 'Wash interval',
            'number', 'value', false, 0, 'min');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.washInterval', 0, true);

        await createControlWashIntervalIfNotExists(adapter, ctx);

        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingActive', 'Indicates whether the air drying process is active',
            'boolean', 'value', false, false, '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingActive', false, true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingActiveTime', 'Active time (duration) of the air drying process',
            'number', 'value', false, 0, 'min');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingActiveTime', 0, true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingRemainingTime', 'Remaining time (duration) of the air drying process',
            'number', 'value', false, 0, 'min');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingRemainingTime', 0, true);

        let airDryingStates = {
            120: '120',
            180: '180',
            240: '240'
        };
        let airDryingDef = 120;
        if (ctx.getModel().isModelTypeX1()) {
            airDryingStates = {
                150: '150',
                210: '210'
            };
            airDryingDef = 150;
        }
        await ctx.adapterProxy.setObjectNotExistsAsync('control.extended.airDryingDuration', {
            'type': 'state',
            'common': {
                'name': 'Duration of the air drying process in minutes',
                'type': 'number',
                'role': 'level',
                'read': true,
                'write': true,
                'min': 120,
                'max': 240,
                'def': airDryingDef,
                'unit': 'min',
                'states': airDryingStates
            },
            'native': {}
        });
        await ctx.adapterProxy.setStateConditionalAsync('control.extended.airDryingDuration', airDryingDef, true);

        await ctx.adapterProxy.createChannelNotExists('info.extended.airDryingDateTime', 'Air drying process related timestamps');
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingDateTime.startTimestamp', 'Start timestamp of the air drying process',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingDateTime.startTimestamp', 0, true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingDateTime.endTimestamp', 'End timestamp of the air drying process',
            'number', 'value', false, 0, '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingDateTime.endTimestamp', 0, true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingDateTime.startDateTime', 'Start date and time of the air drying process',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingDateTime.startDateTime', '', true);
        await ctx.adapterProxy.createObjectNotExists(
            'info.extended.airDryingDateTime.endDateTime', 'End date and time of the air drying process',
            'string', 'value', false, '', '');
        await ctx.adapterProxy.setStateConditionalAsync('info.extended.airDryingDateTime.endDateTime', '', true);
    } else {
        await ctx.adapterProxy.deleteChannelIfExists('info.extended.cleaningStation');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.cleaningStation.state');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.cleaningStation.name');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.cleaningStation.model');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.cleaningStation.serialNumber');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.cleaningStation.firmwareVersion');
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.airDrying');
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.selfCleaning');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.selfCleaningActive');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.cleaningStationActive');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.airDryingState');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.washInterval');
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.washInterval');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.airDryingActive');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.airDryingActiveTime');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.airDryingRemainingTime');
        await ctx.adapterProxy.deleteObjectIfExists('control.extended.airDryingDuration');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.airDryingDateTime.startTimestamp');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.airDryingDateTime.endTimestamp');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.airDryingDateTime.startDateTime');
        await ctx.adapterProxy.deleteObjectIfExists('info.extended.airDryingDateTime.endDateTime');
        await ctx.adapterProxy.deleteChannelIfExists('info.extended.airDryingDateTime');
    }
}

module.exports = {
    changeObjName,
    createInitialObjects,
    createInitialInfoObjects,
    createAdditionalObjects,
    createControlCleanSpeedIfNotExists,
    createControlScrubbingPatternIfNotExists,
    createControlSweepModeIfNotExists,
    createControlWaterLevelIfNotExists,
    createControlWashIntervalIfNotExists,
    createDeviceCapabilityObjects,
    createStationObjects
};
