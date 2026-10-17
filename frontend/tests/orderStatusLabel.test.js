import test from 'node:test'
import assert from 'node:assert/strict'
import { getOrderStatusLabel } from '../../admin/src/utils/orderPresentation.js'

test('non-cancelled statuses pass through without normalization or type conversion', () => {
  for (const status of [
    'Order Placed', 'Approved', 'Packing', 'Sent to Cashier', 'Shipped',
    'Ready To Claim', 'Claimed', 'Pending', 'Legacy status', 'cancelled',
    '', undefined, null, false, 0, {}, []
  ]) {
    assert.strictEqual(getOrderStatusLabel({ status, cancellationSource: 'customer' }), status)
  }
})

test('cancellation labels distinguish customer, Admin and legacy sources exactly', () => {
  assert.equal(getOrderStatusLabel({ status: 'Cancelled', cancellationSource: 'customer' }), 'Cancelled by Customer')
  assert.equal(getOrderStatusLabel({ status: 'Cancelled', cancellationSource: 'admin' }), 'Rejected by Admin')
  for (const cancellationSource of [undefined, null, '', 'legacy', 'Customer', false, {}, []]) {
    assert.equal(getOrderStatusLabel({ status: 'Cancelled', cancellationSource }), 'Cancelled')
  }
})

test('payment and refund evidence does not change status presentation', () => {
  for (const payment of [false, true, undefined]) {
    for (const refund of [undefined, { status: 'Refund Required', requiredAt: 1 }]) {
      for (const [cancellationSource, expected] of [
        ['customer', 'Cancelled by Customer'], ['admin', 'Rejected by Admin'], [undefined, 'Cancelled']
      ]) {
        assert.equal(getOrderStatusLabel({ status: 'Cancelled', cancellationSource, payment, refund }), expected)
        assert.equal(getOrderStatusLabel({ status: 'Packing', cancellationSource, payment, refund }), 'Packing')
      }
    }
  }
})

test('missing fields, inherited fields and invalid top-level inputs retain existing behavior', () => {
  assert.equal(getOrderStatusLabel({}), undefined)
  assert.equal(getOrderStatusLabel([]), undefined)
  assert.equal(getOrderStatusLabel('legacy'), undefined)
  assert.equal(getOrderStatusLabel(0), undefined)
  assert.equal(getOrderStatusLabel(Object.create({ status: 'Cancelled', cancellationSource: 'customer' })), 'Cancelled by Customer')
  assert.throws(() => getOrderStatusLabel(null), TypeError)
  assert.throws(() => getOrderStatusLabel(undefined), TypeError)
})

test('status and source properties are read in the existing branch order without mutation', () => {
  for (const [status, source, expectedReads] of [
    ['Packing', 'customer', ['status', 'status']],
    ['Cancelled', 'customer', ['status', 'source']],
    ['Cancelled', 'admin', ['status', 'source', 'source']],
    ['Cancelled', 'legacy', ['status', 'source', 'source']]
  ]) {
    const reads = []
    const order = Object.freeze({
      get status() { reads.push('status'); return status },
      get cancellationSource() { reads.push('source'); return source }
    })
    getOrderStatusLabel(order)
    assert.deepEqual(reads, expectedReads)
  }
})
