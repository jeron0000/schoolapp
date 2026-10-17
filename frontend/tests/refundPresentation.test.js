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
          ? <CustomerOrderCard order={order} currency='P' onCancel={() => {}} cancellationPending={false} />
          : kind === 'admin'
            ? <OrderDetails order={order} currency='P' pending={false} onAction={() => {}} onClose={() => {}} />
            : <PaymentDetails order={order} currency='P' pending={false} onConfirm={() => {}} onClose={() => {}} />
      );
    `
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl' }
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
  const css = await readFile(new URL('../src/pages/Orders.css', import.meta.url), 'utf8')
  assert.match(css, /\.order-panel-note\s*\{[^}]*color:\s*var\(--pamo-color-text-secondary\)/)
  for (const component of ['OrderDetails', 'PaymentDetails']) {
    const source = await readFile(new URL(`../../admin/src/components/${component}.jsx`, import.meta.url), 'utf8')
    if (component === 'OrderDetails') {
      assert.match(source, /refund && <p className='order-details-refund'/)
      const adminCss = await readFile(new URL('../../admin/src/pages/Orders.css', import.meta.url), 'utf8')
      assert.match(adminCss, /\.order-details-refund\s*\{[^}]*color:\s*var\(--pamo-color-text-secondary\)/)
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
    assert.match(zero, /<dt>Total<\/dt><dd>₱10\.00/)
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
