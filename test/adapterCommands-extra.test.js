'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockAdapter, createMockCtx } = require('./mockHelper');

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
    positionValueStringIsValid: sinon.stub().returns(true)
};

const mockMapHelper = {
    getAreaValue: sinon.stub(),
    getSpotAreaName: sinon.stub(),
    getPositionValuesForExtendedArea: sinon.stub().returns('100,200,300,400'),
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

const adapterCommands = proxyquire('../lib/adapterCommands', {
    './adapterHelper': mockAdapterHelper,
    './mapHelper': mockMapHelper
});

describe('adapterCommands.js - goToPosition and saved area functions', () => {
    let adapter;
    let ctx;

    beforeEach(() => {
        adapter = createMockAdapter({
            clearGoToPosition: sinon.stub(),
            namespace: 'ecovacs-deebot.0'
        });
        ctx = createMockCtx({
            adapter: adapter,
            connected: true
        });
        ctx.vacbot.run = sinon.stub();
        ctx.commandQueue.run = sinon.stub();

        Object.values(mockAdapterHelper).forEach(s => {
            if (typeof s.resetHistory === 'function') s.resetHistory();
        });
        Object.values(mockMapHelper).forEach(s => {
            if (typeof s.resetHistory === 'function') s.resetHistory();
        });

        // Default: control.extended routing
        mockAdapterHelper.getChannelNameById.returns('control');
        mockAdapterHelper.getSubChannelNameById.returns('extended');
        mockAdapterHelper.positionValueStringIsValid.returns(true);
    });

    describe('goToPosition via control.extended.goToPosition', () => {
        it('should call SinglePoint_V2 for airbot model', async () => {
            mockAdapterHelper.getStateNameById.returns('goToPosition');
            ctx.getModel().isModelTypeAirbot.returns(true);
            const state = { ack: false, val: '100,200' };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.goToPosition', state);
            expect(ctx.vacbot.run.calledWith('SinglePoint_V2', '100,200')).to.be.true;
        });

        it('should call GoToPosition for native go-to-position', async () => {
            mockAdapterHelper.getStateNameById.returns('goToPosition');
            ctx.getDevice().useNativeGoToPosition.returns(true);
            const state = { ack: false, val: '100,200' };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.goToPosition', state);
            expect(ctx.vacbot.run.calledWith('GoToPosition', '100,200')).to.be.true;
        });

        it('should use fallback area cleaning for non-native, non-airbot model', async () => {
            mockAdapterHelper.getStateNameById.returns('goToPosition');
            ctx.getModel().isModelTypeAirbot.returns(false);
            ctx.getDevice().useNativeGoToPosition.returns(false);
            const state = { ack: false, val: '100,200' };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.goToPosition', state);
            expect(mockMapHelper.getPositionValuesForExtendedArea.called).to.be.true;
            expect(ctx.goToPositionArea).to.equal('100,200,300,400');
        });

        it('should log warn for invalid position values', async () => {
            mockAdapterHelper.getStateNameById.returns('goToPosition');
            mockAdapterHelper.positionValueStringIsValid.returns(false);
            const state = { ack: false, val: 'invalid' };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.goToPosition', state);
            expect(ctx.adapter.log.warn.calledWith('Invalid input for go to position: invalid')).to.be.true;
        });

        it('should save next used values when goToPosition_saveNextUsedValues is true', async () => {
            mockAdapterHelper.getStateNameById.returns('goToPosition');
            ctx.adapterProxy.getStateAsync
                .withArgs('control.extended.goToPosition_saveNextUsedValues')
                .resolves({ val: true });
            const state = { ack: false, val: '100,200' };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.goToPosition', state);
            await new Promise(resolve => setImmediate(resolve));
            expect(mockMapHelper.saveGoToPositionValues.called).to.be.true;
        });
    });

    describe('cleanSavedCustomArea via map.savedCustomAreas', () => {
        it('should start custom area cleaning when valid area is found', async () => {
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('savedCustomAreas');
            mockAdapterHelper.getStateNameById.returns('trigger');
            const id = 'map.savedCustomAreas.customArea_1234567890';
            ctx.adapterProxy.getObjectAsync.resolves({ native: { area: '1000,2000,3000,4000' } });
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, id, state);
            await new Promise(resolve => setImmediate(resolve));
            expect(ctx.vacbot.run.calledWith('customArea', 'start', '1000,2000,3000,4000', 1)).to.be.true;
        });

        it('should log error when getObjectAsync fails', async () => {
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('savedCustomAreas');
            mockAdapterHelper.getStateNameById.returns('trigger');
            const id = 'map.savedCustomAreas.customArea_1234567890';
            ctx.adapterProxy.getObjectAsync.rejects(new Error('Object lookup failed'));
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, id, state);
            await new Promise(resolve => setImmediate(resolve));
            expect(ctx.adapter.log.error.calledWith(
                sinon.match(/Error cleanSavedCustomArea: Object lookup failed/)
            )).to.be.true;
        });
    });

    describe('spotArea_silentApproach with sorted spot areas', () => {
        it('should sort spot areas by sequence numbers and start cleaning', async () => {
            // spotArea_silentApproach is in the SECOND control block (line 671),
            // NOT the control.extended switch. So subChannelName must NOT be 'extended'.
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');  // NOT 'extended'
            mockAdapterHelper.getStateNameById.returns('spotArea_silentApproach');

            // Mock state values (unprefixed since adapterProxy is plain)
            ctx.adapterProxy.getStateAsync
                .withArgs('control.spotArea_silentApproach')
                .resolves({ val: '3,1,2' });
            ctx.adapterProxy.getStateAsync
                .withArgs('map.1.spotAreas.3.spotAreaSequenceNumber')
                .resolves({ val: 30 });
            ctx.adapterProxy.getStateAsync
                .withArgs('map.1.spotAreas.1.spotAreaSequenceNumber')
                .resolves({ val: 10 });
            ctx.adapterProxy.getStateAsync
                .withArgs('map.1.spotAreas.2.spotAreaSequenceNumber')
                .resolves({ val: 20 });

            ctx.currentMapID = '1';
            ctx.currentSpotAreaID = '1';

            const state = { ack: false, val: '3,1,2' };
            await adapterCommands.handleStateChange(adapter, ctx,
                'control.spotArea_silentApproach', state);

            // Should have called startSpotAreaCleaning with sorted areas
            expect(ctx.vacbot.run.calledWith('spotArea', 'start', '1,2,3', 1)).to.be.true;
        });
    });

    describe('startSpotAreaCleaning', () => {
        it('should run spot area with V2 commands', () => {
            ctx.getDevice().useV2commands.returns(true);
            adapterCommands.startSpotAreaCleaning(adapter, ctx, '1,2,3', 1);
            expect(ctx.vacbot.run.calledWith('spotArea_V2', '1,2,3', 1)).to.be.true;
        });

        it('should run spot area without V2 commands', () => {
            ctx.getDevice().useV2commands.returns(false);
            adapterCommands.startSpotAreaCleaning(adapter, ctx, '1,2,3', 1);
            expect(ctx.vacbot.run.calledWith('spotArea', 'start', '1,2,3', 1)).to.be.true;
        });
    });
});
