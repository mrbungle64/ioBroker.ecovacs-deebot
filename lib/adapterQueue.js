'use strict';

class Queue {
    constructor(adapter) {
        this.adapter = adapter;
        this.entries = [];
    }

    createQueueForId(channelName, stateName, val) {
        this.resetQueue();
        let arg = null;
        let numberOfRuns = 1;
        if ((channelName === 'control') && (stateName === 'spotArea')) {
            numberOfRuns = this.adapter.spotAreaCleanings;
            this.adapter.log.info('[cleaningQueue] Number of spotArea cleanings: ' + numberOfRuns);
            arg = 'start';
        }
        // We start at 2 because first run already executed
        for (let c = 2; c <= numberOfRuns; c++) {
            this.addCmdToQueueObject(stateName, val, arg);
        }
    }

    addCmdToQueueObject(cmd, val = null, arg = null) {
        this.entries.push({
            cmd: cmd,
            value: val,
            arg: arg
        });
        this.adapter.log.info('[cleaningQueue] Added ' + cmd + ' to the queue (' + this.entries.length + ')');
    }

    startNextItemFromQueue() {
        const queued = this.entries[0];
        if (queued) {
            this.entries.shift();
            if ((queued.arg) && (queued.value)) {
                this.adapter.vacbot.run(queued.cmd, queued.arg, queued.value);
            } else if (queued.value) {
                this.adapter.vacbot.run(queued.cmd, queued.value);
            } else {
                this.adapter.vacbot.run(queued.cmd);
            }
            this.adapter.log.info('[cleaningQueue] Starting ' + queued.cmd + ' via queue');
            this.adapter.log.info('[cleaningQueue] Removed ' + queued.cmd + ' from queue (' + this.entries.length + ' runs left)');
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
