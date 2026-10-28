import test from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const output = await build({
  stdin: {
    resolveDir: path.resolve(frontend),
    loader: 'jsx',
    contents: `
      export { AnnouncementCard } from './src/pages/Announcements.jsx'
      export {
        announcementStorageKey,
        markAnnouncementRead,
        readAnnouncementIds,
        unreadAnnouncementCount
      } from './src/utils/announcementReadState.js'
    `
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' },
  write: false
})
const compiled = new Module(path.join(frontend, 'announcements-page-test.cjs'))
compiled.filename = path.join(frontend, 'announcements-page-test.cjs')
compiled.paths = Module._nodeModulePaths(frontend)
compiled.require = createRequire(compiled.filename)
compiled._compile(output.outputFiles[0].text, compiled.filename)

const React = compiled.require('react')
const { renderToStaticMarkup } = compiled.require('react-dom/server')
const { MemoryRouter } = compiled.require('react-router-dom')
const {
  AnnouncementCard,
  announcementStorageKey,
  markAnnouncementRead,
  readAnnouncementIds,
  unreadAnnouncementCount
} = compiled.exports

const render = (announcement, props = {}) => renderToStaticMarkup(
  React.createElement(
    MemoryRouter,
    null,
    React.createElement(AnnouncementCard, { announcement, ...props })
  )
)

test('announcement card renders plain text, type, Manila date, and internal navigation', () => {
  const html = render({
    _id: 'announcement-1',
    type: 'price-change',
    message: '<img src=x onerror=alert(1)> Prices update Monday.',
    link: '/collection',
    publishAt: '2026-10-25T04:00:00.000Z',
    expiresAt: '2026-10-26T04:00:00.000Z'
  }, { opened: true })

  assert.match(html, /Price-change notice/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(html, /<img src=x/)
  assert.match(html, /href="\/collection"/)
  assert.match(html, /Asia\/Manila/)
  assert.doesNotMatch(html, /Expiration/)
})

test('announcement card handles optional dates and links without inventing values', () => {
  const html = render({
    type: 'general',
    message: 'Enrollment kits are now available.',
    link: null,
    publishAt: null,
    expiresAt: null
  })

  assert.match(html, /General announcement/)
  assert.match(html, /Published immediately/)
  assert.doesNotMatch(html, /No expiration date/)
  assert.doesNotMatch(html, /Expiration/)
  assert.doesNotMatch(html, /View details/)
  assert.equal(render(null), '')
})

test('opened announcement card links each selected product through the existing route', () => {
  const html = render({
    _id: 'announcement-2',
    type: 'general',
    message: 'New uniforms are available.',
    linkedProductIds: ['product-1', 'product-2'],
    publishAt: '2026-10-25T04:00:00.000Z'
  }, {
    opened: true,
    products: [
      { _id: 'product-1', name: 'College uniform' },
      { _id: 'product-2', name: 'SHS uniform' }
    ]
  })

  assert.match(html, /Linked products/)
  assert.match(html, /href="\/product\/product-1"/)
  assert.match(html, /College uniform/)
  assert.match(html, /href="\/product\/product-2"/)
  assert.match(html, /SHS uniform/)
})

test('price-change announcement renders multiple authoritative PHP comparisons', () => {
  const html = render({
    _id: 'announcement-3',
    type: 'price-change',
    message: 'Uniform prices change next week.',
    publishAt: '2026-10-25T04:00:00.000Z',
    linkedProductIds: ['stale-product'],
    priceComparisons: [
      {
        productId: 'product-1',
        name: 'College uniform',
        image: 'uniform.jpg',
        previousPrice: 500,
        newPrice: 550,
        effectiveAt: '2026-11-01T01:00:00.000Z'
      },
      {
        productId: 'product-2',
        name: 'PE shirt',
        image: null,
        previousPrice: 250,
        newPrice: 275.5,
        effectiveAt: '2026-11-01T01:00:00.000Z'
      }
    ]
  }, {
    opened: true,
    products: [{ _id: 'stale-product', name: 'Stale linked product' }]
  })

  assert.match(html, /Upcoming price changes/)
  assert.match(html, /href="\/product\/product-1"/)
  assert.match(html, /href="\/product\/product-2"/)
  assert.match(html, /College uniform/)
  assert.match(html, /PE shirt/)
  assert.match(html, /₱500\.00/)
  assert.match(html, /₱550\.00/)
  assert.match(html, /₱275\.50/)
  assert.match(html, /Effective/)
  assert.match(html, /Asia\/Manila/)
  assert.doesNotMatch(html, /Stale linked product/)
})

test('read state is isolated by user and counts only unread public records', () => {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  }
  const firstUser = 'user-1'
  const secondUser = 'user-2'

  assert.notEqual(
    announcementStorageKey(firstUser),
    announcementStorageKey(secondUser)
  )
  assert.equal(markAnnouncementRead(firstUser, 'announcement-1', storage), true)
  assert.equal(markAnnouncementRead(firstUser, 'announcement-1', storage), false)
  assert.deepEqual([...readAnnouncementIds(firstUser, storage)], ['announcement-1'])
  assert.deepEqual([...readAnnouncementIds(secondUser, storage)], [])
  assert.equal(unreadAnnouncementCount([
    { _id: 'announcement-1' },
    { _id: 'announcement-2' }
  ], readAnnouncementIds(firstUser, storage)), 1)
})
