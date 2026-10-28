import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hosts = {};
for (const host of ['frontend', 'admin']) {
  const directory = path.join(root, host);
  const built = await build({
    stdin: { resolveDir: directory, contents: "export { default } from '../shared/LoginFlow.jsx';" },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external',
    jsx: 'automatic', write: false, resolveExtensions: ['.js', '.jsx', '.json'],
    loader: { '.css': 'empty' },
    plugins: [{ name: 'login-asset-urls', setup(builder) {
      builder.onLoad({ filter: /\.(png|jpe?g)$/ }, args => ({
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

test('the enhanced campus photograph is local and optimized for web delivery', () => {
  const photo = fs.readFileSync(path.join(root, 'shared/assets/login-campus.jpg'));
  assert.equal(crypto.createHash('sha256').update(photo).digest('hex'), '8193ef772be874cea97a0a3b535710270be74d093c827bda0f8f6c4a01e9692b');
  assert.equal(photo.subarray(0, 2).toString('hex'), 'ffd8');
  assert.ok(photo.length < 512 * 1024);
});

test('campus layout uses independent theme overlays and fluid, scrollable card constraints', () => {
  const css = fs.readFileSync(path.join(root, 'shared/LoginFlow.css'), 'utf8');
  assert.match(css, /\.shared-login\s*\{[^}]*linear-gradient[^}]*var\(--login-campus-image\)/s);
  assert.match(css, /\.dark \.shared-login\s*\{[^}]*#020617[^}]*linear-gradient/s);
  assert.match(css, /background-size: cover/);
  assert.match(css, /background-position: 60% center/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.doesNotMatch(css, /backdrop-filter|filter:\s*blur|overflow:\s*hidden/);
});

for (const [host, { LoginFlow, require }] of Object.entries(hosts)) {
  const react = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const configuration of configurations) {
    test(`${host}: ${configuration.heading} uses the centered campus card in both themes`, () => {
      for (const theme of ['light', 'dark']) {
        const markup = renderToStaticMarkup(react.createElement('div', { className: theme },
          react.createElement(LoginFlow, props(configuration))));
        assert.ok(markup.includes(configuration.heading));
        assert.match(markup, /--login-campus-image:url\(&quot;\/assets\/login-campus\.jpg&quot;\)/);
        assert.equal((markup.match(/class="login-card /g) || []).length, 1);
        assert.match(markup, /max-w-\[460px\]/);
        assert.match(markup, /min-h-\[100svh\]/);
        assert.match(markup, /alt="PAMO"/);
        assert.doesNotMatch(markup, /login-students|Welcome to PAMO|grid-area:welcome|grid-area:photo|grid-cols-\[/);
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

test('Student Continue retains sign-in and authenticated navigation behavior', t => {
  const destinations = [];
  let render = harness(t, { onStudent: () => destinations.push('student') });
  const advance = () => find(render(), element => element.type === 'button' && element.props.className?.split(' ').includes('login-primary'));
  advance().props.onClick();
  assert.equal(find(render(), element => element.type?.name === 'CredentialForm').props.student, true);
  assert.deepEqual(destinations, []);
  render = harness(t, { studentAuthenticated: true, onStudent: () => destinations.push('student') });
  advance().props.onClick();
  assert.deepEqual(destinations, ['student']);
});

test('the supplied theme toggle remains intact in the top-right header', t => {
  let toggles = 0;
  const toggle = react.createElement('button', { role: 'switch', 'aria-label': 'Dark mode', onClick: () => { toggles++; } });
  const render = harness(t, { themeToggle: toggle });
  const header = find(render(), element => element.type === 'header');
  assert.match(header.props.className, /justify-end/);
  const control = find(header, element => element.props.role === 'switch');
  assert.equal(control.type, toggle.type);
  assert.deepEqual(control.props, toggle.props);
  control.props.onClick();
  assert.equal(toggles, 1);
});

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
  const advance = () => find(render(), element => element.type === 'button' && element.props.className?.split(' ').includes('login-primary'));
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
  const programOptions = [
    { value: 'BSIT', label: 'BSIT' },
    { value: 'digital-arts', label: 'Digital Arts' }
  ];
  const render = harness(t, {
    initialStep: 'studentLogin',
    programOptions,
    onAuthenticate: (...args) => calls.push(args)
  });
  const form = () => find(render(), element => element.type?.name === 'CredentialForm');
  form().props.onRegister(true);
  assert.equal(form().props.register, true);
  assert.deepEqual(form().props.programOptions, programOptions);
  const credentials = { name: 'Synthetic Student', email: 'synthetic@example.test', password: 'synthetic-only' };
  await form().props.onSubmit(credentials, true);
  assert.deepEqual(calls, [[credentials, { register: true, panel: 'pamo' }]]);
  assert.equal(form().props.busy, false);
  form().props.onBack();
  assert.equal(form().props.register, false);
});
