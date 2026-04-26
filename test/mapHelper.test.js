'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockAdapter, createMockCtx } = require('./mockHelper');

// Mock adapterHelper
const mockHelper = {
    getUnixTimestamp: sinon.stub().returns(1234567890),
    isIdValid: sinon.stub().returns(true),
    singleAreaValueStringIsValid: sinon.stub().callsFake((value) => {
        const pattern = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$/;
        return pattern.test(value);
    })
};

// Load the module with mocked dependencies
const mapHelper = proxyquire('../lib/mapHelper', {
    './adapterHelper': mockHelper
});

describe('mapHelper.js', () => {
    let adapter;
    let ctx;

    beforeEach(() => {
        // Reset all stubs
        mockHelper.getUnixTimestamp.reset();
        mockHelper.getUnixTimestamp.returns(1234567890);
        mockHelper.isIdValid.reset();
        mockHelper.isIdValid.returns(true);

        adapter = createMockAdapter();
        ctx = createMockCtx({ adapter: adapter });
    });

    describe('isMapSubSetChannel', () => {
        it('should return true for spot areas channel', () => {
            const result = mapHelper.isMapSubSetChannel('adapter.0.map.spotAreas.123');
            expect(result).to.be.true;
        });

        it('should return true for virtual boundaries channel', () => {
            const result = mapHelper.isMapSubSetChannel('adapter.0.map.virtualBoundaries.123');
            expect(result).to.be.true;
        });

        it('should return false for regular channel', () => {
            const result = mapHelper.isMapSubSetChannel('adapter.0.info.connection');
            expect(result).to.be.false;
        });
    });

    describe('isSpotAreasChannel', () => {
        it('should return true for spot areas channel', () => {
            const result = mapHelper.isSpotAreasChannel('adapter.0.map.spotAreas.123');
            expect(result).to.be.true;
        });

        it('should return false for non-spot areas channel', () => {
            const result = mapHelper.isSpotAreasChannel('adapter.0.map.virtualBoundaries.123');
            expect(result).to.be.false;
        });

        it('should return false for regular channel', () => {
            const result = mapHelper.isSpotAreasChannel('adapter.0.info.connection');
            expect(result).to.be.false;
        });
    });

    describe('isVirtualBoundariesChannel', () => {
        it('should return true for virtual boundaries channel', () => {
            const result = mapHelper.isVirtualBoundariesChannel('adapter.0.map.virtualBoundaries.123');
            expect(result).to.be.true;
        });

        it('should return false for non-virtual boundaries channel', () => {
            const result = mapHelper.isVirtualBoundariesChannel('adapter.0.map.spotAreas.123');
            expect(result).to.be.false;
        });

        it('should return false for regular channel', () => {
            const result = mapHelper.isVirtualBoundariesChannel('adapter.0.info.connection');
            expect(result).to.be.false;
        });
    });

    describe('positionIsInAreaValueString', () => {
        it('should return true when position is within area', () => {
            const areaValueString = '100,200,300,400';
            const x = 200;
            const y = 300;
            const result = mapHelper.positionIsInAreaValueString(x, y, areaValueString);
            expect(result).to.be.true;
        });

        it('should return false when position is outside area', () => {
            const areaValueString = '100,200,300,400';
            const x = 50;
            const y = 50;
            const result = mapHelper.positionIsInAreaValueString(x, y, areaValueString);
            expect(result).to.be.false;
        });

        it('should handle edge case - position on boundary', () => {
            const areaValueString = '100,200,300,400';
            const x = 100;
            const y = 200;
            const result = mapHelper.positionIsInAreaValueString(x, y, areaValueString);
            expect(result).to.be.true;
        });

        it('should handle invalid area value string', () => {
            const result = mapHelper.positionIsInAreaValueString(100, 200, 'invalid');
            expect(result).to.be.false;
        });

        it('should handle empty area value string', () => {
            const result = mapHelper.positionIsInAreaValueString(100, 200, '');
            expect(result).to.be.false;
        });

        it('should handle null area value string', () => {
            const result = mapHelper.positionIsInAreaValueString(100, 200, null);
            expect(result).to.be.false;
        });
    });

    describe('getAreaName_i18n', () => {
        it('should return internationalized area name', () => {
            adapter.config = { languageForSpotAreaNames: 'en' };
            ctx.vacbot.getAreaName_i18n = sinon.stub().callsFake((name, lang) => `${name} (${lang})`);
            const result = mapHelper.getAreaName_i18n(adapter, ctx, 'Living Room');
            expect(result).to.be.a('string');
            expect(result).to.equal('Living Room (en)');
        });

        it('should handle empty string', () => {
            adapter.config = { languageForSpotAreaNames: 'de' };
            ctx.vacbot.getAreaName_i18n = sinon.stub().callsFake((name) => name || 'Unknown');
            const result = mapHelper.getAreaName_i18n(adapter, ctx, '');
            expect(result).to.be.a('string');
        });

        it('should handle null input', () => {
            adapter.config = { languageForSpotAreaNames: '' };
            ctx.vacbot.getAreaName_i18n = sinon.stub().returns('fallback');
            const result = mapHelper.getAreaName_i18n(adapter, ctx, null);
            expect(result).to.equal('');
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle undefined inputs gracefully', () => {
            expect(() => mapHelper.isMapSubSetChannel(undefined)).to.not.throw();
            expect(() => mapHelper.isSpotAreasChannel(undefined)).to.not.throw();
            expect(() => mapHelper.isVirtualBoundariesChannel(undefined)).to.not.throw();
            expect(() => mapHelper.positionIsInAreaValueString(undefined, undefined, undefined)).to.not.throw();
        });

        it('should handle special characters in channel IDs', () => {
            const result = mapHelper.isSpotAreasChannel('adapter.0.map.spotAreas.Living Room & Kitchen');
            expect(result).to.be.true;
        });

        it('should handle very long channel IDs', () => {
            const longId = 'adapter.0.map.spotAreas.very-long-area-name-that-might-cause-issues';
            const result = mapHelper.isSpotAreasChannel(longId);
            expect(result).to.be.true;
        });

        it('should handle numeric channel IDs', () => {
            const result = mapHelper.isSpotAreasChannel('adapter.0.map.spotAreas.123');
            expect(result).to.be.true;
        });
    });

    describe('getPositionValuesForExtendedArea', () => {
        it('should calculate extended area correctly', () => {
            const result = mapHelper.getPositionValuesForExtendedArea('100,200', 50);
            expect(result).to.equal('50,150,150,250');
        });

        it('should handle zero area size', () => {
            const result = mapHelper.getPositionValuesForExtendedArea('100,200', 0);
            expect(result).to.equal('100,200,100,200');
        });
    });

    describe('getCalculatedCenterForBoundary', () => {
        it('should calculate center for simple rectangle', () => {
            const result = mapHelper.getCalculatedCenterForBoundary('0,0;100,0;100,100;0,100');
            expect(result).to.be.a('string');
            expect(result).to.include(',');
        });

        it('should return empty string for invalid input', () => {
            const result = mapHelper.getCalculatedCenterForBoundary('0,0');
            expect(result).to.equal('');
        });
    });

    describe('positionIsInRectangleForPosition', () => {
        it('should return true when position is in rectangle', () => {
            const result = mapHelper.positionIsInRectangleForPosition(100, 200, '100,200', 500);
            expect(result).to.be.true;
        });

        it('should return false when position is outside rectangle', () => {
            const result = mapHelper.positionIsInRectangleForPosition(1000, 2000, '100,200', 500);
            expect(result).to.be.false;
        });
    });

    describe('saveCurrentSpotAreaValues', () => {
        it('should save spot area values when state exists', async () => {
            ctx.adapterProxy.getStateAsync.resolves({ val: '1,2,3' });
            ctx.currentMapID = 'map123';
            await mapHelper.saveCurrentSpotAreaValues(adapter, ctx);
            expect(adapter.setObjectNotExists.called).to.be.true;
        });

        it('should use control.spotArea as fallback', async () => {
            ctx.adapterProxy.getStateAsync
                .onFirstCall().resolves(null)
                .onSecondCall().resolves({ val: '4,5,6' });
            ctx.currentMapID = 'map123';
            await mapHelper.saveCurrentSpotAreaValues(adapter, ctx);
            expect(adapter.setObjectNotExists.called).to.be.true;
        });

        it('should not save when no state value exists', async () => {
            ctx.adapterProxy.getStateAsync.resolves(null);
            ctx.currentMapID = 'map123';
            await mapHelper.saveCurrentSpotAreaValues(adapter, ctx);
            expect(adapter.setObjectNotExists.called).to.be.false;
        });
    });

    describe('saveLastUsedCustomAreaValues', () => {
        it('should save custom area values', async () => {
            ctx.adapterProxy.getStateAsync.resolves({ val: '100,200,300,400' });
            ctx.adapterProxy.getObjectAsync.resolves({
                native: { dateTime: '2022.01.01', currentMapID: 'map456' }
            });
            ctx.currentMapID = 'map123';
            await mapHelper.saveLastUsedCustomAreaValues(adapter, ctx);
            // Function uses internal .then() chains without returning them,
            // so we need to wait for microtasks to complete
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(adapter.setObjectNotExists.called).to.be.true;
        });

        it('should not save when no state exists', async () => {
            ctx.adapterProxy.getStateAsync.resolves(null);
            await mapHelper.saveLastUsedCustomAreaValues(adapter, ctx);
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(adapter.setObjectNotExists.called).to.be.false;
        });
    });

    describe('saveGoToPositionValues', () => {
        it('should save go to position values with auto-generated ID', async () => {
            ctx.currentMapID = 'map123';
            await mapHelper.saveGoToPositionValues(adapter, ctx, '100,200');
            expect(adapter.setObjectNotExists.called).to.be.true;
            expect(ctx.adapter.log.info.called).to.be.true;
        });

        it('should save go to position values with provided ID and name', async () => {
            ctx.currentMapID = 'map123';
            await mapHelper.saveGoToPositionValues(adapter, ctx, '100,200', 'custom.id', 'Custom Name');
            expect(adapter.setObjectNotExists.called).to.be.true;
        });
    });

    describe('saveVirtualBoundary', () => {
        it('should save virtual boundary when object exists', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({
                native: {
                    virtualBoundaryCoordinates: '100,200,300,400',
                    virtualBoundaryID: 'boundary1',
                    virtualBoundaryType: 'vw'
                },
                common: { name: 'Boundary 1' }
            });
            await mapHelper.saveVirtualBoundary(adapter, ctx, 'map1', 'boundary1');
            expect(ctx.adapterProxy.setObjectNotExistsAsync.called).to.be.true;
        });

        it('should not save when object does not exist', async () => {
            ctx.adapterProxy.getObjectAsync.resolves(null);
            await mapHelper.saveVirtualBoundary(adapter, ctx, 'map1', 'boundary1');
            expect(ctx.adapterProxy.setObjectNotExistsAsync.called).to.be.false;
        });
    });

    describe('saveVirtualBoundarySet', () => {
        it('should save virtual boundary set', async () => {
            ctx.adapterProxy.getChannelsOfAsync.resolves([
                {
                    _id: 'adapter.0.map.map1.virtualBoundaries.boundary1',
                    native: {
                        virtualBoundaryID: 'boundary1',
                        virtualBoundaryType: 'vw',
                        virtualBoundaryCoordinates: '100,200,300,400'
                    },
                    common: { name: 'Boundary 1' }
                }
            ]);
            await mapHelper.saveVirtualBoundarySet(adapter, ctx, 'map1');
            // Function uses internal .then() chains without returning them,
            // so we need to wait for microtasks to complete
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(adapter.setObjectNotExists.called).to.be.true;
        });
    });

    describe('createVirtualBoundary', () => {
        it('should create virtual boundary from state', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({
                native: {
                    currentMapID: 'map1',
                    boundaryType: 'vw',
                    boundaryCoordinates: '100,200,300,400'
                }
            });
            await mapHelper.createVirtualBoundary(adapter, ctx, 'test.state');
            expect(ctx.vacbot.run.calledWith('AddVirtualBoundary')).to.be.true;
        });

        it('should not create when state has no native data', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: {} });
            await mapHelper.createVirtualBoundary(adapter, ctx, 'test.state');
            expect(ctx.vacbot.run.called).to.be.false;
        });
    });

    describe('createVirtualBoundarySet', () => {
        it('should create virtual boundary set', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({
                native: { currentMapID: 'map1' }
            });
            ctx.adapterProxy.getChannelsOfAsync.resolves([]);
            await mapHelper.createVirtualBoundarySet(adapter, ctx, 'test.state');
            expect(ctx.vacbot.run.calledWith('GetMaps')).to.be.true;
        });

        it('should not create when object has no native data', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: {} });
            await mapHelper.createVirtualBoundarySet(adapter, ctx, 'test.state');
            expect(ctx.vacbot.run.called).to.be.false;
        });
    });

    describe('deleteVirtualBoundary', () => {
        it('should delete virtual boundary', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: {} });
            ctx.adapterProxy.getStateAsync.resolves({ val: 'vw' });
            ctx.commandQueue = { run: sinon.stub() };
            await mapHelper.deleteVirtualBoundary(adapter, ctx, 'map1', 'boundary1');
            expect(ctx.commandQueue.run.calledWith('DeleteVirtualBoundary')).to.be.true;
            expect(ctx.vacbot.run.calledWith('GetMaps')).to.be.true;
        });

        it('should not delete when boundary type is not found', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: {} });
            ctx.adapterProxy.getStateAsync.resolves(null);
            ctx.commandQueue = { run: sinon.stub() };
            await mapHelper.deleteVirtualBoundary(adapter, ctx, 'map1', 'boundary1');
            expect(ctx.commandQueue.run.called).to.be.false;
            expect(ctx.vacbot.run.calledWith('GetMaps')).to.be.true;
        });
    });
});
