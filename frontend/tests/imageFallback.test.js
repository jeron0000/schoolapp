import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const output = await build({
  stdin: {
    resolveDir: frontend,
    loader: 'jsx',
    contents: `export { default as ImageWithFallback } from './src/components/ImageWithFallback.jsx';`
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  write: false
});
const compiled = new Module(path.join(frontend, 'image-fallback-test.cjs'));
compiled.filename = path.join(frontend, 'image-fallback-test.cjs');
compiled.paths = Module._nodeModulePaths(frontend);
compiled.require = createRequire(compiled.filename);
compiled._compile(output.outputFiles[0].text, compiled.filename);
const { ImageWithFallback } = compiled.exports;
const react = compiled.require('react');
const { renderToStaticMarkup } = compiled.require('react-dom/server');

const instance = t => {
  let failed = false;
  t.mock.method(react, 'useState', () => [failed, value => { failed = value; }]);
  return props => ImageWithFallback(props);
};

test('valid image retains source, alt text and the existing minimal markup', () => {
  const html = renderToStaticMarkup(react.createElement(ImageWithFallback, {
    src: 'https://example.test/uniform.png', name: 'School uniform'
  }));
  assert.match(html, /<img src="https:\/\/example\.test\/uniform\.png" alt="School uniform"\/>/);
  assert.doesNotMatch(html, /class=|loading=|role=|tabindex=/);
});

test('missing sources retain the text fallback without an image', () => {
  for (const src of [undefined, null, '']) {
    assert.equal(renderToStaticMarkup(react.createElement(ImageWithFallback, {
      src, name: 'School uniform'
    })), '<span>Image unavailable</span>');
  }
});

test('a broken URL renders an image until its error event, then retains the fallback', t => {
  const render = instance(t);
  const props = { src: 'https://example.test/broken.png', name: 'School uniform' };
  const image = render(props);
  assert.equal(image.type, 'img');
  assert.equal(image.props.src, props.src);
  assert.equal(image.props.alt, props.name);
  assert.deepEqual(Object.keys(image.props).sort(), ['alt', 'onError', 'src']);
  image.props.onError();
  for (let count = 0; count < 3; count++) {
    const fallback = render(props);
    assert.equal(fallback.type, 'span');
    assert.equal(fallback.props.children, 'Image unavailable');
  }
});

test('source changes alone do not reset failure; a fresh keyed instance starts clean', t => {
  const render = instance(t);
  render({ src: 'https://example.test/old.png', name: 'Old' }).props.onError();
  assert.equal(render({ src: 'https://example.test/new.png', name: 'New' }).type, 'span');
  const fresh = instance(t);
  const image = fresh({ src: 'https://example.test/new.png', name: 'New' });
  assert.equal(image.type, 'img');
  assert.equal(image.props.alt, 'New');
});

test('repeated successful renders preserve attributes and do not latch failure', t => {
  const render = instance(t);
  for (const src of ['https://example.test/one.png', 'https://example.test/two.png']) {
    const image = render({ src, name: 'School uniform' });
    assert.equal(image.type, 'img');
    assert.equal(image.props.src, src);
    assert.equal(image.props.alt, 'School uniform');
    assert.equal(image.props.onLoad, undefined);
  }
});
