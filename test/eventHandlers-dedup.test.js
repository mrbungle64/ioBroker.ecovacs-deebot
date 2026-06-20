'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const fs = require('fs');

describe('eventHandlers.js - deduplication checks', () => {
    describe('no duplicate event registrations across all handlers', () => {
        let eventHandlers;
        let mockVacbot;
        let registeredEvents;

        beforeEach(() => {
            eventHandlers = require('../lib/eventHandlers');
            registeredEvents = new Map();

            mockVacbot = {
                on: sinon.stub().callsFake((eventName, handler) => {
                    const count = registeredEvents.get(eventName) || 0;
                    registeredEvents.set(eventName, count + 1);
                    return mockVacbot;
                })
            };

            const mockMain = {
                log: {
                    info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(),
                    debug: sinon.stub(), silly: sinon.stub()
                },
                updateDeviceConnectionState: sinon.stub(),
                clearUnreachableRetry: sinon.stub(),
                updateConnectionState: sinon.stub(),
                setInitialStateValues: sinon.stub().resolves(),
                setConnection: sinon.stub(),
                vacbotInitialGetStates: sinon.stub(),
                setDeviceStatusByTrigger: sinon.stub(),
                resetErrorStates: sinon.stub(),
                handleDeviceDataReceived: sinon.stub(),
                resetCurrentStats: sinon.stub(),
                setPauseBeforeDockingIfWaterboxInstalled: sinon.stub().resolves(),
                createInfoExtendedChannelNotExists: sinon.stub().resolves(),
                createAirDryingStates: sinon.stub().resolves(),
                handleAirDryingActive: sinon.stub(),
                handleWaterBoxMoppingType: sinon.stub().resolves(),
                handleWaterBoxScrubbingType: sinon.stub().resolves(),
                handleSweepMode: sinon.stub().resolves(),
                handlePositionObj: sinon.stub().resolves(),
                handleSilentApproach: sinon.stub(),
                setHistoryValuesForDustboxRemoval: sinon.stub(),
                getCurrentDateAndTimeFormatted: sinon.stub().returns('2026-05-04 00:00:00'),
                getConfigValue: sinon.stub().returns(''),
                getHoursUntilDustBagEmptyReminderFlagIsSet: sinon.stub().returns(0),
                addToLast20Errors: sinon.stub(),
                version: '2.0.0',
                api: { getVersion: sinon.stub().returns('0.7.0') },
                namespace: 'ecovacs-deebot.0',
                formatDate: sinon.stub().returns('2026-05-04 00:00:00'),
                writeFileAsync: sinon.stub().resolves(),
                downloadLastCleaningMapImage: sinon.stub(),
                deviceContexts: new Map(),
                _flushPendingPosition: sinon.stub()
            };

            const mockCtx = {
                deviceId: 'test_device',
                connected: false, connectionFailed: false,
                unreachableRetryCount: 0, unreachableWarningSent: false, retries: 0,
                chargestatus: 'idle', cleanstatus: 'idle', waterLevel: 1, cleanSpeed: 2,
                waterboxInstalled: false, currentMapID: 'mid1',
                chargePosition: null, deebotPosition: null, errorCode: '0',
                currentCleanedArea: 0, currentCleanedSeconds: 0,
                silentApproach: {}, cleaningClothReminder: { enabled: false, period: 0 },
                last20Errors: [], cleaningLogAcknowledged: false,
                cleaningQueue: { notEmpty: sinon.stub().returns(false), startNextItemFromQueue: sinon.stub() },
                commandQueue: { addInitialGetCommands: sinon.stub(), addStandardGetCommands: sinon.stub(), addAdditionalGetCommands: sinon.stub(), runAll: sinon.stub(), run: sinon.stub() },
                intervalQueue: { addInitialGetCommands: sinon.stub(), addStandardGetCommands: sinon.stub(), addAdditionalGetCommands: sinon.stub(), runAll: sinon.stub(), run: sinon.stub(), addGetLifespan: sinon.stub(), addGetCleanLogs: sinon.stub(), add: sinon.stub() },
                getModel: sinon.stub().returns({
                    is950type: sinon.stub().returns(false), getProtocol: sinon.stub().returns('MQTT/JSON'),
                    getProductName: sinon.stub().returns('Test Model'), getDeviceClass: sinon.stub().returns('p1jij8'),
                    isSupportedFeature: sinon.stub().returns(true),
                    isMappingSupported: sinon.stub().returns(true), usesMqtt: sinon.stub().returns(true),
                    usesXmpp: sinon.stub().returns(false), isModelTypeT9Based: sinon.stub().returns(false),
                    isModelTypeT20: sinon.stub().returns(false), isModelTypeX2: sinon.stub().returns(false),
                    isModelTypeX1: sinon.stub().returns(false), isModelTypeAirbot: sinon.stub().returns(false),
                    getModelType: sinon.stub().returns('T20'),
                    getDeviceCapabilities: sinon.stub().returns({
                        type: 'Vacuum Cleaner', hasMapping: true, hasWaterBox: true,
                        hasAirDrying: true, hasAutoEmpty: true, hasSpotAreas: true,
                        hasVirtualBoundaries: true, hasContinuousCleaning: true,
                        hasDoNotDisturb: true, hasVoiceAssistant: true,
                        hasCleaningStation: true, hasFloorWashing: true
                    }),
                    getProductImageURL: sinon.stub().returns('https://example.com/image.png')
                }),
                getDevice: sinon.stub().returns({
                    status: 'charging', isCleaning: sinon.stub().returns(false),
                    isReturning: sinon.stub().returns(false), isNotCleaning: sinon.stub().returns(true),
                    isNotPaused: sinon.stub().returns(true), isNotStopped: sinon.stub().returns(true),
                    isCharging: sinon.stub().returns(false), isNotCharging: sinon.stub().returns(true),
                    setStatusByTrigger: sinon.stub(), setBatteryLevel: sinon.stub(), batteryLevel: 100
                }),
                getModelType: sinon.stub().returns('T20'),
                adapterProxy: {
                    setStateConditional: sinon.stub(), setStateConditionalAsync: sinon.stub().resolves(),
                    createObjectNotExists: sinon.stub().resolves(), createChannelNotExists: sinon.stub().resolves(),
                    getStateAsync: sinon.stub().resolves({ val: null }),
                    setObjectNotExistsAsync: sinon.stub().resolves()
                },
                _stateValues: new Map(), getGetPosInterval: null,
                _lastPositionTime: 0, _pendingPosition: null,
                _lastFormattedDateUpdate: 0, _lastUptimeValue: 0,
                connectedTimestamp: 0, _lastRecoveryTimestamp: 0, relocationState: '',
                currentSpotAreaData: { spotAreaID: 'unknown', lastTimeEnteredTimestamp: 0 }
            };

            const mockVacuum = { nick: 'TestBot', did: 'test-did', deviceName: 'Test Model', class: 'p1jij8' };

            const handlerNames = Object.keys(eventHandlers);
            for (const name of handlerNames) {
                if (typeof eventHandlers[name] === 'function') {
                    eventHandlers[name](mockMain, mockVacbot, mockCtx, mockVacuum);
                }
            }
        });

        it('should not register any event more than once across all handler functions', () => {
            const duplicates = [];
            for (const [eventName, count] of registeredEvents.entries()) {
                if (count > 1) {
                    duplicates.push(eventName + ' registered ' + count + ' times');
                }
            }
            expect(duplicates, 'Duplicate event registrations found:\n  ' + duplicates.join('\n  '))
                .to.be.an('array').that.is.empty;
        });

        it('should have at least some events registered (sanity check)', () => {
            expect(registeredEvents.size).to.be.greaterThan(10);
        });
    });

    describe('source-level duplicate detection', () => {
        const source = fs.readFileSync(require.resolve('../lib/eventHandlers'), 'utf-8');
        const lines = source.split(/\r?\n/);

        it('should not have deeply indented lines (>16 spaces) inside registerStationEvents', () => {
            const stationStart = lines.findIndex(l => l.match(/^\s*registerStationEvents\(/));
            const consumableStart = lines.findIndex((l, i) => i > stationStart && l.match(/^\s*registerConsumableEvents\(/));

            expect(stationStart).to.be.greaterThan(-1);
            expect(consumableStart).to.be.greaterThan(stationStart);

            const deepLines = [];
            for (let i = stationStart + 1; i < consumableStart; i++) {
                if (lines[i].match(/^ {25,}\S/)) {
                    deepLines.push('Line ' + (i + 1));
                }
            }
            expect(deepLines,
                'Deeply indented lines in registerStationEvents (likely duplicate code): ' + deepLines.join(', '))
                .to.be.an('array').that.is.empty;
        });

        it('registerStationEvents should be much shorter than registerMiscEventHandlers', () => {
            const stationStart = lines.findIndex(l => l.match(/^\s*registerStationEvents\(/));
            const consumableStart = lines.findIndex(l => l.match(/^\s*registerConsumableEvents\(/));
            const miscStart = lines.findIndex(l => l.match(/^\s*registerMiscEventHandlers\(/));

            const stationLen = consumableStart - stationStart;
            const miscLen = lines.length - miscStart;

            expect(stationLen,
                'registerStationEvents=' + stationLen + ' lines, registerMiscEventHandlers=' + miscLen + ' lines')
                .to.be.lessThan(miscLen * 0.8);
        });
    });
});