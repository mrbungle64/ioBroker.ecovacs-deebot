'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');

const Queue = require('../lib/adapterQueue');
const { createMockCtx } = require('./mockHelper');

describe('adapterQueue.js', () => {
    let ctx;
    let queue;

    beforeEach(() => {
        ctx = createMockCtx({
            vacbot: {
                run: sinon.stub(),
                hasMoppingSystem: sinon.stub().returns(false),
                hasMainBrush: sinon.stub().returns(true),
                hasUnitCareInfo: sinon.stub().returns(false),
                hasRoundMopInfo: sinon.stub().returns(false),
                hasVacuumPowerAdjustment: sinon.stub().returns(false),
                getDeviceProperty: sinon.stub().returns(false)
            },
            _model: undefined, // use default model from mockHelper
            _device: undefined  // use default device from mockHelper
        });

        // Override specific model behaviors for our default test scenario
        ctx.getModel().isNot950type.returns(true);
        ctx.getModel().is950type.returns(false);
        ctx.getModel().is950type_V2.returns(false);
        ctx.getModel().isNot950type_V2.returns(true);
        ctx.getModel().isMappingSupported.returns(true);
        ctx.getModel().hasAirDrying.returns(false);
        ctx.getModel().isModelTypeAirbot.returns(false);
        ctx.getModel().isModelTypeX1.returns(false);
        ctx.getModel().isModelTypeX2.returns(false);
        ctx.getModel().isModelTypeT20.returns(false);
        ctx.getModel().hasAdvancedMode.returns(false);
        ctx.getModel().isSupportedFeature.returns(true);
        ctx.getModel().vacbot.getDeviceProperty.returns(false);

        // Set the ctx-level model type to 'deebot' for default tests
        ctx.getModelType.returns('deebot');

        // Set up device mock to return useV2commands false by default
        ctx.getDevice().useV2commands.returns(false);

        // Set ctx properties used by Queue
        ctx.spotAreaCleanings = 1;
        ctx.cleaningLogAcknowledged = false;
        ctx.silentApproach = { mapSpotAreaID: null };

        // Set adapter-level properties used by addAdditionalGetCommands
        ctx.adapter.currentSpotAreaID = 'unknown';
        ctx.adapter.getDevice = sinon.stub().returns({ isCleaning: sinon.stub().returns(false) });

        queue = new Queue(ctx);
    });

    describe('Constructor', () => {
        it('should initialize with empty entries array', () => {
            expect(queue.entries).to.be.an('array');
            expect(queue.entries).to.have.length(0);
            expect(queue.adapter).to.equal(ctx.adapter);
            expect(queue.ctx).to.equal(ctx);
            expect(queue.name).to.equal('queue');
            expect(queue.timeoutValue).to.equal(250);
            expect(queue.duplicateCheck).to.be.true;
        });

        it('should allow custom name, timeout, and duplicateCheck', () => {
            const q2 = new Queue(ctx, 'myQueue', 500, false);
            expect(q2.name).to.equal('myQueue');
            expect(q2.timeoutValue).to.equal(500);
            expect(q2.duplicateCheck).to.be.false;
        });
    });

    describe('add()', () => {
        it('should add commands to entries', () => {
            queue.add('GetBatteryInfo');
            expect(queue.entries).to.have.length(1);
            expect(queue.entries[0].cmd).to.equal('GetBatteryInfo');
            expect(queue.entries[0].arg1).to.equal('');
        });

        it('should add commands with arguments', () => {
            queue.add('GetLifeSpan', 'main_brush');
            expect(queue.entries).to.have.length(1);
            expect(queue.entries[0].cmd).to.equal('GetLifeSpan');
            expect(queue.entries[0].arg1).to.equal('main_brush');
        });

        it('should skip duplicates when duplicateCheck is enabled', () => {
            queue.add('GetBatteryInfo');
            queue.add('GetBatteryInfo');
            expect(queue.entries).to.have.length(1);
            expect(ctx.adapter.log.silly.called).to.be.true;
        });

        it('should allow duplicates when duplicateCheck is disabled', () => {
            const q2 = new Queue(ctx, 'queue', 250, false);
            q2.add('GetBatteryInfo');
            q2.add('GetBatteryInfo');
            expect(q2.entries).to.have.length(2);
        });
    });

    describe('createMultipleCleaningsForSpotArea()', () => {
        it('should create multiple cleaning entries for spotArea', () => {
            // Disable duplicateCheck so all iterations are recorded
            queue.duplicateCheck = false;
            ctx.spotAreaCleanings = 3;
            queue.createMultipleCleaningsForSpotArea('control', 'spotArea', '0');
            expect(queue.entries).to.have.length(2); // starts at 2 up to 3
            expect(queue.entries[0].cmd).to.equal('spotArea');
            expect(queue.entries[0].arg1).to.equal('start');
            expect(queue.entries[0].arg2).to.equal('0');
        });

        it('should reset queue before creating entries', () => {
            queue.add('GetBatteryInfo');
            ctx.spotAreaCleanings = 2;
            queue.createMultipleCleaningsForSpotArea('control', 'spotArea', '1');
            expect(queue.entries).to.have.length(1);
        });
    });

    describe('addInitialGetCommands()', () => {
        it('should add basic commands for deebot model', () => {
            queue.addInitialGetCommands();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetNetInfo');
            expect(cmds).to.include('GetBatteryState');
            expect(cmds).to.include('GetChargeState');
            expect(cmds).to.include('GetPosition');
            expect(cmds).to.include('GetChargerPos');
            expect(cmds).to.include('GetMaps');
        });

        it('should add aqMonitor commands', () => {
            ctx.getModelType.returns('aqMonitor');
            queue.addInitialGetCommands();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetJCYAirQuality');
            expect(cmds).to.not.include('GetBatteryState');
        });

        it('should add airbot commands', () => {
            ctx.getModelType.returns('airbot');
            ctx.getModel().isModelTypeAirbot.returns(true);
            queue.addInitialGetCommands();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetAirQuality');
            expect(cmds).to.include('GetThreeModuleStatus');
            expect(cmds).to.include('GetAtmoVolume');
        });

        it('should add GetOta command when OTA is supported', () => {
            ctx.getModel().hasOtaSupport.returns(true);
            queue.addInitialGetCommands();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetOta');
        });

        it('should not add GetOta command when OTA is not supported', () => {
            ctx.getModel().hasOtaSupport.returns(false);
            queue.addInitialGetCommands();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.not.include('GetOta');
        });
    });

    describe('addStandardGetCommands()', () => {
        it('should add standard get commands', () => {
            queue.addStandardGetCommands();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetSleepStatus');
            expect(cmds).to.include('GetCleanSum');
            expect(cmds).to.include('GetTrueDetect');
            expect(cmds).to.include('GetAutoEmpty');
        });

        it('should add aqMonitor commands only', () => {
            ctx.getModelType.returns('aqMonitor');
            queue.addStandardGetCommands();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetJCYAirQuality');
            expect(cmds).to.not.include('GetSleepStatus');
        });
    });

    describe('addGetCleanLogs()', () => {
        it('should add clean log commands', () => {
            queue.addGetCleanLogs();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetCleanSum');
            expect(cmds).to.include('GetCleanLogs');
        });
    });

    describe('addGetLifespan()', () => {
        it('should add lifespan commands for deebot', () => {
            queue.addGetLifespan();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetLifeSpan');
        });

        it('should add only one lifespan command for airbot', () => {
            ctx.getModelType.returns('airbot');
            queue.addGetLifespan();
            const entries = queue.entries.filter(e => e.cmd === 'GetLifeSpan');
            expect(entries).to.have.length(1);
            expect(entries[0].arg1).to.equal('');
        });

        it('should skip lifespan for goat', () => {
            ctx.getModelType.returns('goat');
            queue.addGetLifespan();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.not.include('GetLifeSpan');
        });
    });

    describe('run()', () => {
        it('should add command and call runAll', () => {
            const stub = sinon.stub(queue, 'runAll');
            queue.run('GetBatteryInfo');
            expect(queue.entries).to.have.length(1);
            expect(stub.calledOnce).to.be.true;
            stub.restore();
        });
    });

    describe('startNextItemFromQueue()', () => {
        it('should call vacbot.run with no args', () => {
            queue.add('GetBatteryInfo');
            queue.startNextItemFromQueue();
            expect(ctx.vacbot.run.calledOnce).to.be.true;
            expect(ctx.vacbot.run.firstCall.args[0]).to.equal('GetBatteryInfo');
            expect(queue.entries).to.have.length(0);
        });

        it('should call vacbot.run with one arg', () => {
            queue.add('GetLifeSpan', 'main_brush');
            queue.startNextItemFromQueue();
            expect(ctx.vacbot.run.calledOnce).to.be.true;
            expect(ctx.vacbot.run.firstCall.args).to.deep.equal(['GetLifeSpan', 'main_brush']);
        });

        it('should call vacbot.run with two args', () => {
            queue.add('Cmd', 'arg1', 'arg2');
            queue.startNextItemFromQueue();
            expect(ctx.vacbot.run.firstCall.args).to.deep.equal(['Cmd', 'arg1', 'arg2']);
        });

        it('should call vacbot.run with three args', () => {
            queue.add('Cmd', 'arg1', 'arg2', 'arg3');
            queue.startNextItemFromQueue();
            expect(ctx.vacbot.run.firstCall.args).to.deep.equal(['Cmd', 'arg1', 'arg2', 'arg3']);
        });

        it('should skip GetMaps when silent approach is active', () => {
            ctx.silentApproach.mapSpotAreaID = '0';
            queue.add('GetMaps');
            queue.startNextItemFromQueue();
            expect(ctx.vacbot.run.called).to.be.false;
            expect(queue.entries).to.have.length(0);
        });

        it('should not schedule next when runAll is false', () => {
            queue.add('GetBatteryInfo');
            queue.startNextItemFromQueue(false);
            expect(ctx.vacbot.run.calledOnce).to.be.true;
        });
    });

    describe('isEmpty() and notEmpty()', () => {
        it('should return true when empty', () => {
            expect(queue.isEmpty()).to.be.true;
            expect(queue.notEmpty()).to.be.false;
        });

        it('should return false when not empty', () => {
            queue.add('GetBatteryInfo');
            expect(queue.isEmpty()).to.be.false;
            expect(queue.notEmpty()).to.be.true;
        });
    });

    describe('resetQueue()', () => {
        it('should clear all entries', () => {
            queue.add('GetBatteryInfo');
            queue.add('GetChargeState');
            expect(queue.entries).to.have.length(2);
            queue.resetQueue();
            expect(queue.entries).to.have.length(0);
        });
    });

    describe('runAll()', () => {
        it('should process all items with timeout', (done) => {
            queue.add('GetBatteryInfo');
            queue.add('GetChargeState');
            queue.runAll();
            expect(ctx.vacbot.run.calledOnce).to.be.true;
            setTimeout(() => {
                expect(ctx.vacbot.run.calledTwice).to.be.true;
                done();
            }, 350);
        });
    });
});
