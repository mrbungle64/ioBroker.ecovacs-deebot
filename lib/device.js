'use strict';

const helper = require('./adapterHelper');

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

    /**
     * Returns whether the robot is currently performing a cleaning operation
     * @returns {Boolean} whether the status is equal to 'cleaning'
     */
    isCleaning() {
        return this.status === 'cleaning';
    }

    /**
     * Returns whether the robot is currently returning to the charging dock
     * @returns {Boolean} whether the status is equal to 'returning'
     */
    isReturning() {
        return this.status === 'returning';
    }

    /**
     * Returns whether the robot is currently charging or docked to the charging station
     * @returns {Boolean} whether the status is equal to 'charging'
     */
    isCharging() {
        return this.status === 'charging';
    }

    /**
     * Returns whether the robot is currently paused
     * @returns {Boolean} whether the status is equal to 'paused'
     */
    isPaused() {
        return this.status === 'paused';
    }

    /**
     * Returns whether the robot is currently not charging
     * @returns {Boolean} whether the status is not equal to 'charging'
     */
    isNotCharging() {
        return this.isCharging() === false;
    }

    /**
     * Returns whether the robot is currently not paused
     * @returns {Boolean} whether the status is not equal to 'paused'
     */
    isNotPaused() {
        return this.isPaused() === false;
    }
}

module.exports = Device;
