// Don't silently swallow unhandled rejections
process.on('unhandledRejection', (e) => {
    throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
const sinonChai = require('sinon-chai');
const chaiAsPromised = require('chai-as-promised');
const { should, use } = require('chai');
const sinon = require('sinon');

// Increase sinon leak threshold to accommodate the large number of stubs
// created across the comprehensive test suite
sinon.leakThreshold = 200000;

should();
use(sinonChai);
use(chaiAsPromised);