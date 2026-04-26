'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');

const Queue = require('../lib/adapterQueue');

describe('adapterQueue.js', () => {
    let adapter;
    let queue;

    beforeEach(() => {
        const modelStub = {
            isSupportedFeature: sinon.stub().returns(true),
            isNot950type: sinon.stub().returns(true),
            is950type: sinon.stub().returns(false),
            is950type_V2: sinon.stub().returns(false),
            isNot950type_V2: sinon.stub().returns(true),
            isMappingSupported: sinon.stub().returns(true),
            hasAirDrying: sinon.stub().returns(false),
            isModelTypeAirbot: sinon.stub().returns(false),
            isModelTypeX1: sinon.stub().returns(false),
            isModelTypeX2: sinon.stub().returns(false),
            isModelTypeT20: sinon.stub().returns(false),
            hasAdvancedMode: sinon.stub().returns(false),
            vacbot: { getDeviceProperty: sinon.stub().returns(false) }
        };

        adapter = {
            log: {
                silly: sinon.stub(),
                debug: sinon.stub(),
                info: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            },
            getModel: sinon.stub().returns(modelStub),
            getModelType: sinon.stub().returns('deebot'),
            spotAreaCleanings: 1,
            cleaningLogAcknowledged: false,
            currentSpotAreaID: 'unknown',
            silentApproach: { mapSpotAreaID: null },
            getDevice: sinon.stub().returns({ isCleaning: sinon.stub().returns(false), useV2commands: sinon.stub().returns(true) }),
            vacbot: {
                run: sinon.stub(),
                hasMoppingSystem: sinon.stub().returns(false),
                hasMainBrush: sinon.stub().returns(true),
                hasUnitCareInfo: sinon.stub().returns(false),
                hasRoundMopInfo: sinon.stub().returns(false),
                hasVacuumPowerAdjustment: sinon.stub().returns(false)
            }
        };

        queue = new Queue(adapter);
    });

    describe('Constructor', () => {
        it('should initialize with empty entries array', () => {
            expect(queue.entries).to.be.an('array');
            expect(queue.entries).to.have.length(0);
            expect(queue.adapter).to.equal(adapter);
            expect(queue.name).to.equal('queue');
            expect(queue.timeoutValue).to.equal(250);
            expect(queue.duplicateCheck).to.be.true;
        });

        it('should allow custom name, timeout, and duplicateCheck', () => {
            const q2 = new Queue(adapter, 'myQueue', 500, false);
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
            expect(adapter.log.silly.called).to.be.true;
        });

        it('should allow duplicates when duplicateCheck is disabled', () => {
            const q2 = new Queue(adapter, 'queue', 250, false);
            q2.add('GetBatteryInfo');
            q2.add('GetBatteryInfo');
            expect(q2.entries).to.have.length(2);
        });
    });

    describe('createMultipleCleaningsForSpotArea()', () => {
        it('should create multiple cleaning entries for spotArea', () => {
            // Disable duplicateCheck so all iterations are recorded
            queue.duplicateCheck = false;
            adapter.spotAreaCleanings = 3;
            queue.createMultipleCleaningsForSpotArea('control', 'spotArea', '0');
            expect(queue.entries).to.have.length(2); // starts at 2 up to 3
            expect(queue.entries[0].cmd).to.equal('spotArea');
            expect(queue.entries[0].arg1).to.equal('start');
            expect(queue.entries[0].arg2).to.equal('0');
        });

        it('should reset queue before creating entries', () => {
            queue.add('GetBatteryInfo');
            adapter.spotAreaCleanings = 2;
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
            adapter.getModelType.returns('aqMonitor');
            queue.addInitialGetCommands();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetJCYAirQuality');
            expect(cmds).to.not.include('GetBatteryState');
        });

        it('should add airbot commands', () => {
            adapter.getModelType.returns('airbot');
            adapter.getModel().isModelTypeAirbot.returns(true);
            queue.addInitialGetCommands();
            const cmds = queue.entries.map(e => e.cmd);
            expect(cmds).to.include('GetAirQuality');
            expect(cmds).to.include('GetThreeModuleStatus');
            expect(cmds).to.include('GetAtmoVolume');
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
            adapter.getModelType.returns('aqMonitor');
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
            adapter.getModelType.returns('airbot');
            queue.addGetLifespan();
            const entries = queue.entries.filter(e => e.cmd === 'GetLifeSpan');
            expect(entries).to.have.length(1);
            expect(entries[0].arg1).to.equal('');
        });

        it('should skip lifespan for goat', () => {
            adapter.getModelType.returns('goat');
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
            expect(adapter.vacbot.run.calledOnce).to.be.true;
            expect(adapter.vacbot.run.firstCall.args[0]).to.equal('GetBatteryInfo');
            expect(queue.entries).to.have.length(0);
        });

        it('should call vacbot.run with one arg', () => {
            queue.add('GetLifeSpan', 'main_brush');
            queue.startNextItemFromQueue();
            expect(adapter.vacbot.run.calledOnce).to.be.true;
            expect(adapter.vacbot.run.firstCall.args).to.deep.equal(['GetLifeSpan', 'main_brush']);
        });

        it('should call vacbot.run with two args', () => {
            queue.add('Cmd', 'arg1', 'arg2');
            queue.startNextItemFromQueue();
            expect(adapter.vacbot.run.firstCall.args).to.deep.equal(['Cmd', 'arg1', 'arg2']);
        });

        it('should call vacbot.run with three args', () => {
            queue.add('Cmd', 'arg1', 'arg2', 'arg3');
            queue.startNextItemFromQueue();
            expect(adapter.vacbot.run.firstCall.args).to.deep.equal(['Cmd', 'arg1', 'arg2', 'arg3']);
        });

        it('should skip GetMaps when silent approach is active', () => {
            adapter.silentApproach.mapSpotAreaID = '0';
            queue.add('GetMaps');
            queue.startNextItemFromQueue();
            expect(adapter.vacbot.run.called).to.be.false;
            expect(queue.entries).to.have.length(0);
        });

        it('should not schedule next when runAll is false', () => {
            queue.add('GetBatteryInfo');
            queue.startNextItemFromQueue(false);
            expect(adapter.vacbot.run.calledOnce).to.be.true;
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
            expect(adapter.vacbot.run.calledOnce).to.be.true;
            setTimeout(() => {
                expect(adapter.vacbot.run.calledTwice).to.be.true;
                done();
            }, 350);
        });
    });
});
