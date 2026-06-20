'use strict';

/**
 * Phase A — Library API-surface contract test.
 *
 * The unit suite stubs `ecovacs-deebot` wholesale, so a breaking change in the
 * pinned `1.0.0-alpha.21` library (a renamed event, a dropped vacbot method,
 * a changed `getDevice()` signature) keeps every unit test green while breaking
 * production. This test loads the *real* installed library and asserts the
 * contract the adapter actually depends on still holds.
 *
 * It is fully offline and fast (no login, no MQTT): `getDevice()` constructs the
 * device synchronously, and the event check is a static cross-check against the
 * installed library source. It therefore lives in the `*.test.js` glob and runs
 * on every PR — exactly when drift should be caught.
 *
 * The contract is *derived from the adapter's own source* (lib/models.js and
 * lib/eventHandlers.js) rather than hard-coded here, so adding a new
 * `vacbot.on('X')` or `this.vacbot.y()` automatically extends the contract and
 * cannot silently drift out of sync.
 *
 * What this does NOT cover (by design — see the Phase C broker test): that the
 * library actually *emits* these events at runtime with the right payloads.
 */

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { describe, it, before } = require('mocha');

const ecovacsDeebot = require('ecovacs-deebot');
const EcoVacsAPI = ecovacsDeebot.EcoVacsAPI;

// Root of the installed library (the package's index.js directory)
const LIBRARY_ROOT = path.dirname(require.resolve('ecovacs-deebot'));
const LIBRARY_SRC_DIR = path.join(LIBRARY_ROOT, 'library');

// Adapter source files that declare the contract
const ADAPTER_MODELS_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'models.js'), 'utf8');
const ADAPTER_EVENTS_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'eventHandlers.js'), 'utf8');

/** Recursively collect the concatenated source of every .js file under dir. */
function readAllSources(dir) {
    let out = '';
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out += readAllSources(full);
        } else if (entry.name.endsWith('.js')) {
            out += fs.readFileSync(full, 'utf8');
        }
    }
    return out;
}

/** Unique matches of a global regex's first capture group against a source string. */
function uniqueMatches(source, regex) {
    return [...new Set([...source.matchAll(regex)].map((m) => m[1]))].sort();
}

// Methods the adapter calls behind a `typeof this.vacbot.x === 'function'` guard
// in lib/models.js are optional by construction — the adapter tolerates their
// absence, so a missing one is NOT a contract violation. Scrape them so we can
// exclude them from the required set and only soft-check them.
const GUARDED_MODEL_METHODS = uniqueMatches(
    ADAPTER_MODELS_SRC,
    /typeof this\.vacbot\.([a-zA-Z0-9_]+) === 'function'/g
);

// Methods the adapter calls on the raw vacbot, scraped from lib/models.js.
// Required = called unconditionally; optional = called only behind a guard.
const ALL_MODEL_METHODS = uniqueMatches(ADAPTER_MODELS_SRC, /this\.vacbot\.([a-zA-Z0-9_]+)\(/g);
const REQUIRED_MODEL_METHODS = ALL_MODEL_METHODS.filter((m) => !GUARDED_MODEL_METHODS.includes(m));

// Event names the adapter subscribes to, scraped from lib/eventHandlers.js
const VACBOT_EVENTS = uniqueMatches(ADAPTER_EVENTS_SRC, /vacbot\.on\('([^']+)'/g);

// Lifecycle methods the adapter drives directly (from main.js — small and stable).
// `removeAllListeners` is called behind a typeof guard in main.js, so it is optional.
const REQUIRED_LIFECYCLE_METHODS = ['on', 'connect', 'connectShared', 'getMqttClient', 'disconnect'];
const OPTIONAL_VACBOT_METHODS = [...GUARDED_MODEL_METHODS, 'removeAllListeners'];

// Builds a real vacbot offline, mirroring the call in main.js connect()
function buildRealVacbot() {
    const api = new EcoVacsAPI('contract-device-id', 'DE', 'EU', '');
    const vacuum = {
        did: 'contract-did',
        name: 'contract-name',
        class: 'yna5xi', // DEEBOT OZMO 950 Series — a 950-type (non-XML) class
        resource: 'contract-res',
        nick: 'Contract Bot',
        company: 'eco-ng'
    };
    return api.getDevice(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, 'EU');
}

describe('Library API contract (ecovacs-deebot)', () => {
    describe('EcoVacsAPI surface', () => {
        // NB: EcoVacsAPI.isCanvasModuleAvailable() is intentionally NOT part of the
        // contract. It is a deprecated backward-compat shim that always returns true
        // (the native `canvas` dependency was removed; rendering is pure JS now), so
        // pinning it here would only obstruct its eventual removal. The adapter still
        // calls it at main.js:80 — see the plan doc follow-up to retire that usage.
        ['md5', 'getDeviceId'].forEach((name) => {
            it(`exposes static EcoVacsAPI.${name}()`, () => {
                expect(EcoVacsAPI[name], `EcoVacsAPI.${name}`).to.be.a('function');
            });
        });

        it('exposes the REALM constant', () => {
            expect(EcoVacsAPI.REALM).to.be.a('string').and.not.be.empty;
        });

        ['connect', 'getDevice'].forEach((name) => {
            it(`exposes instance method api.${name}()`, () => {
                const api = new EcoVacsAPI('id', 'DE', 'EU', '');
                expect(api[name], `api.${name}`).to.be.a('function');
            });
        });
    });

    describe('vacbot construction (offline)', () => {
        let vacbot;
        before(() => {
            vacbot = buildRealVacbot();
        });

        it('constructs a vacbot synchronously without network', () => {
            expect(vacbot).to.be.an('object');
        });

        REQUIRED_LIFECYCLE_METHODS.forEach((name) => {
            it(`exposes lifecycle method vacbot.${name}()`, () => {
                expect(vacbot[name], `vacbot.${name}`).to.be.a('function');
            });
        });

        it('sanity-checks that the contract lists were actually scraped', () => {
            // Guards against a regex/path regression silently asserting nothing.
            expect(REQUIRED_MODEL_METHODS.length, 'required model methods scraped from lib/models.js').to.be.greaterThan(15);
            expect(VACBOT_EVENTS.length, 'events scraped from lib/eventHandlers.js').to.be.greaterThan(50);
        });

        // One assertion per method keeps failures readable (names the missing method)
        REQUIRED_MODEL_METHODS.forEach((name) => {
            it(`exposes model method vacbot.${name}() (used unconditionally by lib/models.js)`, () => {
                expect(vacbot[name], `vacbot.${name} — required by lib/models.js`).to.be.a('function');
            });
        });

        // Optional methods are called only behind a typeof guard. We don't require
        // them, but if present they must be callable — this catches a method that
        // changes from a function to some other type without silently passing.
        OPTIONAL_VACBOT_METHODS.forEach((name) => {
            it(`optional method vacbot.${name}() is absent or a function`, () => {
                expect(
                    vacbot[name] === undefined || typeof vacbot[name] === 'function',
                    `vacbot.${name} — guarded/optional, expected undefined or function`
                ).to.be.true;
            });
        });
    });

    describe('event contract', () => {
        let librarySource;
        before(() => {
            librarySource = readAllSources(LIBRARY_SRC_DIR);
        });

        // A few event families are emitted as a dynamic prefix + suffix, e.g.
        // `this.emitMessage("LifeSpan_" + component, ...)`, so the full name never
        // appears as one literal. For these we verify the emitted prefix and the
        // suffix token each appear in library source.
        const COMPOSED_EVENT_PREFIXES = ['LifeSpan_'];

        const asLiteral = (token) => new RegExp(`['"\`]${token}['"\`]`).test(librarySource);

        // The library emits events dynamically (`this.emit(name, payload)`), so we
        // cannot assert a literal `emit('X')` site. Instead we assert each event
        // name the adapter listens for still appears as a string literal somewhere
        // in the library source — a rename/removal would make the string vanish.
        // This is a static cross-check; runtime emission is covered by Phase C.
        VACBOT_EVENTS.forEach((eventName) => {
            it(`library source still references the '${eventName}' event`, () => {
                const prefix = COMPOSED_EVENT_PREFIXES.find((p) => eventName.startsWith(p));
                if (prefix) {
                    const suffix = eventName.slice(prefix.length);
                    expect(
                        librarySource.includes(prefix) && asLiteral(suffix),
                        `composed event '${eventName}' (subscribed in lib/eventHandlers.js): ` +
                        `expected prefix '${prefix}' and suffix literal '${suffix}' in installed library source`
                    ).to.be.true;
                } else {
                    expect(
                        asLiteral(eventName),
                        `event '${eventName}' (subscribed in lib/eventHandlers.js) not found in installed library source`
                    ).to.be.true;
                }
            });
        });
    });
});
