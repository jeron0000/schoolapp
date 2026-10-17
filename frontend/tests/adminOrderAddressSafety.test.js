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
      export const renderOrderRecord = record => renderToStaticMarkup(<OrderDetails order={record} pending={false} onAction={() => {}} onClose={() => {}} />);
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
    assert.match(html, /https:\/\/images\.example\.test\/uniform\.png/)
    assert.match(html, /Synthetic uniform/)
    assert.match(html, /Processing Fee/)
    assert.match(html, paymentCurrency === undefined ? /currency unverified/ : paymentCurrency === 'PHP' ? /₱235\.00/ : /235\.00 USD/)
  }
  const React = compiled.require('react')
  const calls = []
  const tree = compiled.exports.OrderDetails({ order: record, pending: false, onAction: (...args) => calls.push(args), onClose() {} })
  const buttons = []
  const walk = node => {
    if (!React.isValidElement(node)) return
    if (node.type === 'button' && ['orders-primary', 'orders-reject'].includes(node.props.className)) buttons.push(node)
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
