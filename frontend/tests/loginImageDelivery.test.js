import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const variants = ['login_students-393.png', 'login_students-655.png', 'login_students.png'];
const hosts = {};
for (const host of ['frontend', 'admin']) {
  const directory = path.join(root, host);
  const built = await build({
    stdin: { resolveDir: directory, contents: "export { default } from '../shared/LoginFlow.jsx';" },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external',
    jsx: 'automatic', write: false, resolveExtensions: ['.js', '.jsx', '.json'],
    loader: { '.css': 'empty' },
    plugins: [{ name: 'login-asset-urls', setup(builder) {
      builder.onLoad({ filter: /\.png$/ }, args => ({
        contents: `export default ${JSON.stringify('/assets/' + path.basename(args.path))}`, loader: 'js'
      }));
    } }]
  });
  const filename = path.join(directory, 'login-image-test.cjs');
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(directory);
  compiled.require = createRequire(filename);
  compiled._compile(built.outputFiles[0].text, filename);
  hosts[host] = { LoginFlow: compiled.exports.default, require: compiled.require };
}
const props = overrides => ({
  host: 'student', logo: '/logo.png', themeToggle: null,
  onStudent() {}, onAdmin() {}, onAuthenticate() {}, onError() {}, ...overrides
});
const configurations = [
  { host: 'student', initialStep: 'account', heading: 'Choose your account type' },
  { host: 'admin', initialStep: 'panel', heading: 'Choose your admin panel' },
  { host: 'student', initialStep: 'studentLogin', heading: 'Sign in as Student' },
  { host: 'admin', initialStep: 'adminLogin', initialPanel: 'pamo', heading: 'Sign in to PAMO Admin' },
  { host: 'admin', initialStep: 'adminLogin', initialPanel: 'cashier', heading: 'Sign in to Cashier' }
];

test('original PNG remains byte-identical; derivatives preserve alpha, composition ratio and reduce bytes', () => {
  const original = fs.readFileSync(path.join(root, 'shared/assets/login_students.png'));
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'), '17881010bd8aa74feec5daf2e09544d83ef1de0e749064d1dded00d022c3c354');
  for (const [index, name] of variants.entries()) {
    const buffer = fs.readFileSync(path.join(root, 'shared/assets', name));
    assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
    assert.deepEqual([width, height], [[393, 360], [655, 600], [1310, 1200]][index]);
    assert.equal(width * 1200, height * 1310);
    assert.equal(buffer[25], 6, 'Retain RGBA transparency');
    if (index < 2) assert.ok(buffer.length < original.length / 2);
  }
});

for (const [host, { LoginFlow, require }] of Object.entries(hosts)) {
  const react = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const configuration of configurations) {
    test(`${host}: ${configuration.heading} retains presentation and responsive image attributes in both themes`, () => {
      for (const theme of ['light', 'dark']) {
        const markup = renderToStaticMarkup(react.createElement('div', { className: theme },
          react.createElement(LoginFlow, props(configuration))));
        assert.ok(markup.includes(configuration.heading));
        const image = markup.match(/<img[^>]+class="login-students"[^>]*>/)?.[0];
        assert.ok(image);
        assert.match(image, /src="\/assets\/login_students\.png"/);
        assert.match(image, /srcSet="\/assets\/login_students-393\.png 393w, \/assets\/login_students-655\.png 655w, \/assets\/login_students\.png 1310w"/);
        assert.match(image, /width="1310" height="1200"/);
        assert.match(image, /alt="Students in school uniforms with a guitar, basketball, laptop, and camera"/);
        assert.doesNotMatch(image, /loading=|fetchPriority=|style=|onError=/);
        assert.match(image, /sizes="\(min-width: 1180px\)/);
        if (configuration.initialStep.endsWith('Login')) {
          assert.match(markup, /type="email"/);
          assert.match(markup, /type="password"/);
          assert.match(markup, /required=""/);
          assert.match(markup, /Show password/);
        }
      }
    });
  }
}

const react = hosts.frontend.require('react');
const find = (element, predicate) => {
  if (!react.isValidElement(element)) return undefined;
  if (predicate(element)) return element;
  for (const child of react.Children.toArray(element.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
};
const harness = (t, options) => {
  const slots = [];
  let cursor = 0;
  t.mock.method(react, 'useState', initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  });
  t.mock.method(react, 'useRef', initial => {
    const index = cursor++;
    slots[index] ??= { current: initial };
    return slots[index];
  });
  t.mock.method(react, 'useEffect', () => {});
  return () => { cursor = 0; return hosts.frontend.LoginFlow(props(options)); };
};

test('account and staff panel choices retain navigation callbacks and selection stages', t => {
  const destinations = [];
  const render = harness(t, { onAdmin: panel => destinations.push(panel) });
  const choice = () => find(render(), element => element.type?.name === 'Choices');
  const advance = () => find(render(), element => element.type === 'button' && element.props.className === 'login-primary');
  choice().props.onSelect('admin');
  advance().props.onClick();
  assert.equal(choice().props.kind, 'panel');
  choice().props.onSelect('cashier');
  advance().props.onClick();
  assert.deepEqual(destinations, ['cashier']);
  find(render(), element => element.type?.name === 'BackButton').props.onBack();
  assert.equal(choice().props.kind, 'account');
});

for (const panel of ['pamo', 'cashier']) {
  test(`${panel}: credential submission preserves arguments, pending guard and error presentation`, async t => {
    const calls = [];
    let reject;
    const pending = new Promise((_resolve, fail) => { reject = fail; });
    const render = harness(t, { host: 'admin', initialStep: 'adminLogin', initialPanel: panel,
      onAuthenticate: (...args) => { calls.push(args); return pending; } });
    const form = () => find(render(), element => element.type?.name === 'CredentialForm');
    const credentials = { email: 'synthetic@example.test', password: 'synthetic-only' };
    const first = form().props.onSubmit(credentials, false);
    await form().props.onSubmit(credentials, false);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [credentials, { register: false, panel }]);
    assert.equal(form().props.busy, true);
    reject(new Error('Synthetic login failure'));
    await first;
    assert.equal(form().props.busy, false);
    assert.equal(form().props.error, 'Synthetic login failure');
    form().props.onBack();
    assert.equal(find(render(), element => element.type?.name === 'Choices').props.kind, 'panel');
  });
}

test('student registration and authentication callbacks retain their existing contracts', async t => {
  const calls = [];
  const render = harness(t, { initialStep: 'studentLogin', onAuthenticate: (...args) => calls.push(args) });
  const form = () => find(render(), element => element.type?.name === 'CredentialForm');
  form().props.onRegister(true);
  assert.equal(form().props.register, true);
  const credentials = { name: 'Synthetic Student', email: 'synthetic@example.test', password: 'synthetic-only' };
  await form().props.onSubmit(credentials, true);
  assert.deepEqual(calls, [[credentials, { register: true, panel: 'pamo' }]]);
  assert.equal(form().props.busy, false);
  form().props.onBack();
  assert.equal(form().props.register, false);
});
