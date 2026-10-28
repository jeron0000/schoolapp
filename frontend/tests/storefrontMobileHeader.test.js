import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/components/NavBar.jsx', import.meta.url), 'utf8')

test('Storefront mobile header preserves centered branding and every existing action', () => {
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/)
  assert.match(source, /max-\[359px\]:grid-cols-2/)
  assert.match(source, /col-start-2[^']*justify-self-center[^']*max-\[359px\]:col-span-2/)
  assert.match(source, /h-11 w-11[^']*rounded-md[^>]*>\s*<span className='text-lg font-semibold leading-6 tracking-tight/)
  assert.match(source, /hidden[^']*min-\[430px\]:block[^']*md:block/)
  for (const label of ['Announcements', 'Account', 'Cart, ', 'Open navigation']) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('Mobile control regions keep theme and notifications left, account/cart/menu right', () => {
  const left = source.indexOf("col-start-1 row-start-1")
  const theme = source.indexOf('<ThemeToggle', left)
  const bell = source.indexOf("to='/announcements'", left)
  const right = source.indexOf("col-start-3 row-start-1", left)
  const account = source.indexOf("aria-label='Account'", right)
  const cart = source.indexOf("to='/cart'", right)
  const menu = source.indexOf("aria-label='Open navigation'", right)
  assert.ok(left >= 0 && right > left)
  assert.ok(theme > left && theme < right)
  assert.ok(bell > left && bell < right)
  assert.ok(account > right && cart > account && menu > cart)
  assert.match(source.slice(left, right), /order-first md:order-none/)
})

test('Desktop navigation and right-side mobile drawer contracts remain unchanged', () => {
  assert.match(source, /md:flex md:min-h-\[76px\]/)
  assert.match(source, /min-\[1180px\]:min-h-\[84px\]/)
  assert.match(source, /absolute inset-y-0 right-0 flex w-\[85%\] max-w-sm/)
  assert.match(source, /aria-label='Close navigation'/)
  assert.match(source, /aria-modal='true'/)
})
