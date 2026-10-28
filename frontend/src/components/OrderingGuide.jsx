import { Search, ShoppingCart, Store } from 'lucide-react'

const steps = [
  {
    title: 'Browse essentials',
    copy: 'Explore uniforms and school items for your program.',
    icon: <Search size={26} strokeWidth={1.6} />,
  },
  {
    title: 'Place your order',
    copy: 'Checkout online in just a few steps.',
    icon: <ShoppingCart size={26} strokeWidth={1.6} />,
  },
  {
    title: 'Claim on campus',
    copy: 'Pick up at your campus and get back to what matters.',
    icon: <Store size={26} strokeWidth={1.6} />,
  },
]

const orderingSectionClass = [
  'mt-1 border-t border-[color:var(--pamo-color-border-default)] py-2',
  'md:py-4 min-[960px]:py-5',
].join(' ')

const orderingListClass = [
  'grid divide-y divide-[color:var(--pamo-color-border-default)]',
  'md:grid-cols-3 md:divide-x md:divide-y-0',
].join(' ')

const orderingStepClass = [
  'grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2.5 py-3',
  'first:pt-1.5 last:pb-1.5 md:gap-3 md:px-4 md:py-2 md:first:pt-2 md:last:pb-2',
  'min-[960px]:gap-4 min-[960px]:px-6 min-[960px]:py-1',
  'min-[960px]:first:pl-4 min-[960px]:first:pt-1 min-[960px]:last:pb-1',
].join(' ')

const OrderingGuide = () => (
  <section className={orderingSectionClass} aria-label='How ordering works'>
    <ol className={orderingListClass}>
      {steps.map(({ title, copy, icon }, index) => (
        <li className={orderingStepClass} key={title}>
          <span
            className='text-[13px] font-semibold tabular-nums text-[color:var(--pamo-color-text-secondary)] md:text-sm'
            aria-hidden='true'
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <span
            className='flex h-10 w-10 shrink-0 items-center justify-center border-r border-[color:var(--pamo-color-border-default)] pr-2.5 text-[color:var(--pamo-color-text-primary)] md:h-11 md:w-11 md:pr-3 [&_svg]:h-5 [&_svg]:w-5 md:[&_svg]:h-6 md:[&_svg]:w-6 min-[960px]:[&_svg]:h-[26px] min-[960px]:[&_svg]:w-[26px]'
            aria-hidden='true'
          >
            {icon}
          </span>
          <span className='min-w-0'>
            <span className='block text-sm font-semibold leading-5 text-[color:var(--pamo-color-text-primary)]'>
              {title}
            </span>
            <span className='mt-1 block text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]'>
              {copy}
            </span>
          </span>
        </li>
      ))}
    </ol>
  </section>
)

export default OrderingGuide
