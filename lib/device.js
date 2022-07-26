'use strict';

const helper = require('./adapterHelper');

class Device {
    constructor(adapter) {
        this.adapter = adapter;
        this.status = null;
        this.batteryLevel = null;
    }

    /**
     * Set the status of the vacuum cleaner
     * @param {string} status
     */
    setStatus(status) {
        this.status = status;
    }

    /**
     * Set the battery level
     * and handle the strange behavior of the Deebot 900/901 (class 'ls1ok3')
     * @param {number} batteryLevel
     */
    setBattery(batteryLevel) {
        if ((this.adapter.getModel().getClass() === 'ls1ok3') && this.batteryLevel) {
            if (this.isCharging() && (batteryLevel > this.batteryLevel)) {
                this.batteryLevel = batteryLevel;
            } else if (this.isNotCharging() && (batteryLevel < this.batteryLevel)) {
                this.batteryLevel = batteryLevel;
            } else {
                this.adapter.log.debug('Ignoring battery level value: ' + batteryLevel + ' (current value: ' + this.batteryLevel + ')');
            }
        } else {
            this.batteryLevel = batteryLevel;
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
     * Returns whether the robot is currently not performing a cleaning operation
     * @returns {Boolean} A boolean value
     */
    isNotCleaning() {
        return this.isCleaning() === false;
    }

    /**
     * Returns whether the robot is currently returning to the charging dock
     * @returns {Boolean} whether the status is equal to 'returning'
     */
    isReturning() {
        return this.status === 'returning';
    }

    /**
     * Returns whether the robot is currently not returning to the dock
     * @returns {Boolean} A boolean value
     */
    isNotReturning() {
        return this.isReturning() === false;
    }

    /**
     * Returns whether the robot is currently charging or docked to the charging station
     * @returns {Boolean} whether the status is equal to 'charging'
     */
    isCharging() {
        return this.status === 'charging';
    }

    /**
     * Returns whether the robot is currently not charging
     * @returns {Boolean} whether the status is not equal to 'charging'
     */
    isNotCharging() {
        return this.isCharging() === false;
    }

    /**
     * Returns whether the robot is currently paused
     * @returns {Boolean} whether the status is equal to 'paused'
     */
    isPaused() {
        return this.status === 'paused';
    }

    /**
     * Returns whether the robot is currently not paused
     * @returns {Boolean} whether the status is not equal to 'paused'
     */
    isNotPaused() {
        return this.isPaused() === false;
    }

    /**
     * Returns whether the robot is currently stopped
     * @returns {Boolean} whether the status is equal to 'stopped'
     */
    isStopped() {
        return this.status === 'stopped';
    }

    /**
     * Returns whether the robot is currently not paused
     * @returns {Boolean} whether the status is not equal to 'paused'
     */
    isNotStopped() {
        return this.isStopped() === false;
    }

    /**
     * Returns whether the robot is not paused or stopped
     * @returns {Boolean} A boolean value
     */
    isNotPausedOrStopped() {
        return (this.isPaused() === false) && (this.isStopped() === false);
    }

    useV2commands() {
        const configValue = this.adapter.getConfigValue('feature.control.v2commands');
        if (configValue === '') {
            return this.adapter.getModel().is950type_V2();
        }
        return !!Number(configValue);
    }

    useNativeGoToPosition() {
        const configValue = this.adapter.getConfigValue('feature.control.nativeGoToPosition');
        if (configValue === '') {
            return this.useV2commands();
        }
        return !!Number(configValue);
    }
}

module.exports = Device;
