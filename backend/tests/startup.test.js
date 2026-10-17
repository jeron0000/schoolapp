import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// Evaluate the actual ESM entry point in a child VM with every infrastructure
// import mocked. No dotenv file, database, Cloudinary account or socket is used.
const fixture = String.raw`
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { EventEmitter, once } from 'node:events';
import { pathToFileURL, fileURLToPath } from 'node:url';

const serverUrl = new URL('./backend/server.js', pathToFileURL(process.cwd() + '/'));
const mongoUrl = new URL('./config/mongodb.js', serverUrl);
const source = await readFile(serverUrl, 'utf8');
const mongoSource = await readFile(mongoUrl, 'utf8');
const events = [], messages = [], listeners = [], unhandled = [], urls = [];
process.on('unhandledRejection', error => unhandled.push(error));
let resolveDb, rejectDb;
const database = new Promise((resolve, reject) => { resolveDb = resolve; rejectDb = reject; });
const connection = new EventEmitter();
const fakeProcess = { argv: ['node', fileURLToPath(serverUrl)], env: { MONGODB_URI: 'mongodb://synthetic.invalid', PORT: '4567' } };
if (options.defaultPort) delete fakeProcess.env.PORT;
if (options.relativeEntry) fakeProcess.argv[1] = 'backend/server.js';
if (options.missingEntry) fakeProcess.argv = ['node'];
const app = {
  use(...args) { events.push(['use', ...args]); },
  get(...args) { events.push(['get', ...args]); },
  listen(port, host, callback) {
    events.push(['listen', port, host]);
    const listener = new EventEmitter();
    listeners.push(listener);
    queueMicrotask(() => {
      if (options.listenerError) listener.emit('error', new Error('private listener diagnostic'));
      else { callback?.(); listener.emit('listening'); }
    });
    return listener;
  }
};
const express = () => app;
express.json = () => 'json-parser';
const context = vm.createContext({
  process: fakeProcess,
  console: {
    log: (...args) => messages.push(['log', ...args]),
    error: (...args) => messages.push(['error', ...args])
  }
});
const synthetic = values => new vm.SyntheticModule(Object.keys(values), function () {
  for (const [key, value] of Object.entries(values)) this.setExport(key, value);
}, { context });
const mongo = new vm.SourceTextModule(mongoSource, { context, identifier: mongoUrl.href });
await mongo.link(specifier => {
  assert.equal(specifier, 'mongoose');
  return synthetic({ default: {
    connection,
    connect(url) {
      events.push(['database']);
      urls.push(url);
      if (options.connectionThrows) throw new Error('private database diagnostic');
      return database;
    }
  } });
});
if (options.importOnly) fakeProcess.argv[1] = '/synthetic/consumer.js';
const entry = new vm.SourceTextModule(source, {
  context, identifier: serverUrl.href,
  initializeImportMeta(meta) { meta.url = serverUrl.href; }
});
await entry.link(specifier => {
  if (specifier === 'express') return synthetic({ default: express });
  if (specifier === 'dotenv/config') return synthetic({});
  if (specifier === 'node:url') return synthetic({ pathToFileURL });
  if (specifier === 'node:events') return synthetic({ once });
  if (specifier === './config/mongodb.js') return mongo;
  if (specifier === './config/cloudinary.js') return synthetic({ default: async () => {
    events.push(['cloudinary']);
    if (options.configError) throw new Error('private configuration diagnostic');
  } });
  if (specifier === './config/localApiSecurity.js') return synthetic({
    LOCAL_API_HOST: 'localhost', configureLocalApiSecurity: target => {
      assert.equal(target, app); events.push(['security']);
    }
  });
  if (specifier === './middleware/apiErrorHandler.js') return synthetic({ apiErrorHandler: 'api-errors' });
  if (specifier === './routes/heroRoute.js') return synthetic({ default: 'hero-router', heroErrorHandler: 'hero-errors' });
  assert.match(specifier, /^\.\/routes\/(user|product|cart|order|dashboard)Route\.js$/);
  return synthetic({ default: specifier });
});
const flush = () => new Promise(resolve => setImmediate(resolve));
await entry.evaluate();
await flush();
`;

function run(body, options = {}) {
    try {
        execFileSync(process.execPath, [
            '--experimental-vm-modules', '--input-type=module', '-e',
            `const options = ${JSON.stringify(options)};\n${fixture}\n${body}`
        ], { cwd: new URL('../../', import.meta.url), stdio: 'pipe', timeout: 10000 });
    } catch (error) {
        throw new Error(error.stderr?.toString() || 'Isolated startup fixture failed.');
    }
}

test('importing the entry point starts no database, Cloudinary configuration or listener', () => {
    run(`
assert.equal(entry.namespace.default, app);
assert.equal(typeof entry.namespace.startServer, 'function');
assert.equal(events.filter(([name]) => ['database', 'cloudinary', 'listen'].includes(name)).length, 0);
assert.deepEqual(messages, []);
`, { importOnly: true });
});

test('pending MongoDB blocks listening; successful connection starts exactly one loopback listener', () => {
    run(`
assert.equal(events.filter(([name]) => name === 'database').length, 1);
assert.equal(listeners.length, 0);
resolveDb();
await flush();
assert.equal(listeners.length, 1);
assert.deepEqual(events.find(([name]) => name === 'listen'), ['listen', '4567', 'localhost']);
assert(events.findIndex(([name]) => name === 'cloudinary') < events.findIndex(([name]) => name === 'database'));
assert.deepEqual(urls, ['mongodb://synthetic.invalid/e-commerce']);
assert.equal(fakeProcess.exitCode, undefined);
assert.deepEqual(unhandled, []);
`);
});

test('direct relative entry retains the default port when PORT is absent', () => {
    run(`
assert.equal(listeners.length, 0);
resolveDb();
await flush();
assert.deepEqual(events.find(([name]) => name === 'listen'), ['listen', 4000, 'localhost']);
assert.deepEqual(unhandled, []);
`, { defaultPort: true, relativeEntry: true });
});

test('import without a CLI entry does not start infrastructure', () => {
    run(`
assert.equal(events.filter(([name]) => ['database', 'cloudinary', 'listen'].includes(name)).length, 0);
assert.deepEqual(unhandled, []);
`, { missingEntry: true });
});

for (const [name, options] of [
    ['rejected database connection', {}],
    ['synchronous connection exception', { connectionThrows: true }],
    ['configuration failure', { configError: true }]
]) {
    test(`${name} reports sanitized failure without listening or unhandled rejections`, () => {
        run(`
if (!options.connectionThrows && !options.configError) rejectDb(new Error('private database diagnostic mongodb://synthetic.invalid'));
await flush();
assert.equal(listeners.length, 0);
assert.equal(fakeProcess.exitCode, 1);
assert.equal(messages.filter(([kind]) => kind === 'error').length, 1);
assert.doesNotMatch(JSON.stringify(messages), /private|synthetic|mongodb:|stack/);
assert.match(JSON.stringify(messages), /startup failed/i);
assert.deepEqual(unhandled, []);
`, options);
    });
}

test('initial listener error is caught safely after successful database connection', () => {
    run(`
resolveDb();
await flush();
assert.equal(listeners.length, 1);
assert.equal(fakeProcess.exitCode, 1);
assert.doesNotMatch(JSON.stringify(messages), /private listener diagnostic/);
assert.deepEqual(unhandled, []);
`, { listenerError: true });
});

test('explicit startup after import awaits readiness and returns the listener', () => {
    run(`
const starting = entry.namespace.startServer();
await flush();
assert.equal(listeners.length, 0);
resolveDb();
assert.equal(await starting, listeners[0]);
assert.equal(listeners.length, 1);
assert.equal(listeners[0].listenerCount('error'), 0);
assert.equal(listeners[0].listenerCount('listening'), 0);
connection.emit('connected');
assert(messages.some(row => row[1] === 'DB Connected'));
`, { importOnly: true });
});

test('middleware and route order remain unchanged and no dormant provider routes are mounted', () => {
    run(`
assert.deepEqual(events.filter(([name]) => ['security', 'use', 'get'].includes(name)).map(row => row.slice(0, 3)), [
  ['security'], ['use', 'json-parser'],
  ['use', '/api/user', './routes/userRoute.js'],
  ['use', '/api/product', './routes/productRoute.js'],
  ['use', '/api/cart', './routes/cartRoute.js'],
  ['use', '/api/order', './routes/orderRoute.js'],
  ['use', '/api/dashboard', './routes/dashboardRoute.js'],
  ['use', '/api/hero', 'hero-router'],
  ['get', '/', events.find(([name]) => name === 'get')[2]], ['use', 'api-errors']
]);
assert.deepEqual(events.find(row => row[1] === '/api/hero'), ['use', '/api/hero', 'hero-router', 'hero-errors']);
`, { importOnly: true });
});

test('existing backend startup commands still target server.js', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(manifest.scripts.start, 'node server.js');
    assert.equal(manifest.scripts.server, 'nodemon server.js');
});
