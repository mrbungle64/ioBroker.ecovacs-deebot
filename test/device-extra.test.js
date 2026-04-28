'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockCtx } = require('./mockHelper');

const mockHelper = {
    getDeviceStatusByStatus: sinon.stub()
};

const Device = proxyquire('../lib/device', {
    './adapterHelper': mockHelper
});

describe('device.js - extra status helpers', () => {
    let device;
    let ctx;

    beforeEach(() => {
        ctx = createMockCtx();
        device = new Device(ctx);
    });

    describe('isPaused', () => {
        it('should return true when status is paused', () => {
            device.status = 'paused';
            expect(device.isPaused()).to.be.true;
        });

        it('should return false when status is not paused', () => {
            device.status = 'cleaning';
            expect(device.isPaused()).to.be.false;
        });

        it('should return false when status is null', () => {
            device.status = null;
            expect(device.isPaused()).to.be.false;
        });
    });

    describe('isNotPaused', () => {
        it('should return false when status is paused', () => {
            device.status = 'paused';
            expect(device.isNotPaused()).to.be.false;
        });

        it('should return true when status is not paused', () => {
            device.status = 'charging';
            expect(device.isNotPaused()).to.be.true;
        });
    });

    describe('isStopped', () => {
        it('should return true when status is stopped', () => {
            device.status = 'stopped';
            expect(device.isStopped()).to.be.true;
        });

        it('should return false when status is not stopped', () => {
            device.status = 'cleaning';
            expect(device.isStopped()).to.be.false;
        });
    });

    describe('isNotStopped', () => {
        it('should return false when status is stopped', () => {
            device.status = 'stopped';
            expect(device.isNotStopped()).to.be.false;
        });

        it('should return true when status is not stopped', () => {
            device.status = 'charging';
            expect(device.isNotStopped()).to.be.true;
        });
    });

    describe('isNotPausedOrStopped', () => {
        it('should return false when status is paused', () => {
            device.status = 'paused';
            expect(device.isNotPausedOrStopped()).to.be.false;
        });

        it('should return false when status is stopped', () => {
            device.status = 'stopped';
            expect(device.isNotPausedOrStopped()).to.be.false;
        });

        it('should return true when status is neither paused nor stopped', () => {
            device.status = 'cleaning';
            expect(device.isNotPausedOrStopped()).to.be.true;
        });

        it('should return true when status is charging', () => {
            device.status = 'charging';
            expect(device.isNotPausedOrStopped()).to.be.true;
        });
    });
});
