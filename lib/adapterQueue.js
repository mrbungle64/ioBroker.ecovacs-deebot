'use strict';

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

    add(cmd, arg1 = null, arg2 = null) {
        if (this.duplicateCheck) {
            for (let i = 0; i < this.entries.length; i++) {
                const entryObject = this.entries[i];
                if ((entryObject['cmd'] === cmd) && (entryObject['arg1'] === arg1) && (entryObject['arg2'] === arg2)) {
                    this.adapter.log.debug('[' + this.name + '] Skipping ' + cmd);
                    return;
                }
            }
        }
        this.entries.push({
            cmd: cmd,
            arg1: arg1,
            arg2: arg2
        });
        this.adapter.log.debug('[' + this.name + '] Added ' + cmd + ' to the queue (' + this.entries.length + ')');
    }

    addGetLifespan() {
        if (this.adapter.vacbot.hasMainBrush()) {
            this.add('GetLifeSpan', 'main_brush');
        }
        this.add('GetLifeSpan', 'side_brush');
        this.add('GetLifeSpan', 'filter');
    }

    runAll() {
        this.startNextItemFromQueue(true);
    }

    startNextItemFromQueue(runAll = false) {
        const queued = this.entries[0];
        if (queued) {
            this.entries.shift();
            if ((queued.arg1) && (queued.arg2)) {
                this.adapter.vacbot.run(queued.cmd, queued.arg1, queued.arg2);
            } else if (queued.arg1) {
                this.adapter.vacbot.run(queued.cmd, queued.arg1);
            } else {
                this.adapter.vacbot.run(queued.cmd);
            }
            this.adapter.log.debug('[' + this.name + '] Starting ' + queued.cmd + ' via queue');
            this.adapter.log.debug('[' + this.name + '] Removed ' + queued.cmd + ' from ' + this.name + ' (' + this.entries.length + ' left)');
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

    resetQueue() {
        this.entries.splice(0, this.entries.length);
        this.entries = [];
    }
}

module.exports = Queue;
