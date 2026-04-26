'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

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

const createMockAdapter = () => ({
    namespace: 'ecovacs-deebot.0',
    connected: true,
    currentMapID: '1',
    currentSpotAreaID: '2',
    customAreaCleanings: 1,
    spotAreaCleanings: 1,
    log: {
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
    },
    getDevice: sinon.stub().returns({
        status: 'idle',
        isCleaning: sinon.stub().returns(false),
        isNotCleaning: sinon.stub().returns(true),
        isCharging: sinon.stub().returns(false),
        isNotCharging: sinon.stub().returns(true),
        isPaused: sinon.stub().returns(false),
        useV2commands: sinon.stub().returns(false),
        useNativeGoToPosition: sinon.stub().returns(true)
    }),
    commandQueue: { resetQueue: sinon.stub(), add: sinon.stub(), addGetLifespan: sinon.stub(), runAll: sinon.stub() },
    cleaningQueue: { resetQueue: sinon.stub(), createMultipleCleaningsForSpotArea: sinon.stub() },
    intervalQueue: { add: sinon.stub() },
    clearGoToPosition: sinon.stub(),
    reconnect: sinon.stub(),
    setHistoryValuesForDustboxRemoval: sinon.stub(),
    getCurrentDateAndTimeFormatted: sinon.stub().returns('2023-01-01 12:00:00'),
    setStateConditional: sinon.stub(),
    setStateConditionalAsync: sinon.stub().resolves(),
    getObject: sinon.stub(),
    getObjectAsync: sinon.stub().resolves(null),
    getState: sinon.stub().callsArgWith(1, null, { val: true }),
    getStateAsync: sinon.stub().resolves({ val: '1,2,3' }),
    setStateAsync: sinon.stub().resolves(),
    getModel: sinon.stub().returns({
        isSupportedFeature: sinon.stub().returns(true),
        isModelTypeAirbot: sinon.stub().returns(false)
    }),
    vacbot: {
        run: sinon.stub(),
        is950type: sinon.stub().returns(false)
    }
});

const adapterCommands = proxyquire('../lib/adapterCommands', {
    './adapterHelper': mockAdapterHelper,
    './mapHelper': mockMapHelper
});

describe('adapterCommands.js extended', () => {
    let adapter;

    beforeEach(() => {
        adapter = createMockAdapter();
        Object.values(mockAdapterHelper).forEach(stub => {
            if (stub.resetHistory) stub.resetHistory();
        });
        Object.values(mockMapHelper).forEach(stub => {
            if (stub.resetHistory) stub.resetHistory();
        });
    });

    describe('handleV2commands', () => {
        it('should return original command when V2 is disabled', () => {
            const result = adapterCommands.handleV2commands(adapter, 'clean');
            expect(result).to.equal('clean');
        });

        it('should append _V2 when V2 commands are enabled', () => {
            adapter.getDevice().useV2commands.returns(true);
            const result = adapterCommands.handleV2commands(adapter, 'clean');
            expect(result).to.equal('clean_V2');
        });
    });

    describe('runSetCleanSpeed', () => {
        it('should set clean speed for standard model', () => {
            adapterCommands.runSetCleanSpeed(adapter, 3);
            expect(adapter.vacbot.run.calledWith('SetCleanSpeed', 3)).to.be.true;
        });

        it('should set fan speed for airbot model', () => {
            adapter.getModel().isModelTypeAirbot.returns(true);
            adapterCommands.runSetCleanSpeed(adapter, 2);
            expect(adapter.vacbot.run.calledWith('SetFanSpeed', 2)).to.be.true;
        });
    });

    describe('startSpotAreaCleaning', () => {
        it('should start spot area cleaning without V2', () => {
            adapterCommands.startSpotAreaCleaning(adapter, '1,2', 1);
            expect(adapter.vacbot.run.calledWith('spotArea', 'start', '1,2', 1)).to.be.true;
        });

        it('should start spot area cleaning with V2', () => {
            adapter.getDevice().useV2commands.returns(true);
            adapterCommands.startSpotAreaCleaning(adapter, '1,2', 2);
            expect(adapter.vacbot.run.calledWith('spotArea_V2', '1,2', 2)).to.be.true;
        });
    });


    describe('cleanSpotArea', () => {
        it('should start cleaning when on correct map', () => {
            adapter.currentMapID = '1';
            adapterCommands.cleanSpotArea(adapter, '1', '5');
            expect(adapter.vacbot.run.calledWith('spotArea', 'start', '5')).to.be.true;
        });

        it('should log error when not on correct map', () => {
            adapter.currentMapID = '2';
            adapterCommands.cleanSpotArea(adapter, '1', '5');
            expect(adapter.log.error.called).to.be.true;
        });
    });

    describe('handleStateChange extended branches', () => {
        it('should handle map.lastUsedCustomAreaValues_save', async () => {
            mockAdapterHelper.getStateNameById.returns('lastUsedCustomAreaValues_save');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.map.lastUsedCustomAreaValues_save', { ack: false, val: true });
            expect(mockMapHelper.saveLastUsedCustomAreaValues.called).to.be.true;
        });

        it('should handle map.currentSpotAreaValues_save', async () => {
            mockAdapterHelper.getStateNameById.returns('currentSpotAreaValues_save');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.map.currentSpotAreaValues_save', { ack: false, val: true });
            expect(mockMapHelper.saveCurrentSpotAreaValues.called).to.be.true;
        });

        it('should handle control.spotArea with 950 type and 2 cleanings', async () => {
            mockAdapterHelper.getStateNameById.returns('spotArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            adapter.vacbot.is950type.returns(true);
            adapter.spotAreaCleanings = 2;
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.spotArea', { ack: false, val: '1,2' });
            expect(adapter.vacbot.run.called).to.be.true;
        });

        it('should handle control.customArea with cleanings', async () => {
            mockAdapterHelper.getStateNameById.returns('customArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            mockAdapterHelper.areaValueStringWithCleaningsIsValid.returns(true);
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.customArea', { ack: false, val: '100,200,300,400,2' });
            expect(adapter.vacbot.run.called).to.be.true;
        });

        it('should handle control.customArea with basic area values', async () => {
            mockAdapterHelper.getStateNameById.returns('customArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            mockAdapterHelper.areaValueStringIsValid.returns(true);
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.customArea', { ack: false, val: '100,200,300,400' });
            expect(adapter.vacbot.run.called).to.be.true;
        });

        it('should handle control.cleanSpeed', async () => {
            mockAdapterHelper.getStateNameById.returns('cleanSpeed');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.cleanSpeed', { ack: false, val: 2 });
            expect(adapter.vacbot.run.calledWith('SetCleanSpeed', 2)).to.be.true;
        });

        it('should handle control.waterLevel', async () => {
            mockAdapterHelper.getStateNameById.returns('waterLevel');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.waterLevel', { ack: false, val: 2 });
            expect(adapter.vacbot.run.calledWith('SetWaterLevel', 2)).to.be.true;
        });

        it('should handle control.reconnect', async () => {
            mockAdapterHelper.getStateNameById.returns('reconnect');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.reconnect', { ack: false, val: true });
            expect(adapter.reconnect.called).to.be.true;
        });

        it('should handle move commands', async () => {
            mockAdapterHelper.getStateNameById.returns('forward');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('move');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.move.forward', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('moveforward')).to.be.true;
        });

        it('should handle consumable main_brush_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('main_brush_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.consumable.main_brush_reset', { ack: false, val: true });
            expect(adapter.commandQueue.add.calledWith('ResetLifeSpan', 'main_brush')).to.be.true;
        });

        it('should handle consumable filter_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('filter_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.consumable.filter_reset', { ack: false, val: true });
            expect(adapter.commandQueue.add.calledWith('ResetLifeSpan', 'filter')).to.be.true;
        });

        it('should handle extended.pauseWhenEnteringSpotArea', async () => {
            mockAdapterHelper.getStateNameById.returns('pauseWhenEnteringSpotArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.pauseWhenEnteringSpotArea', { ack: false, val: '5' });
            expect(adapter.pauseWhenEnteringSpotArea).to.equal('5');
        });

        it('should handle extended.volume', async () => {
            mockAdapterHelper.getStateNameById.returns('volume');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.volume', { ack: false, val: 5 });
            expect(adapter.vacbot.run.calledWith('SetVolume', 5)).to.be.true;
        });

        it('should handle extended.advancedMode', async () => {
            mockAdapterHelper.getStateNameById.returns('advancedMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.advancedMode', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EnableAdvancedMode')).to.be.true;
        });

        it('should handle extended.autoEmpty', async () => {
            mockAdapterHelper.getStateNameById.returns('autoEmpty');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.autoEmpty', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EnableAutoEmpty')).to.be.true;
        });

        it('should handle extended.doNotDisturb', async () => {
            mockAdapterHelper.getStateNameById.returns('doNotDisturb');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.doNotDisturb', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EnableDoNotDisturb')).to.be.true;
        });

        it('should handle extended.continuousCleaning', async () => {
            mockAdapterHelper.getStateNameById.returns('continuousCleaning');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.continuousCleaning', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EnableContinuousCleaning')).to.be.true;
        });

        it('should handle extended.trueDetect', async () => {
            mockAdapterHelper.getStateNameById.returns('trueDetect');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.trueDetect', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EnableTrueDetect')).to.be.true;
        });

        it('should handle extended.moppingMode', async () => {
            mockAdapterHelper.getStateNameById.returns('moppingMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.moppingMode', { ack: false, val: 'quick' });
            expect(adapter.vacbot.run.calledWith('SetSweepMode', 'quick')).to.be.true;
        });

        it('should handle extended.washInterval', async () => {
            mockAdapterHelper.getStateNameById.returns('washInterval');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.washInterval', { ack: false, val: 10 });
            expect(adapter.vacbot.run.calledWith('SetWashInterval', 10)).to.be.true;
        });

        it('should handle extended.airDrying', async () => {
            mockAdapterHelper.getStateNameById.returns('airDrying');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.airDrying', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('Drying', 'start')).to.be.true;
        });

        it('should handle extended.selfCleaning', async () => {
            mockAdapterHelper.getStateNameById.returns('selfCleaning');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.selfCleaning', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('Washing', 'start')).to.be.true;
        });

        it('should handle extended.hostedCleanMode', async () => {
            mockAdapterHelper.getStateNameById.returns('hostedCleanMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.hostedCleanMode', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('HostedCleanMode')).to.be.true;
        });

        it('should handle extended.cleanCount', async () => {
            mockAdapterHelper.getStateNameById.returns('cleanCount');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.cleanCount', { ack: false, val: 2 });
            expect(adapter.vacbot.run.calledWith('setCleanCount', 2)).to.be.true;
        });

        it('should handle extended.emptyDustBin', async () => {
            mockAdapterHelper.getStateNameById.returns('emptyDustBin');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.emptyDustBin', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EmptyDustBin')).to.be.true;
        });

        it('should handle history.triggerDustboxRemoved', async () => {
            mockAdapterHelper.getStateNameById.returns('triggerDustboxRemoved');
            mockAdapterHelper.getChannelNameById.returns('history');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.history.triggerDustboxRemoved', { ack: false, val: true });
            expect(adapter.setHistoryValuesForDustboxRemoval.called).to.be.true;
        });

        it('should handle info.currentSchedule_refresh', async () => {
            mockAdapterHelper.getStateNameById.returns('currentSchedule_refresh');
            mockAdapterHelper.getChannelNameById.returns('info');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.info.currentSchedule_refresh', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('GetSchedule')).to.be.true;
        });

        it('should handle cleaninglog.requestCleaningLog', async () => {
            mockAdapterHelper.getStateNameById.returns('requestCleaningLog');
            mockAdapterHelper.getChannelNameById.returns('cleaninglog');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.cleaninglog.requestCleaningLog', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('GetCleanLogs')).to.be.true;
        });

        it('should handle control.pause when paused', async () => {
            mockAdapterHelper.getStateNameById.returns('pause');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            adapter.getDevice().isPaused.returns(true);
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.pause', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('resume')).to.be.true;
        });

        it('should handle control.pause when not paused', async () => {
            mockAdapterHelper.getStateNameById.returns('pause');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            adapter.getDevice().isPaused.returns(false);
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.pause', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('pause')).to.be.true;
        });

        it('should handle control.playSoundId', async () => {
            mockAdapterHelper.getStateNameById.returns('playSoundId');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.playSoundId', { ack: false, val: 5 });
            expect(adapter.vacbot.run.calledWith('playSound', 5)).to.be.true;
        });

        it('should handle control.playIamHere', async () => {
            mockAdapterHelper.getStateNameById.returns('playIamHere');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.playIamHere', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('playSound', 30)).to.be.true;
        });

        it('should handle control.spotPurification', async () => {
            mockAdapterHelper.getStateNameById.returns('spotPurification');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.spotPurification', { ack: false, val: 'room1' });
            expect(adapter.vacbot.run.calledWith('spotPurification', 'room1')).to.be.true;
        });

        it('should handle control.edge', async () => {
            mockAdapterHelper.getStateNameById.returns('edge');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.edge', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('edge')).to.be.true;
        });

        it('should handle control.spot', async () => {
            mockAdapterHelper.getStateNameById.returns('spot');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.spot', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('spot')).to.be.true;
        });

        it('should handle control.stop', async () => {
            mockAdapterHelper.getStateNameById.returns('stop');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.stop', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('stop')).to.be.true;
            expect(adapter.commandQueue.resetQueue.called).to.be.true;
        });

        it('should handle control.charge', async () => {
            mockAdapterHelper.getStateNameById.returns('charge');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.charge', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('charge')).to.be.true;
        });

        it('should handle control.relocate', async () => {
            mockAdapterHelper.getStateNameById.returns('relocate');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.relocate', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('relocate')).to.be.true;
        });

        it('should handle control.basicPurification', async () => {
            mockAdapterHelper.getStateNameById.returns('basicPurification');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.basicPurification', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('basicPurification')).to.be.true;
        });

        it('should handle control.resume', async () => {
            mockAdapterHelper.getStateNameById.returns('resume');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.resume', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('resume')).to.be.true;
        });

        it('should handle control.playSound', async () => {
            mockAdapterHelper.getStateNameById.returns('playSound');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.playSound', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('playSound')).to.be.true;
        });

        it('should handle map.loadCurrentMapImage', async () => {
            mockAdapterHelper.getStateNameById.returns('loadCurrentMapImage');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.map.loadCurrentMapImage', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('GetMapImage', '1', 'outline')).to.be.true;
        });

        it('should handle map.loadMapImage', async () => {
            mockAdapterHelper.getStateNameById.returns('loadMapImage');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.map.123.loadMapImage', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('GetMapImage', '123', 'outline')).to.be.true;
        });

        it('should handle map.saveVirtualBoundary', async () => {
            mockAdapterHelper.getStateNameById.returns('saveVirtualBoundary');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.map.1.virtualBoundaries.5.saveVirtualBoundary', { ack: false, val: true });
            expect(mockMapHelper.saveVirtualBoundary.called).to.be.true;
        });

        it('should handle map.deleteVirtualBoundary', async () => {
            mockAdapterHelper.getStateNameById.returns('deleteVirtualBoundary');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.map.1.virtualBoundaries.5.deleteVirtualBoundary', { ack: false, val: true });
            expect(mockMapHelper.deleteVirtualBoundary.called).to.be.true;
        });

        it('should handle map.saveVirtualBoundarySet', async () => {
            mockAdapterHelper.getStateNameById.returns('saveVirtualBoundarySet');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.map.1.spotAreas.5.saveVirtualBoundarySet', { ack: false, val: true });
            expect(mockMapHelper.saveVirtualBoundarySet.called).to.be.true;
        });

        it('should handle control.extended.autoBoostSuction', async () => {
            mockAdapterHelper.getStateNameById.returns('autoBoostSuction');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.autoBoostSuction', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EnableCarpetPressure')).to.be.true;
        });

        it('should handle control.extended.cleanPreference', async () => {
            mockAdapterHelper.getStateNameById.returns('cleanPreference');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.cleanPreference', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EnableCleanPreference')).to.be.true;
        });

        it('should handle control.extended.edgeDeepCleaning', async () => {
            mockAdapterHelper.getStateNameById.returns('edgeDeepCleaning');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.edgeDeepCleaning', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EnableBorderSpin')).to.be.true;
        });

        it('should handle control.extended.mopOnlyMode', async () => {
            mockAdapterHelper.getStateNameById.returns('mopOnlyMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.mopOnlyMode', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('EnableMopOnlyMode')).to.be.true;
        });

        it('should handle control.extended.airDryingDuration', async () => {
            mockAdapterHelper.getStateNameById.returns('airDryingDuration');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.airDryingDuration', { ack: false, val: 120 });
            expect(adapter.vacbot.run.calledWith('SetDryingDuration', 120)).to.be.true;
        });

        it('should handle control.extended.cleaningMode', async () => {
            mockAdapterHelper.getStateNameById.returns('cleaningMode');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.cleaningMode', { ack: false, val: 'auto' });
            expect(adapter.vacbot.run.calledWith('SetWorkMode', 'auto')).to.be.true;
        });

        it('should handle control.extended.carpetCleaningStrategy', async () => {
            mockAdapterHelper.getStateNameById.returns('carpetCleaningStrategy');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.carpetCleaningStrategy', { ack: false, val: 'avoid' });
            expect(adapter.vacbot.run.calledWith('SetCarpetInfo', 'avoid')).to.be.true;
        });

        it('should handle control.extended.cleaningClothReminder', async () => {
            mockAdapterHelper.getStateNameById.returns('cleaningClothReminder');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            adapter.cleaningClothReminder = { enabled: false, period: 30 };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.cleaningClothReminder', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('SetDusterRemind', 1, 30)).to.be.true;
        });

        it('should handle control.extended.cleaningClothReminder_period', async () => {
            mockAdapterHelper.getStateNameById.returns('cleaningClothReminder_period');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            adapter.cleaningClothReminder = { enabled: true, period: 30 };
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.cleaningClothReminder_period', { ack: false, val: 60 });
            expect(adapter.vacbot.run.calledWith('SetDusterRemind', 1, 60)).to.be.true;
        });

        it('should handle control.extended.voiceAssistant', async () => {
            mockAdapterHelper.getStateNameById.returns('voiceAssistant');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.voiceAssistant', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('SetVoiceAssistantState', 1)).to.be.true;
        });

        it('should handle control.extended.bluetoothSpeaker', async () => {
            mockAdapterHelper.getStateNameById.returns('bluetoothSpeaker');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.bluetoothSpeaker', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('SetBlueSpeaker', 1)).to.be.true;
        });

        it('should handle control.extended.microphone', async () => {
            mockAdapterHelper.getStateNameById.returns('microphone');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.microphone', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('SetMic', 1)).to.be.true;
        });

        it('should handle control.extended.voiceReport', async () => {
            mockAdapterHelper.getStateNameById.returns('voiceReport');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.voiceReport', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('SetVoiceSimple', 1)).to.be.true;
        });

        it('should handle control.extended.atmoVolume', async () => {
            mockAdapterHelper.getStateNameById.returns('atmoVolume');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.atmoVolume', { ack: false, val: 8 });
            expect(adapter.vacbot.run.calledWith('SetAtmoVolume', 8)).to.be.true;
        });

        it('should handle control.extended.atmoLight', async () => {
            mockAdapterHelper.getStateNameById.returns('atmoLight');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.atmoLight', { ack: false, val: 2 });
            expect(adapter.vacbot.run.calledWith('SetAtmoLight', 2)).to.be.true;
        });

        it('should handle control.spotArea buttons', async () => {
            mockAdapterHelper.getStateNameById.returns('spotArea_1');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.spotArea_1', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('spotArea', 'start', '1')).to.be.true;
        });

        it('should not process when not connected', async () => {
            adapter.connected = false;
            mockAdapterHelper.getStateNameById.returns('clean');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.clean', { ack: false, val: true });
            expect(adapter.vacbot.run.called).to.be.false;
        });

        it('should handle history channel without processing commands', async () => {
            mockAdapterHelper.getStateNameById.returns('someHistory');
            mockAdapterHelper.getChannelNameById.returns('history');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.history.someHistory', { ack: false, val: true });
        });

        it('should handle control.customArea_cleanings', async () => {
            mockAdapterHelper.getStateNameById.returns('customArea_cleanings');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.customArea_cleanings', { ack: false, val: 3 });
            expect(adapter.customAreaCleanings).to.equal(3);
        });

        it('should handle control.spotArea_cleanings', async () => {
            mockAdapterHelper.getStateNameById.returns('spotArea_cleanings');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.spotArea_cleanings', { ack: false, val: 3 });
            expect(adapter.spotAreaCleanings).to.equal(3);
        });

        it('should handle extended.pauseBeforeDockingChargingStation', async () => {
            mockAdapterHelper.getStateNameById.returns('pauseBeforeDockingChargingStation');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.pauseBeforeDockingChargingStation', { ack: false, val: true });
            expect(adapter.pauseBeforeDockingChargingStation).to.equal(true);
        });

        it('should handle extended.pauseBeforeDockingIfWaterboxInstalled', async () => {
            mockAdapterHelper.getStateNameById.returns('pauseBeforeDockingIfWaterboxInstalled');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.pauseBeforeDockingIfWaterboxInstalled', { ack: false, val: true });
            expect(adapter.pauseBeforeDockingIfWaterboxInstalled).to.equal(true);
        });

        it('should handle extended.resetCleanSpeedToStandardOnReturn', async () => {
            mockAdapterHelper.getStateNameById.returns('resetCleanSpeedToStandardOnReturn');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.resetCleanSpeedToStandardOnReturn', { ack: false, val: true });
            expect(adapter.resetCleanSpeedToStandardOnReturn).to.equal(true);
        });

        it('should handle extended.pauseWhenLeavingSpotArea', async () => {
            mockAdapterHelper.getStateNameById.returns('pauseWhenLeavingSpotArea');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('extended');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.pauseWhenLeavingSpotArea', { ack: false, val: '3' });
            expect(adapter.pauseWhenLeavingSpotArea).to.equal('3');
        });

        it('should handle map.savedBoundarySets', async () => {
            mockAdapterHelper.getStateNameById.returns('someBoundarySet');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('savedBoundarySets');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.map.savedBoundarySets.virtualBoundarySet_123', { ack: false, val: true });
            expect(mockMapHelper.createVirtualBoundarySet.called).to.be.true;
        });

        it('should handle map.savedBoundaries', async () => {
            mockAdapterHelper.getStateNameById.returns('someBoundary');
            mockAdapterHelper.getChannelNameById.returns('map');
            mockAdapterHelper.getSubChannelNameById.returns('savedBoundaries');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.map.savedBoundaries.virtualBoundary_123', { ack: false, val: true });
            expect(mockMapHelper.createVirtualBoundary.called).to.be.true;
        });

        it('should handle control.waterLevel_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('waterLevel_reset');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            adapter.getChannelsOfAsync = sinon.stub().resolves([
                { _id: 'adapter.0.map.1.spotAreas.1' }
            ]);
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.waterLevel_reset', { ack: false, val: true });
            expect(adapter.setStateConditional.called).to.be.true;
        });

        it('should handle control.cleanSpeed_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('cleanSpeed_reset');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            adapter.getChannelsOfAsync = sinon.stub().resolves([
                { _id: 'adapter.0.map.1.spotAreas.1' }
            ]);
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.cleanSpeed_reset', { ack: false, val: true });
            expect(adapter.setStateConditional.called).to.be.true;
        });

        it('should handle map.deebotPosition savedGoToPositionValues', async () => {
            mockAdapterHelper.getStateNameById.returns('someGoTo');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('savedGoToPositionValues');
            adapter.getObjectAsync = sinon.stub().resolves({ native: { goToPositionValues: '100,200' } });
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.extended.savedGoToPositionValues.goToPosition_123', { ack: false, val: true });
            expect(adapter.vacbot.run.called).to.be.true;
        });

        it('should handle consumable side_brush_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('side_brush_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.consumable.side_brush_reset', { ack: false, val: true });
            expect(adapter.commandQueue.add.calledWith('ResetLifeSpan', 'side_brush')).to.be.true;
        });

        it('should handle consumable unit_care_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('unit_care_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.consumable.unit_care_reset', { ack: false, val: true });
            expect(adapter.commandQueue.add.calledWith('ResetLifeSpan', 'unit_care')).to.be.true;
        });

        it('should handle consumable round_mop_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('round_mop_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.consumable.round_mop_reset', { ack: false, val: true });
            expect(adapter.commandQueue.add.calledWith('ResetLifeSpan', 'round_mop')).to.be.true;
        });

        it('should handle consumable airFreshener_reset', async () => {
            mockAdapterHelper.getStateNameById.returns('airFreshener_reset');
            mockAdapterHelper.getChannelNameById.returns('consumable');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.consumable.airFreshener_reset', { ack: false, val: true });
            expect(adapter.commandQueue.add.calledWith('ResetLifeSpan', 'air_freshener')).to.be.true;
        });

        it('should handle control.clean with V2 enabled', async () => {
            mockAdapterHelper.getStateNameById.returns('clean');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            adapter.getDevice().useV2commands.returns(true);
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.clean', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('clean_V2')).to.be.true;
        });

        it('should handle control.mobilePurification', async () => {
            mockAdapterHelper.getStateNameById.returns('mobilePurification');
            mockAdapterHelper.getChannelNameById.returns('control');
            mockAdapterHelper.getSubChannelNameById.returns('');
            await adapterCommands.handleStateChange(adapter, 'ecovacs-deebot.0.control.mobilePurification', { ack: false, val: true });
            expect(adapter.vacbot.run.calledWith('mobilePurification')).to.be.true;
        });
    });
});
