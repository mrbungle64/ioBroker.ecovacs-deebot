'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockAdapter, createMockCtx } = require('./mockHelper');

// Mock dependencies
const mockMapHelper = {
    isMapSubSetChannel: sinon.stub(),
    isSpotAreasChannel: sinon.stub(),
    isVirtualBoundariesChannel: sinon.stub(),
    getCalculatedCenterForBoundary: sinon.stub().returns('150, 250'),
    getAreaName_i18n: sinon.stub().returns('Test Area'),
    saveVirtualBoundary: sinon.stub().resolves(),
    saveVirtualBoundarySet: sinon.stub().resolves(),
    saveLastUsedCustomAreaValues: sinon.stub().resolves(),
    saveCurrentSpotAreaValues: sinon.stub().resolves(),
    saveGoToPositionValues: sinon.stub().resolves(),
    createVirtualBoundary: sinon.stub().resolves(),
    createVirtualBoundarySet: sinon.stub().resolves(),
    deleteVirtualBoundary: sinon.stub().resolves(),
    getPositionValuesForExtendedArea: sinon.stub().returns('100,200,300,400')
};

const mockAdapterObjects = {
    createControlWaterLevelIfNotExists: sinon.stub().resolves(),
    createControlCleanSpeedIfNotExists: sinon.stub().resolves()
};

const mockAdapterHelper = {
    getUnixTimestamp: sinon.stub().returns(1234567890),
    getTimeStringFormatted: sinon.stub().returns('01:00:00'),
    isIdValid: sinon.stub().returns(true)
};

// Load the module with mocked dependencies
const mapObjects = proxyquire('../lib/mapObjects', {
    './mapHelper': mockMapHelper,
    './adapterObjects': mockAdapterObjects,
    './adapterHelper': mockAdapterHelper
});

describe('mapObjects.js', () => {
    let adapter;
    let ctx;

    beforeEach(() => {
        adapter = createMockAdapter();
        ctx = createMockCtx({ adapter: adapter });

        // Set default ctx properties used by mapObjects
        ctx.currentMapID = 'map123';
        ctx.currentSpotAreaID = 'area1';
        ctx.currentSpotAreaName = 'Test Area';
        ctx.waterboxInstalled = false;

        // Reset history on module-level mock stubs only
        Object.values(mockMapHelper).forEach(stub => {
            if (stub && stub.resetHistory) stub.resetHistory();
        });
        Object.values(mockAdapterObjects).forEach(stub => {
            if (stub && stub.resetHistory) stub.resetHistory();
        });
        Object.values(mockAdapterHelper).forEach(stub => {
            if (stub && stub.resetHistory) stub.resetHistory();
        });
        // Ensure defaults are restored after reset
        mockMapHelper.getCalculatedCenterForBoundary.returns('150, 250');
        mockMapHelper.getAreaName_i18n.returns('Test Area');
        mockAdapterHelper.getUnixTimestamp.returns(1234567890);
        mockAdapterHelper.getTimeStringFormatted.returns('01:00:00');
    });

    describe('processMaps', () => {
        it('should process map data successfully', async () => {
            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map',
                        mapIsAvailable: true
                    }
                ]
            };

            await mapObjects.processMaps(adapter, ctx, mapData);

            expect(ctx.adapter.log.debug.calledWith('[processMaps] Processing map data')).to.be.true;
            expect(ctx.adapterProxy.createChannelNotExists.called).to.be.true;
            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
        });

        it('should handle empty map data', async () => {
            const mapData = { maps: [] };

            await mapObjects.processMaps(adapter, ctx, mapData);

            expect(ctx.adapter.log.debug.calledWith('[processMaps] Processing map data')).to.be.true;
            expect(ctx.adapterProxy.createChannelNotExists.called).to.be.false;
        });

        it('should throw on null map data', async () => {
            try {
                await mapObjects.processMaps(adapter, ctx, null);
                expect.fail('Should have thrown');
            } catch (e) {
                expect(e).to.be.an('error');
            }
        });
    });

    describe('processSpotAreas', () => {
        it('should process spot areas successfully', async () => {
            const spotAreaData = {
                mapID: 'map123',
                mapSpotAreas: [
                    {
                        mapSpotAreaID: 'area1',
                        mapSpotAreaName: 'Living Room'
                    }
                ]
            };

            await mapObjects.processSpotAreas(adapter, ctx, spotAreaData);

            expect(ctx.adapterProxy.createChannelNotExists.called).to.be.true;
        });

        it('should handle empty spot areas', async () => {
            const spotAreaData = { mapID: 'map123', mapSpotAreas: [] };

            await mapObjects.processSpotAreas(adapter, ctx, spotAreaData);

            // No spot areas, so createChannelNotExists for spot areas channel not called
            // (note: it may be called zero times or for other reasons depending on getChannelsOfAsync)
            expect(ctx.adapterProxy.createChannelNotExists.callCount).to.equal(0);
        });

        it('should throw on null spot area data', async () => {
            try {
                await mapObjects.processSpotAreas(adapter, ctx, null);
                expect.fail('Should have thrown');
            } catch (e) {
                expect(e).to.be.an('error');
            }
        });
    });

    describe('processVirtualBoundaries', () => {
        it('should process virtual boundaries successfully', async () => {
            const boundaryData = {
                mapID: 'map123',
                mapVirtualWalls: [
                    {
                        mapVirtualBoundaryID: 'boundary1',
                        mapVirtualBoundaryType: 'vw'
                    }
                ],
                mapNoMopZones: []
            };

            await mapObjects.processVirtualBoundaries(adapter, ctx, boundaryData);

            expect(ctx.adapterProxy.createChannelNotExists.called).to.be.true;
        });

        it('should handle empty virtual boundaries', async () => {
            const boundaryData = { mapID: 'map123', mapVirtualWalls: [], mapNoMopZones: [] };

            await mapObjects.processVirtualBoundaries(adapter, ctx, boundaryData);

            expect(ctx.adapterProxy.createChannelNotExists.called).to.be.false;
        });
    });

    describe('processSpotAreaInfo', () => {
        it('should process spot area info successfully', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: '' });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Living Room',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
        });

        it('should throw on null spot area info', async () => {
            try {
                await mapObjects.processSpotAreaInfo(adapter, ctx, null);
                expect.fail('Should have thrown');
            } catch (e) {
                expect(e).to.be.an('error');
            }
        });
    });

    describe('processVirtualBoundaryInfo', () => {
        it('should process virtual boundary info successfully', async () => {
            const boundaryInfo = {
                mapID: 'map123',
                mapVirtualBoundaryID: 'boundary1',
                mapVirtualBoundaryType: 'vw',
                mapVirtualBoundaryCoordinates: '100,200,300,400'
            };

            await mapObjects.processVirtualBoundaryInfo(adapter, ctx, boundaryInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
        });

        it('should throw on null boundary info', async () => {
            try {
                await mapObjects.processVirtualBoundaryInfo(adapter, ctx, null);
                expect.fail('Should have thrown');
            } catch (e) {
                expect(e).to.be.an('error');
            }
        });
    });

    describe('Error Handling', () => {
        it('should throw on adapter method failures', async () => {
            ctx.adapterProxy.createChannelNotExists.rejects(new Error('Create failed'));

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map'
                    }
                ]
            };

            try {
                await mapObjects.processMaps(adapter, ctx, mapData);
                expect.fail('Should have thrown');
            } catch (e) {
                expect(e.message).to.equal('Create failed');
            }
        });

        it('should throw on missing vacbot.run method', async () => {
            ctx.vacbot.run = undefined;

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map'
                    }
                ]
            };

            try {
                await mapObjects.processMaps(adapter, ctx, mapData);
                expect.fail('Should have thrown');
            } catch (e) {
                expect(e).to.be.an('error');
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle maps without required properties', async () => {
            const mapData = {
                maps: [
                    {
                        // Missing mapID and mapName
                    }
                ]
            };

            await mapObjects.processMaps(adapter, ctx, mapData);

            expect(ctx.adapterProxy.createChannelNotExists.called).to.be.true;
            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
        });

        it('should handle spot areas with special characters in names', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: '' });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Living Room & Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
        });

        it('should handle very long area names', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: '' });
            const longName = 'This is a very long area name that might cause issues with certain systems and databases';
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: longName,
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
        });

        it('should handle numeric area IDs', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 123' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: '' });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: '123',
                mapSpotAreaName: 'Area 123',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
        });
    });

    describe('Feature Support Handling', () => {
        it('should handle models without mapping capabilities', async () => {
            ctx.getModel().isSupportedFeature.returns(false);

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map'
                    }
                ]
            };

            await mapObjects.processMaps(adapter, ctx, mapData);

            expect(ctx.vacbot.run.called).to.be.false;
        });

        it('should handle models without virtual boundaries support', async () => {
            ctx.getModel().isSupportedFeature.callsFake((feature) => feature !== 'map.virtualBoundaries.save');

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map'
                    }
                ]
            };

            await mapObjects.processMaps(adapter, ctx, mapData);

            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith('map.map123.saveVirtualBoundarySet')).to.be.true;
        });

        it('should handle models without spot areas support', async () => {
            ctx.getModel().isSupportedFeature.callsFake((feature) => feature !== 'map.spotAreas');

            const spotAreaData = {
                mapID: 'map123',
                mapSpotAreas: [
                    {
                        mapSpotAreaID: 'area1',
                        mapSpotAreaName: 'Living Room'
                    }
                ]
            };

            await mapObjects.processSpotAreas(adapter, ctx, spotAreaData);

            // vacbot.run for GetSpotAreaInfo is called even when spotAreas not supported
            // (the feature check is for GetSpotAreas command in vacbotRunGetAreaData, not processSpotAreas)
            expect(ctx.vacbot.run.calledWith('GetSpotAreaInfo')).to.be.true;
        });
    });

    describe('createOrUpdateLastTimePresenceAndLastCleanedSpotArea', () => {
        it('should create and update last cleaned spot area', async () => {
            ctx.currentMapID = 'map123';
            ctx.currentSpotAreaID = 'area1';
            ctx.currentSpotAreaName = 'Living Room';
            ctx.waterboxInstalled = true;

            await mapObjects.createOrUpdateLastTimePresenceAndLastCleanedSpotArea(adapter, ctx, 3600);

            expect(ctx.adapterProxy.setStateConditional.called).to.be.true;
            expect(ctx.adapterProxy.createChannelNotExists.called).to.be.true;
        });

        it('should handle when waterbox is not installed', async () => {
            ctx.currentMapID = 'map123';
            ctx.currentSpotAreaID = 'area1';
            ctx.currentSpotAreaName = 'Living Room';
            ctx.waterboxInstalled = false;

            await mapObjects.createOrUpdateLastTimePresenceAndLastCleanedSpotArea(adapter, ctx, 1800);

            expect(ctx.adapterProxy.setStateConditional.called).to.be.true;
        });

        it('should handle vacuum without mopping system', async () => {
            ctx.currentMapID = 'map123';
            ctx.currentSpotAreaID = 'area1';
            ctx.vacbot.hasMoppingSystem.returns(false);

            await mapObjects.createOrUpdateLastTimePresenceAndLastCleanedSpotArea(adapter, ctx, 900);

            expect(ctx.adapterProxy.setStateConditional.called).to.be.true;
        });
    });

    describe('processVirtualBoundaries', () => {
        it('should process virtual boundaries with no mop zones', async () => {
            const boundaryData = {
                mapID: 'map123',
                mapVirtualWalls: [
                    {
                        mapVirtualBoundaryID: 'boundary1',
                        mapVirtualBoundaryType: 'vw'
                    }
                ],
                mapNoMopZones: [
                    {
                        mapVirtualBoundaryID: 'boundary2',
                        mapVirtualBoundaryType: 'nmz'
                    }
                ]
            };

            await mapObjects.processVirtualBoundaries(adapter, ctx, boundaryData);

            expect(ctx.adapterProxy.createChannelNotExists.called).to.be.true;
            expect(ctx.vacbot.run.calledWith('GetVirtualBoundaryInfo')).to.be.true;
        });

        it('should handle empty virtual boundaries and no mop zones', async () => {
            const boundaryData = {
                mapID: 'map123',
                mapVirtualWalls: [],
                mapNoMopZones: []
            };

            await mapObjects.processVirtualBoundaries(adapter, ctx, boundaryData);

            expect(ctx.adapterProxy.createChannelNotExists.called).to.be.false;
        });

        it('should delete obsolete virtual boundary channels', async () => {
            mockMapHelper.isVirtualBoundariesChannel.returns(true);
            ctx.adapterProxy.getChannelsOfAsync.resolves([
                { _id: 'adapter.0.map.map123.virtualBoundaries.oldBoundary' }
            ]);

            const boundaryData = {
                mapID: 'map123',
                mapVirtualWalls: [
                    {
                        mapVirtualBoundaryID: 'newBoundary',
                        mapVirtualBoundaryType: 'vw'
                    }
                ],
                mapNoMopZones: []
            };

            await mapObjects.processVirtualBoundaries(adapter, ctx, boundaryData);

            expect(ctx.adapterProxy.deleteObjectIfExists.called).to.be.true;
        });
    });

    describe('processSpotAreas with channel cleanup', () => {
        it('should deactivate spot areas that no longer exist', async () => {
            mockMapHelper.isSpotAreasChannel.returns(true);
            ctx.adapterProxy.getChannelsOfAsync.resolves([
                { _id: 'adapter.0.map.map123.spotAreas.oldArea' }
            ]);
            ctx.adapterProxy.getStateAsync.resolves({ val: true });

            const spotAreaData = {
                mapID: 'map123',
                mapSpotAreas: [
                    {
                        mapSpotAreaID: 'area1',
                        mapSpotAreaName: 'Living Room'
                    }
                ]
            };

            await mapObjects.processSpotAreas(adapter, ctx, spotAreaData);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
            expect(ctx.adapterProxy.deleteObjectIfExists.called).to.be.true;
        });

        it('should handle spot area sync disabled', async () => {
            ctx.adapter.getConfigValue.returns('noSync');

            const spotAreaData = {
                mapID: 'map123',
                mapSpotAreas: [
                    {
                        mapSpotAreaID: 'area1',
                        mapSpotAreaName: 'Living Room'
                    }
                ]
            };

            await mapObjects.processSpotAreas(adapter, ctx, spotAreaData);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith(sinon.match(/control\.spotArea_/))).to.be.false;
        });
    });

    describe('processSpotAreaInfo with name handling', () => {
        it('should retrieve spot area name from API when configured', async () => {
            ctx.adapter.getConfigValue.withArgs('feature.control.spotAreaKeepModifiedNames').returns(0);
            ctx.getModel().is950type.returns(true);
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: '' });

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(mockMapHelper.getAreaName_i18n.called).to.be.true;
        });

        it('should keep modified spot area name when configured', async () => {
            ctx.adapter.getConfigValue.withArgs('feature.control.spotAreaKeepModifiedNames').returns(1);
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: 'My Custom Name' });

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(mockMapHelper.getAreaName_i18n.called).to.be.false;
        });

        it('should handle spot area with goToPosition when object exists with different values', async () => {
            ctx.adapter.getConfigValue.withArgs('feature.control.spotAreaKeepModifiedNames').returns(0);
            ctx.getModel().isSupportedFeature.callsFake(f => f === 'control.goToPosition');
            ctx.getModel().is950type.returns(false);
            ctx.getDevice().useNativeGoToPosition.returns(true);

            ctx.adapterProxy.getStateAsync.resolves({ val: '' });
            // First call: getObjectAsync for spotAreaObj, second call: for cleanSpotArea_silentApproach
            ctx.adapterProxy.getObjectAsync
                .onFirstCall().resolves({ common: { name: 'Test' } })
                .onSecondCall().resolves({
                    native: { goToPositionValues: '50,60' }
                });
            mockMapHelper.getCalculatedCenterForBoundary.returns('150, 250');

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
        });

        it('should not create goToPosition buttons when feature disabled', async () => {
            ctx.getModel().isSupportedFeature.callsFake((f) => f !== 'control.goToPosition');
            ctx.getModel().is950type.returns(true);
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: '' });

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(mockMapHelper.saveGoToPositionValues.called).to.be.false;
        });

        it('should handle missing spot area object', async () => {
            ctx.adapterProxy.getObjectAsync.resolves(null);

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.false;
        });

        it('should handle spot area with sequence number', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: '' });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: 5,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith(sinon.match(/spotAreaSequenceNumber/))).to.be.true;
        });

        it('should handle spot area with clean preference', async () => {
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: '' });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {
                    cleanCount: 2,
                    cleanSpeed: 3,
                    waterLevel: 2
                }
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith(sinon.match(/cleanPreference/))).to.be.true;
        });

        it('should handle full synchronization mode', async () => {
            ctx.adapter.getConfigValue.withArgs('feature.control.spotAreaSync').returns('fullSynchronization');
            ctx.currentMapID = 'map123';
            ctx.adapterProxy.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            ctx.adapterProxy.getStateAsync.resolves({ val: '' });

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSubType: '',
                mapSpotAreaSequenceNumber: -1,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, ctx, spotAreaInfo);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith(sinon.match(/control\.spotArea_/))).to.be.true;
        });
    });

    describe('processVirtualBoundaryInfo', () => {
        it('should update virtual boundary states', async () => {
            const boundaryInfo = {
                mapID: 'map123',
                mapVirtualBoundaryID: 'boundary1',
                mapVirtualBoundaryType: 'vw',
                mapVirtualBoundaryCoordinates: '100,200,300,400'
            };

            await mapObjects.processVirtualBoundaryInfo(adapter, ctx, boundaryInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
            expect(ctx.adapterProxy.extendObjectAsync.called).to.be.true;
        });

        it('should handle missing mapID', async () => {
            const boundaryInfo = {
                mapVirtualBoundaryID: 'boundary1',
                mapVirtualBoundaryType: 'vw',
                mapVirtualBoundaryCoordinates: '100,200,300,400'
            };

            await mapObjects.processVirtualBoundaryInfo(adapter, ctx, boundaryInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.false;
        });

        it('should handle missing object during extend', async () => {
            ctx.adapterProxy.getObjectAsync.resolves(null);

            const boundaryInfo = {
                mapID: 'map123',
                mapVirtualBoundaryID: 'boundary1',
                mapVirtualBoundaryType: 'vw',
                mapVirtualBoundaryCoordinates: '100,200,300,400'
            };

            await mapObjects.processVirtualBoundaryInfo(adapter, ctx, boundaryInfo);

            expect(ctx.adapterProxy.setStateConditionalAsync.called).to.be.true;
            expect(ctx.adapterProxy.extendObjectAsync.called).to.be.false;
        });
    });

    describe('processMaps with map image support', () => {
        it('should create map image objects when supported', async () => {
            ctx.getModel().isSupportedFeature.returns(true);

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map',
                        mapIsAvailable: true
                    }
                ]
            };

            await mapObjects.processMaps(adapter, ctx, mapData);

            expect(ctx.adapterProxy.createObjectNotExists.calledWith(sinon.match(/loadMapImage/))).to.be.true;
            expect(ctx.adapterProxy.createObjectNotExists.calledWith(sinon.match(/map64/))).to.be.true;
        });

        it('should delete map image objects when not supported', async () => {
            ctx.getModel().isSupportedFeature.callsFake((f) => f !== 'map.mapImage');

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map',
                        mapIsAvailable: true
                    }
                ]
            };

            await mapObjects.processMaps(adapter, ctx, mapData);

            expect(ctx.adapterProxy.deleteObjectIfExists.calledWith(sinon.match(/loadMapImage/))).to.be.true;
        });

        it('should deactivate maps that are no longer available', async () => {
            mockMapHelper.isMapSubSetChannel.returns(false);
            ctx.adapterProxy.getChannelsOfAsync.resolves([
                { _id: 'adapter.0.map.999' }
            ]);
            // First call for .isAvailable, second for .mapIsAvailable
            ctx.adapterProxy.getStateAsync.onFirstCall().resolves({ val: true });
            ctx.adapterProxy.getStateAsync.onSecondCall().resolves(null);

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map',
                        mapIsAvailable: true
                    }
                ]
            };

            await mapObjects.processMaps(adapter, ctx, mapData);

            // Map 999 should be deactivated (set to false)
            expect(ctx.adapterProxy.setStateConditionalAsync.calledWith(sinon.match(/mapIsAvailable/), false)).to.be.true;
        });
    });
});
