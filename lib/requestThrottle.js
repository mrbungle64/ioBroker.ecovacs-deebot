'use strict';

/**
 * RequestThrottle - Rate limiter using a sliding window approach.
 * Limits the number of API requests that can be sent within a given time window.
 *
 * Default: max 10 requests per 30 seconds.
 */
class RequestThrottle {
    /**
     * @param {object} [options]
     * @param {number} [options.maxRequests=10] - Maximum number of requests allowed in the window
     * @param {number} [options.windowMs=30000] - Time window in milliseconds
     * @param {object} [options.log] - Logger instance (must have debug/silly methods)
     */
    constructor(options = {}) {
        this.maxRequests = options.maxRequests || 10;
        this.windowMs = options.windowMs || 30000;
        this.log = options.log || null;
        /** @type {number[]} */
        this.timestamps = [];
    }

    /**
     * Remove expired timestamps from the sliding window.
     * @private
     */
    _cleanup() {
        const now = Date.now();
        const cutoff = now - this.windowMs;
        while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
            this.timestamps.shift();
        }
    }

    /**
     * Check whether a request can proceed immediately.
     * @returns {boolean}
     */
    canProceed() {
        this._cleanup();
        return this.timestamps.length < this.maxRequests;
    }

    /**
     * Record a request being sent (adds the current timestamp).
     */
    record() {
        this._cleanup();
        this.timestamps.push(Date.now());
    }

    /**
     * Get the delay in ms needed before the next request can proceed.
     * Returns 0 if a request can proceed immediately.
     * @returns {number} Delay in milliseconds
     */
    getDelay() {
        this._cleanup();
        if (this.timestamps.length < this.maxRequests) {
            return 0;
        }
        // The oldest request in the window determines when the next slot opens
        const oldestInWindow = this.timestamps[0];
        const nextSlotTime = oldestInWindow + this.windowMs;
        const delay = Math.max(0, nextSlotTime - Date.now());
        if (this.log) {
            this.log.debug(`[throttle] Rate limit reached (${this.timestamps.length}/${this.maxRequests} in ${this.windowMs}ms). Delay: ${delay}ms`);
        }
        return delay;
    }

    /**
     * Get current usage information for diagnostics.
     * @returns {{current: number, max: number, windowMs: number}}
     */
    getStatus() {
        this._cleanup();
        return {
            current: this.timestamps.length,
            max: this.maxRequests,
            windowMs: this.windowMs
        };
    }
}

module.exports = RequestThrottle;
