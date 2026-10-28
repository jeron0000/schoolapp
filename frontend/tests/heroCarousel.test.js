import test from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const requireFrontend = createRequire(path.join(frontend, 'hero-carousel-test.cjs'))
const React = requireFrontend('react')
let runner
let requestedSlides
let requestedFallback

const same = (left, right) => left && right
  && left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]))

const hooks = {
  ...React,
  useContext: () => ({ backendUrl: 'https://api.example.test' }),
  useState: initial => runner.state(initial),
  useRef: initial => runner.ref(initial),
  useId: () => 'hero-carousel-help',
  useEffect: (callback, dependencies) => runner.effect(callback, dependencies)
}

const output = await build({
  stdin: {
    resolveDir: frontend,
    contents: "export { default } from './src/components/HeroCarousel.jsx'"
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  write: false,
  loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' }
})

const slides = ['a', 'b', 'c'].map(id => ({
  _id: id,
  imageUrl: `https://images.example.test/${id}.jpg`,
  altText: `Campus image ${id}`
}))

const compiled = new Module(path.join(frontend, 'hero-carousel-test.cjs'))
compiled.filename = path.join(frontend, 'hero-carousel-test.cjs')
compiled.paths = Module._nodeModulePaths(frontend)
compiled.require = name => {
  if (name === 'react') return hooks
  if (name === 'axios') {
    return { get: async () => ({ data: { success: true, slides: requestedSlides, fallback: requestedFallback } }) }
  }
  return requireFrontend(name)
}
compiled._compile(output.outputFiles[0].text, compiled.filename)
const HeroCarousel = compiled.exports.default

const walk = (node, visit) => {
  if (!React.isValidElement(node)) return
  visit(node)
  React.Children.toArray(node.props.children).forEach(child => walk(child, visit))
}

const find = (tree, predicate) => {
  let found
  walk(tree, node => {
    if (!found && predicate(node)) found = node
  })
  return found
}

const findAll = (tree, predicate) => {
  const found = []
  walk(tree, node => {
    if (predicate(node)) found.push(node)
  })
  return found
}

const settle = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

const mount = (t, { reducedMotion = false, slides: suppliedSlides = slides, fallback = null } = {}) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const timers = []
  const listeners = new Map()
  const mediaListeners = new Set()
  let timerId = 0
  const media = {
    matches: reducedMotion,
    addEventListener: (_type, listener) => mediaListeners.add(listener),
    removeEventListener: (_type, listener) => mediaListeners.delete(listener)
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia: () => media,
      setTimeout(callback, delay) {
        const timer = { id: ++timerId, callback, delay, active: true }
        timers.push(timer)
        return timer.id
      },
      clearTimeout(id) {
        const timer = timers.find(candidate => candidate.id === id)
        if (timer) timer.active = false
      }
    }
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      hidden: false,
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type, listener) => {
        if (listeners.get(type) === listener) listeners.delete(type)
      }
    }
  })
  requestedSlides = suppliedSlides
  requestedFallback = fallback

  const h = { slots: [], cursor: 0, effects: [], timers, listeners, media }
  h.state = initial => {
    const index = h.cursor++
    h.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
    const slot = h.slots[index]
    return [slot.value, value => {
      slot.value = typeof value === 'function' ? value(slot.value) : value
    }]
  }
  h.ref = initial => h.slots[h.cursor++] ??= { current: initial }
  h.effect = (callback, dependencies) => {
    const index = h.cursor++
    const previous = h.slots[index]
    if (same(previous?.dependencies, dependencies)) return
    const slot = { dependencies, cleanup: previous?.cleanup }
    h.slots[index] = slot
    h.effects.push(() => {
      slot.cleanup?.()
      slot.cleanup = callback()
    })
  }
  h.commit = () => {
    h.cursor = 0
    h.effects = []
    runner = h
    try {
      h.tree = HeroCarousel()
    } finally {
      runner = null
    }
    for (const effect of h.effects) effect()
    return h.tree
  }
  h.root = () => find(h.tree, node => typeof node.props.className === 'string'
    && node.props.className.includes('hero-carousel group'))
  h.currentImage = () => find(h.tree, node => node.type === 'img' && /^Campus image/.test(node.props.alt || ''))
  h.activeTimers = () => timers.filter(timer => timer.active)
  h.unmount = () => {
    for (const slot of h.slots) {
      slot?.cleanup?.()
      if (slot) slot.cleanup = undefined
    }
  }
  t.after(() => {
    h.unmount()
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete globalThis.window
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else delete globalThis.document
  })
  h.commit()
  return h
}

const pointer = (overrides = {}) => ({
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
  pointerId: 1,
  clientX: 100,
  clientY: 20,
  currentTarget: { setPointerCapture() {} },
  ...overrides
})

test('carousel removes controls and supports desktop hit regions plus keyboard navigation', async t => {
  const h = mount(t)
  await settle()
  h.commit()

  assert.equal(findAll(h.tree, node => node.type === 'button').length, 0)
  assert.equal(h.root().props.tabIndex, 0)
  const previous = find(h.tree, node => node.props['data-carousel-hit-region'] === 'previous')
  const next = find(h.tree, node => node.props['data-carousel-hit-region'] === 'next')
  assert.ok(previous)
  assert.ok(next)

  h.root().props.onPointerDown(pointer({ pointerType: 'mouse' }))
  next.props.onClick()
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image b')

  find(h.tree, node => node.props['data-carousel-hit-region'] === 'previous').props.onClick()
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image a')

  let prevented = false
  h.root().props.onKeyDown({ key: 'ArrowLeft', preventDefault: () => { prevented = true } })
  h.commit()
  assert.equal(prevented, true)
  assert.equal(h.currentImage().props.alt, 'Campus image c')
  assert.equal(find(h.tree, node => node.props['aria-live'] === 'polite') !== undefined, true)
})

test('the server-selected default starts first and normal autoplay continues without rerender resets', async t => {
  const h = mount(t, { slides: [slides[2], slides[0], slides[1]] })
  await settle()
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image c')
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image c')
  assert.equal(h.activeTimers().at(-1).delay, 7000)
  h.activeTimers().at(-1).callback()
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image a')
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image a')
})

test('touch swipes navigate once while vertical and tiny gestures remain inert', async t => {
  const h = mount(t)
  await settle()
  h.commit()

  let root = h.root()
  root.props.onPointerDown(pointer())
  h.commit()
  root = h.root()
  root.props.onPointerUp(pointer({ clientX: 20 }))
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image b')
  find(h.tree, node => node.props['data-carousel-hit-region'] === 'next').props.onClick()
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image b', 'swipe must not also trigger click navigation')

  root = h.root()
  root.props.onPointerDown(pointer())
  h.commit()
  root = h.root()
  root.props.onPointerMove(pointer({ clientX: 95, clientY: 45 }))
  h.commit()
  h.root().props.onPointerUp(pointer({ clientX: 95, clientY: 45 }))
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image b')

  h.root().props.onPointerDown(pointer())
  h.commit()
  h.root().props.onPointerUp(pointer({ clientX: 70 }))
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image b')
})

test('autoplay loops, resets after manual navigation, pauses appropriately, and cleans up', async t => {
  const h = mount(t)
  await settle()
  h.commit()
  assert.equal(h.activeTimers().at(-1).delay, 7000)

  h.activeTimers().at(-1).callback()
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image b')
  assert.equal(find(h.tree, node => node.props['aria-live'] === 'off') !== undefined, true)

  h.root().props.onPointerDown(pointer({ pointerType: 'mouse' }))
  find(h.tree, node => node.props['data-carousel-hit-region'] === 'next').props.onClick()
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image c')
  assert.equal(h.activeTimers().at(-1).delay, 7000)

  h.activeTimers().at(-1).callback()
  h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image a')

  h.root().props.onPointerEnter({ pointerType: 'mouse' })
  h.commit()
  assert.equal(h.activeTimers().length, 0)
  h.root().props.onPointerLeave()
  h.commit()
  assert.equal(h.activeTimers().length, 1)

  h.root().props.onFocusCapture()
  h.commit()
  assert.equal(h.activeTimers().length, 0)
  h.root().props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null })
  h.commit()
  assert.equal(h.activeTimers().length, 1)

  document.hidden = true
  h.listeners.get('visibilitychange')()
  h.commit()
  assert.equal(h.activeTimers().length, 0)
  h.unmount()
  assert.equal(h.activeTimers().length, 0)
})

test('reduced motion disables autoplay', async t => {
  const reduced = mount(t, { reducedMotion: true })
  await settle()
  reduced.commit()
  assert.equal(reduced.activeTimers().length, 0)
})

test('single-image state does not autoplay or expose navigation', async t => {
  const single = mount(t, { slides: [slides[0]] })
  await settle()
  single.commit()
  assert.equal(single.activeTimers().length, 0)
  assert.equal(single.root().props.tabIndex, undefined)
  assert.equal(findAll(single.tree, node => node.props['data-carousel-hit-region']).length, 0)
})

test('empty managed-image state falls back without exposing navigation', async t => {
  const empty = mount(t, { slides: [] })
  await settle()
  empty.commit()
  assert.equal(empty.activeTimers().length, 0)
  assert.equal(empty.root().props.tabIndex, undefined)
  assert.equal(findAll(empty.tree, node => node.props['data-carousel-hit-region']).length, 0)
  assert.ok(find(empty.tree, node => node.type === 'img' && /STI students/.test(node.props.alt || '')))
})

test('fallback replacement is used only with no usable managed images and never becomes a slide', async t => {
  const replacement = { imageUrl: 'https://images.example.test/fallback.jpg', altText: 'Configured fallback photo' }
  const h = mount(t, { slides: [slides[2], slides[0]], fallback: replacement })
  await settle(); h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image c')
  assert.equal(find(h.tree, node => node.type === 'img' && node.props.src === replacement.imageUrl), undefined)
  assert.equal(h.activeTimers().at(-1).delay, 7000)
  h.activeTimers().at(-1).callback(); h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image a')
  h.currentImage().props.onError(); h.commit()
  assert.equal(h.currentImage().props.alt, 'Campus image c')
  h.currentImage().props.onError(); h.commit()
  let image = find(h.tree, node => node.type === 'img' && node.props.alt === replacement.altText)
  assert.equal(image.props.src, replacement.imageUrl)
  assert.equal(h.activeTimers().length, 0)
  assert.equal(h.root().props.tabIndex, undefined)
  image.props.onError(); h.commit()
  image = find(h.tree, node => node.type === 'img' && /STI students/.test(node.props.alt || ''))
  assert.ok(image, 'Broken replacement returns to the unchanged bundled original')
  assert.equal(image.props.onError, undefined, 'No broken-image retry loop')
})

for (const [name, fallback] of [
  ['persisted fallback', { imageUrl: 'https://images.example.test/fallback.jpg', altText: 'Configured fallback photo' }],
  ['reset fallback', null],
  ['invalid fallback', { imageUrl: 'http://insecure.test/photo.jpg', altText: 'Invalid replacement' }]
]) {
  test('fresh load safely resolves ' + name, async t => {
    const h = mount(t, { slides: [], fallback })
    await settle(); h.commit()
    const image = find(h.tree, node => node.type === 'img')
    if (name === 'persisted fallback') assert.equal(image.props.src, fallback.imageUrl)
    else assert.match(image.props.alt, /STI students/)
    assert.equal(findAll(h.tree, node => node.props['data-carousel-hit-region']).length, 0)
    assert.equal(h.activeTimers().length, 0)
  })
}
