import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { testDatabaseConfig, connectTestDatabase } from './helpers/database.js';

const suites = {
    inventory: ['inventory.test.js', 'PAMO_INVENTORY_INTEGRATION'],
    hero: ['hero.test.js', 'PAMO_HERO_INTEGRATION'],
    dashboard: ['dashboard.test.js', 'PAMO_DASHBOARD_INTEGRATION'],
    cashierDashboard: ['cashierDashboard.test.js', 'PAMO_CASHIER_DASHBOARD_INTEGRATION'],
    cart: ['cartSecurity.test.js', 'PAMO_CART_INTEGRATION'],
    checkoutCart: ['checkoutCart.test.js', 'PAMO_COD_CART_INTEGRATION'],
    recovery: ['paymentRecovery.test.js', 'PAMO_RECOVERY_INTEGRATION']
};
const safeUri = 'mongodb://127.0.0.1:27018/pamo_integration_test?replicaSet=pamoTest&directConnection=true';
const environment = overrides => ({
    ...Object.fromEntries(Object.values(suites).map(([, flag]) => [flag, '1'])),
    PAMO_TEST_DB_APPROVED: '1', PAMO_TEST_MONGODB_URI: safeUri, ...overrides
});
const adapter = () => {
    const calls = [], hooks = [];
    const connection = {
        readyState: 0,
        async dropDatabase() { calls.push(['drop', this.name]); },
        async close() { calls.push(['close']); this.readyState = 0; }
    };
    const mongoose = {
        connection, connections: [connection],
        async connect(uri, options) {
            calls.push(['connect', uri, options]);
            connection.name = options.dbName;
            connection.readyState = 1;
        }
    };
    return { calls, hooks, connection, mongoose, t: { after: callback => hooks.push(callback) } };
};

for (const [name, overrides] of [
    ['missing test URI', { PAMO_TEST_MONGODB_URI: undefined }],
    ['application URI fallback', { PAMO_TEST_MONGODB_URI: undefined, MONGODB_URI: safeUri }],
    ['application URI copied verbatim', { MONGODB_URI: safeUri }],
    ['Atlas URI', { PAMO_TEST_MONGODB_URI: 'mongodb+srv://synthetic.invalid/e-commerce' }],
    ['remote server', { PAMO_TEST_MONGODB_URI: 'mongodb://synthetic.invalid:27018/pamo_integration_test?replicaSet=pamoTest&directConnection=true' }],
    ['application database identity', { PAMO_TEST_MONGODB_URI: safeUri.replace('/pamo_integration_test?', '/e-commerce?') }],
    ['missing database identity', { PAMO_TEST_MONGODB_URI: safeUri.replace('/pamo_integration_test?', '/?') }],
    ['credentials', { PAMO_TEST_MONGODB_URI: safeUri.replace('127.0.0.1', 'synthetic:secret@127.0.0.1') }],
    ['multiple seeds', { PAMO_TEST_MONGODB_URI: safeUri.replace('127.0.0.1:27018', '127.0.0.1:27018,remote.invalid:27018') }],
    ['DNS-dependent host', { PAMO_TEST_MONGODB_URI: safeUri.replace('127.0.0.1', 'localhost') }],
    ['invalid port', { PAMO_TEST_MONGODB_URI: safeUri.replace(':27018', ':65536') }],
    ['missing replica set', { PAMO_TEST_MONGODB_URI: safeUri.replace('replicaSet=pamoTest&', '') }],
    ['duplicate replica set', { PAMO_TEST_MONGODB_URI: safeUri + '&replicaSet=other' }],
    ['discovery enabled', { PAMO_TEST_MONGODB_URI: safeUri.replace('directConnection=true', 'directConnection=false') }],
    ['unknown query option', { PAMO_TEST_MONGODB_URI: safeUri + '&authSource=admin' }],
    ['missing approval', { PAMO_TEST_DB_APPROVED: undefined }],
    ['disabled integration', { PAMO_INVENTORY_INTEGRATION: '0' }]
]) {
    test(`${name} is rejected before any connection or cleanup registration`, async () => {
        const h = adapter();
        await assert.rejects(connectTestDatabase(h.t, h.mongoose, 'inventory', environment(overrides)));
        assert.deepEqual(h.calls, []);
        assert.deepEqual(h.hooks, []);
    });
}

test('all seven suites use explicit safe configuration and unique generated identities', async () => {
    const names = new Set();
    for (const suite of Object.keys(suites)) {
        const h = adapter();
        const result = await connectTestDatabase(h.t, h.mongoose, suite, environment());
        assert.match(result.database, /^pamo_[a-z_]+_test_[a-f0-9]{32}$/);
        assert(!names.has(result.database));
        names.add(result.database);
        assert.deepEqual(h.calls[0], ['connect', safeUri, {
            dbName: result.database, replicaSet: 'pamoTest', directConnection: true, serverSelectionTimeoutMS: 5000
        }]);
        assert.equal(h.hooks.length, 1);
        await Promise.all([result.cleanup(), h.hooks[0]()]);
        assert.deepEqual(h.calls.slice(1), [['drop', result.database], ['close']]);
    }
});

test('IPv6 numeric loopback and reordered query parameters remain supported', () => {
    const uri = 'mongodb://[::1]:27018/pamo_integration_test?directConnection=true&replicaSet=pamoTest';
    assert.equal(testDatabaseConfig('inventory', environment({ PAMO_TEST_MONGODB_URI: uri })).uri, uri);
    assert.throws(() => testDatabaseConfig('constructor', environment()));
});

test('an already active default or secondary connection is never reused or closed', async () => {
    for (const secondary of [false, true]) {
        const h = adapter();
        if (secondary) h.mongoose.connections.push({ readyState: 1 });
        else h.connection.readyState = 1;
        await assert.rejects(connectTestDatabase(h.t, h.mongoose, 'inventory', environment()), /disconnected test worker/);
        assert.deepEqual(h.calls, []);
        assert.deepEqual(h.hooks, []);
    }
});

test('cleanup refuses another database or replacement connection and never drops it', async () => {
    for (const replacement of [false, true]) {
        const h = adapter();
        const { cleanup } = await connectTestDatabase(h.t, h.mongoose, 'inventory', environment());
        if (replacement) h.mongoose.connection = { ...h.connection };
        else h.connection.name = 'e-commerce';
        await assert.rejects(cleanup(), /Refusing cleanup/);
        assert.equal(h.calls.filter(([name]) => name === 'drop').length, 0);
        assert.equal(h.calls.filter(([name]) => name === 'close').length, 1);
    }
});

test('failed connection is sanitized and cleanup closes without dropping any database', async () => {
    const h = adapter();
    h.mongoose.connect = async () => { throw new Error('private connection details'); };
    await assert.rejects(connectTestDatabase(h.t, h.mongoose, 'inventory', environment()), error => {
        assert.match(error.message, /Isolated MongoDB test connection failed/);
        assert.doesNotMatch(error.message, /private/);
        return true;
    });
    await h.hooks[0]();
    assert.deepEqual(h.calls, [['close']]);
});

test('unexpected effective database identity is rejected before returning a usable fixture', async () => {
    const h = adapter();
    h.mongoose.connect = async () => { h.connection.readyState = 1; h.connection.name = 'e-commerce'; };
    await assert.rejects(connectTestDatabase(h.t, h.mongoose, 'inventory', environment()), /Refusing integration/);
    await assert.rejects(h.hooks[0](), /Refusing cleanup/);
    assert.equal(h.calls.filter(([name]) => name === 'drop').length, 0);
});

test('drop failure still closes the owned connection and cleanup is not repeated', async () => {
    const h = adapter();
    h.connection.dropDatabase = async () => { h.calls.push(['drop-failed']); throw new Error('synthetic drop failure'); };
    const { cleanup } = await connectTestDatabase(h.t, h.mongoose, 'inventory', environment());
    await assert.rejects(cleanup(), /synthetic drop failure/);
    await assert.rejects(h.hooks[0](), /synthetic drop failure/);
    assert.deepEqual(h.calls.slice(1), [['drop-failed'], ['close']]);
});

test('integration suites delegate connections and cleanup without application environment loaders', async () => {
    for (const [suite, [file]] of Object.entries(suites)) {
        const source = await readFile(new URL(file, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /dotenv|process\.env\.MONGODB_URI|mongoose\.connect\(|dropDatabase\(|mongoose\.disconnect\(/);
        assert(source.includes(`connectTestDatabase(t, mongoose, '${suite}')`));
    }
});

function discoverSuites(enabled) {
    const guard = `
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(pathToFileURL(process.cwd() + '/backend/package.json'));
const deny = () => { throw new Error('FORBIDDEN_APPLICATION_INFRASTRUCTURE'); };
const mongoose = require('mongoose');
mongoose.connect = deny; mongoose.createConnection = deny; mongoose.Connection.prototype.openUri = deny;
const dotenv = require('dotenv'); dotenv.config = deny; dotenv.configDotenv = deny;
`;
    const env = { ...process.env, ...environment(), MONGODB_URI: 'mongodb+srv://synthetic.invalid/e-commerce',
        PAMO_TEST_MONGODB_URI: 'mongodb+srv://synthetic.invalid/e-commerce',
        ...Object.fromEntries(Object.values(suites).map(([, flag]) => [flag, enabled ? '1' : '0'])) };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, [
        '--import', 'data:text/javascript,' + encodeURIComponent(guard), '--test',
        '--test-reporter=tap',
        '--test-name-pattern', 'transactional inventory lifecycle|Hero MongoDB lifecycle|real database dashboard analytics|real MongoDB projection|actual MongoDB atomic cart concurrency|isolated local MongoDB COD|isolated local MongoDB metadata',
        ...Object.values(suites).map(([file]) => 'backend/tests/' + file)
    ], {
        cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 30000, env
    });
}

test('disabled suite discovery cannot connect or load dotenv, even with hostile inherited configuration', () => {
    const result = discoverSuites(false);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout + result.stderr, /FORBIDDEN_APPLICATION_INFRASTRUCTURE/);
    assert.match(result.stdout, /# skipped 7\b/);
});

test('all seven enabled suites reject an Atlas URI before any database or environment operation', () => {
    const result = discoverSuites(true);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout + result.stderr, /FORBIDDEN_APPLICATION_INFRASTRUCTURE/);
    assert.match(result.stdout, /# fail 7\b/);
    assert.equal((result.stdout.match(/error: 'Set PAMO_TEST_MONGODB_URI/g) || []).length, 7);
});
