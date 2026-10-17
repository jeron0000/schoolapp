import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../admin/src/App.jsx', import.meta.url), 'utf8');
// Exercise the actual App initialization, callbacks and effects without mounting
// unrelated pages or making authentication requests.
const appLogic = source.slice(source.indexOf('\n\nconst ') + 2, source.indexOf('\n  return ('))
  + '\n  return { panel, updateSession };\n}\nApp();';

const harness = ({ mode = 'normal', stored = 'cashier', requestedPanel = null,
  token = '', sessionMessage = '' } = {}) => {
  const calls = [], effects = [], state = [];
  const values = new Map(stored ? [['pamo-admin-panel', stored]] : []);
  const storage = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(method => [method, (...args) => {
    calls.push([method, ...args]);
    if (mode === 'methods-throw') throw new Error('Synthetic blocked storage');
    if (method === 'getItem') return values.get(args[0]) ?? null;
    if (method === 'setItem') values.set(...args);
    if (method === 'removeItem') values.delete(args[0]);
  }]));
  const context = {
    useTheme: () => ({ theme: 'dark' }),
    useLocation: () => ({ pathname: requestedPanel ? '/login' : '/', search: '' }),
    useNavigate: () => (path, options) => calls.push(['navigate', path, options.replace]),
    adminPanelFromSearch: () => requestedPanel,
    matchPath: () => false,
    useAuthSession: () => ({ token, sessionMessage, setToken: value => calls.push(['setToken', value]) }),
    useState(initial) {
      const slot = { value: typeof initial === 'function' ? initial() : initial };
      state.push(slot);
      return [slot.value, value => { slot.value = value; }];
    },
    useRef: value => ({ current: value }),
    useEffect: callback => effects.push(callback),
    toast: { error: message => calls.push(['toast', message]) },
    axios: {}, backendUrl: 'https://api.example.test'
  };
  Object.defineProperty(context, 'sessionStorage', { get() {
    if (mode === 'getter-throws') throw new Error('Synthetic unavailable storage');
    return storage;
  } });
  const app = runInNewContext(appLogic, context);
  return { ...app, calls, effects, state, values };
};

test('normal initialization restores only the existing panel preference', () => {
  assert.equal(harness().panel, 'cashier');
  assert.equal(harness({ stored: 'pamo' }).panel, 'pamo');
  assert.equal(harness({ stored: 'unexpected' }).panel, 'pamo');
  assert.equal(harness({ stored: '' }).panel, 'pamo');
});

for (const mode of ['normal', 'methods-throw', 'getter-throws']) {
  test(`${mode}: initialization preserves URL precedence and safe fallback`, () => {
    assert.equal(harness({ mode, stored: '', requestedPanel: 'cashier' }).panel, 'cashier');
    assert.equal(harness({ mode, stored: '' }).panel, 'pamo');
  });

  for (const panel of ['pamo', 'cashier']) {
    test(`${mode}: ${panel} login retains state updates and navigation`, () => {
      const h = harness({ mode, requestedPanel: panel });
      h.updateSession('synthetic-token', panel);
      assert.equal(h.state[0].value, null);
      assert.equal(h.state[1].value, panel);
      assert.ok(h.calls.some(call => call[0] === 'setToken' && call[1] === 'synthetic-token'));
      assert.deepEqual(h.calls.at(-1), ['navigate', panel === 'cashier' ? '/cashier' : '/dashboard', true]);
      if (mode === 'normal') assert.equal(h.values.get('pamo-admin-panel'), panel);
    });
  }

  test(`${mode}: logout clears in-memory access and panel before navigating`, () => {
    const h = harness({ mode, requestedPanel: 'cashier' });
    h.state[0].value = { role: 'cashier', token: 'synthetic-token' };
    h.updateSession('');
    assert.equal(h.state[0].value, null);
    assert.equal(h.state[1].value, 'pamo');
    assert.ok(h.calls.some(call => call[0] === 'setToken' && call[1] === ''));
    assert.deepEqual(h.calls.at(-1), ['navigate', '/', true]);
    if (mode === 'normal') assert.equal(h.values.has('pamo-admin-panel'), false);
  });

  test(`${mode}: expiry notice and login navigation survive preference cleanup`, () => {
    const h = harness({ mode, requestedPanel: 'cashier', sessionMessage: 'Session expired' });
    h.effects[1]();
    assert.deepEqual(h.calls.at(-2), ['toast', 'Session expired']);
    assert.deepEqual(h.calls.at(-1), ['navigate', '/login?panel=cashier', true]);
    const count = h.calls.length;
    h.effects[1]();
    assert.equal(h.calls.length, count);
  });

  test(`${mode}: authenticated panel redirect survives preference write`, () => {
    const h = harness({ mode, token: 'synthetic-token', requestedPanel: 'cashier' });
    h.effects[2]();
    assert.deepEqual(h.calls.at(-1), ['navigate', '/cashier', true]);
    const loggedOut = harness({ mode, requestedPanel: 'cashier' });
    loggedOut.effects[2]();
    assert.equal(loggedOut.calls.length, 0);
  });
}
