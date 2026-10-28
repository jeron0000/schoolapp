import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cartSelectionKey,
  reconcileCartSelection,
  selectCartItems,
} from '../src/utils/cartSelection.js'

const firstId = '0123456789abcdef01234567'
const secondId = '2123456789abcdef01234567'
const cart = {
  [firstId]: { M: 2, L: 1 },
  [secondId]: { 'One Size': 3 },
}

test('cart selection defaults every product-size variant independently', () => {
  const selection = reconcileCartSelection(cart, null)

  assert.deepEqual(selection.selected, [
    cartSelectionKey(firstId, 'M'),
    cartSelectionKey(firstId, 'L'),
    cartSelectionKey(secondId, 'One Size'),
  ])
})

test('cart selection preserves deselection, adds new variants, and removes stale keys', () => {
  const selectedM = cartSelectionKey(firstId, 'M')
  const selectedL = cartSelectionKey(firstId, 'L')
  const stored = {
    known: [selectedM, selectedL, cartSelectionKey('3123456789abcdef01234567', 'S')],
    selected: [selectedM],
  }

  const selection = reconcileCartSelection(cart, stored)

  assert.deepEqual(selection.known, [
    selectedM,
    selectedL,
    cartSelectionKey(secondId, 'One Size'),
  ])
  assert.deepEqual(selection.selected, [
    selectedM,
    cartSelectionKey(secondId, 'One Size'),
  ])
})

test('selected cart contains only chosen variants and preserves quantities', () => {
  const selected = new Set([
    cartSelectionKey(firstId, 'L'),
    cartSelectionKey(secondId, 'One Size'),
  ])

  assert.deepEqual(selectCartItems(cart, selected), {
    [firstId]: { L: 1 },
    [secondId]: { 'One Size': 3 },
  })
  assert.deepEqual(selectCartItems(cart, new Set()), {})
})
