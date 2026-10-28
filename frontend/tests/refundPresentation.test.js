import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { refundPresentation } from '../../shared/refund.js'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const output = await build({
  stdin: {
    resolveDir: frontend,
    loader: 'jsx',
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import CustomerOrderCard from './src/components/CustomerOrderCard.jsx';
      export { default as StudentOrders } from './src/pages/Orders.jsx';
      import OrderDetails from '../admin/src/components/OrderDetails.jsx';
      import PaymentDetails from '../admin/src/components/PaymentDetails.jsx';
      import ProductItem from './src/components/ProductItem.jsx';
      import CartTotal from './src/components/CartTotal.jsx';
      import { ShopContext } from './src/context/shopContext.js';
      import { MemoryRouter } from 'react-router-dom';
      export const renderProduct = price => renderToStaticMarkup(<MemoryRouter><ProductItem home id='synthetic' image={[]} name='Synthetic' price={price} /></MemoryRouter>);
      export const renderTotals = (subtotal, checkoutView) => renderToStaticMarkup(
        <MemoryRouter><ShopContext.Provider value={{ getCartAmount: () => subtotal, delivery_fee: 10 }}>
          <CartTotal cartView={!checkoutView} checkoutView={checkoutView} itemCount={1} unitCount={3} />
        </ShopContext.Provider></MemoryRouter>
      );
      export const render = (kind, order) => renderToStaticMarkup(
        kind === 'customer'
          ? <MemoryRouter><CustomerOrderCard order={order} currency='P' onCancel={() => {}} cancellationPending={false} /></MemoryRouter>
          : kind === 'admin'
            ? <OrderDetails order={order} currency='P' pending={false} onAction={() => {}} onClose={() => {}} />
            : <PaymentDetails order={order} currency='P' pending={false} onConfirm={() => {}} onClose={() => {}} />
      );
    `
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' }
})
const compiled = new Module(path.join(frontend, 'refund-presentation-test.cjs'))
compiled.filename = path.join(frontend, 'refund-presentation-test.cjs')
compiled.paths = Module._nodeModulePaths(frontend)
compiled.require = createRequire(compiled.filename)
compiled._compile(output.outputFiles[0].text, compiled.filename)

const order = overrides => ({
  _id: '0123456789abcdef01234567', items: [], amount: 235, date: 1,
  status: 'Cancelled', paymentMethod: 'COD', payment: true, allowedStatuses: [], ...overrides
})

test('student online receipts show waiting, saved and clearly marked test references', t => {
  t.mock.method(compiled.require('react'), 'useState', initial => [initial === false ? true : initial, () => {}])
  const online = order({ paymentMethod: 'Stripe', status: 'Approved' })
  assert.match(compiled.exports.render('customer', online), /Awaiting Official Receipt/)
  assert.match(compiled.exports.render('customer', { ...online, receiptNumber: 'OR-ONLINE' }), /OR-ONLINE/)
  const testHtml = compiled.exports.render('customer', { ...online, receiptNumber: 'TEST-OR', receiptIsTest: true })
  assert.match(testHtml, /Test Receipt Reference/)
  assert.match(testHtml, /TEST — TEST-OR/)
})

test('customer and Admin details show server-snapshotted colors and accept historical colorless items', () => {
  for (const kind of ['customer', 'admin']) {
    const purchased = { _id: 'green-product', name: 'Washday Shirt', colorLabel: 'Green & White', size: '4XL', quantity: 1, price: 225, image: [] }
    const html = compiled.exports.render(kind, order({ items: [purchased] }))
    assert.match(html, /Color · Green &amp; White/)
    assert.match(html, /4XL/)
    const itemSnapshot = compiled.exports.render(kind, order({ items: [{ ...purchased, optionLabel: 'Department Shirt' }] }))
    assert.match(itemSnapshot, /Item · Department Shirt/)
    assert.doesNotMatch(itemSnapshot, /Color ·/)
    delete purchased.colorLabel
    const historical = compiled.exports.render(kind, order({ items: [purchased] }))
    assert.doesNotMatch(historical, /Color ·/)
    assert.match(historical, /Washday Shirt/)
  }
})

test('customer, Admin and Cashier distinguish paid cancellation from an unconfirmed refund', () => {
  for (const kind of ['customer', 'admin', 'cashier']) {
    const html = compiled.exports.render(kind, order({ refund: { status: 'Refund Required', requiredAt: 1 } }))
    assert.match(html, /Refund Required/)
    assert.match(html, /refund is required and has not been confirmed/)
    assert.match(html, /Contact PAMO/)
    assert.doesNotMatch(html, />Refunded[.<]/)
    if (kind === 'cashier') assert.doesNotMatch(html, /<form/)
  }
})

test('unpaid, unknown and historical refund states remain truthful in every view', () => {
  for (const kind of ['customer', 'admin', 'cashier']) {
    const unpaid = compiled.exports.render(kind, order({ payment: false }))
    assert.match(unpaid, /Not Required/)
    for (const payment of [undefined, null, 'unknown']) {
      const historical = compiled.exports.render(kind, order({ payment }))
      assert.match(historical, /Payment records need PAMO review/)
      assert.match(historical, /No refund has been confirmed/)
    }
    const unsupported = compiled.exports.render(kind, order({ refund: { status: 'Refunded' } }))
    assert.match(unsupported, /has not been confirmed/)
  }
  assert.equal(refundPresentation(order({ status: 'Packing' })), null)
})

test('customer warning and existing styles provide clear cancellation wording with both theme variants', async () => {
  const page = await readFile(new URL('../src/pages/Orders.jsx', import.meta.url), 'utf8')
  assert.match(page, /Cancelling this paid order records a refund obligation/)
  assert.match(page, /It does not issue a refund/)
  assert.match(page, /orders-cancel-dialog/)
  assert.match(page, /text-\[color:var\(--pamo-color-text-secondary\)\]/)
  for (const component of ['OrderDetails', 'PaymentDetails']) {
    const source = await readFile(new URL(`../../admin/src/components/${component}.jsx`, import.meta.url), 'utf8')
    if (component === 'OrderDetails') {
      assert.match(source, /refund && <p className='order-details-refund /)
      assert.match(source, /order-details-refund[^']*text-\[color:var\(--pamo-color-text-secondary\)\]/)
    } else assert.match(source, /refund && <p className='[^']*text-slate-700 dark:text-slate-300'/)
  }
})

test('product, cart and checkout display two-decimal PHP, including the existing fee on free products', () => {
  assert.match(compiled.exports.renderProduct(500), /₱500\.00/)
  assert.match(compiled.exports.renderProduct(20.1), /₱20\.10/)
  assert.match(compiled.exports.renderProduct(1.001), /Unavailable/)
  for (const checkout of [false, true]) {
    const html = compiled.exports.renderTotals(60.3, checkout)
    assert.match(html, /₱60\.30/)
    assert.match(html, /₱10\.00/)
    assert.match(html, /₱70\.30/)
    const zero = compiled.exports.renderTotals(0, checkout)
    assert.match(zero, /₱0\.00/)
    assert.match(zero, /<dt>Total<\/dt><dd[^>]*>₱10\.00/)
  }
})

test('customer, Admin and Cashier show refund order totals without foreign currency relabeling', () => {
  for (const kind of ['customer', 'admin', 'cashier']) {
    assert.match(compiled.exports.render(kind, order({ amount: 70.3, paymentCurrency: 'PHP' })), /₱70\.30/)
    const foreign = compiled.exports.render(kind, order({ amount: 70.3, paymentCurrency: 'USD' }))
    assert.match(foreign, /70\.30 USD/)
    assert.doesNotMatch(foreign, /₱70/)
    assert.match(foreign, /refund is required and has not been confirmed/)
    const anomaly = compiled.exports.render(kind, order({ amount: 1.005, paymentCurrency: 'PHP' }))
    assert.match(anomaly, /1\.005 PHP \(precision needs review\)/)
  }
})

test('cancellation requests display pending/overdue, decisions, and plain-text reasons in existing cards', () => {
  const pending = order({ status: 'Packing', cancellationRequest: {
    _id: 'request', status: 'pending', requestedAt: Date.now() - 25 * 60 * 60 * 1000,
    reason: '<script>student reason</script>'
  } })
  for (const kind of ['customer', 'admin']) {
    const html = compiled.exports.render(kind, pending)
    assert.match(html, /Cancellation · Overdue/)
    assert.match(html, /&lt;script&gt;student reason&lt;\/script&gt;/)
    if (kind === 'customer') assert.doesNotMatch(html, />Request Cancellation</)
    else assert.match(html, /Approve Cancellation/)
    const rejected = compiled.exports.render(kind, { ...pending, cancellationRequest: {
      ...pending.cancellationRequest, status: 'rejected', rejectionReason: 'Already being prepared.'
    } })
    assert.match(rejected, /Cancellation · Rejected/)
    assert.match(rejected, /Already being prepared\./)
  }
  const paid = compiled.exports.render('customer', order({ status: 'Order Placed' }))
  assert.match(paid, />Request Cancellation</)
  assert.doesNotMatch(paid, />Cancel Order</)
  const unpaid = compiled.exports.render('customer', order({ status: 'Order Placed', payment: false }))
  assert.match(unpaid, />Cancel Order</)
  const cashier = compiled.exports.render('cashier', { ...pending, status: 'Sent to Cashier', payment: false, paymentCurrency: 'PHP' })
  assert.doesNotMatch(cashier, /<form/)
  assert.match(cashier, /Payment confirmation is on hold/)
})

test('paid-online policy hides ordinary cancellation, links Support, and preserves COD behavior', () => {
  for (const paymentMethod of ['Stripe', 'Paypal']) {
    for (const status of ['Order Placed', 'Approved', 'Packing', 'Ready To Claim', 'Claimed']) {
      const paid = order({ paymentMethod, payment: true, status, cancellationMode: 'request' })
      const html = compiled.exports.render('customer', paid)
      assert.match(html, /Online Payment — Cancellation Policy/)
      assert.match(html, /This order has been paid online and cannot be cancelled directly through PAMO\./)
      assert.match(html, /For payment issues, unavailable items, or refund concerns, please contact PAMO Support\./)
      assert.match(html, /href="\/contact"[^>]*>Contact Support/)
      assert.doesNotMatch(html, />Cancel Order<|>Request Cancellation</)
    }
    const pending = compiled.exports.render('customer', order({ paymentMethod, payment: false, status: 'Order Placed' }))
    assert.doesNotMatch(pending, /Online Payment — Cancellation Policy/)
    const admin = compiled.exports.render('admin', order({ paymentMethod, payment: true, status: 'Approved' }))
    assert.match(admin, /Exceptional Cancellation/)
    const completed = compiled.exports.render('admin', order({ paymentMethod, payment: true, status: 'Completed' }))
    assert.doesNotMatch(completed, /Exceptional Cancellation/)
  }
  const cod = compiled.exports.render('customer', order({ paymentMethod: 'COD', payment: true, status: 'Approved' }))
  assert.match(cod, />Request Cancellation</)
  assert.doesNotMatch(cod, /Online Payment — Cancellation Policy/)
})

test('Student request dialog requires a reason and prevents duplicate submissions', async t => {
  const require = createRequire(compiled.filename)
  const React = require('react')
  const axios = require('axios')
  const { toast } = require('react-toastify')
  const slots = []
  let cursor = 0
  const record = order({ status: 'Packing', cancellationRequest: undefined })
  const context = { token: 'student', backendUrl: 'https://api.example.test', getProductsData: async () => {} }
  t.mock.method(React, 'useContext', () => context)
  t.mock.method(React, 'useEffect', () => {})
  t.mock.method(React, 'useCallback', callback => callback)
  t.mock.method(React, 'useState', initial => {
    const index = cursor++
    slots[index] ??= { value: Array.isArray(initial) ? [record] : initial }
    return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next }]
  })
  t.mock.method(React, 'useRef', initial => slots[cursor++] ??= { current: initial })
  const find = (node, predicate) => {
    if (!React.isValidElement(node)) return null
    if (predicate(node)) return node
    for (const child of React.Children.toArray(node.props.children)) {
      const found = find(child, predicate)
      if (found) return found
    }
    return null
  }
  const render = () => { cursor = 0; return compiled.exports.StudentOrders() }
  let tree = render()
  find(tree, node => typeof node.props.onCancel === 'function').props.onCancel(record)
  tree = render()
  let submit = find(tree, node => node.type === 'button' && node.props.children === 'Submit Request')
  assert.equal(submit.props.disabled, true)
  find(tree, node => node.type === 'textarea').props.onChange({ target: { value: 'Wrong size' } })
  tree = render()
  submit = find(tree, node => node.type === 'button' && node.props.children === 'Submit Request')
  assert.equal(submit.props.disabled, false)
  let resolveRequest
  const post = t.mock.method(axios, 'post', () => new Promise(resolve => { resolveRequest = resolve }))
  t.mock.method(toast, 'success', () => {})
  const pending = submit.props.onClick()
  await submit.props.onClick()
  assert.equal(post.mock.callCount(), 1)
  assert.equal(post.mock.calls[0].arguments[0], context.backendUrl + '/api/order/cancellation/request')
  assert.deepEqual(post.mock.calls[0].arguments[1], { orderId: record._id, reason: 'Wrong size' })
  resolveRequest({ data: { success: true, order: { ...record, cancellationRequest: { status: 'pending' } } } })
  await pending
})
