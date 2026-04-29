'use strict';

const { expect } = require('chai');
const RequestThrottle = require('../lib/requestThrottle');

describe('RequestThrottle', function() {
    describe('Constructor', function() {
        it('should initialize with default values', function() {
            const throttle = new RequestThrottle();
            expect(throttle.maxRequests).to.equal(10);
            expect(throttle.windowMs).to.equal(30000);
            expect(throttle.timestamps).to.be.an('array').that.is.empty;
        });

        it('should accept custom options', function() {
            const throttle = new RequestThrottle({ maxRequests: 5, windowMs: 10000 });
            expect(throttle.maxRequests).to.equal(5);
            expect(throttle.windowMs).to.equal(10000);
        });
    });

    describe('canProceed()', function() {
        it('should return true when no requests have been made', function() {
            const throttle = new RequestThrottle({ maxRequests: 3, windowMs: 1000 });
            expect(throttle.canProceed()).to.be.true;
        });

        it('should return true when under the limit', function() {
            const throttle = new RequestThrottle({ maxRequests: 3, windowMs: 1000 });
            throttle.record();
            throttle.record();
            expect(throttle.canProceed()).to.be.true;
        });

        it('should return false when at the limit', function() {
            const throttle = new RequestThrottle({ maxRequests: 3, windowMs: 60000 });
            throttle.record();
            throttle.record();
            throttle.record();
            expect(throttle.canProceed()).to.be.false;
        });
    });

    describe('getDelay()', function() {
        it('should return 0 when under the limit', function() {
            const throttle = new RequestThrottle({ maxRequests: 3, windowMs: 1000 });
            throttle.record();
            expect(throttle.getDelay()).to.equal(0);
        });

        it('should return positive delay when at the limit', function() {
            const throttle = new RequestThrottle({ maxRequests: 3, windowMs: 60000 });
            throttle.record();
            throttle.record();
            throttle.record();
            const delay = throttle.getDelay();
            expect(delay).to.be.greaterThan(0);
            expect(delay).to.be.at.most(60000);
        });

        it('should return 0 after window expires', function(done) {
            const throttle = new RequestThrottle({ maxRequests: 2, windowMs: 50 });
            throttle.record();
            throttle.record();
            expect(throttle.canProceed()).to.be.false;
            setTimeout(() => {
                expect(throttle.getDelay()).to.equal(0);
                expect(throttle.canProceed()).to.be.true;
                done();
            }, 60);
        });
    });

    describe('record()', function() {
        it('should add timestamp', function() {
            const throttle = new RequestThrottle({ maxRequests: 5, windowMs: 1000 });
            throttle.record();
            expect(throttle.timestamps).to.have.lengthOf(1);
            throttle.record();
            expect(throttle.timestamps).to.have.lengthOf(2);
        });
    });

    describe('getStatus()', function() {
        it('should return current usage stats', function() {
            const throttle = new RequestThrottle({ maxRequests: 10, windowMs: 30000 });
            throttle.record();
            throttle.record();
            throttle.record();
            const status = throttle.getStatus();
            expect(status.current).to.equal(3);
            expect(status.max).to.equal(10);
            expect(status.windowMs).to.equal(30000);
        });
    });

    describe('Sliding window cleanup', function() {
        it('should remove expired timestamps', function(done) {
            const throttle = new RequestThrottle({ maxRequests: 2, windowMs: 50 });
            throttle.record();
            throttle.record();
            expect(throttle.timestamps).to.have.lengthOf(2);
            setTimeout(() => {
                throttle._cleanup();
                expect(throttle.timestamps).to.have.lengthOf(0);
                done();
            }, 60);
        });
    });

    describe('Logging', function() {
        it('should call log.debug when rate limit is reached and log is provided', function() {
            let logCalled = false;
            const mockLog = {
                debug: () => { logCalled = true; }
            };
            const throttle = new RequestThrottle({ maxRequests: 1, windowMs: 60000, log: mockLog });
            throttle.record();
            throttle.getDelay();
            expect(logCalled).to.be.true;
        });

        it('should not fail when no log is provided', function() {
            const throttle = new RequestThrottle({ maxRequests: 1, windowMs: 60000 });
            throttle.record();
            expect(() => throttle.getDelay()).to.not.throw();
        });
    });
});
