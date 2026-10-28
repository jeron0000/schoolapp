import test from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const output = await build({
  stdin: {
    resolveDir: frontend,
    contents: `
      export { default as ProgramRecommendations } from './src/components/ProgramRecommendations.jsx';
      export { ShopContext } from './src/context/shopContext.js';
      export { getProgramRecommendations } from './src/utils/programRecommendations.js';
    `,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.css': 'empty' },
  write: false,
})
const filename = path.join(frontend, 'program-recommendations-test.cjs')
const require = createRequire(filename)
const compiled = new Module(filename)
compiled.filename = filename
compiled.paths = Module._nodeModulePaths(frontend)
compiled.require = require
compiled._compile(output.outputFiles[0].text, filename)

const {
  ProgramRecommendations,
  ShopContext,
  getProgramRecommendations,
} = compiled.exports
const react = require('react')
const router = require('react-router-dom')
const { renderToStaticMarkup } = require('react-dom/server')

const product = (id, program, stock, flags = {}) => ({
  _id: id,
  name: `Product ${id}`,
  image: [`https://example.test/${id}.png`],
  price: 100,
  category: 'Men',
  subCategory: program,
  sizes: ['S'],
  inventory: { S: stock },
  newArrivalMarkedAt: new Date().toISOString(),
  ...flags,
})

test('course-exclusive products always rank before shared products', () => {
  const products = [
    product('shared-high-stock', 'BSIT', 100, {
      academicPrograms: ['BSBAOM', 'BSIT'],
    }),
    product('exclusive-out-of-stock', 'BSBAOM', 0, {
      academicPrograms: ['BSBAOM'],
      NewArrival: true,
      BestSeller: true,
    }),
    product('shared-medium-stock', 'BSHM', 20, {
      academicPrograms: ['BSBAOM', 'BSIT', 'BSHM', 'BSTM'],
    }),
    product('other-program', 'BSIT', 30, {
      academicPrograms: ['BSIT'],
    }),
    product('exclusive-in-stock', 'BSBAOM', 5, {
      academicPrograms: ['BSBAOM'],
    }),
  ]

  assert.deepEqual(
    getProgramRecommendations(products, ' bsbaom ').map(item => item.product._id),
    [
      'exclusive-in-stock',
      'exclusive-out-of-stock',
      'shared-high-stock',
      'shared-medium-stock',
    ],
  )
  assert.deepEqual(
    getProgramRecommendations(products, 'BSIT').map(item => item.product._id),
    ['other-program', 'shared-high-stock', 'shared-medium-stock'],
  )
  assert.deepEqual(getProgramRecommendations(products, ''), [])
})

test('shared products rank by stock quantity, merchandising, recency, then stable IDs', () => {
  const products = [
    product('shared-bestseller', 'BSIT', 10, {
      academicPrograms: ['BSIT', 'BSHM'],
      BestSeller: true,
      date: 900,
    }),
    product('shared-b', 'BSIT', 10, {
      academicPrograms: ['BSIT', 'BSHM'],
      NewArrival: true,
      BestSeller: true,
      date: 400,
    }),
    product('shared-highest-stock', 'BSIT', 30, {
      academicPrograms: ['BSIT', 'BSHM'],
      date: 100,
    }),
    product('shared-newer', 'BSIT', 10, {
      academicPrograms: ['BSIT', 'BSHM'],
      NewArrival: true,
      BestSeller: true,
      date: 500,
    }),
    product('shared-a', 'BSIT', 10, {
      academicPrograms: ['BSIT', 'BSHM'],
      NewArrival: true,
      BestSeller: true,
      date: 400,
    }),
  ]

  const expected = ['shared-highest-stock', 'shared-newer', 'shared-a', 'shared-b']
  assert.deepEqual(
    getProgramRecommendations(products, 'BSIT').map(item => item.product._id),
    expected,
  )
  assert.deepEqual(
    getProgramRecommendations(products, 'BSIT').map(item => item.product._id),
    expected,
  )
})

test('expired New Arrival stops influencing ranking at the exact boundary, including grouped items', () => {
  const now = Date.parse('2026-10-28T04:00:00.000Z')
  const markedAt = now - 30 * 24 * 60 * 60 * 1000
  const products = [
    product('old', 'BSIT', 10, { NewArrival: true, newArrivalMarkedAt: new Date(markedAt).toISOString(), date: 100 }),
    product('newer', 'BSIT', 10, { date: 200 }),
    product('curated', 'BSIT', 10, { BestSeller: true, date: 50 }),
    product('other', 'BSHM', 100, { NewArrival: true })
  ]
  assert.deepEqual(getProgramRecommendations(products, 'BSIT', now - 1).map(item => item.product._id), ['old', 'curated', 'newer'])
  assert.deepEqual(getProgramRecommendations(products, 'BSIT', now).map(item => item.product._id), ['curated', 'newer', 'old'])
  const grouped = products.map(item => {
    if (item._id === 'old') return { ...item, variantGroupId: 'old', optionLabel: 'Classic', groupTitle: 'Shirts' }
    if (item._id === 'newer') return { ...item, variantGroupId: 'old', optionLabel: 'Washday' }
    return item
  })
  const recommendations = getProgramRecommendations(grouped, 'BSIT', now)
  assert.deepEqual(recommendations.map(item => item.product._id), ['curated', 'newer'])
  assert.equal(recommendations[1].product.name, 'Shirts')
  assert.equal(recommendations[1].product.optionLabel, 'Washday')
})

test('one to five exclusive products fill at most four positions before shared products', () => {
  for (const exclusiveCount of [1, 2, 3, 4, 5]) {
    const exclusiveProducts = Array.from({ length: exclusiveCount }, (_, index) => (
      product(`exclusive-${index}`, 'BSIT', exclusiveCount - index, {
        academicPrograms: ['BSIT'],
      })
    ))
    const sharedProducts = Array.from({ length: 4 }, (_, index) => (
      product(`shared-${index}`, 'BSIT', 100 - index, {
        academicPrograms: ['BSIT', 'BSHM'],
      })
    ))
    const recommendations = getProgramRecommendations(
      [...sharedProducts, ...exclusiveProducts],
      'BSIT',
    ).map(item => item.product._id)
    const expectedExclusive = exclusiveProducts
      .slice(0, Math.min(exclusiveCount, 4))
      .map(item => item._id)
    const expectedShared = sharedProducts
      .slice(0, Math.max(0, 4 - exclusiveCount))
      .map(item => item._id)

    assert.deepEqual(recommendations, [...expectedExclusive, ...expectedShared])
  }
})

test('recommendations preserve legacy fallback, explicit clearing, dynamic programs, and deduplication', () => {
  const multi = product('multi', 'BSHM', 5, {
    academicPrograms: ['BSIT', 'BSCpE', 'BSBAOM'],
  })
  const explicitlyCleared = product('cleared', 'BSIT', 8, {
    academicPrograms: [],
    BestSeller: true,
  })
  const legacy = product('legacy', 'BSIT', 3)

  assert.deepEqual(
    getProgramRecommendations([multi, multi, explicitlyCleared, legacy], 'BSIT')
      .map(item => item.product._id),
    ['legacy', 'multi'],
  )
  assert.deepEqual(
    getProgramRecommendations([multi], 'BSCpE').map(item => item.product._id),
    ['multi'],
  )
  assert.deepEqual(getProgramRecommendations([explicitlyCleared], 'BSIT'), [])
})

const renderRecommendations = overrides => {
  const value = {
    products: [product('dynamic', 'DIGITAL-ARTS', 3)],
    productsLoading: false,
    productCategories: [
      { code: 'DIGITAL-ARTS', name: 'Digital Arts', scope: 'program', active: true },
    ],
    token: 'customer-session',
    studentProfile: { academicProgram: 'DIGITAL-ARTS' },
    profileLoading: false,
    ...overrides,
  }

  return renderToStaticMarkup(
    react.createElement(
      router.MemoryRouter,
      null,
      react.createElement(
        ShopContext.Provider,
        { value },
        react.createElement(ProgramRecommendations),
      ),
    ),
  )
}

test('dynamic programs render real products and use the Collection program contract', () => {
  const products = Array.from({ length: 5 }, (_, index) => (
    product(`dynamic-${index}`, 'DIGITAL-ARTS', index + 1, {
      academicPrograms: ['DIGITAL-ARTS'],
      date: index,
    })
  ))
  const markup = renderRecommendations({ products })

  assert.match(markup, /Essentials for your Digital Arts program/)
  assert.equal([...markup.matchAll(/href="\/product\/dynamic-/g)].length, 4)
  assert.match(markup, /Low Stock/)
  assert.match(markup, /href="\/collection\?program=DIGITAL-ARTS"/)
})

test('guests, loading profiles, missing programs, and unmatched programs render nothing', () => {
  assert.equal(renderRecommendations({ token: '' }), '')
  assert.equal(renderRecommendations({ profileLoading: true }), '')
  assert.equal(renderRecommendations({ studentProfile: {} }), '')
  assert.equal(renderRecommendations({
    studentProfile: { academicProgram: 'BSHM' },
  }), '')
})

test('one to four recommendations use the same left-aligned responsive grid', () => {
  for (const count of [1, 2, 3, 4]) {
    const products = Array.from({ length: count }, (_, index) => ({
      ...product(`item-${index}`, 'DIGITAL-ARTS', index + 1),
      name: `Long academic program product name ${index}`,
      price: 123456789789,
    }))
    const markup = renderRecommendations({ products })
    const cards = [...markup.matchAll(/href="\/product\/item-/g)]

    assert.equal(cards.length, count)
    assert.match(markup, /grid-cols-2 gap-x-3 gap-y-\[17px\] max-\[359px\]:grid-cols-1/)
    assert.match(markup, /md:grid-cols-\[repeat\(2,minmax\(0,320px\)\)\] md:justify-center/)
    assert.match(markup, /min-\[1180px\]:grid-cols-4/)
    assert.doesNotMatch(markup, /max-w-\[1040px\]|max-w-\[680px\]|mx-auto mt-7 grid/)
    assert.match(markup, /min-h-\[311px\]/)
    assert.match(markup, /aspect-\[155\/175\]/)
    assert.doesNotMatch(markup, /aspect-\[4\/3\]|min-\[1180px\]:grid-cols-3/)
    assert.match(markup, /₱123,456,789,789\.00/)
    assert.match(markup, /\[overflow-wrap:anywhere\]/)
  }
})
