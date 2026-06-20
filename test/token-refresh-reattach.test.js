'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');

// Phase A of consuming ecovacs-deebot alpha.21: the adapter no longer polls
// getMqttClient() after a token refresh. Instead it listens once for the
// library's 'mqttClientReplaced' event on the primary vacbot and re-subscribes
// the shared (secondary) devices through the replacement client.
describe('token-refresh-reattach.test.js - mqttClientReplaced driven reattach', () => {
    const mockEcoVacsAPI = sinon.stub();
    mockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
    mockEcoVacsAPI.getDeviceId = sinon.stub().returns('mocked-device-id');
    mockEcoVacsAPI.REALM = 'mocked-realm';

    const mockEcovacsDeebot = { EcoVacsAPI: mockEcoVacsAPI, countries: { DE: { continent: 'EU' } } };

    const mockAdapterCore = {
        Adapter: class {
            constructor(options) {
                Object.assign(this, options || {});
                this.namespace = 'ecovacs-deebot.0';
                this.log = { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), debug: sinon.stub(), silly: sinon.stub() };
                this.config = {};
                this.deviceContexts = new Map();
                this.on = sinon.stub();
            }
        }
    };

    let instance;

    // Minimal vacbot supporting the EventEmitter-style once() the adapter uses.
    function makeVacbot() {
        const listeners = {};
        return {
            _listeners: listeners,
            once: sinon.spy((name, fn) => { listeners[name] = fn; }),
            emit: (name, arg) => { if (listeners[name]) listeners[name](arg); },
            updateUserAccessToken: sinon.stub(),
            connectShared: sinon.stub()
        };
    }

    beforeEach(() => {
        sinon.resetHistory();
        const Factory = proxyquire('../main', {
            '@iobroker/adapter-core': mockAdapterCore,
            'ecovacs-deebot': mockEcovacsDeebot,
            'node-machine-id': { machineIdSync: sinon.stub().returns('id') }
        });
        instance = Factory({});
    });

    it('applies the token to every device and registers a one-time mqttClientReplaced listener on the primary', () => {
        const primary = makeVacbot();
        const secondary = makeVacbot();
        instance.deviceContexts.set('a', { deviceId: 'a', vacbot: primary, isPrimaryMqttDevice: true, usesSharedMqttClient: false });
        instance.deviceContexts.set('b', { deviceId: 'b', vacbot: secondary, isPrimaryMqttDevice: false, usesSharedMqttClient: true });

        const updated = instance._applyRefreshedToken('new-token');

        expect(updated).to.equal(2);
        expect(primary.updateUserAccessToken.calledWith('new-token')).to.be.true;
        expect(secondary.updateUserAccessToken.calledWith('new-token')).to.be.true;
        expect(primary.once.calledWith('mqttClientReplaced')).to.be.true;
    });

    it('re-subscribes shared devices through the replacement client when mqttClientReplaced fires', () => {
        const primary = makeVacbot();
        const secondary = makeVacbot();
        instance.deviceContexts.set('a', { deviceId: 'a', vacbot: primary, isPrimaryMqttDevice: true, usesSharedMqttClient: false });
        instance.deviceContexts.set('b', { deviceId: 'b', vacbot: secondary, isPrimaryMqttDevice: false, usesSharedMqttClient: true });

        instance._applyRefreshedToken('new-token');

        const newClient = { connected: true, id: 'replacement' };
        primary.emit('mqttClientReplaced', newClient);

        expect(secondary.connectShared.calledOnceWith(newClient)).to.be.true;
        // The primary owns the client; it must not re-subscribe to its own client.
        expect(primary.connectShared.called).to.be.false;
    });

    it('does not register a reattach listener when there are no shared devices', () => {
        const primary = makeVacbot();
        instance.deviceContexts.set('a', { deviceId: 'a', vacbot: primary, isPrimaryMqttDevice: true, usesSharedMqttClient: false });

        instance._applyRefreshedToken('new-token');

        expect(primary.once.called).to.be.false;
        expect(primary.updateUserAccessToken.calledWith('new-token')).to.be.true;
    });

    it('returns 0 and does nothing for an empty token', () => {
        const primary = makeVacbot();
        instance.deviceContexts.set('a', { deviceId: 'a', vacbot: primary, isPrimaryMqttDevice: true, usesSharedMqttClient: false });

        expect(instance._applyRefreshedToken('')).to.equal(0);
        expect(primary.updateUserAccessToken.called).to.be.false;
    });
});
