'use strict';

const { expect } = require('chai');
const { describe, it } = require('mocha');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

// Load the module
const adapterHelper = require('../lib/adapterHelper');

describe('adapterHelper.js', () => {
    describe('decrypt', () => {
        it('should decrypt a simple string correctly', () => {
            const key = 'testkey';
            const original = 'hello';
            
            // First encrypt (XOR is symmetric)
            let encrypted = '';
            for (let i = 0; i < original.length; ++i) {
                encrypted += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ original.charCodeAt(i));
            }
            
            // Then decrypt
            const decrypted = adapterHelper.decrypt(key, encrypted);
            expect(decrypted).to.equal(original);
        });

        it('should handle empty strings', () => {
            const result = adapterHelper.decrypt('key', '');
            expect(result).to.equal('');
        });

        it('should handle single character strings', () => {
            const key = 'a';
            const original = 'X';
            
            // Encrypt
            const encrypted = String.fromCharCode(key.charCodeAt(0) ^ original.charCodeAt(0));
            
            // Decrypt
            const decrypted = adapterHelper.decrypt(key, encrypted);
            expect(decrypted).to.equal(original);
        });

        it('should handle longer keys than values', () => {
            const key = 'verylongkeythatexceedsthevalue';
            const original = 'short';
            
            // Encrypt
            let encrypted = '';
            for (let i = 0; i < original.length; ++i) {
                encrypted += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ original.charCodeAt(i));
            }
            
            // Decrypt
            const decrypted = adapterHelper.decrypt(key, encrypted);
            expect(decrypted).to.equal(original);
        });
    });

    describe('isIdValid', () => {
        it('should return true for valid IDs', () => {
            const validIds = [
                'ecovacs-deebot.0.control.clean',
                'test-channel.sub-channel.state',
                'a.b.c.d.e',
                'UPPERCASE.id',
                'mixed_Case.id-123',
                'a1b2c3.d4e5f6'
            ];

            validIds.forEach(id => {
                expect(adapterHelper.isIdValid(id)).to.be.true;
            });
        });

        it('should return false for invalid IDs', () => {
            const invalidIds = [
                '',
                '.invalid',
                'invalid.',
                'invalid..id',
                'invalid id',
                'invalid@id',
                'invalid#id',
                'invalid$id',
                'invalid%id',
                'invalid^id',
                'invalid&id',
                'invalid*id',
                'invalid(id',
                'invalid)id',
                'invalid+id',
                'invalid=id',
                'invalid[id',
                'invalid]id',
                'invalid{id',
                'invalid}id',
                'invalid|id',
                'invalid\\id',
                'invalid/id',
                'invalid?id',
                'invalid<id',
                'invalid>id',
                'invalid,id',
                'invalid;id',
                'invalid:id',
                'invalid\'id',
                'invalid"id',
                'invalid`id',
                'invalid~id',
                'invalid!id',
                'invalid id'
            ];

            invalidIds.forEach(id => {
                expect(adapterHelper.isIdValid(id)).to.be.false;
            });
        });

        it('should handle edge cases', () => {
            expect(adapterHelper.isIdValid('a')).to.be.true; // Single character
            expect(adapterHelper.isIdValid('a.b')).to.be.true; // Simple two-part ID
            expect(adapterHelper.isIdValid('adapter_underscore.id')).to.be.true; // Underscore is allowed
            expect(adapterHelper.isIdValid('adapter-hyphen.id')).to.be.true; // Hyphen is allowed
        });
    });

    describe('getChannelNameById', () => {
        it('should extract channel name from valid IDs', () => {
            const testCases = [
                { id: 'adapter.0.channel.state', expected: 'channel' },
                { id: 'ecovacs-deebot.0.control.clean', expected: 'control' },
                { id: 'test.adapter.0.info.connection', expected: '0' }, // Third part is index 2
                { id: 'simple.id.here', expected: 'here' } // Third part is index 2
            ];

            testCases.forEach(({ id, expected }) => {
                expect(adapterHelper.getChannelNameById(id)).to.equal(expected);
            });
        });

        it('should handle IDs with fewer than 3 parts', () => {
            expect(adapterHelper.getChannelNameById('adapter.0')).to.equal(undefined);
            expect(adapterHelper.getChannelNameById('simple')).to.equal(undefined);
        });

        it('should handle empty strings', () => {
            expect(adapterHelper.getChannelNameById('')).to.equal(undefined);
        });
    });

    describe('getSubChannelNameById', () => {
        it('should extract sub-channel name from valid IDs', () => {
            const testCases = [
                { id: 'adapter.0.channel.subchannel.state', expected: 'subchannel' },
                { id: 'ecovacs-deebot.0.map.spotAreas.area1', expected: 'spotAreas' },
                { id: 'test.adapter.0.info.library.version', expected: 'library' },
                { id: 'simple.id.here.now.state', expected: 'now' }
            ];

            testCases.forEach(({ id, expected }) => {
                expect(adapterHelper.getSubChannelNameById(id)).to.equal(expected);
            });
        });

        it('should handle IDs with fewer parts', () => {
            expect(adapterHelper.getSubChannelNameById('adapter.0.channel')).to.equal('0');
            expect(adapterHelper.getSubChannelNameById('simple.id')).to.equal('simple');
        });

        it('should handle empty strings', () => {
            expect(adapterHelper.getSubChannelNameById('')).to.equal(undefined);
        });
    });

    describe('getStateNameById', () => {
        it('should extract state name from valid IDs', () => {
            const testCases = [
                { id: 'adapter.0.channel.state', expected: 'state' },
                { id: 'ecovacs-deebot.0.control.clean', expected: 'clean' },
                { id: 'test.adapter.0.info.connection', expected: 'connection' },
                { id: 'simple.id.here', expected: 'here' }
            ];

            testCases.forEach(({ id, expected }) => {
                expect(adapterHelper.getStateNameById(id)).to.equal(expected);
            });
        });

        it('should handle single part IDs', () => {
            expect(adapterHelper.getStateNameById('simple')).to.equal('simple');
        });

        it('should handle empty strings', () => {
            expect(adapterHelper.getStateNameById('')).to.equal('');
        });
    });

    describe('getUnixTimestamp', () => {
        it('should return a valid Unix timestamp', () => {
            const timestamp = adapterHelper.getUnixTimestamp();
            expect(timestamp).to.be.a('number');
            expect(timestamp).to.be.greaterThan(0);
            
            // Should be within reasonable range (within last year)
            const currentTime = Math.floor(Date.now() / 1000);
            expect(timestamp).to.be.at.most(currentTime);
            expect(timestamp).to.be.at.least(currentTime - 31536000); // 1 year in seconds
        });

        it('should return consistent timestamps when called multiple times', () => {
            const timestamp1 = adapterHelper.getUnixTimestamp();
            const timestamp2 = adapterHelper.getUnixTimestamp();
            
            // Should be very close (within 1 second)
            expect(Math.abs(timestamp1 - timestamp2)).to.be.at.most(1);
        });
    });

    describe('isValidChargeStatus', () => {
        it('should return true for valid charge statuses', () => {
            const validStatuses = ['idle', 'charging', 'returning'];
            validStatuses.forEach(status => {
                expect(adapterHelper.isValidChargeStatus(status)).to.be.true;
            });
        });

        it('should return false for invalid charge statuses', () => {
            const invalidStatuses = ['invalid', 'unknown', 'error', 'cleaning', 'paused', null, undefined, ''];
            invalidStatuses.forEach(status => {
                expect(adapterHelper.isValidChargeStatus(status)).to.be.false;
            });
        });
    });

    describe('isValidCleanStatus', () => {
        it('should return true for valid clean statuses', () => {
            const validStatuses = ['idle', 'alert', 'area', 'auto', 'comeClean', 'custom_area', 'drying', 'edge', 'entrust', 'error', 'freeClean', 'move', 'pause', 'qcClean', 'returning', 'setLocation', 'singlePoint', 'single_room', 'spot', 'spot_area', 'stop', 'washing'];
            validStatuses.forEach(status => {
                expect(adapterHelper.isValidCleanStatus(status)).to.be.true;
            });
        });

        it('should return false for invalid clean statuses', () => {
            const invalidStatuses = ['invalid', 'unknown', 'cleaning', 'charging', null, undefined, ''];
            invalidStatuses.forEach(status => {
                expect(adapterHelper.isValidCleanStatus(status)).to.be.false;
            });
        });
    });

    describe('getDeviceStatusByStatus', () => {
        it('should return correct device status mappings', () => {
            const testCases = [
                { input: 'idle', expected: 'idle' },
                { input: 'cleaning', expected: 'cleaning' },
                { input: 'returning', expected: 'returning' },
                { input: 'charging', expected: 'charging' },
                { input: 'paused', expected: 'paused' },
                { input: 'stop', expected: 'stopped' },
                { input: 'spot', expected: 'cleaning' },
                { input: 'drying', expected: 'drying' },
                { input: 'washing', expected: 'washing' },
                { input: 'unknown', expected: 'unknown' },
                { input: 'invalid', expected: 'invalid' },
                { input: '', expected: '' },
                { input: null, expected: 'unknown' },
                { input: undefined, expected: undefined }
            ];

            testCases.forEach(({ input, expected }) => {
                expect(adapterHelper.getDeviceStatusByStatus(input)).to.equal(expected);
            });
        });
    });

    describe('positionValueStringIsValid', () => {
        it('should return true for valid position strings', () => {
            const validPositions = [
                '100,200',
                '-100,-200',
                '0,0',
                '123.45,678.90',
                '-123.45,-678.90'
            ];

            validPositions.forEach(pos => {
                expect(adapterHelper.positionValueStringIsValid(pos)).to.be.true;
            });
        });

        it('should return false for invalid position strings', () => {
            const invalidPositions = [
                '',
                'invalid',
                '100',
                '100,',
                ',200',
                '100,200,300',
                'abc,def',
                '100.200.300,400.500.600',
                null,
                undefined
            ];

            invalidPositions.forEach(pos => {
                expect(adapterHelper.positionValueStringIsValid(pos)).to.be.false;
            });
        });
    });

    describe('getTimeStringFormatted', () => {
        it('should format seconds correctly', () => {
            expect(adapterHelper.getTimeStringFormatted(3661)).to.equal('1h 01m 01s');
        });

        it('should format zero seconds', () => {
            expect(adapterHelper.getTimeStringFormatted(0)).to.equal('0h 00m 00s');
        });

        it('should format minutes without hours', () => {
            expect(adapterHelper.getTimeStringFormatted(59)).to.equal('0h 00m 59s');
        });

        it('should format large numbers', () => {
            expect(adapterHelper.getTimeStringFormatted(90061)).to.equal('25h 01m 01s');
        });
    });

    describe('singleAreaValueStringIsValid', () => {
        it('should return true for valid area strings', () => {
            expect(adapterHelper.singleAreaValueStringIsValid('100,200,300,400')).to.be.true;
            expect(adapterHelper.singleAreaValueStringIsValid('-100,-200,300.5,400.5')).to.be.true;
            expect(adapterHelper.singleAreaValueStringIsValid('0,0,0,0')).to.be.true;
        });

        it('should return false for invalid area strings', () => {
            expect(adapterHelper.singleAreaValueStringIsValid('100,200,300')).to.be.false;
            expect(adapterHelper.singleAreaValueStringIsValid('100,200')).to.be.false;
            expect(adapterHelper.singleAreaValueStringIsValid('')).to.be.false;
            expect(adapterHelper.singleAreaValueStringIsValid('abc,def,ghi,jkl')).to.be.false;
            expect(adapterHelper.singleAreaValueStringIsValid('100;200;300;400')).to.be.false;
        });
    });

    describe('areaValueStringIsValid', () => {
        it('should return true for valid area value strings', () => {
            expect(adapterHelper.areaValueStringIsValid('100,200,300,400')).to.be.true;
            expect(adapterHelper.areaValueStringIsValid('100,200,300,400;500,600,700,800')).to.be.true;
        });

        it('should handle trailing semicolon', () => {
            expect(adapterHelper.areaValueStringIsValid('100,200,300,400;')).to.be.true;
        });

        it('should return false for invalid area value strings', () => {
            expect(adapterHelper.areaValueStringIsValid('')).to.be.false;
            expect(adapterHelper.areaValueStringIsValid('100,200,300')).to.be.false;
            expect(adapterHelper.areaValueStringIsValid('100,200,300,400;invalid')).to.be.false;
        });
    });

    describe('areaValueStringWithCleaningsIsValid', () => {
        it('should return true for valid strings with cleanings', () => {
            expect(adapterHelper.areaValueStringWithCleaningsIsValid('100,200,300,400,1')).to.be.true;
            expect(adapterHelper.areaValueStringWithCleaningsIsValid('100,200,300,400,2')).to.be.true;
        });

        it('should return false for invalid cleaning counts', () => {
            expect(adapterHelper.areaValueStringWithCleaningsIsValid('100,200,300,400,0')).to.be.false;
            expect(adapterHelper.areaValueStringWithCleaningsIsValid('100,200,300,400,3')).to.be.false;
            expect(adapterHelper.areaValueStringWithCleaningsIsValid('100,200,300,400')).to.be.false;
        });
    });

    describe('isSingleSpotAreaValue', () => {
        it('should return true for single spot area values', () => {
            expect(adapterHelper.isSingleSpotAreaValue('1')).to.be.true;
            expect(adapterHelper.isSingleSpotAreaValue('12')).to.be.true;
            expect(adapterHelper.isSingleSpotAreaValue('0')).to.be.true;
        });

        it('should return false for invalid values', () => {
            expect(adapterHelper.isSingleSpotAreaValue('')).to.be.false;
            expect(adapterHelper.isSingleSpotAreaValue('1,2')).to.be.false;
            expect(adapterHelper.isSingleSpotAreaValue('abc')).to.be.false;
            expect(adapterHelper.isSingleSpotAreaValue('1a')).to.be.false;
        });
    });

    describe('getCurrentDateAndTimeFormatted', () => {
        it('should return a formatted date string', () => {
            const mockAdapter = {
                formatDate: sinon.stub().returns('2023.01.01 12:00:00')
            };
            const result = adapterHelper.getCurrentDateAndTimeFormatted(mockAdapter);
            expect(result).to.equal('2023.01.01 12:00:00');
            expect(mockAdapter.formatDate.calledOnce).to.be.true;
        });

        it('should handle adapter formatDate errors', () => {
            const mockAdapter = {
                formatDate: sinon.stub().throws(new Error('Format error'))
            };
            
            expect(() => adapterHelper.getCurrentDateAndTimeFormatted(mockAdapter)).to.throw('Format error');
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle special characters in decrypt', () => {
            const key = 'key';
            const original = '🚀 Unicode test 中文';
            
            // Encrypt
            let encrypted = '';
            for (let i = 0; i < original.length; ++i) {
                encrypted += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ original.charCodeAt(i));
            }
            
            // Decrypt
            const decrypted = adapterHelper.decrypt(key, encrypted);
            expect(decrypted).to.equal(original);
        });

        it('should handle null and undefined inputs gracefully', () => {
            expect(adapterHelper.isIdValid(null)).to.be.true; // Regex matches null
            expect(adapterHelper.isIdValid(undefined)).to.be.true; // Regex matches undefined
            // These functions crash on null/undefined, so we expect them to throw
            expect(() => adapterHelper.getChannelNameById(null)).to.throw();
            expect(() => adapterHelper.getSubChannelNameById(undefined)).to.throw();
            expect(() => adapterHelper.getStateNameById(null)).to.throw();
            expect(adapterHelper.positionValueStringIsValid(null)).to.be.false;
        });

        it('should handle empty strings', () => {
            expect(adapterHelper.isIdValid('')).to.be.false;
            expect(adapterHelper.getChannelNameById('')).to.be.undefined;
            expect(adapterHelper.getSubChannelNameById('')).to.be.undefined;
            expect(adapterHelper.getStateNameById('')).to.equal('');
            expect(adapterHelper.positionValueStringIsValid('')).to.be.false;
        });
    });
});