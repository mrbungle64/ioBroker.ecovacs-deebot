'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Mock dependencies
const mockMapHelper = {
    isMapSubSetChannel: sinon.stub(),
    isSpotAreasChannel: sinon.stub(),
    isVirtualBoundariesChannel: sinon.stub(),
    getCalculatedCenterForBoundary: sinon.stub().returns({ x: 100, y: 200 }),
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

const mockHelper = {
    getUnixTimestamp: sinon.stub().returns(1234567890),
    getCurrentDateAndTimeFormatted: sinon.stub().returns('2023.01.01 12:00:00'),
    isIdValid: sinon.stub().returns(true)
};

// Load the module with mocked dependencies
const mapObjects = proxyquire('../lib/mapObjects', {
    './mapHelper': mockMapHelper,
    './adapterObjects': mockAdapterObjects,
    './adapterHelper': mockHelper
});

// Create mock adapter
const createMockAdapter = () => ({
    log: {
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
    },
    createChannelNotExists: sinon.stub().resolves(),
    createObjectNotExists: sinon.stub().resolves(),
    setObjectNotExists: sinon.stub().resolves(),
    setStateConditional: sinon.stub(),
    setStateConditionalAsync: sinon.stub().resolves(),
    deleteObjectIfExists: sinon.stub().resolves(),
    deleteChannelIfExists: sinon.stub().resolves(),
    getStateAsync: sinon.stub().resolves({ val: 'test-value' }),
    getObjectAsync: sinon.stub().resolves({ common: { name: 'Test' } }),
    getChannelsOfAsync: sinon.stub().resolves([]),
    getConfigValue: sinon.stub().returns(true),
    extendObjectAsync: sinon.stub().resolves(),
    extendObject: sinon.stub().resolves(),
    getDevice: sinon.stub().returns({
        useNativeGoToPosition: sinon.stub().returns(true)
    }),
    getModel: sinon.stub().returns({
        isSupportedFeature: sinon.stub().returns(true),
        hasMappingCapabilities: sinon.stub().returns(true),
        is950type: sinon.stub().returns(false),
        is950type_V2: sinon.stub().returns(false),
        isNot950type_V2: sinon.stub().returns(true),
        getCleanSpeed: sinon.stub().returns(3),
        getWaterLevel: sinon.stub().returns(3)
    }),
    getCurrentDateAndTimeFormatted: sinon.stub().returns('2023.01.01 12:00:00'),
    currentMapID: 'map123',
    currentSpotAreaID: 'area1',
    currentSpotAreaName: 'Test Area',
    canvasModuleIsInstalled: true,
    waterboxInstalled: false,
    spotAreaCleanings: 2,
    vacbot: {
        run: sinon.stub().resolves(),
        hasMoppingSystem: sinon.stub().returns(true)
    }
});

describe('mapObjects.js', () => {
    let adapter;

    beforeEach(() => {
        adapter = createMockAdapter();
        // Reset history on module-level mock stubs only
        Object.values(mockMapHelper).forEach(stub => {
            if (stub && stub.resetHistory) stub.resetHistory();
        });
        Object.values(mockAdapterObjects).forEach(stub => {
            if (stub && stub.resetHistory) stub.resetHistory();
        });
        Object.values(mockHelper).forEach(stub => {
            if (stub && stub.resetHistory) stub.resetHistory();
        });
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

            await mapObjects.processMaps(adapter, mapData);

            expect(adapter.log.debug.calledWith('[processMaps] Processing map data')).to.be.true;
            expect(adapter.createChannelNotExists.called).to.be.true;
            expect(adapter.setStateConditionalAsync.called).to.be.true;
        });

        it('should handle empty map data', async () => {
            const mapData = { maps: [] };

            await mapObjects.processMaps(adapter, mapData);

            expect(adapter.log.debug.calledWith('[processMaps] Processing map data')).to.be.true;
            expect(adapter.createChannelNotExists.called).to.be.false;
        });

        it('should throw on null map data', async () => {
            try {
                await mapObjects.processMaps(adapter, null);
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

            await mapObjects.processSpotAreas(adapter, spotAreaData);

            expect(adapter.createChannelNotExists.called).to.be.true;
        });

        it('should handle empty spot areas', async () => {
            const spotAreaData = { mapID: 'map123', mapSpotAreas: [] };

            await mapObjects.processSpotAreas(adapter, spotAreaData);

            expect(adapter.createChannelNotExists.called).to.be.false;
        });

        it('should throw on null spot area data', async () => {
            try {
                await mapObjects.processSpotAreas(adapter, null);
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

            await mapObjects.processVirtualBoundaries(adapter, boundaryData);

            expect(adapter.createChannelNotExists.called).to.be.true;
        });

        it('should handle empty virtual boundaries', async () => {
            const boundaryData = { mapID: 'map123', mapVirtualWalls: [], mapNoMopZones: [] };

            await mapObjects.processVirtualBoundaries(adapter, boundaryData);

            expect(adapter.createChannelNotExists.called).to.be.false;
        });
    });

    describe('processSpotAreaInfo', () => {
        it('should process spot area info successfully', async () => {
            adapter.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Living Room',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.true;
        });

        it('should throw on null spot area info', async () => {
            try {
                await mapObjects.processSpotAreaInfo(adapter, null);
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

            await mapObjects.processVirtualBoundaryInfo(adapter, boundaryInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.true;
        });

        it('should throw on null boundary info', async () => {
            try {
                await mapObjects.processVirtualBoundaryInfo(adapter, null);
                expect.fail('Should have thrown');
            } catch (e) {
                expect(e).to.be.an('error');
            }
        });
    });

    describe('Error Handling', () => {
        it('should throw on adapter method failures', async () => {
            adapter.createChannelNotExists.rejects(new Error('Create failed'));
            
            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map'
                    }
                ]
            };

            try {
                await mapObjects.processMaps(adapter, mapData);
                expect.fail('Should have thrown');
            } catch (e) {
                expect(e.message).to.equal('Create failed');
            }
        });

        it('should throw on missing vacbot.run method', async () => {
            adapter.vacbot.run = undefined;
            
            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map'
                    }
                ]
            };

            try {
                await mapObjects.processMaps(adapter, mapData);
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

            await mapObjects.processMaps(adapter, mapData);

            expect(adapter.createChannelNotExists.called).to.be.true;
            expect(adapter.setStateConditionalAsync.called).to.be.true;
        });

        it('should handle spot areas with special characters in names', async () => {
            adapter.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Living Room & Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.true;
        });

        it('should handle very long area names', async () => {
            adapter.getObjectAsync.resolves({ common: { name: 'Spot area 1' } });
            const longName = 'This is a very long area name that might cause issues with certain systems and databases';
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: longName,
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.true;
        });

        it('should handle numeric area IDs', async () => {
            adapter.getObjectAsync.resolves({ common: { name: 'Spot area 123' } });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: '123',
                mapSpotAreaName: 'Area 123',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.true;
        });
    });

    describe('Feature Support Handling', () => {
        it('should handle models without mapping capabilities', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().returns(false),
                hasMappingCapabilities: sinon.stub().returns(false)
            });

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map'
                    }
                ]
            };

            await mapObjects.processMaps(adapter, mapData);

            expect(adapter.vacbot.run.called).to.be.false;
        });

        it('should handle models without virtual boundaries support', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((feature) => feature !== 'map.virtualBoundaries.save'),
                hasMappingCapabilities: sinon.stub().returns(true)
            });

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map'
                    }
                ]
            };

            await mapObjects.processMaps(adapter, mapData);

            expect(adapter.deleteObjectIfExists.calledWith('map.map123.saveVirtualBoundarySet')).to.be.true;
        });

        it('should handle models without spot areas support', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((feature) => feature !== 'map.spotAreas'),
                hasMappingCapabilities: sinon.stub().returns(true)
            });

            const spotAreaData = {
                mapID: 'map123',
                mapSpotAreas: [
                    {
                        mapSpotAreaID: 'area1',
                        mapSpotAreaName: 'Living Room'
                    }
                ]
            };

            await mapObjects.processSpotAreas(adapter, spotAreaData);

            expect(adapter.vacbot.run.called).to.be.true;
        });
    });

    describe('createOrUpdateLastTimePresenceAndLastCleanedSpotArea', () => {
        it('should create and update last cleaned spot area', async () => {
            adapter.currentMapID = 'map123';
            adapter.currentSpotAreaID = 'area1';
            adapter.currentSpotAreaName = 'Living Room';
            adapter.waterboxInstalled = true;

            await mapObjects.createOrUpdateLastTimePresenceAndLastCleanedSpotArea(adapter, 3600);

            expect(adapter.setStateConditional.called).to.be.true;
            expect(adapter.createChannelNotExists.called).to.be.true;
        });

        it('should handle when waterbox is not installed', async () => {
            adapter.currentMapID = 'map123';
            adapter.currentSpotAreaID = 'area1';
            adapter.currentSpotAreaName = 'Living Room';
            adapter.waterboxInstalled = false;

            await mapObjects.createOrUpdateLastTimePresenceAndLastCleanedSpotArea(adapter, 1800);

            expect(adapter.setStateConditional.called).to.be.true;
        });

        it('should handle vacuum without mopping system', async () => {
            adapter.currentMapID = 'map123';
            adapter.currentSpotAreaID = 'area1';
            adapter.vacbot.hasMoppingSystem.returns(false);

            await mapObjects.createOrUpdateLastTimePresenceAndLastCleanedSpotArea(adapter, 900);

            expect(adapter.setStateConditional.called).to.be.true;
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

            await mapObjects.processVirtualBoundaries(adapter, boundaryData);

            expect(adapter.createChannelNotExists.called).to.be.true;
            expect(adapter.vacbot.run.calledWith('GetVirtualBoundaryInfo')).to.be.true;
        });

        it('should handle empty virtual boundaries and no mop zones', async () => {
            const boundaryData = {
                mapID: 'map123',
                mapVirtualWalls: [],
                mapNoMopZones: []
            };

            await mapObjects.processVirtualBoundaries(adapter, boundaryData);

            expect(adapter.createChannelNotExists.called).to.be.false;
        });

        it('should delete obsolete virtual boundary channels', async () => {
            mockMapHelper.isVirtualBoundariesChannel.returns(true);
            adapter.getChannelsOfAsync.resolves([
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

            await mapObjects.processVirtualBoundaries(adapter, boundaryData);

            expect(adapter.deleteObjectIfExists.called).to.be.true;
        });
    });

    describe('processSpotAreas with channel cleanup', () => {
        it('should deactivate spot areas that no longer exist', async () => {
            mockMapHelper.isSpotAreasChannel.returns(true);
            adapter.getChannelsOfAsync.resolves([
                { _id: 'adapter.0.map.map123.spotAreas.oldArea' }
            ]);
            adapter.getStateAsync.resolves({ val: true });

            const spotAreaData = {
                mapID: 'map123',
                mapSpotAreas: [
                    {
                        mapSpotAreaID: 'area1',
                        mapSpotAreaName: 'Living Room'
                    }
                ]
            };

            await mapObjects.processSpotAreas(adapter, spotAreaData);

            expect(adapter.setStateConditionalAsync.called).to.be.true;
            expect(adapter.deleteObjectIfExists.called).to.be.true;
        });

        it('should handle spot area sync disabled', async () => {
            adapter.getConfigValue.returns('noSync');

            const spotAreaData = {
                mapID: 'map123',
                mapSpotAreas: [
                    {
                        mapSpotAreaID: 'area1',
                        mapSpotAreaName: 'Living Room'
                    }
                ]
            };

            await mapObjects.processSpotAreas(adapter, spotAreaData);

            expect(adapter.createObjectNotExists.calledWith(sinon.match(/control\.spotArea_/))).to.be.false;
        });
    });

    describe('processSpotAreaInfo with name handling', () => {
        it('should retrieve spot area name from API when configured', async () => {
            adapter.getConfigValue.withArgs('feature.control.spotAreaKeepModifiedNames').returns(0);
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().returns(true),
                is950type: sinon.stub().returns(true),
                hasMappingCapabilities: sinon.stub().returns(true)
            });
            adapter.getStateAsync.resolves({ val: '' });

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(mockMapHelper.getAreaName_i18n.called).to.be.true;
        });

        it('should keep modified spot area name when configured', async () => {
            adapter.getConfigValue.withArgs('feature.control.spotAreaKeepModifiedNames').returns(1);
            adapter.getStateAsync.resolves({ val: 'My Custom Name' });

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(mockMapHelper.getAreaName_i18n.called).to.be.false;
        });

        it('should handle spot area with goToPosition when object exists with different values', async () => {
            adapter.getConfigValue.withArgs('feature.control.spotAreaKeepModifiedNames').returns(0);
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake(f => f === 'control.goToPosition'),
                is950type: sinon.stub().returns(false),
                hasMappingCapabilities: sinon.stub().returns(true)
            });
            adapter.getStateAsync.resolves({ val: '' });
            // Object exists but with different goToPositionValues
            adapter.getObjectAsync.onFirstCall().resolves({ common: { name: 'Test' } });
            adapter.getObjectAsync.onSecondCall().resolves({
                native: { goToPositionValues: '50,60' }
            });
            mockMapHelper.getCalculatedCenterForBoundary.returns({ x: 150, y: 250 });

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.true;
        });

        it('should not create goToPosition buttons when feature disabled', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((f) => f !== 'control.goToPosition'),
                is950type: sinon.stub().returns(true),
                hasMappingCapabilities: sinon.stub().returns(true)
            });

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(mockMapHelper.saveGoToPositionValues.called).to.be.false;
        });

        it('should handle missing spot area object', async () => {
            adapter.getObjectAsync.resolves(null);

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.false;
        });

        it('should handle spot area with sequence number', async () => {
            adapter.getStateAsync.resolves({ val: '' });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaSequenceNumber: 5,
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(adapter.createObjectNotExists.calledWith(sinon.match(/spotAreaSequenceNumber/))).to.be.true;
        });

        it('should handle spot area with clean preference', async () => {
            adapter.getStateAsync.resolves({ val: '' });
            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {
                    cleanCount: 2,
                    cleanSpeed: 3,
                    waterLevel: 2
                }
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(adapter.createObjectNotExists.calledWith(sinon.match(/cleanPreference/))).to.be.true;
        });

        it('should handle full synchronization mode', async () => {
            adapter.getConfigValue.withArgs('feature.control.spotAreaSync').returns('fullSynchronization');
            adapter.currentMapID = 'map123';
            adapter.getStateAsync.resolves({ val: '' });

            const spotAreaInfo = {
                mapID: 'map123',
                mapSpotAreaID: 'area1',
                mapSpotAreaName: 'Kitchen',
                mapSpotAreaBoundaries: '100,200,300,400',
                mapSpotAreaCleanSet: {}
            };

            await mapObjects.processSpotAreaInfo(adapter, spotAreaInfo);

            expect(adapter.createObjectNotExists.calledWith(sinon.match(/control\.spotArea_/))).to.be.true;
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

            await mapObjects.processVirtualBoundaryInfo(adapter, boundaryInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.true;
            expect(adapter.extendObjectAsync.called).to.be.true;
        });

        it('should handle missing mapID', async () => {
            const boundaryInfo = {
                mapVirtualBoundaryID: 'boundary1',
                mapVirtualBoundaryType: 'vw',
                mapVirtualBoundaryCoordinates: '100,200,300,400'
            };

            await mapObjects.processVirtualBoundaryInfo(adapter, boundaryInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.false;
        });

        it('should handle missing object during extend', async () => {
            adapter.getObjectAsync.resolves(null);

            const boundaryInfo = {
                mapID: 'map123',
                mapVirtualBoundaryID: 'boundary1',
                mapVirtualBoundaryType: 'vw',
                mapVirtualBoundaryCoordinates: '100,200,300,400'
            };

            await mapObjects.processVirtualBoundaryInfo(adapter, boundaryInfo);

            expect(adapter.setStateConditionalAsync.called).to.be.true;
            expect(adapter.extendObjectAsync.called).to.be.false;
        });
    });

    describe('processMaps with map image support', () => {
        it('should create map image objects when supported', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().returns(true),
                hasMappingCapabilities: sinon.stub().returns(true)
            });

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map',
                        mapIsAvailable: true
                    }
                ]
            };

            await mapObjects.processMaps(adapter, mapData);

            expect(adapter.createObjectNotExists.calledWith(sinon.match(/loadMapImage/))).to.be.true;
            expect(adapter.createObjectNotExists.calledWith(sinon.match(/map64/))).to.be.true;
        });

        it('should delete map image objects when not supported', async () => {
            adapter.getModel.returns({
                isSupportedFeature: sinon.stub().callsFake((f) => f !== 'map.mapImage'),
                hasMappingCapabilities: sinon.stub().returns(true)
            });

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map',
                        mapIsAvailable: true
                    }
                ]
            };

            await mapObjects.processMaps(adapter, mapData);

            expect(adapter.deleteObjectIfExists.calledWith(sinon.match(/loadMapImage/))).to.be.true;
        });

        it('should deactivate maps that are no longer available', async () => {
            mockMapHelper.isMapSubSetChannel.returns(false);
            adapter.getChannelsOfAsync.resolves([
                { _id: 'adapter.0.map.999' }
            ]);
            // First call for .isAvailable, second for .mapIsAvailable
            adapter.getStateAsync.onFirstCall().resolves({ val: true });
            adapter.getStateAsync.onSecondCall().resolves(null);

            const mapData = {
                maps: [
                    {
                        mapID: 'map123',
                        mapName: 'Test Map',
                        mapIsAvailable: true
                    }
                ]
            };

            await mapObjects.processMaps(adapter, mapData);

            // Map 999 should be deactivated (set to false)
            expect(adapter.setStateConditionalAsync.calledWith(sinon.match(/mapIsAvailable/), false)).to.be.true;
        });
    });
});