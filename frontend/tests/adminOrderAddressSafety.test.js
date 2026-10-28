import test from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const admin = fileURLToPath(new URL('../../admin/', import.meta.url))
const output = await build({
  stdin: {
    resolveDir: admin,
    loader: 'jsx',
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import OrderDetails from './src/components/OrderDetails.jsx';
      import PaymentDetails from './src/components/PaymentDetails.jsx';
      export { OrderDetails };
      export const renderOrderRecord = (record, programCategories = []) => renderToStaticMarkup(<OrderDetails order={record} pending={false} onAction={() => {}} onClose={() => {}} programCategories={programCategories} />);
      const order = address => ({
        _id: '0123456789abcdef01234567', address, items: [], amount: 235,
        date: 1, sentToCashierAt: 1, status: 'Sent to Cashier', payment: false,
        paymentMethod: 'COD', allowedStatuses: []
      });
      export const renderOrder = address => renderToStaticMarkup(
        <OrderDetails order={order(address)} currency='P' pending={false} onAction={() => {}} onClose={() => {}} />
      );
      export const renderPayment = address => renderToStaticMarkup(
        <PaymentDetails order={order(address)} currency='P' pending={false} onConfirm={() => {}} onClose={() => {}} />
      );
      export const renderPaymentRecord = (record, programCategories = []) => renderToStaticMarkup(
        <PaymentDetails order={record} currency='P' pending={false} onConfirm={() => {}} onClose={() => {}} programCategories={programCategories} />
      );
    `
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  write: false,
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl' }
})
const compiled = new Module(path.join(admin, 'order-address-safety-test.cjs'))
compiled.filename = path.join(admin, 'order-address-safety-test.cjs')
compiled.paths = Module._nodeModulePaths(admin)
compiled.require = createRequire(compiled.filename)
compiled._compile(output.outputFiles[0].text, compiled.filename)

const validAddress = {
  firstName: 'Synthetic', lastName: 'Student', email: 'student@example.test',
  phone: '09171234567', street: '123 Campus Road', city: 'Carmona',
  state: 'Cavite', country: 'Philippines', zipcode: '4116'
}

test('normal addresses retain their established staff presentation', () => {
  const adminHtml = compiled.exports.renderOrder(validAddress)
  const cashierHtml = compiled.exports.renderPayment(validAddress)
  for (const html of [adminHtml, cashierHtml]) {
    assert.match(html, /Synthetic Student/)
    assert.match(html, /student@example\.test/)
    assert.match(html, /09171234567/)
  }
  assert.match(adminHtml, /123 Campus Road/)
  assert.match(adminHtml, /Carmona, Cavite, Philippines, 4116/)
})

test('campus pickup orders use the authenticated student snapshot without address fallbacks', () => {
  const record = {
    _id: 'campus-pickup-order',
    student: { name: 'Campus Student', email: 'campus@example.test', academicProgram: 'BSIT' },
    fulfillmentMethod: 'campus_pickup',
    items: [],
    amount: 235,
    date: 1,
    sentToCashierAt: 1,
    status: 'Sent to Cashier',
    payment: false,
    paymentMethod: 'COD',
    allowedStatuses: []
  }
  const html = compiled.exports.renderOrderRecord(record)
  assert.match(html, /Campus Student/)
  assert.match(html, /campus@example\.test/)
  assert.match(html, /BSIT/)
  assert.match(html, /Campus pickup/)
  assert.doesNotMatch(html, /Street address not provided|Mobile number not provided/)
})

test('staff order and receipt views resolve the current managed academic program name', () => {
  const record = {
    _id: 'renamed-program-order',
    student: { name: 'Existing Student', email: 'student@example.test', academicProgram: 'BSIT' },
    fulfillmentMethod: 'campus_pickup',
    items: [], amount: 235, date: 1, sentToCashierAt: 1,
    status: 'Sent to Cashier', payment: true, paymentMethod: 'COD',
    receiptNumber: 'OR-RENAMED', allowedStatuses: []
  }
  const categories = [{ code: 'BSIT', name: 'Information Technology', scope: 'program', active: false }]
  const orderHtml = compiled.exports.renderOrderRecord(record, categories)
  const receiptHtml = compiled.exports.renderPaymentRecord(record, categories)

  for (const html of [orderHtml, receiptHtml]) {
    assert.match(html, /Information Technology/)
    assert.doesNotMatch(html, />BSIT</)
  }
  assert.equal(record.student.academicProgram, 'BSIT')
})

test('PAMO Admin order details show authoritative cashier receipt evidence', () => {
  const paidOrder = {
    _id: 'paid-order',
    student: { name: 'Paid Student', email: 'paid@example.test', academicProgram: 'BSIT' },
    fulfillmentMethod: 'campus_pickup', items: [], amount: 235, date: 1,
    status: 'Packing', payment: true, paymentMethod: 'COD',
    receiptNumber: 'OR-2026-101', paidAt: Date.UTC(2026, 9, 28, 4, 30),
    allowedStatuses: []
  }
  const html = compiled.exports.renderOrderRecord(paidOrder)

  assert.match(html, /Payment information/i)
  assert.match(html, /Official Receipt Number/)
  assert.match(html, /OR-2026-101/)
  assert.match(html, /Payment confirmation date/)
  assert.match(html, /Paid/)
})

test('pending, historical paid, and cancelled paid orders keep accurate receipt states', () => {
  const baseOrder = {
    _id: 'receipt-state-order',
    student: { name: 'Receipt Student', email: 'receipt@example.test', academicProgram: 'BSIT' },
    fulfillmentMethod: 'campus_pickup', items: [], amount: 235, date: 1,
    paymentMethod: 'COD', allowedStatuses: []
  }
  const pendingHtml = compiled.exports.renderOrderRecord({
    ...baseOrder, status: 'Sent to Cashier', payment: false
  })
  const historicalHtml = compiled.exports.renderOrderRecord({
    ...baseOrder, status: 'Packing', payment: true
  })
  const cancelledHtml = compiled.exports.renderOrderRecord({
    ...baseOrder, status: 'Cancelled', payment: true,
    receiptNumber: 'OR-RETAINED', paidAt: 1, cancellationSource: 'admin'
  })

  assert.match(pendingHtml, /Awaiting Cashier Confirmation/)
  assert.match(historicalHtml, /No receipt recorded/)
  assert.match(cancelledHtml, /OR-RETAINED/)
  const online = { ...baseOrder, payment: true, paymentMethod: 'Stripe', status: 'Approved', receiptIsTest: true }
  assert.match(compiled.exports.renderOrderRecord(online), /Awaiting Official Receipt/)
  const testReceipt = compiled.exports.renderOrderRecord({ ...online, receiptNumber: 'TEST-OR' })
  assert.match(testReceipt, /Test Receipt Reference/)
  assert.match(testReceipt, /TEST — TEST-OR/)
})

test('malformed historical address fields render safe fallbacks in both staff panels', () => {
  const malformed = {
    firstName: { $ne: null }, lastName: ['Student'], email: { nested: true },
    phone: 9171234567, street: ['Campus'], city: { value: 'Carmona' },
    state: null, country: false, zipcode: ['4116']
  }
  for (const render of [compiled.exports.renderOrder, compiled.exports.renderPayment]) {
    const html = render(malformed)
    assert.match(html, /Name not provided/)
    assert.match(html, /Email not provided/)
    assert.match(html, /Mobile number not provided/)
    assert.doesNotMatch(html, /\[object Object\]/)
  }
  const adminHtml = compiled.exports.renderOrder(malformed)
  assert.match(adminHtml, /Street address not provided/)
  assert.match(adminHtml, /City, province, country and zipcode not provided/)
})

test('missing, array and excessive historical address values remain renderable and bounded', () => {
  for (const address of [undefined, null, [], 'invalid']) {
    assert.doesNotThrow(() => compiled.exports.renderOrder(address))
    assert.doesNotThrow(() => compiled.exports.renderPayment(address))
  }
  const longName = 'x'.repeat(1000)
  const html = compiled.exports.renderOrder({ ...validAddress, firstName: longName })
  assert.match(html, new RegExp('x{100} Student'))
  assert.doesNotMatch(html, /x{101}/)
})

test('V2 details preserve historical currencies, images, totals, and server-provided action ordering', () => {
  const record = {
    _id: 'synthetic-order', status: 'Order Placed', address: validAddress, date: 1,
    paymentMethod: 'COD', payment: false, amount: 235,
    items: [{ _id: 'item', name: 'Synthetic uniform', size: 'M', quantity: 1, price: 225, image: ['https://images.example.test/uniform.png'] }],
    allowedStatuses: ['Approved', 'Cancelled', 'Unsupported']
  }
  for (const paymentCurrency of [undefined, 'USD', 'PHP']) {
    const html = compiled.exports.renderOrderRecord({ ...record, paymentCurrency })
    let expectedAmount = /235\.00 USD/
    if (paymentCurrency === undefined) expectedAmount = /currency unverified/
    else if (paymentCurrency === 'PHP') expectedAmount = /₱235\.00/
    assert.match(html, /https:\/\/images\.example\.test\/uniform\.png/)
    assert.match(html, /Synthetic uniform/)
    assert.match(html, /Processing Fee/)
    assert.match(html, expectedAmount)
  }
  const React = compiled.require('react')
  const calls = []
  const tree = compiled.exports.OrderDetails({ order: record, pending: false, onAction: (...args) => calls.push(args), onClose() {} })
  const buttons = []
  const walk = node => {
    if (!React.isValidElement(node)) return
    const classNames = typeof node.props.className === 'string' ? node.props.className.split(' ') : []
    if (node.type === 'button' && classNames.some(name => ['orders-primary', 'orders-reject'].includes(name))) buttons.push(node)
    React.Children.toArray(node.props.children).forEach(walk)
  }
  walk(tree)
  assert.deepEqual(buttons.map(button => button.key.replace(/^\.\$/, '')), ['Cancelled', 'Approved'])
  buttons.forEach(button => button.props.onClick())
  assert.deepEqual(calls, [[record, 'Cancelled'], [record, 'Approved']])
  for (const status of ['Claimed', 'Cancelled', 'Legacy status']) {
    const html = compiled.exports.renderOrderRecord({ ...record, status, allowedStatuses: [] })
    assert.doesNotMatch(html, /Approve Order|Reject Order|Mark Claimed/)
  }
})
