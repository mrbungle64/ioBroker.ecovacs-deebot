'use strict';

const { expect } = require('chai');
const { describe, it, afterEach } = require('mocha');
const sinon = require('sinon');
const Model = require('../lib/models');

// Builds a mock vacbot exposing the methods the real Model delegates to.
// Mirrors the factory in models.test.js so both suites exercise the same surface.
function createMockVacbot(overrides = {}) {
    return Object.assign({
        deviceClass: 'unknown_class',
        getPlatformType: sinon.stub().returns(''),
        getSmartType: sinon.stub().returns(''),
        getDeviceCategory: sinon.stub().returns('Vacuum Cleaner'),
        getProductImageURL: sinon.stub().returns('http://example.com/image.png'),
        getProtocol: sinon.stub().returns('MQTT'),
        hasMappingCapabilities: sinon.stub().returns(false),
        hasMainBrush: sinon.stub().returns(false),
        hasSideBrush: sinon.stub().returns(false),
        hasFilter: sinon.stub().returns(false),
        hasAirDrying: sinon.stub().returns(false),
        hasMoppingSystem: sinon.stub().returns(false),
        isModelTypeAirbot: sinon.stub().returns(false),
        isModelTypeAqMonitor: sinon.stub().returns(false),
        // yiko => voice assistant capability
        getDeviceProperty: sinon.stub().returns(false)
    }, overrides);
}

describe('Device Type Classification (lib/models.js)', () => {
    afterEach(() => {
        sinon.restore();
    });

    describe('getDeviceCategory()', () => {
        // The real Model delegates the friendly category to the library's
        // getDeviceCategory(); these assert that delegation and null safety.
        const categories = ['Vacuum Cleaner', 'Air Purifier', 'Lawn Mower', 'Air Quality Monitor'];

        categories.forEach((category) => {
            it(`should delegate "${category}" from the vacbot`, () => {
                const vacbot = createMockVacbot({ getDeviceCategory: sinon.stub().returns(category) });
                const model = new Model(vacbot, {});
                expect(model.getDeviceCategory()).to.equal(category);
            });
        });

        it('should return an empty string when there is no vacbot', () => {
            const model = new Model(null, {});
            expect(model.getDeviceCategory()).to.equal('');
        });
    });

    describe('getDeviceCapabilities()', () => {
        it('should expose the full capabilities contract', () => {
            const vacbot = createMockVacbot();
            const caps = new Model(vacbot, {}).getDeviceCapabilities();

            expect(caps).to.have.all.keys(
                'type',
                'hasMapping',
                'hasWaterBox',
                'hasAirDrying',
                'hasAutoEmpty',
                'hasSpotAreas',
                'hasVirtualBoundaries',
                'hasContinuousCleaning',
                'hasDoNotDisturb',
                'hasVoiceAssistant',
                'hasCleaningStation',
                'hasFloorWashing'
            );
        });

        it('should classify an Air Purifier (AIRBOT Z1)', () => {
            const vacbot = createMockVacbot({
                deviceClass: 'sdp1y1', // AIRBOT Z1, map: true in SUPPORTED_STATES
                getDeviceCategory: sinon.stub().returns('Air Purifier'),
                hasMappingCapabilities: sinon.stub().returns(true),
                isModelTypeAirbot: sinon.stub().returns(true),
                getDeviceProperty: sinon.stub().withArgs('yiko').returns(true)
            });
            const caps = new Model(vacbot, {}).getDeviceCapabilities();

            expect(caps.type).to.equal('Air Purifier');
            expect(caps.hasMapping).to.be.true;
            expect(caps.hasSpotAreas).to.be.true; // map: true => MAP_DEFAULT_STATES implicit
            expect(caps.hasVoiceAssistant).to.be.true;
            expect(caps.hasContinuousCleaning).to.be.false;
            expect(caps.hasDoNotDisturb).to.be.false;
        });

        it('should classify a Lawn Mower (unlisted device class)', () => {
            const vacbot = createMockVacbot({
                deviceClass: 'lawn_unlisted',
                getDeviceCategory: sinon.stub().returns('Lawn Mower'),
                hasMappingCapabilities: sinon.stub().returns(false)
            });
            const caps = new Model(vacbot, {}).getDeviceCapabilities();

            expect(caps.type).to.equal('Lawn Mower');
            expect(caps.hasMapping).to.be.false;
            expect(caps.hasSpotAreas).to.be.false;
            expect(caps.hasVoiceAssistant).to.be.false;
        });

        it('should classify an Air Quality Monitor', () => {
            const vacbot = createMockVacbot({
                deviceClass: '20anby', // Z1 Air Quality Monitor
                getDeviceCategory: sinon.stub().returns('Air Quality Monitor'),
                isModelTypeAqMonitor: sinon.stub().returns(true)
            });
            const caps = new Model(vacbot, {}).getDeviceCapabilities();

            expect(caps.type).to.equal('Air Quality Monitor');
            expect(caps.hasMapping).to.be.false;
            expect(caps.hasAirDrying).to.be.false;
        });

        it('should resolve registry-driven features for a high-end vacuum (950 series)', () => {
            const vacbot = createMockVacbot({
                deviceClass: 'yna5xi', // DEEBOT OZMO 950 Series
                getDeviceCategory: sinon.stub().returns('Vacuum Cleaner'),
                hasMappingCapabilities: sinon.stub().returns(true),
                hasAirDrying: sinon.stub().returns(true),
                hasMoppingSystem: sinon.stub().returns(true),
                getDeviceProperty: sinon.stub().withArgs('yiko').returns(true)
            });
            const caps = new Model(vacbot, {}).getDeviceCapabilities();

            expect(caps.type).to.equal('Vacuum Cleaner');
            expect(caps.hasMapping).to.be.true;
            expect(caps.hasContinuousCleaning).to.be.true; // explicit in SUPPORTED_STATES
            expect(caps.hasDoNotDisturb).to.be.true; // explicit in SUPPORTED_STATES
            expect(caps.hasSpotAreas).to.be.true; // map: true => implicit
            expect(caps.hasAirDrying).to.be.true;
            expect(caps.hasCleaningStation).to.be.true; // implied by air drying
            expect(caps.hasFloorWashing).to.be.true; // mopping system + cleaning station
            expect(caps.hasVoiceAssistant).to.be.true;
        });

        it('should resolve a canonical device class via deviceClassLink (OZMO 920 -> 950)', () => {
            const vacbot = createMockVacbot({
                deviceClass: 'vi829v', // DEEBOT OZMO 920, linked to yna5xi
                getDeviceCategory: sinon.stub().returns('Vacuum Cleaner')
            });
            const caps = new Model(vacbot, {}).getDeviceCapabilities();

            // Features are inherited from the linked 950 class
            expect(caps.hasContinuousCleaning).to.be.true;
            expect(caps.hasDoNotDisturb).to.be.true;
        });

        it('should not derive hasWaterBox / hasAutoEmpty from the registry without config', () => {
            // info.waterbox and control.autoEmptyStation are not registry-derived;
            // they stay false unless explicitly enabled via adapter config.
            const vacbot = createMockVacbot({ deviceClass: 'yna5xi' });
            const caps = new Model(vacbot, {}).getDeviceCapabilities();

            expect(caps.hasWaterBox).to.be.false;
            expect(caps.hasAutoEmpty).to.be.false;

            const enabled = new Model(vacbot, { 'feature.control.autoEmptyStation': '1' }).getDeviceCapabilities();
            expect(enabled.hasAutoEmpty).to.be.true;
        });

        it('should treat a missing yiko property as no voice assistant', () => {
            const vacbot = createMockVacbot({ getDeviceProperty: sinon.stub().returns(false) });
            const caps = new Model(vacbot, {}).getDeviceCapabilities();
            expect(caps.hasVoiceAssistant).to.be.false;
        });
    });
});
