import test from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const admin = fileURLToPath(new URL('../../admin/', import.meta.url))
const requireAdmin = createRequire(path.join(admin, 'admin-navigation-test.cjs'))
const React = requireAdmin('react')
let runner
const hooks = {
  ...React,
  useState: initial => runner.state(initial),
  useRef: initial => runner.ref(initial),
  useEffect: (callback, dependencies) => runner.effect(callback, dependencies)
}
const output = await build({
  stdin: { resolveDir: admin, contents: "export { default as Sidebar } from './src/components/Sidebar.jsx'; export { default as CashierLayout } from './src/components/CashierLayout.jsx'" },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' }
})
const compiled = new Module(path.join(admin, 'admin-navigation-test.cjs'))
compiled.filename = path.join(admin, 'admin-navigation-test.cjs')
compiled.paths = Module._nodeModulePaths(admin)
compiled.require = name => {
  if (name === 'react') return hooks
  if (name === 'react-router-dom') return { ...requireAdmin(name), useLocation: () => runner.location, useNavigate: () => () => {} }
  return requireAdmin(name)
}
compiled._compile(output.outputFiles[0].text, compiled.filename)
const { Sidebar, CashierLayout } = compiled.exports

const findAll = (node, predicate) => {
  if (!React.isValidElement(node)) return []
  return [
    ...(predicate(node) ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap(child => findAll(child, predicate))
  ]
}
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

// Hook/DOM-target fixture; no authenticated browser or API calls.
const mount = (t, width = 390, kind = 'Admin') => {
  const cashier = kind === 'Cashier'
  const breakpoint = cashier ? 1280 : 768
  const drawerId = cashier ? 'cashier-navigation-drawer' : 'pamo-admin-navigation'
  const closeLabel = cashier ? 'Close cashier navigation' : 'Close admin navigation'
  const h = { width, slots: [], location: { pathname: cashier ? '/cashier' : '/dashboard' }, frames: new Map(), listeners: new Set(), documentListeners: new Map(), focus: [], logouts: 0 }
  const media = { get matches() { return h.width >= breakpoint },
    addEventListener: (_type, listener) => h.listeners.add(listener),
    removeEventListener: (_type, listener) => h.listeners.delete(listener) }
  let frameId = 0
  for (const [name, value] of Object.entries({
    window: {
      matchMedia: query => { assert.equal(query, `(min-width: ${breakpoint}px)`); return media },
      requestAnimationFrame: callback => { h.frames.set(++frameId, callback); return frameId },
      cancelAnimationFrame: id => h.frames.delete(id)
    },
    document: {
      body: { style: { overflow: 'auto' } }, activeElement: null,
      addEventListener: (type, listener) => h.documentListeners.set(type, listener),
      removeEventListener: (type, listener) => { if (h.documentListeners.get(type) === listener) h.documentListeners.delete(type) }
    }
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value })
    t.after(() => {
      h.unmount()
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    })
  }
  h.first = { getClientRects: () => [1], closest: () => h.drawerNode?.inert ? {} : null, focus: () => h.focus.push('first') }
  h.last = { ...h.first, focus: () => h.focus.push('last') }
  h.hidden = { getClientRects: () => [], focus: () => assert.fail('Hidden control focused') }
  h.state = initial => {
    const index = h.cursor++
    h.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
    const slot = h.slots[index]
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
  }
  h.ref = initial => h.slots[h.cursor++] ??= { current: initial }
  h.effect = (callback, dependencies) => {
    const index = h.cursor++
    const previous = h.slots[index]
    if (same(previous?.dependencies, dependencies)) return
    const slot = { dependencies, cleanup: previous?.cleanup }
    h.slots[index] = slot
    h.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  }
  h.all = predicate => findAll(h.tree, predicate)
  h.find = predicate => h.all(predicate)[0]
  h.toggle = () => h.find(node => node.props['aria-controls'] === drawerId)
  h.drawer = () => h.find(node => node.props.id === drawerId)
  h.closeButton = () => findAll(h.drawer(), node => node.type === 'button' && node.props['aria-label'] === closeLabel)[0]
  h.commit = () => {
    h.cursor = 0; h.effects = []; runner = h
    try {
      h.tree = cashier
        ? CashierLayout({ token: 'synthetic', setToken: () => { h.logouts++ } })
        : Sidebar({ dashboard: true, onLogout: () => { h.logouts++ } })
    }
    finally { runner = null }
    for (const node of h.all(node => Boolean(node.props.ref))) {
      const ref = node.props.ref
      const isToggle = Boolean(node.props['aria-controls'])
      ref.current ??= {
        isConnected: true, inert: false,
        getClientRects: () => isToggle && (h.width >= breakpoint || h.toggle().props.className.includes('invisible')) ? [] : [1],
        focus: () => h.focus.push(isToggle ? 'toggle' : 'close'),
        querySelectorAll: () => [h.hidden, h.first, h.last]
      }
      if ('inert' in node.props) ref.current.inert = Boolean(node.props.inert)
      if (node.props.id === drawerId) h.drawerNode = ref.current
    }
    h.effects.forEach(effect => effect())
  }
  h.flushNavigation = () => {
    for (const [id, callback] of h.frames) { h.frames.delete(id); callback() }
    h.commit()
  }
  h.open = () => { h.toggle().props.onClick(); h.commit() }
  h.resize = width => {
    h.width = width
    for (const listener of [...h.listeners]) listener({ matches: media.matches })
    h.commit()
  }
  h.unmount = () => {
    for (const slot of h.slots) { slot?.cleanup?.(); if (slot) slot.cleanup = undefined }
  }
  h.commit(); h.flushNavigation()
  return h
}

for (const width of [320, 390, 768, 1279]) {
  test(`Cashier ${width}px: right drawer preserves width, one close control and inert background`, t => {
    const h = mount(t, width, 'Cashier')
    const brand = h.find(node => typeof node.props.className === 'string' && node.props.className.includes('cashier-workspace-brand'))
    const headerChildren = React.Children.toArray(brand.props.children)
    assert.equal(headerChildren[0].props.className.includes('cashier-dashboard-mobile-theme'), true)
    assert.equal(headerChildren[1].props.to, '/cashier')
    assert.equal(headerChildren[2].props['aria-label'], 'Open cashier navigation')
    assert.match(headerChildren[2].props.className, /h-11 w-11.*rounded-md.*border-slate-200.*text-\[color:var\(--pamo-color-text-primary\)\].*hover:bg-slate-100.*focus-visible:outline-2.*focus-visible:outline-offset-2.*focus-visible:outline-amber-500/)
    assert.equal(headerChildren[2].props.children.props.size, 20)
    assert.equal(h.drawer().props.inert, true)
    assert.match(h.drawer().props.className, /right-0/)
    assert.doesNotMatch(h.drawer().props.className, /(?:^| )left-0| -translate-x-full/)
    assert.match(h.drawer().props.className, /w-\[min\(300px,calc\(100%-16px\)\)\]/)
    assert.match(h.drawer().props.className, /invisible translate-x-full/)
    h.open()
    assert.equal(h.drawer().props.inert, undefined)
    assert.equal(h.find(node => node.type === 'main').props.inert, true)
    assert.match(h.drawer().props.className, /visible translate-x-0/)
    assert.match(h.drawer().props.className, /transition-\[transform,visibility\].*motion-reduce:transition-none/)
    assert.match(h.toggle().props.className, /invisible pointer-events-none/)
    assert.equal(h.all(node => node.props['aria-label'] === 'Close cashier navigation').length, 1)
    assert.equal(document.body.style.overflow, 'hidden')
    assert.equal(h.focus.at(-1), 'close')
    h.closeButton().props.onClick(); h.commit()
    assert.equal(h.drawer().props.inert, true)
    assert.equal(h.find(node => node.type === 'main').props.inert, undefined)
    assert.equal(document.body.style.overflow, 'auto')
    assert.equal(h.focus.at(-1), 'toggle')
  })
}

for (const width of [1280, 1440]) {
  test(`Cashier ${width}px: desktop sidebar stays static, interactive and unlocked`, t => {
    const h = mount(t, width, 'Cashier')
    assert.equal(h.drawer().props.inert, undefined)
    assert.equal(h.drawer().props['aria-hidden'], undefined)
    assert.match(h.drawer().props.className, /xl:visible xl:static.*xl:w-auto.*xl:transform-none/)
    assert.match(h.find(node => node.type === 'aside').props.className, /xl:sticky.*xl:border-r/)
    assert.equal(document.body.style.overflow, 'auto')
    assert.equal(h.documentListeners.has('keydown'), false)
  })
}

test('Cashier backdrop, Escape, focus wrapping, route dismissal, active links and Sign Out are preserved', t => {
  const h = mount(t, 390, 'Cashier')
  h.open()
  document.activeElement = h.last
  h.documentListeners.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault() {} })
  assert.equal(h.focus.at(-1), 'first')
  document.activeElement = h.first
  h.documentListeners.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault() {} })
  assert.equal(h.focus.at(-1), 'last')
  h.documentListeners.get('keydown')({ key: 'Escape' }); h.commit()
  assert.equal(h.toggle().props['aria-expanded'], false)
  h.open()
  h.find(node => node.props['aria-label'] === 'Dismiss cashier navigation backdrop').props.onClick(); h.commit()
  assert.equal(h.toggle().props['aria-expanded'], false)
  h.open()
  h.location = { pathname: '/cashier/transactions' }; h.commit(); h.flushNavigation()
  assert.equal(h.toggle().props['aria-expanded'], false)
  assert.equal(h.find(node => node.props['aria-label'] === 'Transactions').props['aria-current'], 'page')
  h.open()
  h.find(node => node.props['aria-label'] === 'Payments').props.onClick(); h.commit()
  assert.equal(h.toggle().props['aria-expanded'], false)
  h.find(node => node.props['aria-label'] === 'Sign out').props.onClick()
  assert.equal(h.logouts, 1)
})

test('Cashier desktop resize/unmount releases scroll, inert state, listeners and focus safely', t => {
  const h = mount(t, 390, 'Cashier')
  h.open(); h.resize(1280)
  assert.equal(h.toggle().props['aria-expanded'], false)
  assert.equal(h.drawer().props.inert, undefined)
  assert.equal(h.find(node => node.type === 'main').props.inert, undefined)
  assert.equal(document.body.style.overflow, 'auto')
  assert.notEqual(h.focus.at(-1), 'toggle', 'Hidden desktop menu toggle must not receive focus')
  h.resize(390); h.open(); h.unmount()
  assert.equal(h.listeners.size, 0)
  assert.equal(h.documentListeners.size, 0)
  assert.equal(document.body.style.overflow, 'auto')
})

for (const width of [320, 390]) {
  test(`Admin ${width}px: right drawer opens/closes with one visible close control`, t => {
    const h = mount(t, width)
    const header = h.find(node => typeof node.props.className === 'string' && node.props.className.includes('grid-cols-[64px_minmax(0,1fr)_64px]'))
    const headerChildren = React.Children.toArray(header.props.children)
    assert.equal(headerChildren[0].props.className, 'justify-self-start md:hidden')
    assert.equal(headerChildren[1].props.to, '/dashboard')
    assert.equal(headerChildren[1].props['aria-label'], 'Go to PAMO Admin Dashboard')
    assert.equal(findAll(headerChildren[1], node => node.props.alt === 'PAMO logo').length, 1)
    assert.equal(findAll(headerChildren[1], node => node.props.children === 'Admin Panel').length, 1)
    assert.equal(headerChildren[2].props['aria-label'], 'Open admin navigation')
    assert.match(headerChildren[2].props.className, /justify-self-end/)
    assert.equal(h.drawerNode.inert, true)
    assert.match(h.drawer().props.className, /right-0/)
    assert.doesNotMatch(h.drawer().props.className, /left-0/)
    assert.match(h.drawer().props.className, /invisible translate-x-full/)
    assert.match(h.drawer().props.className, /w-\[min\(300px,calc\(100%-16px\)\)\]/)
    h.open()
    assert.equal(h.drawerNode.inert, false)
    assert.match(h.drawer().props.className, /visible translate-x-0/)
    assert.match(h.drawer().props.className, /transition-\[transform,visibility\].*duration-200.*motion-reduce:transition-none/)
    assert.match(h.toggle().props.className, /invisible pointer-events-none/)
    assert.equal(findAll(h.drawer(), node => node.props['aria-label'] === 'Close admin navigation').length, 1)
    assert.equal(h.focus.at(-1), 'close')
    assert.equal(document.body.style.overflow, 'hidden')
    h.closeButton().props.onClick(); h.commit()
    assert.equal(h.drawerNode.inert, true)
    assert.match(h.drawer().props.className, /invisible translate-x-full/)
    assert.equal(document.body.style.overflow, 'auto')
    assert.equal(h.focus.at(-1), 'toggle')
  })
}

for (const width of [768, 1440]) {
  test(`Admin ${width}px: desktop sidebar remains static, interactive and untrapped`, t => {
    const h = mount(t, width)
    const header = h.find(node => typeof node.props.className === 'string' && node.props.className.includes('grid-cols-[64px_minmax(0,1fr)_64px]'))
    const brand = React.Children.toArray(header.props.children)[1]
    assert.match(header.props.className, /md:flex md:justify-start/)
    assert.equal(brand.props.to, '/dashboard')
    assert.equal(brand.props['aria-label'], 'Go to PAMO Admin Dashboard')
    assert.equal(h.drawerNode.inert, false)
    assert.match(h.drawer().props.className, /md:visible md:static md:w-auto md:flex-1 md:transform-none md:pointer-events-auto md:shadow-none md:transition-none/)
    assert.match(h.tree.props.className, /md:sticky.*md:border-r/)
    h.drawer().props.onKeyDown({ key: 'Tab', preventDefault: () => assert.fail('Desktop Tab trapped') })
    assert.equal(document.body.style.overflow, 'auto')
  })
}

test('Admin backdrop, Escape, focus wrapping, route/link dismissal and Logout retain their behavior', t => {
  const h = mount(t)
  h.open()
  document.activeElement = h.last
  let prevented = false
  h.drawer().props.onKeyDown({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented = true } })
  assert.equal(prevented, true); assert.equal(h.focus.at(-1), 'first')
  document.activeElement = h.first
  h.drawer().props.onKeyDown({ key: 'Tab', shiftKey: true, preventDefault() {} })
  assert.equal(h.focus.at(-1), 'last')
  h.drawer().props.onKeyDown({ key: 'Escape' }); h.commit()
  assert.equal(h.toggle().props['aria-expanded'], false)
  h.open()
  h.find(node => node.props['aria-label'] === 'Dismiss admin navigation backdrop').props.onClick(); h.commit()
  assert.equal(h.toggle().props['aria-expanded'], false)
  h.open()
  h.location = { pathname: '/orders' }; h.commit(); h.flushNavigation()
  assert.equal(h.toggle().props['aria-expanded'], false)
  h.open()
  h.find(node => node.props.to === '/list').props.onClick(); h.commit()
  assert.equal(h.toggle().props['aria-expanded'], false)
  h.find(node => node.props['aria-label'] === 'Logout').props.onClick()
  assert.equal(h.logouts, 1)
})

test('Admin branding links to Dashboard from the mobile header and open drawer', t => {
  const h = mount(t, 390)
  const headerBrand = h.find(node => node.props['aria-label'] === 'Go to PAMO Admin Dashboard')
  assert.equal(headerBrand.props.to, '/dashboard')
  headerBrand.props.onClick(); h.commit()
  assert.equal(h.toggle().props['aria-expanded'], false)

  h.open()
  const dashboardLinks = findAll(h.drawer(), node => node.props.to === '/dashboard')
  const drawerBrand = dashboardLinks.find(node => node.props['aria-label'] === 'Go to PAMO Admin Dashboard')
  assert.ok(drawerBrand)
  drawerBrand.props.onClick(); h.commit()
  assert.equal(h.toggle().props['aria-expanded'], false)
})

test('Admin desktop resize and unmount release drawer interaction and scroll locks', t => {
  const h = mount(t)
  h.open(); h.resize(768)
  assert.equal(h.toggle().props['aria-expanded'], false)
  assert.equal(h.drawerNode.inert, false)
  assert.equal(document.body.style.overflow, 'auto')
  h.resize(390); h.open(); h.unmount()
  assert.equal(document.body.style.overflow, 'auto')
  assert.equal(h.listeners.size, 0)
  assert.equal(h.frames.size, 0)
})
