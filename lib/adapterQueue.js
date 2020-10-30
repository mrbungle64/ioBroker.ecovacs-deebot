'use strict';

class Queue {
    constructor(adapter, name = 'queue', timeoutValue = 100) {
        this.adapter = adapter;
        this.name = name;
        this.timeoutValue = timeoutValue;
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
            this.add(stateName, val, 'start');
        }
    }

    add(cmd, arg1 = null, arg2 = null) {
        this.entries.push({
            cmd: cmd,
            arg1: arg1,
            arg2: arg2
        });
        this.adapter.log.debug('[' + this.name + '] Added ' + cmd + ' to the queue (' + this.entries.length + ')');
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
