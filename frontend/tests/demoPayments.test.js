import test from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const localRequire = createRequire(path.join(frontend, 'demo-payments-test.cjs'))
const React = localRequire('react')
let runner, api
const hooks = { ...React }
for (const hook of ['useState', 'useRef', 'useEffect', 'useContext']) {
  hooks[hook] = (...args) => runner ? runner[hook](...args) : React[hook](...args)
}
const output = await build({
  stdin: { resolveDir: frontend, loader: 'jsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MemoryRouter } from 'react-router-dom';
    import StudentOrder from './src/components/CustomerOrderCard.jsx';
    import AdminOrder from '../admin/src/components/OrderDetails.jsx';
    export { default as Page } from './src/pages/DemoPayment.jsx';
    export const student = order => renderToStaticMarkup(<MemoryRouter><StudentOrder order={order} /></MemoryRouter>);
    export const admin = order => renderToStaticMarkup(<AdminOrder order={order} onClose={() => {}} />);
  ` },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' }
})
const compiled = new Module(path.join(frontend, 'demo-payments-test.cjs'))
compiled.filename = path.join(frontend, 'demo-payments-test.cjs')
compiled.paths = Module._nodeModulePaths(frontend)
compiled.require = name => {
  if (name === 'react') return hooks
  if (name === 'axios') return { get: (...args) => api.get(...args), post: (...args) => api.post(...args) }
  if (name === 'react-router-dom') return { ...localRequire(name), useParams: () => ({ orderId: 'demo-order' }) }
  return localRequire(name)
}
compiled._compile(output.outputFiles[0].text, compiled.filename)
const record = overrides => ({
  _id: 'demo-order', requestId: 'demo-checkout', paymentMethod: 'PayPal (DEMO)', paymentCurrency: 'PHP',
  status: 'Order Placed', payment: false, inventoryStatus: 'reserved', amount: 235, date: 1, items: [],
  student: { name: 'Demo Student', email: 'demo@example.test', academicProgram: 'BSIT' },
  demoPayment: { mode: 'demo', provider: 'paypal', status: 'pending' }, ...overrides
})
const all = (node, predicate) => {
  if (!React.isValidElement(node)) return []
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => all(child, predicate))]
}
const settle = async () => { for (let index = 0; index < 10; index++) await Promise.resolve() }
const mount = (t, order = record()) => {
  const slots = [], cleanups = []
  let cursor = 0, effects = []
  const context = { backendUrl: 'https://api.example.test', token: 'synthetic-demo', reloadCart: t.mock.fn(), getProductsData: t.mock.fn() }
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const remove = t.mock.fn()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: () => JSON.stringify({ requestId: order.requestId }), removeItem: remove
  } })
  api = {
    get: t.mock.fn(async () => ({ data: { success: true, order } })),
    post: t.mock.fn(async () => ({ data: { success: true, order } }))
  }
  const page = {
    context, remove, api,
    useContext: () => context,
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, value => { slots[index].value = value }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect(callback, dependencies) {
      const index = cursor++
      if (slots[index]?.every((value, item) => value === dependencies[item])) return
      slots[index] = dependencies
      effects.push(() => { cleanups.push(callback()) })
    },
    render() {
      cursor = 0; effects = []; runner = page
      try { page.tree = compiled.exports.Page() } finally { runner = null }
      effects.forEach(effect => effect())
    },
    unmount() { cleanups.forEach(cleanup => cleanup?.()) },
    buttons() { return all(page.tree, node => node.type === 'button') }
  }
  t.after(() => {
    page.unmount()
    if (storage) Object.defineProperty(globalThis, 'sessionStorage', storage)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  })
  page.render()
  return page
}

test('Student and Admin show the same demo transaction without real-payment or receipt claims', () => {
  const order = record({ payment: true, status: 'Approved', paidAt: 2,
    demoPayment: { mode: 'demo', provider: 'paypal', status: 'succeeded', transactionId: 'DEMO-PAYPAL-example' } })
  for (const render of [compiled.exports.student, compiled.exports.admin]) {
    const html = render(order)
    assert.match(html, /PayPal \(DEMO\)/)
    assert.match(html, /DEMO-PAYPAL-example/)
    assert.match(html, /[Nn]o (real )?money/)
    assert.doesNotMatch(html, /Refund Required/)
  }
  const pending = compiled.exports.student(record())
  assert.match(pending, /Continue demo payment/)
  assert.match(pending, /href="\/demo-payment\/demo-order"/)
})

test('demo page exposes three accessible actions and prevents duplicate success submissions', async t => {
  const page = mount(t)
  await settle(); page.render()
  assert.equal(page.api.get.mock.calls[0].arguments[0], 'https://api.example.test/api/order/demo/demo-order')
  assert.equal(page.buttons().length, 3)
  assert(page.buttons().every(button => button.props.type === 'button' && button.props.className.includes('min-h-11')))
  let finish
  const saved = record({ payment: true, status: 'Approved',
    demoPayment: { mode: 'demo', provider: 'paypal', status: 'succeeded', transactionId: 'DEMO-PAYPAL-example' } })
  page.api.post.mock.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const success = page.buttons().find(button => button.props.children === 'Simulate success')
  const first = success.props.onClick()
  await success.props.onClick()
  assert.equal(page.api.post.mock.callCount(), 1)
  assert.deepEqual(page.api.post.mock.calls[0].arguments[1], { outcome: 'succeeded' })
  finish({ data: { success: true, order: saved } })
  await first; page.render()
  assert.equal(page.context.reloadCart.mock.callCount(), 1)
  assert.equal(page.remove.mock.callCount(), 1)
  assert.equal(page.buttons().length, 0)
  assert(all(page.tree, node => node.props.to === '/orders').length > 0)
})

test('refresh resumes a saved terminal result without simulating a second payment', async t => {
  const page = mount(t, record({ status: 'Cancelled', inventoryStatus: 'released',
    demoPayment: { mode: 'demo', provider: 'paypal', status: 'failed' } }))
  await settle(); page.render()
  assert.equal(page.buttons().length, 0)
  assert.equal(page.api.post.mock.callCount(), 0)
  assert.equal(page.remove.mock.callCount(), 1)
  assert.equal(page.context.reloadCart.mock.callCount(), 1)
})

for (const [outcome, label] of [['failed', 'Simulate failure'], ['cancelled', 'Cancel demo payment']]) {
  test(`demo page submits ${outcome} and returns the saved result without a transaction or receipt`, async t => {
    const page = mount(t)
    await settle(); page.render()
    page.api.post.mock.mockImplementation(async () => ({ data: { success: true, order: record({
      status: 'Cancelled', inventoryStatus: 'released',
      demoPayment: { mode: 'demo', provider: 'paypal', status: outcome }
    }) } }))
    await page.buttons().find(button => button.props.children === label).props.onClick()
    page.render()
    assert.deepEqual(page.api.post.mock.calls[0].arguments[1], { outcome })
    assert.equal(page.buttons().length, 0)
    assert.equal(page.context.reloadCart.mock.callCount(), 1)
    assert.equal(page.remove.mock.callCount(), 1)
  })
}

test('late demo success after logout/unmount cannot refresh another session cart', async t => {
  const page = mount(t)
  await settle(); page.render()
  let finish
  page.api.post.mock.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const submission = page.buttons()[0].props.onClick()
  page.unmount()
  finish({ data: { success: true, order: record() } })
  await submission
  assert.equal(page.context.reloadCart.mock.callCount(), 0)
  assert.equal(page.remove.mock.callCount(), 0)
})
