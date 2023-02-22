'use strict';

const adapterCommands = require('./adapterCommands');

class Queue {
    constructor(adapter, name = 'queue', timeoutValue = 250, duplicateCheck = true) {
        this.adapter = adapter;
        this.name = name;
        this.timeoutValue = timeoutValue;
        this.duplicateCheck = duplicateCheck;
        this.entries = [];
    }

    createForId(channelName, stateName, val) {
        this.resetQueue();
        let quantity = 1;
        if ((channelName === 'control') && (stateName === 'spotArea')) {
            quantity = this.adapter.spotAreaCleanings;
            this.adapter.log.info('[cleaningQueue] Number of spotArea cleanings: ' + quantity);
        }
        // We start at 2 because first run already executed
        for (let c = 2; c <= quantity; c++) {
            this.add(stateName, 'start', val);
        }
    }

    add(cmd, arg1 = '', arg2 = '', arg3 = '') {
        if (this.duplicateCheck) {
            for (let i = 0; i < this.entries.length; i++) {
                const entryObject = this.entries[i];
                if ((entryObject['cmd'] === cmd) && (entryObject['arg1'] === arg1) && (entryObject['arg2'] === arg2) && (entryObject['arg3'] === arg3)) {
                    this.adapter.log.silly('[' + this.name + '] Skipping ' + cmd);
                    return;
                }
            }
        }
        this.entries.push({
            cmd: cmd,
            arg1: arg1,
            arg2: arg2,
            arg3: arg3
        });
        this.adapter.log.silly('[' + this.name + '] Added ' + cmd + ' to the queue (' + this.entries.length + ')');
    }

    addInitialGetCommands() {
        this.add(adapterCommands.handleV2commands(this.adapter, 'GetCleanState'));
        this.add('GetChargeState');
        this.add('GetBatteryState');
        if (this.adapter.getModel().isMappingSupported()) {
            this.add('GetPosition');
            if (this.adapter.getModel().isNot950type()) {
                this.add('GetChargerPos');
            }
        }
        this.add(adapterCommands.handleV2commands(this.adapter, 'GetSchedule'));
        if (this.adapter.getModel().isSupportedFeature('info.network.ip')) {
            this.add('GetNetInfo');
        }
        if (this.adapter.getModel().is950type_V2()) {
            this.add('GetCleanPreference');
        }
        if (this.adapter.getModel().isMappingSupported()) {
            this.add('GetMaps');
        }
        if (this.adapter.getModel().hasAirDrying()) {
            if (this.adapter.getModel().getModelType() === 'yeedi') {
                this.add('GetAirDrying');
            } else {
                this.add('GetStationState');
            }
        }
        if (this.adapter.getModel().getModelType() === 'X1') {
            this.add('GetWashInterval');
        }
        this.addGetLifespan();
        this.adapter.cleaningLogAcknowledged = false;
        this.addGetCleanLogs();
    }

    addStandardGetCommands() {
        this.add('GetSleepStatus');
        if (this.adapter.vacbot.hasMoppingSystem()) {
            this.add('GetWaterBoxInfo');
            if (this.adapter.getModel().is950type() &&
                this.adapter.getModel().isNot950type_V2()) {
                this.add('GetDusterRemind');
            } else {
                this.add('GetWaterLevel');
            }
        }
        if (this.adapter.getModel().isNot950type_V2()) {
            if (this.adapter.getModel().isSupportedFeature('control.doNotDisturb')) {
                this.add('GetDoNotDisturb');
            }
            if (this.adapter.getModel().isSupportedFeature('control.continuousCleaning')) {
                this.add('GetContinuousCleaning');
            }
        }
        if (this.adapter.getModel().isSupportedFeature('control.autoBoostSuction')) {
            this.add('GetCarpetPressure');
        }
        if (this.adapter.getModel().isSupportedFeature('cleaninglog.channel')) {
            this.add('GetCleanSum');
        }
        if (this.adapter.vacbot.hasVacuumPowerAdjustment()) {
            this.add('GetCleanSpeed');
        }
        if (this.adapter.getModel().isSupportedFeature('control.volume')) {
            this.add('GetVolume');
        }
        if (this.adapter.getModel().isSupportedFeature('control.cleanCount')) {
            this.add('GetCleanCount');
        }
        if (this.adapter.getModel().isSupportedFeature('technology.trueDetect')) {
            this.add('GetTrueDetect');
        }
        if (this.adapter.getModel().isSupportedFeature('control.autoEmptyStation')) {
            this.add('GetAutoEmpty');
        }
        if (this.adapter.getModel().is950type() &&
            this.adapter.getModel().isMappingSupported() &&
            this.adapter.getModel().getModelType() !== 'X1') {
            this.add('GetAdvancedMode');
        }
        if (this.adapter.getModel().vacbot.getDeviceProperty('yiko')) {
            this.add('GetVoiceAssistantState');
        }
    }

    addAdditionalGetCommands() {
        // update position for currentSpotArea if supported and still unknown (after connect maps are not ready)
        if (this.adapter.getModel().isMappingSupported()
            && this.adapter.getModel().isSupportedFeature('map.deebotPositionCurrentSpotAreaID')
            && (this.adapter.currentSpotAreaID === 'unknown')) {

            this.add('GetPosition');
        }
        if (this.adapter.getModel().isSupportedFeature('info.network.wifiSignal')
            && this.adapter.getDevice().isCleaning()) {
            this.add('GetNetInfo');
        }
        if (!this.adapter.cleaningLogAcknowledged) {
            this.addGetCleanLogs();
        }
    }

    addGetCleanLogs() {
        if (this.adapter.getModel().isSupportedFeature('cleaninglog.channel')) {
            this.add('GetCleanSum');
            this.add('GetCleanLogs');
        }
    }

    addGetLifespan() {
        if (this.adapter.vacbot.hasMainBrush()) {
            this.add('GetLifeSpan', 'main_brush');
        }
        this.add('GetLifeSpan', 'side_brush');
        this.add('GetLifeSpan', 'filter');
        if (this.adapter.vacbot.hasUnitCareInfo()) {
            this.add('GetLifeSpan', 'unit_care');
        }
        if (this.adapter.vacbot.hasRoundMopInfo()) {
            this.add('GetLifeSpan', 'round_mop');
        }
        if (this.adapter.getModel().isSupportedFeature('consumable.airFreshener')) {
            this.add('GetLifeSpan', 'dModule');
        }
    }

    run(cmd, arg1 = '', arg2 = '', arg3 = '') {
        this.add(cmd, arg1, arg2, arg3);
        this.runAll();
    }

    runAll() {
        this.startNextItemFromQueue(true);
    }

    startNextItemFromQueue(runAll = false) {
        const queued = this.entries[0];
        if (queued) {
            this.entries.shift();
            if (queued.cmd === 'GetMaps' && this.adapter.silentApproach.mapSpotAreaID) {
                this.adapter.log.info('[' + this.name + '] startNextItemFromQueue: skipping ' + queued.cmd + ' because silent approach active');
            } else if ((queued.arg1 !== '') && (queued.arg2 !== '') && (queued.arg3 !== '')) {
                this.adapter.vacbot.run(queued.cmd, queued.arg1, queued.arg2, queued.arg3);
                this.adapter.log.debug('[' + this.name + '] startNextItemFromQueue: ' + queued.cmd + ', ' + queued.arg1 + ', ' + queued.arg2 + ', ' + queued.arg3);
            } else if ((queued.arg1 !== '') && (queued.arg2 !== '')) {
                this.adapter.vacbot.run(queued.cmd, queued.arg1, queued.arg2);
                this.adapter.log.debug('[' + this.name + '] startNextItemFromQueue: ' + queued.cmd + ', ' + queued.arg1 + ', ' + queued.arg2);
            } else if (queued.arg1 !== '') {
                this.adapter.vacbot.run(queued.cmd, queued.arg1);
                this.adapter.log.debug('[' + this.name + '] startNextItemFromQueue: ' + queued.cmd + ', ' + queued.arg1);
            } else {
                this.adapter.vacbot.run(queued.cmd);
                this.adapter.log.debug('[' + this.name + '] startNextItemFromQueue: ' + queued.cmd);
            }
            this.adapter.log.silly('[' + this.name + '] startNextItemFromQueue: Removed ' + queued.cmd + ' from ' + this.name + ' (' + this.entries.length + ' left)');
        }
        if (runAll && !this.isEmpty()) {
            setTimeout(() => {
                this.startNextItemFromQueue(true);
            }, this.timeoutValue);
        }
    }

    isEmpty() {
        return (this.entries.length === 0);
    }

    notEmpty() {
        return (!this.isEmpty());
    }

    resetQueue() {
        this.entries.splice(0, this.entries.length);
        this.entries = [];
    }
}

module.exports = Queue;
