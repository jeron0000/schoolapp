import test from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const admin = fileURLToPath(new URL('../../admin/', import.meta.url))
const requireAdmin = createRequire(path.join(admin, 'custom-size-input-test.cjs'))
const React = requireAdmin('react')
let runner
const hooks = { ...React, useState: initial => runner.state(initial) }
const output = await build({
  stdin: { resolveDir: admin, contents: "export { default } from './src/components/CustomSizeInput.jsx';" },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  write: false
})
const compiled = new Module(path.join(admin, 'custom-size-input-test.cjs'))
compiled.filename = path.join(admin, 'custom-size-input-test.cjs')
compiled.paths = Module._nodeModulePaths(admin)
compiled.require = name => name === 'react' ? hooks : requireAdmin(name)
compiled._compile(output.outputFiles[0].text, compiled.filename)

const walk = (element, visit) => {
  if (!React.isValidElement(element)) return
  visit(element)
  React.Children.toArray(element.props.children).forEach(child => walk(child, visit))
}

const find = (tree, predicate) => {
  let found
  walk(tree, element => { if (!found && predicate(element)) found = element })
  return found
}

const mount = () => {
  const harness = { slots: [], cursor: 0, added: [] }
  harness.props = {
    selectedSizes: [],
    onAdd: size => {
      harness.added.push(size)
      harness.props.selectedSizes = [...harness.props.selectedSizes, size]
    }
  }
  harness.state = initial => {
    const index = harness.cursor++
    const initialValue = typeof initial === 'function' ? initial() : initial
    harness.slots[index] ??= { value: initialValue }
    const slot = harness.slots[index]
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
  }
  harness.commit = () => {
    harness.cursor = 0
    runner = harness
    try {
      harness.tree = compiled.exports.default(harness.props)
    } finally {
      runner = null
    }
  }
  harness.commit()
  return harness
}

test('custom size input validates, normalizes, deduplicates, and supports keyboard actions', () => {
  const harness = mount()
  find(harness.tree, node => node.type === 'button').props.onClick()
  harness.commit()

  const input = () => find(harness.tree, node => node.props.id === 'custom-size-label')
  const add = () => find(harness.tree, node => node.type === 'button' && node.props.children === 'Add Size')
  input().props.onChange({ target: { value: '4XL.' } })
  harness.commit()
  add().props.onClick()
  harness.commit()
  assert.match(find(harness.tree, node => node.props.role === 'alert').props.children, /1–40/)

  input().props.onChange({ target: { value: ' 4xl ' } })
  harness.commit()
  let prevented = false
  input().props.onKeyDown({ key: 'Enter', preventDefault: () => { prevented = true } })
  harness.commit()
  assert.equal(prevented, true)
  assert.deepEqual(harness.added, ['4XL'])

  find(harness.tree, node => node.type === 'button').props.onClick()
  harness.commit()
  input().props.onChange({ target: { value: '4xl' } })
  harness.commit()
  add().props.onClick()
  harness.commit()
  assert.match(find(harness.tree, node => node.props.role === 'alert').props.children, /already selected/)

  input().props.onKeyDown({ key: 'Escape', preventDefault() {} })
  harness.commit()
  assert.equal(find(harness.tree, node => node.props.id === 'custom-size-label'), undefined)
})
