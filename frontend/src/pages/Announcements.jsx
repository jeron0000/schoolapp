import {
  ArrowRight,
  Bell,
  BellOff,
  CalendarDays,
  ChevronDown,
  Package,
  RefreshCw,
} from 'lucide-react'
import { useContext, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPhp } from '../../../shared/money.js'
import { ShopContext } from '../context/shopContext.js'
import { usePublicAnnouncements } from '../hooks/usePublicAnnouncements'
import { markAnnouncementRead } from '../utils/announcementReadState'

const MANILA_TIME_ZONE = 'Asia/Manila'

const manilaDateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: MANILA_TIME_ZONE,
})

const formatManilaDateTime = value => {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return `${manilaDateFormatter.format(date)} (Asia/Manila)`
}

const announcementType = type => {
  if (type === 'price-change') return 'Price-change notice'
  return 'General announcement'
}

const linkedProductsFor = (announcement, products) => {
  return (announcement.linkedProductIds || []).map((productId, index) => {
    const product = products.find(item => item._id === productId)
    return {
      _id: productId,
      name: product?.name || `Linked product ${index + 1}`,
    }
  })
}

const PriceComparisonCard = ({ comparison }) => {
  const effectiveAt = formatManilaDateTime(comparison.effectiveAt)

  return (
    <li className='min-w-0'>
      <Link
        to={`/product/${comparison.productId}`}
        className='grid min-w-0 gap-4 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-4 hover:border-[color:var(--pamo-color-accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)] min-[360px]:grid-cols-[3.5rem_minmax(0,1fr)] sm:p-5'
      >
        {comparison.image ? (
          <img src={comparison.image} alt='' className='h-14 w-14 rounded-md object-cover' />
        ) : (
          <span className='grid h-14 w-14 place-items-center rounded-md bg-[var(--pamo-color-surface-default)] text-[color:var(--pamo-color-text-secondary)]'>
            <Package size={20} aria-hidden='true' />
          </span>
        )}

        <div className='min-w-0'>
          <span className='inline-flex min-h-7 items-center rounded-full border border-[color:var(--pamo-color-brand-yellow)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-accent-text)]'>Upcoming</span>
          <h4 className='mt-2 break-words text-sm font-semibold leading-5 text-[color:var(--pamo-color-text-primary)]'>{comparison.name}</h4>
          <dl className='mt-4 grid min-w-0 gap-3 text-xs sm:grid-cols-3'>
            <div>
              <dt className='font-medium text-[color:var(--pamo-color-text-secondary)]'>Previous price</dt>
              <dd className='mt-1 text-sm font-semibold text-[color:var(--pamo-color-text-primary)]'>{formatPhp(comparison.previousPrice)}</dd>
            </div>
            <div>
              <dt className='font-medium text-[color:var(--pamo-color-text-secondary)]'>New price</dt>
              <dd className='mt-1 inline-flex rounded-md bg-[var(--pamo-color-brand-yellow)] px-2 py-1 text-sm font-bold text-slate-950'>{formatPhp(comparison.newPrice)}</dd>
            </div>
            <div>
              <dt className='font-medium text-[color:var(--pamo-color-text-secondary)]'>Effective</dt>
              <dd className='mt-1 leading-5 text-[color:var(--pamo-color-text-primary)]'>{effectiveAt || 'Date unavailable'}</dd>
            </div>
          </dl>
        </div>
      </Link>
    </li>
  )
}

export const AnnouncementCard = ({
  announcement,
  products = [],
  opened = false,
  onToggle = () => {},
}) => {
  const detailsId = useId()
  if (!announcement) return null
  const published = formatManilaDateTime(announcement.publishAt)
  const linkedProducts = linkedProductsFor(announcement, products)
  const priceComparisons = Array.isArray(announcement.priceComparisons)
    ? announcement.priceComparisons
    : []
  const messageClassName = opened ? '' : 'line-clamp-3'

  return (
    <article className='min-w-0 overflow-hidden rounded-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]'>
      <div className='h-1 bg-[var(--pamo-color-brand-yellow)]' aria-hidden='true' />
      <div className='min-w-0 p-5 sm:p-7 lg:p-8'>
        <div className='flex flex-wrap items-center gap-3'>
          <span className='inline-flex min-h-8 items-center gap-2 rounded-full border border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[.05em] text-[color:var(--pamo-color-accent-text)]'>
            <Bell size={14} aria-hidden='true' />
            {announcementType(announcement.type)}
          </span>
          <span className='inline-flex items-center gap-2 text-xs font-medium text-[color:var(--pamo-color-success-text)]'>
            <span className='h-1.5 w-1.5 rounded-full bg-[var(--pamo-color-success)]' aria-hidden='true' />
            Active
          </span>
        </div>

        <h2 className='mt-6 text-[clamp(1.25rem,3vw,1.625rem)] font-semibold leading-[1.35] text-[color:var(--pamo-color-text-primary)]'>
          Storefront notice
        </h2>
        <p className={`mt-4 whitespace-pre-line rounded-lg bg-[var(--pamo-color-surface-subtle)] px-4 py-4 text-[15px] leading-[1.75] text-[color:var(--pamo-color-text-primary)] [overflow-wrap:anywhere] sm:px-5 sm:py-5 sm:text-base ${messageClassName}`}>
          {announcement.message}
        </p>

        <button
          type='button'
          aria-expanded={opened}
          aria-controls={detailsId}
          onClick={() => onToggle(announcement._id)}
          className='mt-5 inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[color:var(--pamo-color-accent-text)] hover:bg-[var(--pamo-color-surface-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)]'
        >
          {opened ? 'Close announcement' : 'Open announcement'}
          <ChevronDown className={opened ? 'rotate-180' : ''} size={17} aria-hidden='true' />
        </button>

        {opened && (
          <div id={detailsId} className='mt-5 border-t border-[color:var(--pamo-color-border-default)] pt-5'>
            {priceComparisons.length > 0 && (
              <section aria-label='Upcoming price changes'>
                <h3 className='flex items-center gap-2 text-xs font-semibold uppercase tracking-[.05em] text-[color:var(--pamo-color-text-secondary)]'>
                  <Package size={16} className='text-[color:var(--pamo-color-accent-text)]' aria-hidden='true' />
                  Upcoming price changes
                </h3>
                <ul className='mt-3 grid min-w-0 gap-3'>
                  {priceComparisons.map(comparison => (
                    <PriceComparisonCard
                      key={`${comparison.productId}:${comparison.effectiveAt}`}
                      comparison={comparison}
                    />
                  ))}
                </ul>
              </section>
            )}

            {priceComparisons.length === 0 && linkedProducts.length > 0 && (
              <section aria-label='Linked products'>
                <h3 className='flex items-center gap-2 text-xs font-semibold uppercase tracking-[.05em] text-[color:var(--pamo-color-text-secondary)]'>
                  <Package size={16} className='text-[color:var(--pamo-color-accent-text)]' aria-hidden='true' />
                  Linked products
                </h3>
                <ul className='mt-3 flex min-w-0 flex-wrap gap-2'>
                  {linkedProducts.map(product => (
                    <li key={product._id} className='min-w-0 max-w-full'>
                      <Link to={`/product/${product._id}`} className='inline-flex min-h-11 max-w-full items-center rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2 text-sm font-semibold text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)]'>
                        <span className='truncate'>{product.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {announcement.link && (
              <Link to={announcement.link} className='mt-5 inline-flex min-h-11 max-w-full items-center gap-2 rounded-md bg-[var(--pamo-color-brand-yellow)] px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-[var(--pamo-color-brand-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)]'>
                View details <ArrowRight size={17} aria-hidden='true' />
              </Link>
            )}
          </div>
        )}

        <dl className='mt-8 border-t border-[color:var(--pamo-color-border-default)] pt-5 text-center text-sm'>
          <div>
            <dt className='inline-flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[.05em] text-[color:var(--pamo-color-text-secondary)]'>
              <CalendarDays size={15} className='text-[color:var(--pamo-color-accent-text)]' aria-hidden='true' />
              Published
            </dt>
            <dd className='mt-1.5 leading-6 text-[color:var(--pamo-color-text-secondary)]'>
              {published || 'Published immediately'}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  )
}

const Announcements = () => {
  const { products, userId } = useContext(ShopContext)
  const { announcements, status, error, retry } = usePublicAnnouncements()
  const [openedIds, setOpenedIds] = useState(() => new Set())

  const toggleAnnouncement = announcementId => {
    if (!announcementId) return
    const wasOpened = openedIds.has(announcementId)
    setOpenedIds(current => {
      const next = new Set(current)
      if (wasOpened) {
        next.delete(announcementId)
      } else {
        next.add(announcementId)
      }
      return next
    })
    if (!wasOpened) markAnnouncementRead(userId, announcementId)
  }

  return (
    <section className='announcements-page page-section mx-auto grid min-w-0 max-w-[1120px] grid-cols-[minmax(0,1fr)] gap-8 text-[color:var(--pamo-color-text-primary)] sm:gap-10' aria-labelledby='announcements-heading'>
      <header className='min-w-0 border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4'>
        <p className='text-[11px] font-medium uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)]'>Store updates</p>
        <h1 id='announcements-heading' className='mt-4 break-words text-[clamp(1.875rem,5vw,2.75rem)] font-semibold leading-[1.15] tracking-[-.025em]'>Announcements</h1>
        <p className='mt-4 max-w-2xl text-sm leading-6 text-[color:var(--pamo-color-text-secondary)] sm:text-base'>Official merchandise, schedule, and pricing notices from PAMO.</p>
      </header>

      {status === 'loading' && (
        <p role='status' className='rounded-[10px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-8 text-center text-sm text-[color:var(--pamo-color-text-secondary)]'>Loading announcements…</p>
      )}
      {status === 'error' && (
        <div role='alert' className='rounded-[10px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-6 text-center sm:p-8'>
          <p className='text-sm leading-6 text-[color:var(--pamo-color-error-text)]'>{error}</p>
          <button type='button' onClick={retry} className='mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] px-4 py-2.5 text-sm font-semibold hover:border-[color:var(--pamo-color-accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)]'><RefreshCw size={16} aria-hidden='true' />Try again</button>
        </div>
      )}
      {status === 'ready' && announcements.length > 0 && (
        <div className='grid min-w-0 gap-6'>
          {announcements.map(announcement => (
            <AnnouncementCard
              key={announcement._id}
              announcement={announcement}
              products={products}
              opened={openedIds.has(announcement._id)}
              onToggle={toggleAnnouncement}
            />
          ))}
        </div>
      )}
      {status === 'ready' && announcements.length === 0 && (
        <div className='flex min-h-64 flex-col items-center justify-center rounded-[10px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-6 text-center sm:p-10'>
          <span className='grid h-14 w-14 place-items-center rounded-full bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-accent-text)]'><BellOff size={25} aria-hidden='true' /></span>
          <h2 className='mt-5 text-xl font-semibold'>No active announcements</h2>
          <p className='mt-3 max-w-md text-sm leading-6 text-[color:var(--pamo-color-text-secondary)]'>There are no current Storefront notices. Check back later for merchandise and pricing updates.</p>
          <Link to='/collection' className='mt-6 inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[color:var(--pamo-color-accent-text)] hover:bg-[var(--pamo-color-surface-subtle)]'>Browse collection <ArrowRight size={16} aria-hidden='true' /></Link>
        </div>
      )}
    </section>
  )
}

export default Announcements
