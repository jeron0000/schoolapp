import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));

const loadHost = async host => {
  const directory = path.join(root, host);
  const output = await build({
    stdin: {
      resolveDir: directory,
      contents: `export { default as Provider } from './src/context/ThemeContext.jsx';
        export { ThemeContext, useTheme } from './src/hooks/useTheme.js';`
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    jsx: 'automatic',
    write: false
  });
  const compiled = new Module(path.join(directory, 'theme-lifecycle-test.cjs'));
  compiled.filename = path.join(directory, 'theme-lifecycle-test.cjs');
  compiled.paths = Module._nodeModulePaths(directory);
  compiled.require = createRequire(compiled.filename);
  compiled._compile(output.outputFiles[0].text, compiled.filename);
  const html = readFileSync(path.join(directory, 'index.html'), 'utf8');
  return {
    ...compiled.exports,
    react: compiled.require('react'),
    bootstrap: html.match(/<script>([\s\S]*?)<\/script>/)[1]
  };
};

const environment = (t, host, { saved, dark = false, storage = 'available' } = {}) => {
  const listeners = new Set();
  const values = new Map(saved === undefined ? [] : [['pamo-theme', saved]]);
  const element = {
    dataset: {},
    style: {},
    classList: {
      contains: () => dark,
      toggle: (name, enabled) => { assert.equal(name, 'dark'); dark = enabled; }
    }
  };
  const media = {
    matches: dark,
    addEventListener: (name, listener) => { assert.equal(name, 'change'); listeners.add(listener); },
    removeEventListener: (name, listener) => { assert.equal(name, 'change'); listeners.delete(listener); }
  };
  const globals = {
    document: { documentElement: element },
    window: { matchMedia: query => { assert.equal(query, '(prefers-color-scheme: dark)'); return media; } }
  };
  if (storage !== 'missing') {
    globals.localStorage = {
      getItem: key => { if (storage === 'blocked') throw new Error('Storage unavailable'); return values.get(key); },
      setItem: (key, value) => { if (storage === 'blocked') throw new Error('Storage unavailable'); values.set(key, value); }
    };
  }
  for (const name of ['document', 'window', 'localStorage']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value: globals[name] });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  const bootstrap = () => runInNewContext(host.bootstrap, globals);
  bootstrap();
  return {
    element, values, listeners, bootstrap,
    systemChange: matches => { media.matches = matches; for (const listener of listeners) listener({ matches }); }
  };
};

// Model hook slots and effect cleanup to exercise the real provider without a DOM dependency.
const mountProvider = (t, host) => {
  const slots = [];
  let index = 0;
  let pending = [];
  t.mock.method(host.react, 'useState', initial => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
    return [slots[slot], value => { slots[slot] = value; }];
  });
  t.mock.method(host.react, 'useRef', initial => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = { current: initial };
    return slots[slot];
  });
  const effect = (callback, dependencies) => {
    const slot = index++;
    const previous = slots[slot];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      pending.push(() => {
        previous?.cleanup?.();
        slots[slot] = { dependencies, cleanup: callback() };
      });
    }
  };
  t.mock.method(host.react, 'useLayoutEffect', effect);
  t.mock.method(host.react, 'useEffect', effect);
  return {
    render: () => {
      index = 0;
      pending = [];
      const element = host.Provider({ children: 'unchanged children' });
      assert.equal(element.type, host.ThemeContext.Provider);
      assert.equal(element.props.children, 'unchanged children');
      assert.deepEqual(Object.keys(element.props.value).sort(), ['theme', 'toggleTheme']);
      for (const flush of pending) flush();
      return element.props.value;
    },
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); slots.length = 0; }
  };
};

const hosts = await Promise.all(['frontend', 'admin'].map(loadHost));
assert.notEqual(hosts[0].ThemeContext, hosts[1].ThemeContext);

for (const [hostIndex, name] of ['frontend', 'admin'].entries()) {
  const host = hosts[hostIndex];
  for (const configuration of [
    { dark: false }, { dark: true }, { saved: 'light', dark: true },
    { saved: 'dark' }, { saved: 'invalid', dark: true },
    { storage: 'blocked', dark: true }, { storage: 'missing' }
  ]) {
    test(`${name}: first paint, initialization and cleanup ${JSON.stringify(configuration)}`, t => {
      const env = environment(t, host, configuration);
      const initial = env.element.style.colorScheme;
      const provider = mountProvider(t, host);
      assert.equal(provider.render().theme, initial);
      assert.equal(env.element.classList.contains('dark'), initial === 'dark');
      assert.equal(env.listeners.size, 1);
      provider.render();
      assert.equal(env.listeners.size, 1);
      provider.unmount();
      assert.equal(env.listeners.size, 0);
      assert.equal(provider.render().theme, initial);
      assert.equal(env.listeners.size, 1);
      provider.unmount();
      assert.equal(env.listeners.size, 0);
    });
  }

  test(`${name}: system changes, manual override, persistence and reload`, t => {
    const env = environment(t, host);
    const provider = mountProvider(t, host);
    assert.equal(provider.render().theme, 'light');
    env.systemChange(true);
    let value = provider.render();
    assert.equal(value.theme, 'dark');
    assert.equal(env.element.style.colorScheme, 'dark');
    assert.equal(env.element.dataset.themePreference, 'system');
    value.toggleTheme();
    value = provider.render();
    assert.equal(value.theme, 'light');
    assert.equal(env.values.get('pamo-theme'), 'light');
    assert.equal(env.element.dataset.themePreference, 'light');
    env.systemChange(true);
    assert.equal(provider.render().theme, 'light');
    provider.unmount();
    env.bootstrap();
    assert.equal(provider.render().theme, 'light');
    provider.render().toggleTheme();
    assert.equal(provider.render().theme, 'dark');
    assert.equal(env.values.get('pamo-theme'), 'dark');
    provider.unmount();
  });

  for (const storage of ['missing', 'blocked']) {
    test(`${name}: manual switching survives ${storage} storage`, t => {
      const env = environment(t, host, { storage });
      const provider = mountProvider(t, host);
      provider.render().toggleTheme();
      assert.equal(provider.render().theme, 'dark');
      env.systemChange(false);
      assert.equal(provider.render().theme, 'dark');
      provider.unmount();
      assert.equal(env.listeners.size, 0);
    });
  }

  test(`${name}: consumer hook retains its host context and missing-provider error`, t => {
    const value = { theme: 'dark', toggleTheme: () => {} };
    t.mock.method(host.react, 'useContext', context => {
      assert.equal(context, host.ThemeContext);
      return value;
    });
    assert.equal(host.useTheme(), value);
    host.react.useContext.mock.mockImplementation(() => null);
    assert.throws(() => host.useTheme(), /useTheme must be used inside ThemeContextProvider/);
  });
}
