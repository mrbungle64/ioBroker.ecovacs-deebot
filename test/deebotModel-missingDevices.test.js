'use strict';

const { expect } = require('chai');
const { describe, it } = require('mocha');
const sinon = require('sinon');
const Model = require('../lib/deebotModel');

/**
 * Create a realistic mock vacbot for a given device class and model type.
 */
function createMockVacbot(deviceClass, modelType, overrides = {}) {
    return Object.assign({
        deviceClass,
        getModelType: sinon.stub().returns(modelType),
        hasMappingCapabilities: sinon.stub().returns(true),
        hasAirDrying: sinon.stub().returns(false),
        hasMoppingSystem: sinon.stub().returns(true),
        hasMainBrush: sinon.stub().returns(true),
        hasFilter: sinon.stub().returns(true),
        hasSideBrush: sinon.stub().returns(true),
        hasAdvancedMode: sinon.stub().returns(true),
        hasCustomAreaCleaningMode: sinon.stub().returns(true),
        is950type: sinon.stub().returns(true),
        is950type_V2: sinon.stub().returns(false),
        isModelTypeN8: sinon.stub().returns(false),
        isModelTypeT8: sinon.stub().returns(false),
        isModelTypeT9: sinon.stub().returns(false),
        isModelTypeT10: sinon.stub().returns(modelType === 'T10'),
        isModelTypeT20: sinon.stub().returns(false),
        isModelTypeX1: sinon.stub().returns(false),
        isModelTypeX2: sinon.stub().returns(false),
        isModelTypeAirbot: sinon.stub().returns(false),
        getDeviceProperty: sinon.stub().returns(false),
        getProtocol: sinon.stub().returns('MQTT'),
        getProductImageURL: sinon.stub().returns(''),
        hasSpotAreaCleaningMode: sinon.stub().returns(true)
    }, overrides);
}

describe('Missing device class support in SUPPORTED_STATES', () => {
    describe('p95mgv (DEEBOT T10 PLUS)', () => {
        const deviceClass = 'p95mgv';
        const modelType = 'T10';

        it('should resolve product name via deviceClassLink', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            expect(model.getProductName()).to.equal('DEEBOT T8/T9/T10 Series');
        });

        it('should support map features', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('map')).to.be.true;
            expect(model.isSupportedFeature('map.spotAreas')).to.be.true;
            expect(model.isSupportedFeature('map.virtualBoundaries')).to.be.true;
            expect(model.isSupportedFeature('map.chargePosition')).to.be.true;
            expect(model.isSupportedFeature('map.deebotPosition')).to.be.true;
            expect(model.isSupportedFeature('map.deebotPositionCurrentSpotAreaID')).to.be.true;
        });

        it('should support control features', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('control.cleanSpeed')).to.be.true;
            expect(model.isSupportedFeature('control.continuousCleaning')).to.be.true;
            expect(model.isSupportedFeature('control.doNotDisturb')).to.be.true;
            expect(model.isSupportedFeature('control.autoEmptyStation')).to.be.true;
        });

        it('should support consumable.reset', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('consumable.reset')).to.be.true;
        });

        it('should support cleaninglog.lastCleaningMap', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('cleaninglog.lastCleaningMap')).to.be.true;
        });

        it('should support technology.trueDetect', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('technology.trueDetect')).to.be.true;
        });

        it('should support info.dustbox and info.sleepStatus', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('info.dustbox')).to.be.true;
            expect(model.isSupportedFeature('info.sleepStatus')).to.be.true;
        });

        it('should return correct device capabilities', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            const caps = model.getDeviceCapabilities();
            expect(caps.type).to.equal('Vacuum Cleaner');
            expect(caps.hasMapping).to.be.true;
            expect(caps.hasAutoEmpty).to.be.true;
            expect(caps.hasSpotAreas).to.be.true;
            expect(caps.hasVirtualBoundaries).to.be.true;
            expect(caps.hasContinuousCleaning).to.be.true;
            expect(caps.hasDoNotDisturb).to.be.true;
            expect(caps.hasCleaningStation).to.be.false;
            expect(caps.hasFloorWashing).to.be.false;
        });
    });

    describe('20anby (Z1 Air Quality Monitor)', () => {
        const deviceClass = '20anby';
        const modelType = 'aqMonitor';

        it('should resolve product name', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                hasMappingCapabilities: sinon.stub().returns(false),
                hasMoppingSystem: sinon.stub().returns(false),
                hasMainBrush: sinon.stub().returns(false),
                hasFilter: sinon.stub().returns(false),
                hasSideBrush: sinon.stub().returns(false),
                is950type: sinon.stub().returns(false)
            });
            const model = new Model(vacbot, {});
            expect(model.getProductName()).to.equal('Z1 Air Quality Monitor');
        });

        it('should not support robot features', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                hasMappingCapabilities: sinon.stub().returns(false),
                hasMoppingSystem: sinon.stub().returns(false),
                hasMainBrush: sinon.stub().returns(false),
                hasFilter: sinon.stub().returns(false),
                hasSideBrush: sinon.stub().returns(false),
                is950type: sinon.stub().returns(false)
            });
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('map')).to.be.false;
            expect(model.isSupportedFeature('control.cleanSpeed')).to.be.false;
            expect(model.isSupportedFeature('control.autoEmptyStation')).to.be.false;
            expect(model.isSupportedFeature('consumable.reset')).to.be.false;
        });

        it('should support basic network info', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                hasMappingCapabilities: sinon.stub().returns(false),
                hasMoppingSystem: sinon.stub().returns(false),
                is950type: sinon.stub().returns(false)
            });
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('info.network.ip')).to.be.true;
            expect(model.isSupportedFeature('info.network.wifiSSID')).to.be.true;
        });

        it('should return correct device capabilities', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                hasMappingCapabilities: sinon.stub().returns(false),
                hasMoppingSystem: sinon.stub().returns(false),
                is950type: sinon.stub().returns(false)
            });
            const model = new Model(vacbot, {});
            const caps = model.getDeviceCapabilities();
            expect(caps.type).to.equal('Air Quality Monitor');
            expect(caps.hasMapping).to.be.false;
            expect(caps.hasAutoEmpty).to.be.false;
            expect(caps.hasSpotAreas).to.be.false;
            expect(caps.hasCleaningStation).to.be.false;
        });
    });

    describe('9eamof (DEEBOT T80 OMNI)', () => {
        const deviceClass = '9eamof';
        const modelType = 'T10';

        it('should resolve product name via deviceClassLink', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            expect(model.getProductName()).to.equal('DEEBOT T8/T9/T10 Series');
        });

        it('should support T10/T20 features', () => {
            const vacbot = createMockVacbot(deviceClass, modelType);
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('map')).to.be.true;
            expect(model.isSupportedFeature('control.autoEmptyStation')).to.be.true;
            expect(model.isSupportedFeature('consumable.reset')).to.be.true;
            expect(model.isSupportedFeature('technology.trueDetect')).to.be.true;
        });

        it('should return correct modelType via SUPPORTED_STATES override', () => {
            // The library returns 'T20' for T80 devices, but the SUPPORTED_STATES
            // modelType field should override it to 'T80'
            const vacbot = createMockVacbot(deviceClass, 'T20', {
                isModelTypeT20: sinon.stub().returns(true)
            });
            const model = new Model(vacbot, {});
            expect(model.getModelType()).to.equal('T80');
        });

        it('should return library modelType when no SUPPORTED_STATES override exists', () => {
            // For device classes without a modelType override, the library value is used
            const vacbot = createMockVacbot('nonexistent', 'UnknownModel');
            const model = new Model(vacbot, {});
            expect(model.getModelType()).to.equal('UnknownModel');
        });

    });

    describe('p1jij8 (DEEBOT T20 OMNI)', () => {
        const deviceClass = 'p1jij8';
        const modelType = 'T20';

        it('should resolve product name via deviceClassLink', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                isModelTypeT20: sinon.stub().returns(true)
            });
            const model = new Model(vacbot, {});
            expect(model.getProductName()).to.equal('DEEBOT T8/T9/T10 Series');
        });

        it('should support T20 features', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                isModelTypeT20: sinon.stub().returns(true)
            });
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('map')).to.be.true;
            expect(model.isSupportedFeature('control.autoEmptyStation')).to.be.true;
            expect(model.isSupportedFeature('consumable.reset')).to.be.true;
            expect(model.isSupportedFeature('technology.trueDetect')).to.be.true;
        });
    });


    describe('sdp1y1 (AIRBOT Z1)', () => {
        const deviceClass = 'sdp1y1';
        const modelType = 'airbot';

        it('should resolve product name via deviceClassLink', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                isModelTypeAirbot: sinon.stub().returns(true),
                hasMappingCapabilities: sinon.stub().returns(true),
                is950type: sinon.stub().returns(false)
            });
            const model = new Model(vacbot, {});
            expect(model.getProductName()).to.equal('Airbot Z1');
        });

        it('should support airbot features', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                isModelTypeAirbot: sinon.stub().returns(true),
                hasMappingCapabilities: sinon.stub().returns(true),
                is950type: sinon.stub().returns(false)
            });
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('map')).to.be.true;
            expect(model.isSupportedFeature('map.spotAreas')).to.be.true;
            expect(model.isSupportedFeature('info.network.ip')).to.be.true;
            expect(model.isSupportedFeature('control.cleanSpeed')).to.be.false;
        });
    });

    describe('xmp9ds (GOAT A1600 RTK)', () => {
        const deviceClass = 'xmp9ds';
        const modelType = 'goat';

        it('should resolve product name via deviceClassLink', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                hasMappingCapabilities: sinon.stub().returns(false),
                hasMoppingSystem: sinon.stub().returns(false),
                is950type: sinon.stub().returns(false)
            });
            const model = new Model(vacbot, {});
            expect(model.getProductName()).to.equal('GOAT GX-600');
        });

        it('should support goat features', () => {
            const vacbot = createMockVacbot(deviceClass, modelType, {
                hasMappingCapabilities: sinon.stub().returns(false),
                hasMoppingSystem: sinon.stub().returns(false),
                is950type: sinon.stub().returns(false)
            });
            const model = new Model(vacbot, {});
            expect(model.isSupportedFeature('info.network.ip')).to.be.true;
            expect(model.isSupportedFeature('info.network.wifiSSID')).to.be.true;
            expect(model.isSupportedFeature('control.cleanSpeed')).to.be.false;
            expect(model.isSupportedFeature('map')).to.be.false;
        });
    });
});
