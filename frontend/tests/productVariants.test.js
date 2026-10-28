import test from 'node:test'
import assert from 'node:assert/strict'
import { colorKey, getProductOptionLabel, groupProductListings, normalizeColorLabel, normalizeOptionLabel } from '../../shared/productVariants.js'
import { getProgramRecommendations } from '../src/utils/programRecommendations.js'
import { cartSelectionKey, selectCartItems } from '../src/utils/cartSelection.js'

const product = (id, color, price, stock = 5, programs = ['BSIT']) => ({
  _id: id, variantGroupId: 'yellow', colorLabel: color, name: `Shirt ${color}`,
  price, image: [`${color}.jpg`], sizes: ['M'], inventory: { M: stock }, academicPrograms: programs
})
const colors = () => [
  { ...product('yellow', 'Yellow', 225), groupTitle: 'Washday Shirt' },
  product('green', 'Green', 250, 23), product('red', 'Red', 225, 0)
]

test('labels normalize whitespace/case and reject empty, HTML, or oversized values', () => {
  assert.equal(normalizeColorLabel('  Navy   Blue '), 'Navy Blue')
  assert.equal(colorKey('GREEN'), colorKey(' green '))
  for (const label of ['', ' ', '<b>red</b>', 'x'.repeat(41), {}, null]) assert.equal(normalizeColorLabel(label), '')
})

test('listing grouping preserves real links/images, prices, input order, and independent inventory', () => {
  const catalog = colors()
  const before = structuredClone(catalog)
  const [listing] = groupProductListings([catalog[1], catalog[0], catalog[2]], catalog)
  assert.equal(listing._id, 'green')
  assert.equal(listing.image[0], 'Green.jpg')
  assert.equal(listing.name, 'Washday Shirt')
  assert.equal(listing.price, 225)
  assert.equal(listing.priceFrom, true)
  assert.equal(listing.inventory.M, 23, 'no aggregate stock is invented')
  assert.deepEqual(catalog, before)
  assert.equal(groupProductListings([catalog[0], catalog[2]], catalog)[0].priceFrom, false)
})

test('filter-first grouping counts only matching prices and leaves orphan/ungrouped products discoverable', () => {
  const catalog = colors()
  const [greenOnly] = groupProductListings([catalog[1]], catalog)
  assert.equal(greenOnly._id, 'green')
  assert.equal(greenOnly.price, 250)
  assert.equal(greenOnly.priceFrom, false)
  const orphan = product('orphan', 'Blue', 100)
  assert.deepEqual(groupProductListings([orphan]), [orphan])
  const standalone = { _id: 'plain', name: 'Standalone', price: 10 }
  assert.equal(groupProductListings([standalone])[0], standalone)
})

test('recommendations retain exclusive-first stock ranking and deduplicate groups before the four-item limit', () => {
  const catalog = colors()
  catalog.push(...Array.from({ length: 4 }, (_, index) => ({
    ...product(`plain-${index}`, '', 200, 1), variantGroupId: undefined
  })))
  const recommendations = getProgramRecommendations(catalog, 'BSIT')
  assert.equal(recommendations.length, 4)
  assert.equal(recommendations[0].product._id, 'green')
  assert.equal(recommendations.filter(item => item.product.variantGroupId === 'yellow').length, 1)
  assert.equal(getProgramRecommendations(catalog, 'BSHM').length, 0)
})

test('selective checkout keeps same-size colors as distinct product variants', () => {
  const yellow = '0123456789abcdef01234567'
  const green = '1123456789abcdef01234567'
  const cart = { [yellow]: { M: 1 }, [green]: { M: 2 } }
  const selected = selectCartItems(cart, [cartSelectionKey(green, 'M')])
  assert.deepEqual(selected, { [green]: { M: 2 } })
  assert.deepEqual(cart[yellow], { M: 1 })
})

test('general item listings coexist with saved color groups without changing purchasable identities', () => {
  const catalog = colors()
  catalog[1].optionLabel = 'Department Shirt'
  delete catalog[1].colorLabel
  catalog[1].name = 'Department Shirt'
  assert.equal(getProductOptionLabel(catalog[0]), 'Yellow')
  assert.equal(getProductOptionLabel(catalog[1]), 'Department Shirt')
  assert.equal(normalizeOptionLabel(' Classic   Shirt '), 'Classic Shirt')
  assert.equal(normalizeOptionLabel('x'.repeat(81)), '')
  assert.equal(groupProductListings(catalog).length, 1)
  const filtered = groupProductListings([catalog[1]], catalog)
  assert.equal(filtered[0]._id, 'green')
  assert.equal(filtered[0].optionLabel, 'Department Shirt')
  assert.equal(filtered[0].price, 250)
})
