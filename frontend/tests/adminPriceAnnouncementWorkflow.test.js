import test from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const admin = fileURLToPath(new URL('../../admin/', import.meta.url))
const requireAdmin = createRequire(path.join(admin, 'price-announcement-test.cjs'))
const React = requireAdmin('react')
let runner

const hooks = {
  ...React,
  useEffect: () => {},
  useRef: initial => runner.ref(initial),
  useState: initial => runner.state(initial),
}

const output = await build({
  stdin: {
    resolveDir: admin,
    loader: 'jsx',
    contents: `
      export { default as BulkPriceScheduleDialog } from './src/components/BulkPriceScheduleDialog.jsx'
      export { AnnouncementForm } from './src/pages/Announcements.jsx'
    `,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' },
  write: false,
})

const compiled = new Module(path.join(admin, 'price-announcement-test.cjs'))
compiled.filename = path.join(admin, 'price-announcement-test.cjs')
compiled.paths = Module._nodeModulePaths(admin)
compiled.require = name => {
  if (name === 'react') return hooks
  return requireAdmin(name)
}
compiled._compile(output.outputFiles[0].text, compiled.filename)

const walk = (element, visit) => {
  if (!React.isValidElement(element)) return
  visit(element)
  React.Children.toArray(element.props.children).forEach(child => walk(child, visit))
}

const find = (tree, predicate) => {
  let result
  walk(tree, element => {
    if (!result && predicate(element)) result = element
  })
  return result
}

const textContent = value => {
  if (Array.isArray(value)) return value.map(textContent).join('')
  if (React.isValidElement(value)) return textContent(value.props.children)
  if (typeof value === 'string') return value
  return ''
}

const mount = (Component, props) => {
  const harness = { cursor: 0, slots: [] }
  harness.state = initial => {
    const index = harness.cursor++
    harness.slots[index] ??= {
      value: typeof initial === 'function' ? initial() : initial,
    }
    const slot = harness.slots[index]
    return [slot.value, value => {
      slot.value = typeof value === 'function' ? value(slot.value) : value
    }]
  }
  harness.ref = initial => {
    const index = harness.cursor++
    harness.slots[index] ??= { current: initial }
    return harness.slots[index]
  }
  harness.commit = () => {
    harness.cursor = 0
    runner = harness
    try {
      harness.tree = Component(props)
    } finally {
      runner = null
    }
    return harness.tree
  }
  harness.commit()
  return harness
}

const product = {
  _id: 'product-1',
  name: 'College Uniform',
  price: 500,
  image: ['uniform.jpg'],
}

const prepareReview = (harness, actionLabel) => {
  const selector = find(harness.tree, element => {
    return element.props.legend === 'Products to update'
  })
  selector.props.onChange([product._id])
  harness.commit()

  find(harness.tree, element => element.props.id === 'bulk-price-product-1')
    .props.onChange({ target: { value: '550' } })
  find(harness.tree, element => element.props.id === 'bulk-effective-at')
    .props.onChange({ target: { value: '2099-01-02T09:30' } })
  harness.commit()

  find(harness.tree, element => {
    return element.type === 'button' && textContent(element) === actionLabel
  }).props.onClick()
  harness.commit()
}

test('new price-change type enters the shared atomic scheduling workflow', () => {
  let starts = 0
  const harness = mount(compiled.exports.AnnouncementForm, {
    announcement: null,
    products: [product],
    busy: false,
    onClose: () => {},
    onSave: async () => ({ ok: true }),
    onStartPriceSchedule: () => { starts += 1 },
  })

  const typeSelect = find(harness.tree, element => {
    return element.props.id === 'announcement-type'
  })
  typeSelect.props.onChange({
    target: { checked: false, name: 'type', type: 'select-one', value: 'price-change' },
  })
  assert.equal(starts, 1)
})

for (const [actionLabel, announceToStudents] of [
  ['Schedule Only', false],
  ['Schedule & Announce', true],
]) {
  test(`${actionLabel} requires review and submits the expected atomic payload`, async () => {
    const submissions = []
    const harness = mount(compiled.exports.BulkPriceScheduleDialog, {
      products: [product],
      busy: false,
      onClose: () => {},
      onSchedule: async values => {
        submissions.push(values)
        return { ok: true }
      },
    })

    prepareReview(harness, actionLabel)
    assert.equal(submissions.length, 0)

    const form = find(harness.tree, element => element.type === 'form')
    await form.props.onSubmit({ preventDefault: () => {} })
    assert.equal(submissions.length, 1)
    assert.deepEqual(submissions[0].changes, [{ productId: product._id, price: 550 }])
    assert.equal(submissions[0].announceToStudents, announceToStudents)
    assert.equal(submissions[0].effectiveAt, '2099-01-02T01:30:00.000Z')
  })
}
