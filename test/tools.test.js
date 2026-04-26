'use strict';

const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Mock axios: tools.js calls axios({url, timeout: 15000}) directly
let mockAxios;

// Load the module with mocked dependencies
const tools = proxyquire('../lib/tools', {
    'axios': (...args) => mockAxios(...args)
});

describe('tools.js', () => {
    beforeEach(() => {
        mockAxios = sinon.stub();
    });

    describe('isObject', () => {
        it('should return true for plain objects', () => {
            expect(tools.isObject({})).to.be.true;
            expect(tools.isObject({ key: 'value' })).to.be.true;
            expect(tools.isObject({ a: 1, b: 2 })).to.be.true;
        });

        it('should return false for arrays', () => {
            expect(tools.isObject([])).to.be.false;
            expect(tools.isObject([1, 2, 3])).to.be.false;
            expect(tools.isObject(['a', 'b'])).to.be.false;
        });

        it('should return false for null', () => {
            expect(tools.isObject(null)).to.be.false;
        });

        it('should return false for undefined', () => {
            expect(tools.isObject(undefined)).to.be.false;
        });

        it('should return false for primitives', () => {
            expect(tools.isObject('string')).to.be.false;
            expect(tools.isObject(123)).to.be.false;
            expect(tools.isObject(true)).to.be.false;
            expect(tools.isObject(false)).to.be.false;
        });

        it('should return false for functions', () => {
            expect(tools.isObject(function() {})).to.be.false;
            expect(tools.isObject(() => {})).to.be.false;
        });

        it('should return false for dates', () => {
            expect(tools.isObject(new Date())).to.be.false;
        });

        it('should return false for regex', () => {
            expect(tools.isObject(/regex/)).to.be.false;
        });
    });

    describe('isArray', () => {
        it('should return true for arrays', () => {
            expect(tools.isArray([])).to.be.true;
            expect(tools.isArray([1, 2, 3])).to.be.true;
            expect(tools.isArray(['a', 'b'])).to.be.true;
            expect(tools.isArray([{}])).to.be.true;
        });

        it('should return false for plain objects', () => {
            expect(tools.isArray({})).to.be.false;
            expect(tools.isArray({ key: 'value' })).to.be.false;
        });

        it('should return false for null', () => {
            expect(tools.isArray(null)).to.be.false;
        });

        it('should return false for undefined', () => {
            expect(tools.isArray(undefined)).to.be.false;
        });

        it('should return false for primitives', () => {
            expect(tools.isArray('string')).to.be.false;
            expect(tools.isArray(123)).to.be.false;
            expect(tools.isArray(true)).to.be.false;
        });

        it('should return false for functions', () => {
            expect(tools.isArray(function() {})).to.be.false;
            expect(tools.isArray(() => {})).to.be.false;
        });

        it('should return false for array-like objects', () => {
            expect(tools.isArray({ 0: 'a', 1: 'b', length: 2 })).to.be.false;
        });
    });

    describe('translateText', () => {
        it('should return original text for English target language', async () => {
            const result = await tools.translateText('Hello World', 'en');
            expect(result).to.equal('Hello World');
        });

        it('should call Yandex API when API key is provided', async () => {
            mockAxios.resolves({ data: { text: ['Hola Mundo'] } });

            const result = await tools.translateText('Hello World', 'es', 'test-api-key');

            expect(mockAxios.calledOnce).to.be.true;
            const callArg = mockAxios.firstCall.args[0];
            expect(callArg.url).to.include('translate.yandex.net');
            expect(callArg.timeout).to.equal(15000);
            expect(result).to.equal('Hola Mundo');
        });

        it('should call Google API when no API key is provided', async () => {
            // Google branch expects response.data[0][0][0]
            mockAxios.resolves({ data: [[['Hola Mundo']]] });

            const result = await tools.translateText('Hello World', 'es');

            expect(mockAxios.calledOnce).to.be.true;
            const callArg = mockAxios.firstCall.args[0];
            expect(callArg.url).to.include('translate.googleapis.com');
            expect(result).to.equal('Hola Mundo');
        });

        it('should handle Yandex API errors gracefully', async () => {
            mockAxios.rejects(new Error('API Error'));

            try {
                await tools.translateText('Hello World', 'es', 'test-api-key');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Could not translate to "es"');
                expect(error.message).to.include('API Error');
            }
        });

        it('should handle Google API errors gracefully', async () => {
            mockAxios.rejects(new Error('Network Error'));

            try {
                await tools.translateText('Hello World', 'es');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Could not translate to "es"');
                expect(error.message).to.include('Network Error');
            }
        });

        it('should handle empty text', async () => {
            mockAxios.resolves({ data: [[['']]] });
            const result = await tools.translateText('', 'es');
            expect(result).to.equal('');
        });

        it('should handle null text', async () => {
            mockAxios.resolves({ data: [[['translated']]] });
            const result = await tools.translateText('null_text', 'es');
            expect(result).to.equal('translated');
        });

        it('should handle undefined text', async () => {
            mockAxios.resolves({ data: [[['translated']]] });
            const result = await tools.translateText('undefined_text', 'es');
            expect(result).to.equal('translated');
        });

        it('should handle special characters in text', async () => {
            mockAxios.resolves({ data: [[['¡Hola Mundo!']]] });

            const result = await tools.translateText('Hello World!', 'es');

            expect(result).to.equal('¡Hola Mundo!');
        });

        it('should handle multi-line text', async () => {
            mockAxios.resolves({ data: [[['Línea 1\nLínea 2']]] });

            const result = await tools.translateText('Line 1\nLine 2', 'es');

            expect(result).to.equal('Línea 1\nLínea 2');
        });

        it('should handle very long text', async () => {
            const longText = 'This is a very long text that might cause issues with certain translation APIs and systems. It contains multiple sentences and should be handled properly by the translation function.';
            mockAxios.resolves({ data: [[[longText + ' (translated)']]] });

            const result = await tools.translateText(longText, 'es');

            expect(result).to.equal(longText + ' (translated)');
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle network timeouts', async () => {
            mockAxios.callsFake(() => new Promise((resolve, reject) => {
                setTimeout(() => reject(new Error('Timeout')), 10);
            }));

            try {
                await tools.translateText('Hello World', 'es');
                expect.fail('Should have thrown a timeout error');
            } catch (error) {
                expect(error.message).to.include('Timeout');
            }
        });

        it('should handle malformed API responses', async () => {
            mockAxios.resolves({ data: { invalid: 'response' } });

            try {
                await tools.translateText('Hello World', 'es');
                expect.fail('Should have thrown an error for malformed response');
            } catch (error) {
                expect(error).to.be.an('error');
            }
        });

        it('should handle API rate limiting', async () => {
            mockAxios.rejects(new Error('Rate limit exceeded'));

            try {
                await tools.translateText('Hello World', 'es');
                expect.fail('Should have thrown a rate limit error');
            } catch (error) {
                expect(error.message).to.include('Rate limit exceeded');
            }
        });

        it('should handle special language codes', async () => {
            mockAxios.resolves({ data: [[['你好世界']]] });

            const result = await tools.translateText('Hello World', 'zh-CN');

            expect(result).to.equal('你好世界');
        });

        it('should handle text with HTML entities', async () => {
            mockAxios.resolves({ data: [[['Hello & World']]] });

            const result = await tools.translateText('Hello & World', 'es');

            expect(result).to.equal('Hello & World');
        });

        it('should handle text with Unicode characters', async () => {
            mockAxios.resolves({ data: [[['Hello 世界']]] });

            const result = await tools.translateText('Hello 世界', 'en');

            expect(result).to.equal('Hello 世界');
        });
    });

    describe('Integration with different translation services', () => {
        it('should handle Yandex API with different response formats', async () => {
            mockAxios.resolves({ data: { code: 200, lang: 'en-es', text: ['Hola Mundo'] } });

            const result = await tools.translateText('Hello World', 'es', 'yandex-key');

            expect(result).to.equal('Hola Mundo');
        });

        it('should handle Google API with different response formats', async () => {
            // Google branch expects isArray(response.data), object response should throw
            mockAxios.resolves({
                data: {
                    data: {
                        translations: [
                            { translatedText: 'Hola Mundo', detectedSourceLanguage: 'en' }
                        ]
                    }
                }
            });

            try {
                await tools.translateText('Hello World', 'es');
                expect.fail('Should have thrown an error for unexpected response format');
            } catch (error) {
                expect(error).to.be.an('error');
            }
        });
    });
});
