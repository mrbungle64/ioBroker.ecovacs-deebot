'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');

// Ecovacs login response code 1013 (device verification) / 1012 (invalid code).
class DeviceVerificationRequired extends Error {
    constructor(message = 'Device verification required', code = '1013') {
        super(message);
        this.name = 'DeviceVerificationRequired';
        this.code = code;
    }
}
class InvalidVerificationCode extends Error {
    constructor(message = 'Invalid or expired verification code', code = '1012') {
        super(message);
        this.name = 'InvalidVerificationCode';
        this.code = code;
    }
}

describe('main.js - device verification (login code 1013)', () => {
    let EcovacsDeebotFactory;
    let instance;
    // The api object that `new EcoVacsAPI(...)` returns; reconfigured per test.
    let apiInstance;

    // A constructor function returning apiInstance (a sinon.stub() constructor
    // would ignore its .prototype under `new`, so use a plain function).
    function mockEcoVacsAPI(...args) {
        mockEcoVacsAPI.constructedWith.push(args);
        return apiInstance;
    }
    mockEcoVacsAPI.constructedWith = [];
    mockEcoVacsAPI.md5 = sinon.stub().returns('mocked-md5');
    mockEcoVacsAPI.getDeviceId = sinon.stub().returns('generated-device-id');
    mockEcoVacsAPI.REALM = 'mocked-realm';
    mockEcoVacsAPI.DeviceVerificationRequired = DeviceVerificationRequired;
    mockEcoVacsAPI.InvalidVerificationCode = InvalidVerificationCode;

    const mockEcovacsDeebot = {
        EcoVacsAPI: mockEcoVacsAPI,
        countries: { DE: { continent: 'EU' } },
        // main.js destructures these error classes from the module exports.
        DeviceVerificationRequired,
        InvalidVerificationCode
    };

    const mockAdapterCore = {
        Adapter: class {
            constructor(options) {
                Object.assign(this, options || {});
                this.name = 'ecovacs-deebot';
                this.namespace = 'ecovacs-deebot';
                this.log = {
                    info: sinon.stub(),
                    warn: sinon.stub(),
                    error: sinon.stub(),
                    debug: sinon.stub(),
                    silly: sinon.stub()
                };
                this.config = {
                    pollingInterval: 120000,
                    countrycode: 'DE',
                    email: 'test@example.com',
                    password: 'testpassword'
                };
                this.password = 'testpassword';
                this.deviceContexts = new Map();
                this.connected = false;
                this.connectedTimestamp = 0;
                this.authFailed = false;
                this.connectionFailed = false;
                this._connecting = false;

                this.on = sinon.stub();
                this.setStateConditional = sinon.stub();
                this.setStateAsync = sinon.stub().resolves();
                this.getStateAsync = sinon.stub().resolves({ val: null });
                this.getObject = sinon.stub();
                this.setObjectNotExistsAsync = sinon.stub().resolves();
                this.subscribeStates = sinon.stub();
            }
        }
    };

    const mockNodeMachineId = { machineIdSync: sinon.stub().returns('test-machine-id') };

    const noopStubs = () => ({});
    const mockAdapterObjects = {
        createInitialInfoObjects: sinon.stub().resolves(),
        createInitialObjects: sinon.stub().resolves()
    };

    beforeEach(() => {
        sinon.resetHistory();
        mockEcoVacsAPI.getDeviceId = sinon.stub().returns('generated-device-id');
        mockEcoVacsAPI.constructedWith = [];

        // Fresh api object returned by `new EcoVacsAPI(...)`, reconfigured per test.
        apiInstance = {
            connect: sinon.stub().resolves(),
            devices: sinon.stub().resolves([]),
            requestDeviceVerificationCode: sinon.stub().resolves(),
            verifyDevice: sinon.stub().resolves('ready')
        };

        EcovacsDeebotFactory = proxyquire('../main', {
            '@iobroker/adapter-core': mockAdapterCore,
            'ecovacs-deebot': mockEcovacsDeebot,
            'node-machine-id': mockNodeMachineId,
            './lib/adapterObjects': mockAdapterObjects,
            './lib/adapterCommands': { handleStateChange: sinon.stub().resolves() },
            './lib/constants': { MIN_POLLING_INTERVAL_MS: 10000, CONNECT_COOLDOWN_MS: 0, REQUEST_THROTTLE_MAX_PER_DEVICE: 10 },
            './lib/adapterHelper': { isIdValid: sinon.stub().returns(true), getUnixTimestamp: sinon.stub().returns(0) },
            './lib/models': class { },
            './lib/device': class { },
            './lib/deviceContext': class { },
            './lib/requestThrottle': class { },
            './lib/mapObjects': noopStubs(),
            './lib/eventHandlers': noopStubs(),
            './lib/mapHelper': noopStubs()
        });

        instance = EcovacsDeebotFactory({});
        instance.requestThrottle = { maxRequests: 0 };
        // setupDevices is exercised elsewhere; here we only assert it is invoked
        // once verification succeeds, so stub it to keep these tests focused.
        instance.setupDevices = sinon.stub().resolves();
    });

    describe('connect() on code 1013', () => {
        it('enters verification mode instead of failing', async () => {
            apiInstance.connect = sinon.stub().rejects(new DeviceVerificationRequired());

            await instance.connect();

            expect(instance._awaitingVerification).to.equal(true);
            expect(instance.authFailed).to.equal(false);
            expect(instance.connectionFailed).to.equal(false);
            expect(apiInstance.requestDeviceVerificationCode.calledOnce).to.equal(true);
            // status transitions required -> code_sent
            const statusCalls = instance.setStateConditional.getCalls()
                .filter(c => c.args[0] === 'verification.status')
                .map(c => c.args[1]);
            expect(statusCalls).to.include('required');
            expect(statusCalls).to.include('code_sent');
        });

        it('does not enter verification mode for a normal auth error', async () => {
            apiInstance.connect = sinon.stub().rejects(new Error('code 1010 - incorrect account or password'));

            await instance.connect();

            expect(instance._awaitingVerification).to.equal(false);
            expect(instance.authFailed).to.equal(true);
            expect(apiInstance.requestDeviceVerificationCode.called).to.equal(false);
        });

        it('subsequent connect() is skipped while awaiting verification', async () => {
            apiInstance.connect = sinon.stub().rejects(new DeviceVerificationRequired());
            await instance.connect();
            apiInstance.requestDeviceVerificationCode.resetHistory();

            await instance.connect();

            expect(apiInstance.requestDeviceVerificationCode.called).to.equal(false);
        });
    });

    describe('submitVerificationCode()', () => {
        beforeEach(async () => {
            apiInstance.connect = sinon.stub().rejects(new DeviceVerificationRequired());
            await instance.connect();
            // The verification code the user typed into verification.code.
            instance.getStateAsync = sinon.stub()
                .withArgs('verification.code').resolves({ val: ' 123456 ' });
        });

        it('valid code calls verifyDevice and completes the login', async () => {
            await instance.submitVerificationCode();

            expect(apiInstance.verifyDevice.calledOnceWith('123456')).to.equal(true);
            expect(instance.setupDevices.calledOnce).to.equal(true);
            expect(instance._awaitingVerification).to.equal(false);
            const statusCalls = instance.setStateConditional.getCalls()
                .filter(c => c.args[0] === 'verification.status')
                .map(c => c.args[1]);
            expect(statusCalls).to.include('verified');
            // code state is cleared
            expect(instance.setStateAsync.calledWith('verification.code', { val: '', ack: true })).to.equal(true);
        });

        it('invalid code (1012) sets invalid_code, does not crash, allows retry', async () => {
            apiInstance.verifyDevice = sinon.stub().rejects(new InvalidVerificationCode());

            await instance.submitVerificationCode();

            const statusCalls = instance.setStateConditional.getCalls()
                .filter(c => c.args[0] === 'verification.status')
                .map(c => c.args[1]);
            expect(statusCalls).to.include('invalid_code');
            expect(instance.setupDevices.called).to.equal(false);
            expect(instance._verifying).to.equal(false);

            // Retry with a valid code now succeeds.
            apiInstance.verifyDevice = sinon.stub().resolves('ready');
            await instance.submitVerificationCode();
            expect(apiInstance.verifyDevice.calledOnceWith('123456')).to.equal(true);
            expect(instance.setupDevices.calledOnce).to.equal(true);
        });

        it('empty code does not call verifyDevice', async () => {
            instance.getStateAsync = sinon.stub().withArgs('verification.code').resolves({ val: '' });

            await instance.submitVerificationCode();

            expect(apiInstance.verifyDevice.called).to.equal(false);
        });
    });

    describe('persisted client deviceId', () => {
        it('first start generates and persists info.deviceId', async () => {
            instance.getStateAsync = sinon.stub().resolves({ val: null });

            const id = await instance.ensureDeviceId();

            expect(id).to.equal('generated-device-id');
            expect(instance.setStateAsync.calledWith('info.deviceId', { val: 'generated-device-id', ack: true })).to.equal(true);
        });

        it('second start reuses the persisted deviceId (no new 1013 risk)', async () => {
            instance.getStateAsync = sinon.stub().resolves({ val: 'persisted-id' });

            const id = await instance.ensureDeviceId();

            expect(id).to.equal('persisted-id');
            expect(mockEcoVacsAPI.getDeviceId.called).to.equal(false);
            expect(instance.setStateAsync.called).to.equal(false);
        });

        it('a non-empty clientDeviceId config overrides everything', async () => {
            instance.config.clientDeviceId = 'manual-id';
            instance.getStateAsync = sinon.stub().resolves({ val: 'persisted-id' });

            const id = await instance.ensureDeviceId();

            expect(id).to.equal('manual-id');
            expect(instance.getStateAsync.called).to.equal(false);
        });
    });
});
