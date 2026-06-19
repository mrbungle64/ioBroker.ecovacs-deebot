// Don't silently swallow unhandled rejections
process.on('unhandledRejection', (e) => {
    throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
const sinonChai = require('sinon-chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const { should, use } = require('chai');

should();
use(sinonChai.default || sinonChai);
use(chaiAsPromised.default || chaiAsPromised);

// Global root hook: restore the default sinon sandbox after every test.
// Without this, files that create stubs in their beforeEach hooks keep adding
// fakes to the default sandbox for the whole run, which trips sinon's
// "number of fakes exceeded the leak threshold of 10000" warning. Restoring
// here un-wraps any stubbed methods and keeps the sandbox bounded.
exports.mochaHooks = {
    afterEach() {
        sinon.restore();
    }
};
