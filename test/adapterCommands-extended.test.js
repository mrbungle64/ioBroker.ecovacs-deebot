'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockAdapter, createMockCtx } = require('./mockHelper');

const mockAdapterHelper = {
    getStateNameById: sinon.stub(),
    getChannelNameById: sinon.stub().returns('control'),
    getSubChannelNameById: sinon.stub().returns('extended'),
    getUnixTimestamp: sinon.stub().returns(1234567890),
    isValidChargeStatus: sinon.stub(),
    isValidCleanStatus: sinon.stub(),
    getDeviceStatusByStatus: sinon.stub(),
    isSingleSpotAreaValue: sinon.stub().returns(true),
    areaValueStringWithCleaningsIsValid: sinon.stub().returns(false),
    areaValueStringIsValid: sinon.stub().returns(false),
    positionValueStringIsValid: sinon.stub().returns(true)
};

const mockMapHelper = {
    saveCurrentSpotAreaValues: sinon.stub().resolves(),
    saveLastUsedCustomAreaValues: sinon.stub().resolves(),
    saveVirtualBoundary: sinon.stub().resolves(),
    saveVirtualBoundarySet: sinon.stub(),
    createVirtualBoundary: sinon.stub().resolves(),
    createVirtualBoundarySet: sinon.stub().resolves(),
    deleteVirtualBoundary: sinon.stub().resolves(),
    saveGoToPositionValues: sinon.stub().resolves(),
    getPositionValuesForExtendedArea: sinon.stub().returns('100,200,300,400'),
    isSpotAreasChannel: sinon.stub().returns(true)
};

const adapterCommands = proxyquire('../lib/adapterCommands', {
    './adapterHelper': mockAdapterHelper,
    './mapHelper': mockMapHelper
});

describe('adapterCommands.js extended', () => {
    let adapter;
    let ctx;

    beforeEach(() => {
        adapter = createMockAdapter({
            clearGoToPosition: sinon.stub(),
            setHistoryValuesForDustboxRemoval: sinon.stub(),
            setStateAsync: sinon.stub().resolves()
        });
        ctx = createMockCtx({
            adapter: adapter,
            connected: true,
            currentMapID: '1',
            currentSpotAreaID: '2',
            customAreaCleanings: 1,
            spotAreaCleanings: 1
        });
        // Ensure commandQueue has addGetLifespan and runAll
        ctx.commandQueue.addGetLifespan = sinon.stub();
        ctx.commandQueue.runAll = sinon.stub();
        // Ensure cleaningQueue has run method
        ctx.cleaningQueue.run = sinon.stub();

        Object.values(mockAdapterHelper).forEach(stub => {
            if (stub.resetHistory) stub.resetHistory();
        });
        Object.values(mockMapHelper).forEach(stub => {
            if (stub.resetHistory) stub.resetHistory();
        });
    });

    describe('handleV2commands', () => {
        it('should return original command when V2 is disabled', () => {
            ctx.getDevice().useV2commands.returns(false);
            const result = adapterCommands.handleV2commands(adapter, ctx, 'clean');
            expect(result).to.equal('clean');
        });

        it('should append _V2 when V2 commands are enabled', () => {
            ctx.getDevice().useV2commands.returns(true);
            const result = adapterCommands.handleV2commands(adapter, ctx, 'clean');
            expect(result).to.equal('clean_V2');
        });
    });

    describe('runSetCleanSpeed', () => {
        it('should set clean speed for standard model', () => {
            ctx.getModel().isModelTypeAirbot.returns(false);
            adapterCommands.runSetCleanSpeed(adapter, ctx, 3);
            expect(ctx.vacbot.run.calledWith('SetCleanSpeed', 3)).to.be.true;
        });

        it('should set fan speed for airbot model', () => {
            ctx.getModel().isModelTypeAirbot.returns(true);
            adapterCommands.runSetCleanSpeed(adapter, ctx, 2);
            expect(ctx.vacbot.run.calledWith('SetFanSpeed', 2)).to.be.true;
        });
    });

    describe('startSpotAreaCleaning', () => {
        it('should start spot area cleaning without V2', () => {
            ctx.getDevice().useV2commands.returns(false);
            adapterCommands.startSpotAreaCleaning(adapter, ctx, '1,2', 1);
            expect(ctx.vacbot.run.calledWith('spotArea', 'start', '1,2', 1)).to.be.true;
        });

        it('should start spot area cleaning with V2', () => {
            ctx.getDevice().useV2commands.returns(true);
            adapterCommands.startSpotAreaCleaning(adapter, ctx, '1,2', 2);
            expect(ctx.vacbot.run.calledWith('spotArea_V2', '1,2', 2)).to.be.true;
        });
    });

    describe('cleanSpotArea', () => {
        it('should start cleaning when on correct map', () => {
            ctx.currentMapID = '1';
            ctx.deebotPositionIsInvalid = false;
            adapterCommands.cleanSpotArea(adapter, ctx, '1', '5');
            expect(ctx.vacbot.run.calledWith('spotArea', 'start', '5')).to.be.true;
        });

        it('should log error when not on correct map', () => {
            ctx.currentMapID = '2';
            ctx.deebotPositionIsInvalid = false;
            adapterCommands.cleanSpotArea(adapter, ctx, '1', '5');
            expect(adapter.log.error.called).to.be.true;
        });
    });

    describe('handleStateChange extended branches', () => {
        it('should handle map.lastUsedCustomAreaValues_save', async () => {
            mockAdapterHelper.getStateNameById.returns('lastUsedCustomAreaValues_save');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'map.lastUsedCustomAreaValues_save', { ack: false, val: true });
            expect(mockMapHelper.saveLastUsedCustomAreaValues.called).to.be.true;
        });

        it('should handle map.currentSpotAreaValues_save', async () => {
            mockAdapterHelper.getStateNameById.returns('currentSpotAreaValues_save');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'map.currentSpotAreaValues_save', { ack: false, val: true });
            expect(mockMapHelper.saveCurrentSpotAreaValues.called).to.be.true;
        });

        it('should handle control.spotArea with 950 type and 2 cleanings', async () => {
            mockAdapterHelper.getStateNameById.returns('spotArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.vacbot.is950type = sinon.stub().returns(true);
            ctx.spotAreaCleanings = 2;
            await adapterCommands.handleStateChange(adapter, ctx, 'control.spotArea', { ack: false, val: '1,2' });
            expect(ctx.vacbot.run.called).to.be.true;
        });

        it('should handle control.customArea with cleanings', async () => {
            mockAdapterHelper.getStateNameById.returns('customArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            mockAdapterHelper.areaValueStringWithCleaningsIsValid.returns(true);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.customArea', { ack: false, val: '100,200,300,400,2' });
            expect(ctx.vacbot.run.called).to.be.true;
        });

        it('should handle control.customArea with basic area values', async () => {
            mockAdapterHelper.getStateNameById.returns('customArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            mockAdapterHelper.areaValueStringWithCleaningsIsValid.returns(false);
            mockAdapterHelper.areaValueStringIsValid.returns(true);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.customArea', { ack: false, val: '100,200,300,400' });
            expect(ctx.vacbot.run.called).to.be.true;
        });

        it('should handle control.cleanSpeed', async () => {
            mockAdapterHelper.getStateNameById.returns('cleanSpeed');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.getModel().isModelTypeAirbot.returns(false);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.cleanSpeed', { ack: false, val: 2 });
            expect(ctx.vacbot.run.calledWith('SetCleanSpeed', 2)).to.be.true;
        });

        it('should handle control.waterLevel', async () => {
            mockAdapterHelper.getStateNameById.returns('waterLevel');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.waterLevel', { ack: false, val: 2 });
            expect(ctx.vacbot.run.calledWith('SetWaterLevel', 2)).to.be.true;
        });

        it('should handle control.reconnect', async () => {
            mockAdapterHelper.getStateNameById.returns('reconnect');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.reconnect', { ack: false, val: true });
            expect(adapter.reconnect.called).to.be.true;
        });

        it('should handle move commands', async () => {
            mockAdapterHelper.getStateNameById.returns('forward');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('move');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.move.forward', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('moveforward')).to.be.true;
        });

        it('should handle consumable main_brush_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('main_brush_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'consumable.main_brush_reset', { ack: false, val: true });
            expect(ctx.commandQueue.add.calledWith('ResetLifeSpan', 'main_brush')).to.be.true;
        });

        it('should handle consumable filter_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('filter_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'consumable.filter_reset', { ack: false, val: true });
            expect(ctx.commandQueue.add.calledWith('ResetLifeSpan', 'filter')).to.be.true;
        });

        it('should handle extended.pauseWhenEnteringSpotArea', async () => {
            mockAdapterHelper.getStateNameById.returns('pauseWhenEnteringSpotArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.pauseWhenEnteringSpotArea', { ack: false, val: '5' });
            expect(ctx.pauseWhenEnteringSpotArea).to.equal('5');
        });

        it('should handle extended.volume', async () => {
            mockAdapterHelper.getStateNameById.returns('volume');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.volume', { ack: false, val: 5 });
            expect(ctx.vacbot.run.calledWith('SetVolume', 5)).to.be.true;
        });

        it('should handle extended.advancedMode', async () => {
            mockAdapterHelper.getStateNameById.returns('advancedMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.advancedMode', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EnableAdvancedMode')).to.be.true;
        });

        it('should handle extended.autoEmpty', async () => {
            mockAdapterHelper.getStateNameById.returns('autoEmpty');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.autoEmpty', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EnableAutoEmpty')).to.be.true;
        });

        it('should handle extended.doNotDisturb', async () => {
            mockAdapterHelper.getStateNameById.returns('doNotDisturb');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.doNotDisturb', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EnableDoNotDisturb')).to.be.true;
        });

        it('should handle extended.continuousCleaning', async () => {
            mockAdapterHelper.getStateNameById.returns('continuousCleaning');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.continuousCleaning', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EnableContinuousCleaning')).to.be.true;
        });

        it('should handle extended.trueDetect', async () => {
            mockAdapterHelper.getStateNameById.returns('trueDetect');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.trueDetect', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EnableTrueDetect')).to.be.true;
        });

        it('should handle extended.moppingMode', async () => {
            mockAdapterHelper.getStateNameById.returns('moppingMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.moppingMode', { ack: false, val: 'quick' });
            expect(ctx.vacbot.run.calledWith('SetSweepMode', 'quick')).to.be.true;
        });

        it('should handle extended.washInterval', async () => {
            mockAdapterHelper.getStateNameById.returns('washInterval');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.washInterval', { ack: false, val: 10 });
            expect(ctx.vacbot.run.calledWith('SetWashInterval', 10)).to.be.true;
        });

        it('should handle extended.airDrying', async () => {
            mockAdapterHelper.getStateNameById.returns('airDrying');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.airDrying', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('Drying', 'start')).to.be.true;
        });

        it('should handle extended.selfCleaning', async () => {
            mockAdapterHelper.getStateNameById.returns('selfCleaning');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.selfCleaning', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('Washing', 'start')).to.be.true;
        });

        it('should handle extended.hostedCleanMode', async () => {
            mockAdapterHelper.getStateNameById.returns('hostedCleanMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.hostedCleanMode', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('HostedCleanMode')).to.be.true;
        });

        it('should handle extended.cleanCount', async () => {
            mockAdapterHelper.getStateNameById.returns('cleanCount');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.cleanCount', { ack: false, val: 2 });
            expect(ctx.vacbot.run.calledWith('setCleanCount', 2)).to.be.true;
        });

        it('should handle extended.emptyDustBin', async () => {
            mockAdapterHelper.getStateNameById.returns('emptyDustBin');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.emptyDustBin', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EmptyDustBin')).to.be.true;
        });

        it('should handle history.triggerDustboxRemoved', async () => {
            mockAdapterHelper.getStateNameById.returns('triggerDustboxRemoved');
            mockAdapterHelper.getChannelNameById.returns('history');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'history.triggerDustboxRemoved', { ack: false, val: true });
            expect(adapter.setHistoryValuesForDustboxRemoval.called).to.be.true;
        });

        it('should handle info.currentSchedule_refresh', async () => {
            mockAdapterHelper.getStateNameById.returns('currentSchedule_refresh');
            mockAdapterHelper.getChannelNameById.returns('info');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.getDevice().useV2commands.returns(false);
            await adapterCommands.handleStateChange(adapter, ctx, 'info.currentSchedule_refresh', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('GetSchedule')).to.be.true;
        });

        it('should handle cleaninglog.requestCleaningLog', async () => {
            mockAdapterHelper.getStateNameById.returns('requestCleaningLog');
            mockAdapterHelper.getChannelNameById.returns('cleaninglog');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'cleaninglog.requestCleaningLog', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('GetCleanLogs')).to.be.true;
        });

        it('should handle control.pause when paused', async () => {
            mockAdapterHelper.getStateNameById.returns('pause');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.getDevice().isPaused.returns(true);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.pause', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('resume')).to.be.true;
        });

        it('should handle control.pause when not paused', async () => {
            mockAdapterHelper.getStateNameById.returns('pause');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.getDevice().isPaused.returns(false);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.pause', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('pause')).to.be.true;
        });

        it('should handle control.playSoundId', async () => {
            mockAdapterHelper.getStateNameById.returns('playSoundId');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.playSoundId', { ack: false, val: 5 });
            expect(ctx.vacbot.run.calledWith('playSound', 5)).to.be.true;
        });

        it('should handle control.playIamHere', async () => {
            mockAdapterHelper.getStateNameById.returns('playIamHere');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.playIamHere', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('playSound', 30)).to.be.true;
        });

        it('should handle control.spotPurification', async () => {
            mockAdapterHelper.getStateNameById.returns('spotPurification');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.spotPurification', { ack: false, val: 'room1' });
            expect(ctx.vacbot.run.calledWith('spotPurification', 'room1')).to.be.true;
        });

        it('should handle control.edge', async () => {
            mockAdapterHelper.getStateNameById.returns('edge');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.edge', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('edge')).to.be.true;
        });

        it('should handle control.spot', async () => {
            mockAdapterHelper.getStateNameById.returns('spot');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.spot', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('spot')).to.be.true;
        });

        it('should handle control.stop', async () => {
            mockAdapterHelper.getStateNameById.returns('stop');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.stop', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('stop')).to.be.true;
            expect(ctx.commandQueue.resetQueue.called).to.be.true;
        });

        it('should handle control.charge', async () => {
            mockAdapterHelper.getStateNameById.returns('charge');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.charge', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('charge')).to.be.true;
        });

        it('should handle control.relocate', async () => {
            mockAdapterHelper.getStateNameById.returns('relocate');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.relocate', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('relocate')).to.be.true;
        });

        it('should handle control.basicPurification', async () => {
            mockAdapterHelper.getStateNameById.returns('basicPurification');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.basicPurification', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('basicPurification')).to.be.true;
        });

        it('should handle control.resume', async () => {
            mockAdapterHelper.getStateNameById.returns('resume');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.resume', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('resume')).to.be.true;
        });

        it('should handle control.playSound', async () => {
            mockAdapterHelper.getStateNameById.returns('playSound');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.playSound', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('playSound')).to.be.true;
        });

        it('should handle map.loadCurrentMapImage', async () => {
            mockAdapterHelper.getStateNameById.returns('loadCurrentMapImage');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.currentMapID = '1';
            await adapterCommands.handleStateChange(adapter, ctx, 'map.loadCurrentMapImage', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('GetMapImage', '1', 'outline')).to.be.true;
        });

        it('should handle map.loadMapImage', async () => {
            mockAdapterHelper.getStateNameById.returns('loadMapImage');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'map.0.0.123.loadMapImage', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('GetMapImage', '123', 'outline')).to.be.true;
        });

        it('should handle map.saveVirtualBoundary', async () => {
            mockAdapterHelper.getStateNameById.returns('saveVirtualBoundary');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'map.1.virtualBoundaries.5.saveVirtualBoundary', { ack: false, val: true });
            expect(mockMapHelper.saveVirtualBoundary.called).to.be.true;
        });

        it('should handle map.deleteVirtualBoundary', async () => {
            mockAdapterHelper.getStateNameById.returns('deleteVirtualBoundary');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'map.1.virtualBoundaries.5.deleteVirtualBoundary', { ack: false, val: true });
            expect(mockMapHelper.deleteVirtualBoundary.called).to.be.true;
        });

        it('should handle map.saveVirtualBoundarySet', async () => {
            mockAdapterHelper.getStateNameById.returns('saveVirtualBoundarySet');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'map.1.spotAreas.5.saveVirtualBoundarySet', { ack: false, val: true });
            expect(mockMapHelper.saveVirtualBoundarySet.called).to.be.true;
        });

        it('should handle control.extended.autoBoostSuction', async () => {
            mockAdapterHelper.getStateNameById.returns('autoBoostSuction');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.autoBoostSuction', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EnableCarpetPressure')).to.be.true;
        });

        it('should handle control.extended.cleanPreference', async () => {
            mockAdapterHelper.getStateNameById.returns('cleanPreference');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.cleanPreference', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EnableCleanPreference')).to.be.true;
        });

        it('should handle control.extended.edgeDeepCleaning', async () => {
            mockAdapterHelper.getStateNameById.returns('edgeDeepCleaning');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.edgeDeepCleaning', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EnableBorderSpin')).to.be.true;
        });

        it('should handle control.extended.mopOnlyMode', async () => {
            mockAdapterHelper.getStateNameById.returns('mopOnlyMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.mopOnlyMode', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('EnableMopOnlyMode')).to.be.true;
        });

        it('should handle control.extended.airDryingDuration', async () => {
            mockAdapterHelper.getStateNameById.returns('airDryingDuration');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.airDryingDuration', { ack: false, val: 120 });
            expect(ctx.vacbot.run.calledWith('SetDryingDuration', 120)).to.be.true;
        });

        it('should handle control.extended.cleaningMode', async () => {
            mockAdapterHelper.getStateNameById.returns('cleaningMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.cleaningMode', { ack: false, val: 'auto' });
            expect(ctx.vacbot.run.calledWith('SetWorkMode', 'auto')).to.be.true;
        });

        it('should handle control.extended.carpetCleaningStrategy', async () => {
            mockAdapterHelper.getStateNameById.returns('carpetCleaningStrategy');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.carpetCleaningStrategy', { ack: false, val: 'avoid' });
            expect(ctx.vacbot.run.calledWith('SetCarpetInfo', 'avoid')).to.be.true;
        });

        it('should handle control.extended.cleaningClothReminder', async () => {
            mockAdapterHelper.getStateNameById.returns('cleaningClothReminder');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            ctx.cleaningClothReminder = { enabled: false, period: 30 };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.cleaningClothReminder', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('SetDusterRemind', 1, 30)).to.be.true;
        });

        it('should handle control.extended.cleaningClothReminder_period', async () => {
            mockAdapterHelper.getStateNameById.returns('cleaningClothReminder_period');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            ctx.cleaningClothReminder = { enabled: true, period: 30 };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.cleaningClothReminder_period', { ack: false, val: 60 });
            expect(ctx.vacbot.run.calledWith('SetDusterRemind', 1, 60)).to.be.true;
        });

        it('should handle control.extended.voiceAssistant', async () => {
            mockAdapterHelper.getStateNameById.returns('voiceAssistant');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.voiceAssistant', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('SetVoiceAssistantState', 1)).to.be.true;
        });

        it('should handle control.extended.bluetoothSpeaker', async () => {
            mockAdapterHelper.getStateNameById.returns('bluetoothSpeaker');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.bluetoothSpeaker', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('SetBlueSpeaker', 1)).to.be.true;
        });

        it('should handle control.extended.microphone', async () => {
            mockAdapterHelper.getStateNameById.returns('microphone');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.microphone', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('SetMic', 1)).to.be.true;
        });

        it('should handle control.extended.voiceReport', async () => {
            mockAdapterHelper.getStateNameById.returns('voiceReport');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.voiceReport', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('SetVoiceSimple', 1)).to.be.true;
        });

        it('should handle control.extended.atmoVolume', async () => {
            mockAdapterHelper.getStateNameById.returns('atmoVolume');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.atmoVolume', { ack: false, val: 8 });
            expect(ctx.vacbot.run.calledWith('SetAtmoVolume', 8)).to.be.true;
        });

        it('should handle control.extended.atmoLight', async () => {
            mockAdapterHelper.getStateNameById.returns('atmoLight');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.atmoLight', { ack: false, val: 2 });
            expect(ctx.vacbot.run.calledWith('SetAtmoLight', 2)).to.be.true;
        });

        it('should handle control.spotArea buttons', async () => {
            mockAdapterHelper.getStateNameById.returns('spotArea_1');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.getDevice().useV2commands.returns(false);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.spotArea_1', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('spotArea', 'start', '1')).to.be.true;
        });

        it('should not process when not connected', async () => {
            ctx.connected = false;
            mockAdapterHelper.getStateNameById.returns('clean');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', { ack: false, val: true });
            expect(ctx.vacbot.run.called).to.be.false;
        });

        it('should handle history channel without processing commands', async () => {
            mockAdapterHelper.getStateNameById.returns('someHistory');
            mockAdapterHelper.getChannelNameById.returns('history');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'history.someHistory', { ack: false, val: true });
        });

        it('should handle control.customArea_cleanings', async () => {
            mockAdapterHelper.getStateNameById.returns('customArea_cleanings');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.customArea_cleanings', { ack: false, val: 3 });
            expect(ctx.customAreaCleanings).to.equal(3);
        });

        it('should handle control.spotArea_cleanings', async () => {
            mockAdapterHelper.getStateNameById.returns('spotArea_cleanings');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.spotArea_cleanings', { ack: false, val: 3 });
            expect(ctx.spotAreaCleanings).to.equal(3);
        });

        it('should handle extended.pauseBeforeDockingChargingStation', async () => {
            mockAdapterHelper.getStateNameById.returns('pauseBeforeDockingChargingStation');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.pauseBeforeDockingChargingStation', { ack: false, val: true });
            expect(ctx.pauseBeforeDockingChargingStation).to.equal(true);
        });

        it('should handle extended.pauseBeforeDockingIfWaterboxInstalled', async () => {
            mockAdapterHelper.getStateNameById.returns('pauseBeforeDockingIfWaterboxInstalled');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.pauseBeforeDockingIfWaterboxInstalled', { ack: false, val: true });
            expect(ctx.pauseBeforeDockingIfWaterboxInstalled).to.equal(true);
        });

        it('should handle extended.resetCleanSpeedToStandardOnReturn', async () => {
            mockAdapterHelper.getStateNameById.returns('resetCleanSpeedToStandardOnReturn');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.resetCleanSpeedToStandardOnReturn', { ack: false, val: true });
            expect(ctx.resetCleanSpeedToStandardOnReturn).to.equal(true);
        });

        it('should handle extended.pauseWhenLeavingSpotArea', async () => {
            mockAdapterHelper.getStateNameById.returns('pauseWhenLeavingSpotArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.pauseWhenLeavingSpotArea', { ack: false, val: '3' });
            expect(ctx.pauseWhenLeavingSpotArea).to.equal('3');
        });

        it('should handle map.savedBoundarySets', async () => {
            mockAdapterHelper.getStateNameById.returns('someBoundarySet');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('savedBoundarySets');
            await adapterCommands.handleStateChange(adapter, ctx, 'map.savedBoundarySets.virtualBoundarySet_123', { ack: false, val: true });
            expect(mockMapHelper.createVirtualBoundarySet.called).to.be.true;
        });

        it('should handle map.savedBoundaries', async () => {
            mockAdapterHelper.getStateNameById.returns('someBoundary');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('savedBoundaries');
            await adapterCommands.handleStateChange(adapter, ctx, 'map.savedBoundaries.virtualBoundary_123', { ack: false, val: true });
            expect(mockMapHelper.createVirtualBoundary.called).to.be.true;
        });

        it('should handle control.waterLevel_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('waterLevel_reset');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.adapterProxy.getChannelsOfAsync.resolves([
                { _id: 'adapter.0.map.1.spotAreas.1' }
            ]);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.waterLevel_reset', { ack: false, val: true });
            expect(ctx.adapterProxy.setStateConditional.called).to.be.true;
        });

        it('should handle control.cleanSpeed_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('cleanSpeed_reset');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.adapterProxy.getChannelsOfAsync.resolves([
                { _id: 'adapter.0.map.1.spotAreas.1' }
            ]);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.cleanSpeed_reset', { ack: false, val: true });
            expect(ctx.adapterProxy.setStateConditional.called).to.be.true;
        });

        it('should handle map.deebotPosition savedGoToPositionValues', async () => {
            mockAdapterHelper.getStateNameById.returns('someGoTo');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('savedGoToPositionValues');
            ctx.adapterProxy.getObjectAsync.resolves({ native: { goToPositionValues: '100,200' } });
            ctx.getDevice().useNativeGoToPosition.returns(true);
            ctx.getModel().isModelTypeAirbot.returns(false);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.savedGoToPositionValues.goToPosition_123', { ack: false, val: true });
            expect(ctx.vacbot.run.called).to.be.true;
        });

        it('should handle consumable side_brush_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('side_brush_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'consumable.side_brush_reset', { ack: false, val: true });
            expect(ctx.commandQueue.add.calledWith('ResetLifeSpan', 'side_brush')).to.be.true;
        });

        it('should handle consumable unit_care_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('unit_care_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'consumable.unit_care_reset', { ack: false, val: true });
            expect(ctx.commandQueue.add.calledWith('ResetLifeSpan', 'unit_care')).to.be.true;
        });

        it('should handle consumable round_mop_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('round_mop_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'consumable.round_mop_reset', { ack: false, val: true });
            expect(ctx.commandQueue.add.calledWith('ResetLifeSpan', 'round_mop')).to.be.true;
        });

        it('should handle consumable airFreshener_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('airFreshener_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'consumable.airFreshener_reset', { ack: false, val: true });
            expect(ctx.commandQueue.add.calledWith('ResetLifeSpan', 'air_freshener')).to.be.true;
        });

        it('should handle control.clean with V2 enabled', async () => {
            mockAdapterHelper.getStateNameById.returns('clean');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            ctx.getDevice().useV2commands.returns(true);
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('clean_V2')).to.be.true;
        });

        it('should handle control.mobilePurification', async () => {
            mockAdapterHelper.getStateNameById.returns('mobilePurification');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, ctx, 'control.mobilePurification', { ack: false, val: true });
            expect(ctx.vacbot.run.calledWith('mobilePurification')).to.be.true;
        });
    });
});
