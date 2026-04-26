'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockCtx, createMockAdapter, createMockModel } = require('./mockHelper');

// Mock helper module
const mockHelper = {
    getDeviceStatusByStatus: sinon.stub()
};

// Load the Device class with mocked dependencies
const Device = proxyquire('../lib/device', {
    './adapterHelper': mockHelper
});

describe('device.js', () => {
    let device;
    let ctx;

    beforeEach(() => {
        // Reset stubs
        if (mockHelper.getDeviceStatusByStatus.reset) {
            mockHelper.getDeviceStatusByStatus.reset();
        }

        // Create a proper ctx using the shared mock helper
        ctx = createMockCtx();

        // Create device instance with ctx
        device = new Device(ctx);
    });

    describe('constructor', () => {
        it('should initialize with default values', () => {
            expect(device.ctx).to.equal(ctx);
            expect(device.adapter).to.equal(ctx.adapter);
            expect(device.status).to.be.null;
            expect(device.cleanStatus).to.be.null;
            expect(device.chargeStatus).to.be.null;
            expect(device.batteryLevel).to.be.null;
        });
    });

    describe('setStatus', () => {
        it('should set device status and log debug message', () => {
            device.cleanStatus = 'cleaning';
            device.chargeStatus = 'idle';

            device.setStatus('active');

            expect(device.status).to.equal('active');
            expect(ctx.adapter.log.debug.called).to.be.true;
            const debugCall = ctx.adapter.log.debug.getCall(0);
            expect(debugCall.args[0]).to.include("[setStatus] status = 'active'");
        });

        it('should handle null status', () => {
            device.setStatus(null);
            expect(device.status).to.be.null;
        });

        it('should handle undefined status', () => {
            device.setStatus(undefined);
            expect(device.status).to.be.undefined;
        });
    });

    describe('setBatteryLevel', () => {
        it('should set battery level for non-900 series devices', () => {
            ctx.getModel().isModel900Series.returns(false);

            device.setBatteryLevel(85);

            expect(device.batteryLevel).to.equal(85);
            expect(ctx.getModel().isModel900Series.called).to.be.true;
        });

        it('should handle 900 series device logic when charging', () => {
            ctx.getModel().isModel900Series.returns(true);
            device.batteryLevel = 80;
            device.status = 'charging'; // isCharging() returns true

            device.setBatteryLevel(85); // Higher than current, charging

            expect(device.batteryLevel).to.equal(85);
            expect(ctx.adapter.log.debug.calledWith('Ignoring battery level value: 85 (current value: 80)')).to.be.false;
        });

        it('should ignore battery level for 900 series when not charging and level is higher', () => {
            ctx.getModel().isModel900Series.returns(true);
            device.batteryLevel = 80;
            device.status = 'cleaning'; // isCharging() = false, isNotCharging() = true

            device.setBatteryLevel(85); // Higher than current, not charging

            expect(device.batteryLevel).to.equal(80); // Should not change
            expect(ctx.adapter.log.debug.calledWith('Ignoring battery level value: 85 (current value: 80)')).to.be.true;
        });

        it('should accept battery level for 900 series when not charging and level is lower', () => {
            ctx.getModel().isModel900Series.returns(true);
            device.batteryLevel = 80;
            device.status = 'cleaning'; // isCharging() = false, isNotCharging() = true

            device.setBatteryLevel(75); // Lower than current, not charging

            expect(device.batteryLevel).to.equal(75);
        });

        it('should ignore battery level for 900 series when charging and level is lower', () => {
            ctx.getModel().isModel900Series.returns(true);
            device.batteryLevel = 80;
            device.status = 'charging'; // isCharging() = true

            device.setBatteryLevel(75); // Lower than current, charging

            // The 900 series logic: charging + lower level => ignored
            expect(device.batteryLevel).to.equal(80); // Should not change
            expect(ctx.adapter.log.debug.calledWith('Ignoring battery level value: 75 (current value: 80)')).to.be.true;
        });

        it('should handle first battery level setting for 900 series', () => {
            ctx.getModel().isModel900Series.returns(true);
            device.batteryLevel = null; // First time setting

            device.setBatteryLevel(85);

            expect(device.batteryLevel).to.equal(85);
        });

        it('should handle null battery level', () => {
            device.setBatteryLevel(null);
            expect(device.batteryLevel).to.be.null;
        });
    });

    describe('setStatusByTrigger', () => {
        beforeEach(() => {
            mockHelper.getDeviceStatusByStatus.returns('mapped-status');
        });

        // NOTE: In the actual source code (device.js line 45-46), BOTH cleanStatus
        // and chargeStatus are set from this.ctx.chargestatus:
        //   this.cleanStatus = this.ctx.chargestatus;
        //   this.chargeStatus = this.ctx.chargestatus;
        // So both will always have the same value.

        it('should handle idle chargestatus (both idle)', () => {
            ctx.chargestatus = 'idle';

            device.setStatusByTrigger('cleanstatus');

            expect(device.cleanStatus).to.equal('idle');
            expect(device.chargeStatus).to.equal('idle');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('stop')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should handle stop chargestatus (both stop => falls to else)', () => {
            ctx.chargestatus = 'stop';

            device.setStatusByTrigger('cleanstatus');

            // cleanStatus='stop', chargeStatus='stop'
            // First condition: both idle => no
            // Second condition: clean=stop, charge=charging => no
            // Third condition: trigger=cleanstatus, clean!=idle => yes => setStatus(cleanStatus)
            expect(device.cleanStatus).to.equal('stop');
            expect(device.chargeStatus).to.equal('stop');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('stop')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should handle cleaning chargestatus with cleanstatus trigger', () => {
            ctx.chargestatus = 'cleaning';

            device.setStatusByTrigger('cleanstatus');

            // cleanStatus='cleaning', chargeStatus='cleaning'
            // First condition: both idle => no
            // Second condition: clean=stop, charge=charging => no
            // Third condition: trigger=cleanstatus, clean!=idle => yes
            expect(device.cleanStatus).to.equal('cleaning');
            expect(device.chargeStatus).to.equal('cleaning');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('cleaning')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should handle charging chargestatus with chargestatus trigger', () => {
            ctx.chargestatus = 'charging';

            device.setStatusByTrigger('chargestatus');

            // cleanStatus='charging', chargeStatus='charging'
            // First condition: both idle => no
            // Second condition: clean=stop, charge=charging => no (clean is 'charging', not 'stop')
            // Third condition: trigger=chargestatus => no
            // Fourth condition: trigger=chargestatus, charge!=idle => yes
            expect(device.cleanStatus).to.equal('charging');
            expect(device.chargeStatus).to.equal('charging');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('charging')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should handle returning chargestatus with chargestatus trigger', () => {
            ctx.chargestatus = 'returning';

            device.setStatusByTrigger('chargestatus');

            // cleanStatus='returning', chargeStatus='returning'
            // Third condition: trigger=chargestatus => no
            // Fourth condition: trigger=chargestatus, charge!=idle => yes
            expect(device.cleanStatus).to.equal('returning');
            expect(device.chargeStatus).to.equal('returning');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('returning')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should fall to else branch for idle chargestatus with unknown trigger', () => {
            ctx.chargestatus = 'idle';

            device.setStatusByTrigger('unknown');

            // cleanStatus='idle', chargeStatus='idle'
            // First condition: both idle => yes => setStatus('stop')
            expect(device.cleanStatus).to.equal('idle');
            expect(device.chargeStatus).to.equal('idle');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('stop')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should handle spot chargestatus with unknown trigger', () => {
            ctx.chargestatus = 'spot';

            device.setStatusByTrigger('unknown');

            // cleanStatus='spot', chargeStatus='spot'
            // First condition: both idle => no
            // Second condition: clean=stop, charge=charging => no
            // Third condition: trigger=unknown => no
            // Fourth condition: trigger=unknown => no
            // Fifth condition: charge=charging, clean=idle => no
            // Else: setStatus(cleanStatus) => 'spot'
            expect(device.cleanStatus).to.equal('spot');
            expect(device.chargeStatus).to.equal('spot');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('spot')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });
    });

    describe('Status Check Methods', () => {
        beforeEach(() => {
            device.status = 'cleaning';
        });

        describe('isCleaning', () => {
            it('should return true when status is cleaning', () => {
                expect(device.isCleaning()).to.be.true;
            });

            it('should return false when status is not cleaning', () => {
                device.status = 'charging';
                expect(device.isCleaning()).to.be.false;
            });

            it('should return false when status is null', () => {
                device.status = null;
                expect(device.isCleaning()).to.be.false;
            });
        });

        describe('isNotCleaning', () => {
            it('should return false when status is cleaning', () => {
                expect(device.isNotCleaning()).to.be.false;
            });

            it('should return true when status is not cleaning', () => {
                device.status = 'charging';
                expect(device.isNotCleaning()).to.be.true;
            });
        });

        describe('isReturning', () => {
            it('should return true when status is returning', () => {
                device.status = 'returning';
                expect(device.isReturning()).to.be.true;
            });

            it('should return false when status is not returning', () => {
                expect(device.isReturning()).to.be.false;
            });
        });

        describe('isNotReturning', () => {
            it('should return false when status is returning', () => {
                device.status = 'returning';
                expect(device.isNotReturning()).to.be.false;
            });

            it('should return true when status is not returning', () => {
                expect(device.isNotReturning()).to.be.true;
            });
        });

        describe('isCharging', () => {
            it('should return true when status is charging', () => {
                device.status = 'charging';
                expect(device.isCharging()).to.be.true;
            });

            it('should return false when status is not charging', () => {
                expect(device.isCharging()).to.be.false;
            });
        });

        describe('isNotCharging', () => {
            it('should return false when status is charging', () => {
                device.status = 'charging';
                expect(device.isNotCharging()).to.be.false;
            });

            it('should return true when status is not charging', () => {
                expect(device.isNotCharging()).to.be.true;
            });
        });
    });

    describe('useV2commands', () => {
        it('should return is950type_V2() when config value is empty string', () => {
            ctx.adapter.getConfigValue.returns('');
            ctx.getModel().is950type_V2.returns(false);

            expect(device.useV2commands()).to.be.false;
        });

        it('should return true when is950type_V2 returns true and config is empty', () => {
            ctx.adapter.getConfigValue.returns('');
            ctx.getModel().is950type_V2.returns(true);

            expect(device.useV2commands()).to.be.true;
        });

        it('should return true for config value "1"', () => {
            ctx.adapter.getConfigValue.returns('1');

            expect(device.useV2commands()).to.be.true;
        });

        it('should return false for config value "0"', () => {
            ctx.adapter.getConfigValue.returns('0');

            expect(device.useV2commands()).to.be.false;
        });
    });

    describe('useNativeGoToPosition', () => {
        it('should fall through to useV2commands when config value is empty string', () => {
            // useNativeGoToPosition config is empty => delegates to useV2commands
            // useV2commands config is also empty => delegates to is950type_V2()
            ctx.adapter.getConfigValue.returns('');
            ctx.getModel().is950type_V2.returns(false);

            const result = device.useNativeGoToPosition();
            expect(result).to.be.false;
        });

        it('should return false for config value "false" (NaN is falsy)', () => {
            ctx.adapter.getConfigValue.returns('false');

            const result = device.useNativeGoToPosition();
            expect(result).to.be.false;
        });

        it('should return false for config value "true" (Number("true") is NaN)', () => {
            ctx.adapter.getConfigValue.returns('true');

            const result = device.useNativeGoToPosition();
            expect(result).to.be.false;
        });

        it('should return false for any other non-numeric config value', () => {
            ctx.adapter.getConfigValue.returns('other');

            const result = device.useNativeGoToPosition();
            expect(result).to.be.false;
        });

        it('should return false for undefined config value (Number(undefined) is NaN)', () => {
            ctx.adapter.getConfigValue.returns(undefined);

            const result = device.useNativeGoToPosition();
            expect(result).to.be.false;
        });

        it('should return false for null config value (Number(null) is 0)', () => {
            ctx.adapter.getConfigValue.returns(null);

            const result = device.useNativeGoToPosition();
            expect(result).to.be.false;
        });

        it('should return true for numeric string config values', () => {
            ctx.adapter.getConfigValue.returns('1');
            expect(device.useNativeGoToPosition()).to.be.true;

            ctx.adapter.getConfigValue.returns('2');
            expect(device.useNativeGoToPosition()).to.be.true;

            ctx.adapter.getConfigValue.returns('0');
            expect(device.useNativeGoToPosition()).to.be.false; // 0 is falsy
        });

        it('should return true when is950type_V2 returns true and config is empty', () => {
            ctx.adapter.getConfigValue.returns('');
            ctx.getModel().is950type_V2.returns(true);

            const result = device.useNativeGoToPosition();
            expect(result).to.be.true;
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should throw when ctx is null', () => {
            expect(() => new Device(null)).to.throw();
        });

        it('should not throw when ctx has adapter with log.debug', () => {
            const minimalCtx = {
                adapter: { log: { debug: sinon.stub() } },
                getModel: sinon.stub().returns({ isModel900Series: sinon.stub().returns(false) })
            };
            const d = new Device(minimalCtx);
            expect(() => d.setStatus('test')).to.not.throw();
        });

        it('should handle complex status in setStatusByTrigger', () => {
            // With the real source, both cleanStatus and chargeStatus come from ctx.chargestatus
            ctx.chargestatus = 'returning';

            device.setStatusByTrigger('cleanstatus');

            // cleanStatus='returning', chargeStatus='returning'
            // trigger=cleanstatus, cleanStatus != idle => third branch
            expect(device.cleanStatus).to.equal('returning');
            expect(device.chargeStatus).to.equal('returning');
            expect(mockHelper.getDeviceStatusByStatus.called).to.be.true;
        });

        it('should handle when helper returns different status mappings', () => {
            mockHelper.getDeviceStatusByStatus.returns('custom-status');
            ctx.chargestatus = 'cleaning';

            device.setStatusByTrigger('cleanstatus');

            expect(device.status).to.equal('custom-status');
        });
    });
});
