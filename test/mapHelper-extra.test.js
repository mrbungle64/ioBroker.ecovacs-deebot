'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const { createMockCtx, createMockAdapter } = require('./mockHelper');

describe('mapHelper.js - virtual boundary sets', () => {
    let mapHelper;
    let ctx;
    let adapter;

    beforeEach(() => {
        adapter = createMockAdapter();
        ctx = createMockCtx();
        ctx.vacbot.run = sinon.stub();
        ctx.commandQueue = { run: sinon.stub() };

        mapHelper = proxyquire('../lib/mapHelper', {});
    });

    describe('createVirtualBoundarySet', () => {
        const stateId = 'test.ns.map.savedBoundarySets.virtualBoundarySet_123';

        it('should call AddVirtualBoundary when boundary does not exist on channels', async () => {
            const stateObj = {
                native: {
                    currentMapID: '1',
                    virtualBoundarySet: {
                        '0': {
                            virtualBoundaryID: 'vb_new',
                            boundaryCoordinates: '500,600,700,800',
                            boundaryType: 'NoMopZone'
                        }
                    }
                }
            };
            ctx.adapterProxy.getObjectAsync
                .withArgs(stateId).resolves(stateObj);
            ctx.adapterProxy.getChannelsOfAsync
                .withArgs('map').resolves([]);

            await mapHelper.createVirtualBoundarySet(adapter, ctx, stateId);

            expect(ctx.commandQueue.run.calledWith(
                'AddVirtualBoundary', '1', '500,600,700,800', 'NoMopZone'
            )).to.be.true;
            expect(ctx.vacbot.run.calledWith('GetMaps')).to.be.true;
        });

        it('should not call AddVirtualBoundary when boundary exists on channels', async () => {
            const stateObj = {
                native: {
                    currentMapID: '1',
                    virtualBoundarySet: {
                        '0': {
                            virtualBoundaryID: 'vb_1',
                            boundaryCoordinates: '100,200,300,400',
                            boundaryType: 'NoMopZone'
                        }
                    }
                }
            };
            ctx.adapterProxy.getObjectAsync
                .withArgs(stateId).resolves(stateObj);

            // Channel must match isVirtualBoundariesChannel ('virtualBoundaries' in id)
            // AND include '.1.' (the currentMapID)
            const channelObj = {
                _id: 'test.1.virtualBoundaries.vb_1',
                native: {
                    virtualBoundaryID: 'vb_1',
                    virtualBoundaryCoordinates: '100,200,300,400',
                    virtualBoundaryType: 'NoMopZone'
                }
            };
            ctx.adapterProxy.getChannelsOfAsync
                .withArgs('map').resolves([channelObj]);

            await mapHelper.createVirtualBoundarySet(adapter, ctx, stateId);

            expect(ctx.commandQueue.run.calledWith('AddVirtualBoundary')).to.be.false;
            expect(ctx.vacbot.run.calledWith('GetMaps')).to.be.true;
        });

        it('should do nothing when object has no native data', async () => {
            ctx.adapterProxy.getObjectAsync
                .withArgs(stateId).resolves({});

            await mapHelper.createVirtualBoundarySet(adapter, ctx, stateId);

            expect(ctx.vacbot.run.called).to.be.false;
        });
    });

    describe('deleteVirtualBoundary', () => {
        it('should delete a virtual boundary with type', async () => {
            // deleteVirtualBoundary(adapter, ctx, mapID, mapSpotAreaID)
            const mapID = '1';
            const mapSpotAreaID = 'vb_1';

            const objID = 'map.1.virtualBoundaries.vb_1';
            ctx.adapterProxy.getObjectAsync
                .withArgs(objID).resolves({});

            const stateID = 'map.1.virtualBoundaries.vb_1.virtualBoundaryType';
            ctx.adapterProxy.getStateAsync
                .withArgs(stateID).resolves({ val: 'VirtualWall' });

            await mapHelper.deleteVirtualBoundary(adapter, ctx, mapID, mapSpotAreaID);

            expect(ctx.commandQueue.run.calledWith(
                'DeleteVirtualBoundary', '1', 'vb_1', 'VirtualWall'
            )).to.be.true;
            expect(ctx.vacbot.run.calledWith('GetMaps')).to.be.true;
        });

        it('should call GetMaps even when object does not exist', async () => {
            const mapID = '1';
            const mapSpotAreaID = 'vb_nonexistent';

            const objID = 'map.1.virtualBoundaries.vb_nonexistent';
            ctx.adapterProxy.getObjectAsync
                .withArgs(objID).resolves(null);

            await mapHelper.deleteVirtualBoundary(adapter, ctx, mapID, mapSpotAreaID);

            expect(ctx.vacbot.run.calledWith('GetMaps')).to.be.true;
        });
    });
});
