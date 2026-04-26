'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockAdapter, createMockCtx, createMockDevice } = require('./mockHelper');

// Mock dependencies injected via proxyquire
const mockAdapterHelper = {
    getStateNameById: sinon.stub(),
    getChannelNameById: sinon.stub(),
    getSubChannelNameById: sinon.stub(),
    getUnixTimestamp: sinon.stub().returns(1234567890),
    isValidChargeStatus: sinon.stub(),
    isValidCleanStatus: sinon.stub(),
    getDeviceStatusByStatus: sinon.stub(),
    isSingleSpotAreaValue: sinon.stub().returns(false),
    areaValueStringWithCleaningsIsValid: sinon.stub().returns(false),
    areaValueStringIsValid: sinon.stub().returns(false),
    positionValueStringIsValid: sinon.stub().returns(false)
};

const mockMapHelper = {
    getAreaValue: sinon.stub(),
    getSpotAreaName: sinon.stub(),
    getPositionValuesForExtendedArea: sinon.stub(),
    saveLastUsedCustomAreaValues: sinon.stub().resolves(),
    saveCurrentSpotAreaValues: sinon.stub().resolves(),
    saveGoToPositionValues: sinon.stub().resolves(),
    saveVirtualBoundary: sinon.stub().resolves(),
    saveVirtualBoundarySet: sinon.stub().resolves(),
    deleteVirtualBoundary: sinon.stub().resolves(),
    createVirtualBoundary: sinon.stub().resolves(),
    createVirtualBoundarySet: sinon.stub().resolves(),
    isSpotAreasChannel: sinon.stub().returns(false)
};

// Load the module with mocked dependencies
const adapterCommands = proxyquire('../lib/adapterCommands', {
    './adapterHelper': mockAdapterHelper,
    './mapHelper': mockMapHelper
});

/**
 * Helper to configure the mock helper stubs for a given subPath.
 * subPath is e.g. 'control.clean_home', 'control.playSound', 'control.stop'
 */
function configureMockHelperForSubPath(subPath) {
    const parts = subPath.split('.');
    const stateName = parts[parts.length - 1];
    // channelName is at index 0 of subPath (equivalent to index 2 of full id)
    const channelName = parts[0] || undefined;
    // subChannelName is at second-to-last position
    const subChannelName = parts.length >= 2 ? parts[parts.length - 2] : undefined;

    mockAdapterHelper.getStateNameById.returns(stateName);
    mockAdapterHelper.getChannelNameById.returns(channelName);
    mockAdapterHelper.getSubChannelNameById.returns(subChannelName);
}

describe('adapterCommands.js', () => {
    let adapter;
    let ctx;

    beforeEach(() => {
        adapter = createMockAdapter({
            clearGoToPosition: sinon.stub(),
            setStateAsync: sinon.stub().resolves(),
            setHistoryValuesForDustboxRemoval: sinon.stub()
        });
        ctx = createMockCtx({ adapter: adapter, connected: true });

        // Reset proxyquire module mock histories
        Object.values(mockAdapterHelper).forEach(stub => {
            if (stub.resetHistory) stub.resetHistory();
        });
        Object.values(mockMapHelper).forEach(stub => {
            if (stub.resetHistory) stub.resetHistory();
        });
    });

    describe('Module Structure', () => {
        it('should export the expected functions', () => {
            expect(adapterCommands).to.be.an('object');
            expect(adapterCommands).to.have.property('handleStateChange');
            expect(adapterCommands).to.have.property('cleanSpotArea');
            expect(adapterCommands).to.have.property('runSetCleanSpeed');
            expect(adapterCommands).to.have.property('handleV2commands');
            expect(adapterCommands).to.have.property('startSpotAreaCleaning');
        });
    });

    describe('handleStateChange', () => {
        it('should handle clean_home state when device is in error state', async () => {
            const mockDevice = createMockDevice({ status: 'error' });
            ctx.getDevice.returns(mockDevice);
            configureMockHelperForSubPath('control.clean_home');

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean_home', state);

            expect(ctx.adapter.log.warn.calledWith('Please check bot for errors')).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.called).to.be.false;
        });

        it('should handle clean_home state when device is paused', async () => {
            const mockDevice = createMockDevice({ status: 'paused' });
            ctx.getDevice.returns(mockDevice);
            configureMockHelperForSubPath('control.clean_home');

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean_home', state);

            expect(ctx.vacbot.run.calledWith('resume')).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('control.clean_home', true, true)).to.be.true;
        });

        it('should handle clean_home state when device is cleaning', async () => {
            const mockDevice = createMockDevice({ status: 'cleaning' });
            ctx.getDevice.returns(mockDevice);
            configureMockHelperForSubPath('control.clean_home');

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean_home', state);

            expect(ctx.vacbot.run.calledWith('charge')).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('control.clean_home', false, true)).to.be.true;
        });

        it('should handle clean_home state when device is idle', async () => {
            const mockDevice = createMockDevice({ status: 'idle' });
            ctx.getDevice.returns(mockDevice);
            configureMockHelperForSubPath('control.clean_home');

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean_home', state);

            expect(ctx.vacbot.run.calledWith('clean')).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('control.clean_home', true, true)).to.be.true;
        });

        it('should reset button states after execution', async () => {
            configureMockHelperForSubPath('control.playSound');

            const mockObject = { common: { role: 'button' } };
            adapter.getObject.callsArgWith(1, null, mockObject);

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.playSound', state);

            expect(ctx.adapterProxy.setStateConditional.calledWith('control.playSound', false, true)).to.be.true;
            expect(ctx.adapter.log.info.calledWith('Run: playSound')).to.be.true;
        });
    });

    describe('Error Handling', () => {
        it('should propagate vacbot.run errors', async () => {
            ctx.vacbot.run.throws(new Error('Vacbot error'));
            configureMockHelperForSubPath('control.clean');

            const state = { ack: false, val: true };
            let thrown = false;
            try {
                await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', state);
            } catch (e) {
                thrown = true;
                expect(e.message).to.equal('Vacbot error');
            }
            expect(thrown).to.be.true;
        });

        it('should handle invalid state values', async () => {
            configureMockHelperForSubPath('control.invalid');

            const state = { ack: false, val: 'invalid' };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.invalid', state);
            expect(ctx.vacbot.run.called).to.be.false;
        });
    });

    describe('Edge Cases', () => {
        it('should handle acknowledged states', async () => {
            configureMockHelperForSubPath('control.clean');

            const state = { ack: true, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', state);

            // Acknowledged states should not trigger any vacbot command (returned at line 144)
            expect(ctx.vacbot.run.called).to.be.false;
        });

        it('should handle null/undefined state values', async () => {
            configureMockHelperForSubPath('control.stop');

            const state = { ack: false, val: null };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.stop', state);

            expect(ctx.vacbot.run.calledWith('stop')).to.be.true;
        });

        it('should handle device object errors', async () => {
            configureMockHelperForSubPath('control.playSound');

            adapter.getObject.callsArgWith(1, new Error('Object not found'), null);

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.playSound', state);

            expect(ctx.adapter.log.info.calledWith('Run: playSound')).to.be.true;
        });
    });
});
