'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

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
    let mockAdapter;
    let mockModel;

    beforeEach(() => {
        // Reset stubs
        if (mockHelper.getDeviceStatusByStatus.reset) {
            mockHelper.getDeviceStatusByStatus.reset();
        }
        
        // Create mock model
        mockModel = {
            isModel900Series: sinon.stub().returns(false),
            is950type_V2: sinon.stub().returns(false)
        };

        // Create mock adapter
        mockAdapter = {
            log: {
                debug: sinon.stub()
            },
            getModel: sinon.stub().returns(mockModel),
            getConfigValue: sinon.stub(),
            cleanstatus: 'idle',
            chargestatus: 'idle'
        };

        // Create device instance
        device = new Device(mockAdapter);
    });

    describe('constructor', () => {
        it('should initialize with default values', () => {
            expect(device.adapter).to.equal(mockAdapter);
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
            expect(mockAdapter.log.debug.called).to.be.true;
            const debugCall = mockAdapter.log.debug.getCall(0);
            expect(debugCall.args[0]).to.include('[setStatus] status = \'active\'');
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
            mockModel.isModel900Series.returns(false);
            
            device.setBatteryLevel(85);
            
            expect(device.batteryLevel).to.equal(85);
            expect(mockModel.isModel900Series.called).to.be.true;
        });

        it('should handle 900 series device logic when charging', () => {
            mockModel.isModel900Series.returns(true);
            device.batteryLevel = 80;
            device.isCharging = sinon.stub().returns(true);
            device.isNotCharging = sinon.stub().returns(false);
            
            device.setBatteryLevel(85); // Higher than current
            
            expect(device.batteryLevel).to.equal(85);
            expect(mockAdapter.log.debug.calledWith('Ignoring battery level value: 85 (current value: 80)')).to.be.false;
        });

        it('should ignore battery level for 900 series when not charging and level is higher', () => {
            mockModel.isModel900Series.returns(true);
            device.batteryLevel = 80;
            device.isCharging = sinon.stub().returns(false);
            device.isNotCharging = sinon.stub().returns(true);
            
            device.setBatteryLevel(85); // Higher than current, not charging
            
            expect(device.batteryLevel).to.equal(80); // Should not change
            expect(mockAdapter.log.debug.calledWith('Ignoring battery level value: 85 (current value: 80)')).to.be.true;
        });

        it('should accept battery level for 900 series when charging and level is lower', () => {
            mockModel.isModel900Series.returns(true);
            device.batteryLevel = 80;
            device.isCharging = sinon.stub().returns(true);
            device.isNotCharging = sinon.stub().returns(false);
            
            device.setBatteryLevel(75); // Lower than current, charging
            
            // The 900 series logic should ignore lower battery levels when charging
            expect(device.batteryLevel).to.equal(80); // Should not change due to 900 series logic
            expect(mockAdapter.log.debug.calledWith('Ignoring battery level value: 75 (current value: 80)')).to.be.true;
        });

        it('should handle first battery level setting for 900 series', () => {
            mockModel.isModel900Series.returns(true);
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

        it('should handle idle clean and charge status', () => {
            mockAdapter.cleanstatus = 'idle';
            mockAdapter.chargestatus = 'idle';
            
            device.setStatusByTrigger('cleanstatus');
            
            expect(device.cleanStatus).to.equal('idle');
            expect(device.chargeStatus).to.equal('idle');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('stop')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should handle stop clean and charging charge status', () => {
            mockAdapter.cleanstatus = 'stop';
            mockAdapter.chargestatus = 'charging';
            
            device.setStatusByTrigger('cleanstatus');
            
            expect(device.cleanStatus).to.equal('stop');
            expect(device.chargeStatus).to.equal('charging');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('charging')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should handle non-idle clean status with cleanstatus trigger', () => {
            mockAdapter.cleanstatus = 'cleaning';
            mockAdapter.chargestatus = 'idle';
            
            device.setStatusByTrigger('cleanstatus');
            
            expect(device.cleanStatus).to.equal('cleaning');
            expect(device.chargeStatus).to.equal('idle');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('cleaning')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should handle non-idle charge status with chargestatus trigger', () => {
            mockAdapter.cleanstatus = 'idle';
            mockAdapter.chargestatus = 'returning';
            
            device.setStatusByTrigger('chargestatus');
            
            expect(device.cleanStatus).to.equal('idle');
            expect(device.chargeStatus).to.equal('returning');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('returning')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should handle charging with idle clean status', () => {
            mockAdapter.cleanstatus = 'idle';
            mockAdapter.chargestatus = 'charging';
            
            device.setStatusByTrigger('chargestatus');
            
            expect(device.cleanStatus).to.equal('idle');
            expect(device.chargeStatus).to.equal('charging');
            expect(mockHelper.getDeviceStatusByStatus.calledWith('charging')).to.be.true;
            expect(device.status).to.equal('mapped-status');
        });

        it('should default to clean status for unknown combinations', () => {
            mockAdapter.cleanstatus = 'spot';
            mockAdapter.chargestatus = 'idle';
            
            device.setStatusByTrigger('unknown');
            
            expect(device.cleanStatus).to.equal('spot');
            expect(device.chargeStatus).to.equal('idle');
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

    describe('useNativeGoToPosition', () => {
        it('should return false for config value empty string (calls useV2commands which returns false)', () => {
            const result = device.useNativeGoToPosition('');
            expect(result).to.be.false; // Because is950type_V2() returns false
        });

        it('should return false for config value false', () => {
            mockAdapter.getConfigValue.returns('false');
            const result = device.useNativeGoToPosition('false');
            expect(result).to.be.false;
        });

        it('should return false for config value true (Number("true") is NaN)', () => {
            mockAdapter.getConfigValue.returns('true');
            const result = device.useNativeGoToPosition('true');
            expect(result).to.be.false;
        });

        it('should return false for any other non-numeric config value', () => {
            mockAdapter.getConfigValue.returns('other');
            const result = device.useNativeGoToPosition('other');
            expect(result).to.be.false;
        });

        it('should return false for undefined config value (Number(undefined) is NaN)', () => {
            mockAdapter.getConfigValue.returns(undefined);
            const result = device.useNativeGoToPosition(undefined);
            expect(result).to.be.false;
        });

        it('should return false for null config value (Number(null) is 0)', () => {
            mockAdapter.getConfigValue.returns(null);
            const result = device.useNativeGoToPosition(null);
            expect(result).to.be.false;
        });

        it('should return true for numeric string config values', () => {
            mockAdapter.getConfigValue.returns('1');
            expect(device.useNativeGoToPosition('1')).to.be.true;
            
            mockAdapter.getConfigValue.returns('2');
            expect(device.useNativeGoToPosition('2')).to.be.true;
            
            mockAdapter.getConfigValue.returns('0');
            expect(device.useNativeGoToPosition('0')).to.be.false; // 0 is falsy
        });

        it('should return true when is950type_V2 returns true and config is empty', () => {
            mockModel.is950type_V2.returns(true);
            mockAdapter.getConfigValue.returns('');
            const result = device.useNativeGoToPosition('');
            expect(result).to.be.true;
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle null adapter gracefully', () => {
            const deviceWithNullAdapter = new Device(null);
            expect(() => deviceWithNullAdapter.setStatus('test')).to.throw();
        });

        it('should handle undefined adapter methods', () => {
            const deviceWithIncompleteAdapter = new Device({ log: { debug: sinon.stub() } });
            expect(() => deviceWithIncompleteAdapter.setStatus('test')).to.not.throw();
        });

        it('should handle complex status combinations in setStatusByTrigger', () => {
            mockAdapter.cleanstatus = 'returning';
            mockAdapter.chargestatus = 'charging';
            
            device.setStatusByTrigger('cleanstatus');
            
            expect(device.cleanStatus).to.equal('returning');
            expect(device.chargeStatus).to.equal('charging');
            expect(mockHelper.getDeviceStatusByStatus.called).to.be.true;
        });

        it('should handle when helper returns different status mappings', () => {
            mockHelper.getDeviceStatusByStatus.returns('custom-status');
            mockAdapter.cleanstatus = 'cleaning';
            mockAdapter.chargestatus = 'idle';
            
            device.setStatusByTrigger('cleanstatus');
            
            expect(device.status).to.equal('custom-status');
        });
    });
});