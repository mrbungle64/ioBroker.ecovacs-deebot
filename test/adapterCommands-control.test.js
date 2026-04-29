'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockAdapter, createMockCtx } = require('./mockHelper');

// Import the REAL adapterHelper to use its actual path-parsing functions
const realAdapterHelper = require('../lib/adapterHelper');

/**
 * Create a mock adapterHelper that delegates getChannelNameById,
 * getSubChannelNameById, and getStateNameById to the REAL adapterHelper
 * functions, while stubbing side-effect methods like getUnixTimestamp.
 *
 * This is the critical difference from other test files: the existing tests
 * stub ALL helper methods, which means they never test that the subPath
 * is correctly resolved. The bug we fixed was that getChannelNameById
 * returned undefined for subPaths like 'control.clean' because it expected
 * the device ID prefix (e.g. 'test_device.control.clean') but received
 * the bare subPath.
 *
 * With the fix, handleStateChange now computes helperId = ctx.deviceId + '.' + id
 * before calling getChannelNameById/getSubChannelNameById. These tests verify
 * that integration end-to-end.
 */
const mockAdapterHelper = Object.assign({}, realAdapterHelper, {
    // Stub time to keep tests deterministic
    getUnixTimestamp: sinon.stub().returns(1234567890),
    // Stub status resolution (not the focus of these tests)
    getDeviceStatusByStatus: sinon.stub().returns('idle'),
    isSingleSpotAreaValue: sinon.stub().returns(false),
    areaValueStringWithCleaningsIsValid: sinon.stub().returns(false),
    areaValueStringIsValid: sinon.stub().returns(false),
    positionValueStringIsValid: sinon.stub().returns(false)
});

const mockMapHelper = {
    saveCurrentSpotAreaValues: sinon.stub().resolves(),
    saveLastUsedCustomAreaValues: sinon.stub().resolves(),
    saveVirtualBoundary: sinon.stub().resolves(),
    saveVirtualBoundarySet: sinon.stub().resolves(),
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

describe('adapterCommands.js - control command dispatch with real path resolution', () => {
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
            currentSpotAreaID: '2'
        });
        // Ensure commandQueue and cleaningQueue have required stubs
        ctx.commandQueue.addGetLifespan = sinon.stub();
        ctx.commandQueue.runAll = sinon.stub();
        ctx.cleaningQueue.run = sinon.stub();

        // Reset all stub histories
        Object.values(mockMapHelper).forEach(stub => {
            if (stub.resetHistory) stub.resetHistory();
        });
        mockAdapterHelper.getUnixTimestamp.resetHistory();
        mockAdapterHelper.getDeviceStatusByStatus.resetHistory();
    });

    // ======================================================================
    // Tests verifying that the REAL getChannelNameById works correctly
    // with the helperId reconstruction (ctx.deviceId + '.' + id) in handleStateChange
    // ======================================================================

    describe('path resolution with real adapterHelper functions', () => {
        it('should dispatch clean command via real path resolution', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', state);

            expect(ctx.vacbot.run.calledWith('clean')).to.be.true;
            expect(ctx.adapter.log.info.calledWith('Run: clean')).to.be.true;
        });

        it('should dispatch stop command via real path resolution', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.stop', state);

            expect(ctx.vacbot.run.calledWith('stop')).to.be.true;
            expect(ctx.commandQueue.resetQueue.called).to.be.true;
        });

        it('should dispatch charge command via real path resolution', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.charge', state);

            expect(ctx.vacbot.run.calledWith('charge')).to.be.true;
            expect(ctx.commandQueue.resetQueue.called).to.be.true;
        });

        it('should dispatch pause command via real path resolution', async () => {
            ctx.getDevice().isPaused.returns(false);
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.pause', state);

            expect(ctx.vacbot.run.calledWith('pause')).to.be.true;
        });

        it('should dispatch pause as resume when already paused', async () => {
            ctx.getDevice().isPaused.returns(true);
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.pause', state);

            expect(ctx.vacbot.run.calledWith('resume')).to.be.true;
        });

        it('should dispatch playSound command via real path resolution', async () => {
            // The button reset code calls getObject, we need to provide a button role
            adapter.getObject.callsArgWith(1, null, { common: { role: 'button' } });

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.playSound', state);

            expect(ctx.vacbot.run.calledWith('playSound')).to.be.true;
            expect(ctx.adapter.log.info.calledWith('Run: playSound')).to.be.true;
        });

        it('should dispatch playIamHere command via real path resolution', async () => {
            adapter.getObject.callsArgWith(1, null, { common: { role: 'button' } });

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.playIamHere', state);

            expect(ctx.vacbot.run.calledWith('playSound', 30)).to.be.true;
            expect(ctx.adapter.log.info.calledWith('Run: playIamHere')).to.be.true;
        });

        it('should dispatch resume command via real path resolution', async () => {
            adapter.getObject.callsArgWith(1, null, { common: { role: 'button' } });

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.resume', state);

            expect(ctx.vacbot.run.calledWith('resume')).to.be.true;
        });

        it('should dispatch edge command via real path resolution', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.edge', state);

            expect(ctx.vacbot.run.calledWith('edge')).to.be.true;
        });

        it('should dispatch spot command via real path resolution', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.spot', state);

            expect(ctx.vacbot.run.calledWith('spot')).to.be.true;
        });

        it('should dispatch relocate command via real path resolution', async () => {
            adapter.getObject.callsArgWith(1, null, { common: { role: 'button' } });

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.relocate', state);

            expect(ctx.vacbot.run.calledWith('relocate')).to.be.true;
        });

        it('should dispatch waterLevel command via real path resolution', async () => {
            const state = { ack: false, val: 3 };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.waterLevel', state);

            expect(ctx.vacbot.run.calledWith('SetWaterLevel', 3)).to.be.true;
        });

        it('should dispatch cleanSpeed command via real path resolution', async () => {
            ctx.getModel().isModelTypeAirbot.returns(false);
            const state = { ack: false, val: 2 };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.cleanSpeed', state);

            expect(ctx.vacbot.run.calledWith('SetCleanSpeed', 2)).to.be.true;
        });

        it('should dispatch clean_home as clean when device is idle', async () => {
            ctx.getDevice().status = 'idle';
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean_home', state);

            expect(ctx.vacbot.run.calledWith('clean')).to.be.true;
        });

        it('should dispatch clean_home as charge when device is cleaning', async () => {
            ctx.getDevice().status = 'cleaning';
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean_home', state);

            expect(ctx.vacbot.run.calledWith('charge')).to.be.true;
        });

        it('should dispatch clean_home as resume when device is paused', async () => {
            ctx.getDevice().status = 'paused';
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean_home', state);

            expect(ctx.vacbot.run.calledWith('resume')).to.be.true;
        });

        it('should warn on clean_home when device is in error state', async () => {
            ctx.getDevice().status = 'error';
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean_home', state);

            expect(ctx.vacbot.run.called).to.be.false;
            expect(ctx.adapter.log.warn.calledWith('Please check bot for errors')).to.be.true;
        });
    });

    // ======================================================================
    // Extended control paths (control.extended.*)
    // ======================================================================

    describe('extended control with real path resolution', () => {
        it('should dispatch volume command via real path resolution', async () => {
            const state = { ack: false, val: 5 };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.volume', state);

            expect(ctx.vacbot.run.calledWith('SetVolume', 5)).to.be.true;
        });

        it('should dispatch advancedMode enable command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.advancedMode', state);

            expect(ctx.vacbot.run.calledWith('EnableAdvancedMode')).to.be.true;
        });

        it('should dispatch advancedMode disable command', async () => {
            const state = { ack: false, val: false };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.advancedMode', state);

            expect(ctx.vacbot.run.calledWith('DisableAdvancedMode')).to.be.true;
        });

        it('should dispatch autoBoostSuction enable command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.autoBoostSuction', state);

            expect(ctx.vacbot.run.calledWith('EnableCarpetPressure')).to.be.true;
        });

        it('should dispatch autoBoostSuction disable command', async () => {
            const state = { ack: false, val: false };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.autoBoostSuction', state);

            expect(ctx.vacbot.run.calledWith('DisableCarpetPressure')).to.be.true;
        });

        it('should dispatch edgeDeepCleaning enable command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.edgeDeepCleaning', state);

            expect(ctx.vacbot.run.calledWith('EnableBorderSpin')).to.be.true;
        });

        it('should dispatch edgeDeepCleaning disable command', async () => {
            const state = { ack: false, val: false };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.edgeDeepCleaning', state);

            expect(ctx.vacbot.run.calledWith('DisableBorderSpin')).to.be.true;
        });

        it('should dispatch voiceAssistant enable command (value=true)', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.voiceAssistant', state);

            expect(ctx.vacbot.run.calledWith('SetVoiceAssistantState', 1)).to.be.true;
        });

        it('should dispatch voiceAssistant disable command (value=false)', async () => {
            const state = { ack: false, val: false };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.voiceAssistant', state);

            expect(ctx.vacbot.run.calledWith('SetVoiceAssistantState', 0)).to.be.true;
        });
    });

    // ======================================================================
    // Move commands (control.move.*)
    // ======================================================================

    describe('move commands with real path resolution', () => {
        it('should dispatch move.forward command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.move.forward', state);

            expect(ctx.vacbot.run.calledWith('moveforward')).to.be.true;
        });

        it('should dispatch move.left command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.move.left', state);

            expect(ctx.vacbot.run.calledWith('moveleft')).to.be.true;
        });

        it('should dispatch move.right command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.move.right', state);

            expect(ctx.vacbot.run.calledWith('moveright')).to.be.true;
        });

        it('should dispatch move.backward command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.move.backward', state);

            expect(ctx.vacbot.run.calledWith('movebackward')).to.be.true;
        });

        it('should dispatch move.turnAround command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.move.turnAround', state);

            expect(ctx.vacbot.run.calledWith('moveturnAround')).to.be.true;
        });
    });

    // ======================================================================
    // OTA commands (control.ota.autoUpdate)
    // ======================================================================

    describe('OTA commands with real path resolution', () => {
        it('should dispatch OTA autoUpdate enable', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.ota.autoUpdate', state);

            expect(ctx.vacbot.run.calledWith('SetOta', true)).to.be.true;
        });

        it('should dispatch OTA autoUpdate disable', async () => {
            const state = { ack: false, val: false };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.ota.autoUpdate', state);

            expect(ctx.vacbot.run.calledWith('SetOta', false)).to.be.true;
        });
    });

    // ======================================================================
    // Consumable commands
    // ======================================================================

    describe('consumable commands with real path resolution', () => {
        it('should dispatch main_brush_reset command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'consumable.main_brush_reset', state);

            expect(ctx.commandQueue.add.calledWith('ResetLifeSpan', 'main_brush')).to.be.true;
        });

        it('should dispatch side_brush_reset command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'consumable.side_brush_reset', state);

            expect(ctx.commandQueue.add.calledWith('ResetLifeSpan', 'side_brush')).to.be.true;
        });

        it('should dispatch filter_reset command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'consumable.filter_reset', state);

            expect(ctx.commandQueue.add.calledWith('ResetLifeSpan', 'filter')).to.be.true;
        });
    });

    // ======================================================================
    // History and info commands
    // ======================================================================

    describe('history and info commands with real path resolution', () => {
        it('should dispatch triggerDustboxRemoved command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'history.triggerDustboxRemoved', state);

            expect(adapter.setHistoryValuesForDustboxRemoval.called).to.be.true;
        });

        it('should dispatch currentSchedule_refresh command', async () => {
            ctx.getDevice().useV2commands.returns(false);
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'info.currentSchedule_refresh', state);

            expect(ctx.vacbot.run.calledWith('GetSchedule')).to.be.true;
        });

        it('should dispatch cleaning log request command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'cleaninglog.requestCleaningLog', state);

            expect(ctx.vacbot.run.calledWith('GetCleanLogs')).to.be.true;
        });
    });

    // ======================================================================
    // Generic command handling
    // ======================================================================

    describe('genericCommand with real path resolution', () => {
        it('should dispatch generic command run', async () => {
            ctx.adapterProxy.getStateAsync
                .withArgs('control.extended.genericCommand.command')
                .resolves({ val: 'GetStats' });
            ctx.adapterProxy.getStateAsync
                .withArgs('control.extended.genericCommand.payload')
                .resolves({ val: '' });

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.genericCommand.run', state);

            expect(ctx.vacbot.run.calledWith('Generic', 'GetStats')).to.be.true;
        });

        it('should dispatch generic command run with JSON payload', async () => {
            ctx.adapterProxy.getStateAsync
                .withArgs('control.extended.genericCommand.command')
                .resolves({ val: 'SetStats' });
            ctx.adapterProxy.getStateAsync
                .withArgs('control.extended.genericCommand.payload')
                .resolves({ val: '{"key":"value"}' });

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.extended.genericCommand.run', state);

            expect(ctx.vacbot.run.calledWith('Generic', 'SetStats', { key: 'value' })).to.be.true;
        });
    });

    // ======================================================================
    // Edge cases and connection states
    // ======================================================================

    describe('edge cases with real path resolution', () => {
        it('should not dispatch any command when not connected', async () => {
            ctx.connected = false;
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', state);

            expect(ctx.vacbot.run.called).to.be.false;
        });

        it('should not dispatch command for acknowledged (read-only) state changes', async () => {
            const state = { ack: true, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', state);

            expect(ctx.vacbot.run.called).to.be.false;
        });

        it('should handle customArea_cleanings storage', async () => {
            const state = { ack: false, val: 3 };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.customArea_cleanings', state);

            expect(ctx.customAreaCleanings).to.equal(3);
            expect(ctx.vacbot.run.called).to.be.false;
        });

        it('should handle spotArea_cleanings storage', async () => {
            const state = { ack: false, val: 3 };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.spotArea_cleanings', state);

            expect(ctx.spotAreaCleanings).to.equal(3);
            expect(ctx.vacbot.run.called).to.be.false;
        });

        it('should set history timestamp and date on state change', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.edge', state);

            expect(ctx.adapterProxy.setStateConditional.calledWith('history.timestampOfLastStateChange', 1234567890, true)).to.be.true;
            expect(ctx.adapterProxy.setStateConditional.calledWith('history.dateOfLastStateChange', '2023.01.01 12:00:00', true)).to.be.true;
        });

        it('should not set history timestamps for history channel changes', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'history.someHistory', state);

            expect(ctx.adapterProxy.setStateConditional.calledWith('history.timestampOfLastStateChange', sinon.match.number, true)).to.be.false;
        });

        it('should reset button state for button-role objects', async () => {
            adapter.getObject.callsArgWith(1, null, { common: { role: 'button' } });

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.playSound', state);

            expect(ctx.adapterProxy.setStateConditional.calledWith('control.playSound', false, true)).to.be.true;
        });

        it('should not reset state for non-button role objects', async () => {
            adapter.getObject.callsArgWith(1, null, { common: { role: 'level' } });

            const state = { ack: false, val: 3 };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.waterLevel', state);

            expect(ctx.adapterProxy.setStateConditional.calledWith('control.waterLevel', false, true)).to.be.false;
        });
    });

    // ======================================================================
    // Spot area button pattern (control.spotArea_N)
    // ======================================================================

    describe('spotArea buttons with real path resolution', () => {
        it('should dispatch spotArea_1 button command', async () => {
            adapter.clearGoToPosition = sinon.stub();
            ctx.getDevice().useV2commands.returns(false);
            ctx.deebotPositionIsInvalid = false;

            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.spotArea_1', state);

            expect(ctx.vacbot.run.calledWith('spotArea', 'start', '1')).to.be.true;
        });
    });

    // ======================================================================
    // Airbot purification commands (control.basicPurification etc.)
    // ======================================================================

    describe('airbot purification commands with real path resolution', () => {
        it('should dispatch basicPurification command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.basicPurification', state);

            expect(ctx.vacbot.run.calledWith('basicPurification')).to.be.true;
        });

        it('should dispatch mobilePurification command', async () => {
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.mobilePurification', state);

            expect(ctx.vacbot.run.calledWith('mobilePurification')).to.be.true;
        });

        it('should dispatch spotPurification command with value', async () => {
            const state = { ack: false, val: 'room1' };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.spotPurification', state);

            expect(ctx.vacbot.run.calledWith('spotPurification', 'room1')).to.be.true;
        });
    });

    // ======================================================================
    // PlaySoundId command (control.playSoundId)
    // ======================================================================

    describe('playSoundId command with real path resolution', () => {
        it('should dispatch playSoundId command with the given id', async () => {
            adapter.getObject.callsArgWith(1, null, { common: { role: 'button' } });

            const state = { ack: false, val: 7 };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.playSoundId', state);

            expect(ctx.vacbot.run.calledWith('playSound', 7)).to.be.true;
        });
    });

    // ======================================================================
    // Clean with V2 commands
    // ======================================================================

    describe('V2 command variation with real path resolution', () => {
        it('should dispatch clean_V2 command when V2 is enabled', async () => {
            ctx.getDevice().useV2commands.returns(true);
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', state);

            expect(ctx.vacbot.run.calledWith('clean_V2')).to.be.true;
        });

        it('should dispatch clean command when V2 is disabled', async () => {
            ctx.getDevice().useV2commands.returns(false);
            const state = { ack: false, val: true };
            await adapterCommands.handleStateChange(adapter, ctx, 'control.clean', state);

            expect(ctx.vacbot.run.calledWith('clean')).to.be.true;
        });
    });
});
