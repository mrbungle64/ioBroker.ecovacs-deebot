'use strict';

const { expect } = require('chai');
const { describe, it } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

/** Build the real state-change route with robot communication replaced by spies. */
function createAdapter(singleDeviceMode) {
    const mapHelper = {
        saveVirtualBoundary: sinon.stub().resolves(),
        deleteVirtualBoundary: sinon.stub().resolves(),
        saveVirtualBoundarySet: sinon.stub().resolves()
    };
    const adapterCommands = proxyquire('../lib/adapterCommands', { './mapHelper': mapHelper });
    const factory = proxyquire.noCallThru()('../main', {
        '@iobroker/adapter-core': {
            Adapter: class {
                constructor() {
                    this.namespace = 'ecovacs-deebot.0';
                    this.config = { singleDeviceMode };
                    this.log = { info: sinon.stub(), debug: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
                    this.on = sinon.stub();
                }
            }
        },
        'ecovacs-deebot': {},
        'node-machine-id': {},
        './lib/adapterCommands': adapterCommands,
        './lib/adapterObjects': {},
        './lib/constants': {},
        './lib/adapterHelper': {},
        './lib/models': class {},
        './lib/device': class {},
        './lib/deviceContext': class {},
        './lib/requestThrottle': class {},
        './lib/mapObjects': {},
        './lib/eventHandlers': {},
        './lib/mapHelper': {}
    });
    const adapter = factory({});
    adapter.getObject = sinon.stub().callsFake((_id, callback) => callback(null, { common: { role: 'button' } }));
    adapter.getCurrentDateAndTimeFormatted = sinon.stub().returns('');
    const ctx = {
        enabled: true,
        connected: true,
        adapter,
        statePath: id => singleDeviceMode ? id : `test_device.${id}`,
        adapterProxy: { setStateConditional: sinon.stub() },
        vacbot: { run: sinon.stub() }
    };
    adapter.deviceContexts.set('test_device', ctx);
    return { adapter, ctx, mapHelper };
}

/** Send a full ioBroker state ID through the shipped routing and command handler. */
async function writeMapState(adapter, ctx, path, state = { val: true, ack: false }) {
    const devicePrefix = adapter.config.singleDeviceMode ? '' : 'test_device.';
    adapter.onStateChange(`${adapter.namespace}.${devicePrefix}${path}`, state);
    await ctx._stateChangePromise;
    expect(adapter.log.error.called).to.be.false;
}

describe('map commands through onStateChange', () => {
    for (const singleDeviceMode of [true, false]) {
        describe(singleDeviceMode ? 'single-device mode' : 'multi-device mode', () => {
            it('loads the requested map image and resets the correct button', async () => {
                const { adapter, ctx } = createAdapter(singleDeviceMode);
                const path = 'map.2012459551.loadMapImage';

                await writeMapState(adapter, ctx, path);

                expect(ctx.vacbot.run.args).to.deep.equal([['GetMapImage', '2012459551', 'outline']]);
                expect(adapter.getObject.calledWith(ctx.statePath(path))).to.be.true;
                expect(ctx.adapterProxy.setStateConditional.calledWith(path, false, true)).to.be.true;
            });

            it('passes the map ID when saving a boundary set', async () => {
                const { adapter, ctx, mapHelper } = createAdapter(singleDeviceMode);

                await writeMapState(adapter, ctx, 'map.2012459551.saveVirtualBoundarySet');

                expect(mapHelper.saveVirtualBoundarySet.calledOnceWithExactly(adapter, ctx, '2012459551')).to.be.true;
            });

            for (const command of ['saveVirtualBoundary', 'deleteVirtualBoundary']) {
                it(`passes map and boundary IDs for ${command}`, async () => {
                    const { adapter, ctx, mapHelper } = createAdapter(singleDeviceMode);

                    await writeMapState(adapter, ctx, `map.2012459551.virtualBoundaries.7.${command}`);

                    expect(mapHelper[command].calledOnceWithExactly(adapter, ctx, '2012459551', '7')).to.be.true;
                });
            }

            it('cleans the requested room on the current map', async () => {
                const { adapter, ctx } = createAdapter(singleDeviceMode);
                ctx.currentMapID = '2012459551';
                ctx.getModel = () => ({ isSupportedFeature: () => false });

                await writeMapState(adapter, ctx, 'map.2012459551.spotAreas.7.cleanSpotArea');

                expect(ctx.vacbot.run.args).to.deep.equal([['spotArea', 'start', '7']]);
            });

            it('rejects room cleaning on a different map', async () => {
                const { adapter, ctx } = createAdapter(singleDeviceMode);
                ctx.currentMapID = '2012459552';
                ctx.getModel = () => ({ isSupportedFeature: () => false });
                const devicePrefix = singleDeviceMode ? '' : 'test_device.';

                adapter.onStateChange(`${adapter.namespace}.${devicePrefix}map.2012459551.spotAreas.7.cleanSpotArea`, { val: true, ack: false });
                await ctx._stateChangePromise;

                expect(ctx.vacbot.run.called).to.be.false;
                expect(adapter.log.error.calledOnceWithExactly('failed start cleaning spot area: 7 - bot not on map 2012459551 (current mapID: 2012459552)')).to.be.true;
            });

            it('ignores acknowledged map image writes', async () => {
                const { adapter, ctx } = createAdapter(singleDeviceMode);

                await writeMapState(adapter, ctx, 'map.2012459551.loadMapImage', { val: true, ack: true });

                expect(ctx.vacbot.run.called).to.be.false;
            });

            it('ignores map image writes while disconnected', async () => {
                const { adapter, ctx } = createAdapter(singleDeviceMode);
                ctx.connected = false;

                await writeMapState(adapter, ctx, 'map.2012459551.loadMapImage');

                expect(ctx.vacbot.run.called).to.be.false;
            });
        });
    }
});
