/* eslint-disable quotes */

const helper = require("./adapterHelper");

class Device {
    constructor(adapter) {
        this.adapter = adapter;
        this.status = null;
        this.battery = null;
    }

    setStatus(status) {
        this.status = status;
    }

    setBattery(newValue) {
        if ((this.adapter.config['workaround.batteryValue'] === true) && this.battery) {
            if (this.isCharging() && (newValue > this.battery)) {
                this.battery = newValue;
            } else if (this.isNotCharging() && (newValue < this.battery)) {
                this.battery = newValue;
            } else {
                this.adapter.log.debug('Ignoring battery value: ' + newValue + ' (current value: ' + this.battery + ')');
            }
        } else {
            this.battery = newValue;
        }
    }

    setStatusByTrigger(trigger) {
        if ((trigger === 'chargestatus') && (this.adapter.chargestatus !== 'idle')) {
            this.setStatus(helper.getDeviceStatusByStatus(this.adapter.chargestatus));
        } else if (trigger === 'cleanstatus') {
            if (((this.adapter.cleanstatus === 'stop') || (this.adapter.cleanstatus === 'idle')) && (this.adapter.chargestatus === 'charging')) {
                this.setStatus(helper.getDeviceStatusByStatus(this.adapter.chargestatus));
            } else {
                this.setStatus(helper.getDeviceStatusByStatus(this.adapter.cleanstatus));
            }
        }
    }

    isCleaning() {
        return this.status === 'cleaning';
    }

    isReturning() {
        return this.status === 'returning';
    }

    isCharging() {
        return this.status === 'charging';
    }

    isPaused() {
        return this.status === 'paused';
    }

    isNotCharging() {
        return this.isCharging() === false;
    }

    isNotPaused() {
        return this.isPaused() === false;
    }
}

module.exports = Device;
