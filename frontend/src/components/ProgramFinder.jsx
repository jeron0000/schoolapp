import { Link } from 'react-router-dom'
import { productGenders, productPrograms } from '../../../shared/productTaxonomy'
import HomeSectionHeading from './HomeSectionHeading'
import { ArrowUpRight, Code2, ConciergeBell, GraduationCap, LayoutGrid } from 'lucide-react'

// These approved shortcuts use the same program codes as the catalog filters.
const shortcuts = [
  { program: 'BSIT', title: 'Information Technology', icon: Code2 },
  { program: 'BSHM', title: 'Hospitality Management', icon: ConciergeBell },
  { program: 'SHS', title: 'Senior High School', icon: GraduationCap },
  { title: 'All programs', icon: LayoutGrid }
]

const programSectionClass = [
  'mt-12 border-t border-[color:var(--pamo-color-border-default)] pt-10 md:mt-14 md:pt-12',
  'min-[1180px]:mt-12 min-[1180px]:pt-12 min-[1180px]:[&_h2]:!text-[30px]',
  'min-[1180px]:[&_.home-eyebrow]:!mb-3.5',
  'min-[1180px]:[&_.home-section-description]:!mt-3.5',
  'min-[1180px]:[&_.home-section-description]:!text-[14px]',
].join(' ')

const programGridClass = [
  'mt-7 grid grid-cols-2 items-stretch gap-3 max-[359px]:grid-cols-1',
  'md:mt-8 md:gap-5',
  'min-[1180px]:grid-cols-4 min-[1180px]:gap-5',
].join(' ')

const programCardClass = [
  'group relative flex min-h-[164px] min-w-0 flex-col rounded-lg border',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]',
  'p-4 transition-colors duration-200 hover:border-[color:var(--pamo-color-border-input)]',
  "before:absolute before:-left-px before:-top-px before:h-[3px] before:w-[43px] before:rounded-sm before:bg-[var(--pamo-color-brand-yellow)] before:content-['']",
  'md:min-h-[176px] md:p-5',
  'min-[1180px]:min-h-[180px] min-[1180px]:rounded-[9px] min-[1180px]:before:w-[61px]',
].join(' ')

const programLabelClass = [
  'flex items-center gap-3 text-xs font-medium uppercase leading-[1.5]',
  'text-[color:var(--pamo-color-accent-text)] min-[1180px]:text-[11px]',
].join(' ')

const programMarkClass = [
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
  'bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-text-primary)]',
  'min-[1180px]:h-11 min-[1180px]:w-11 min-[1180px]:rounded-[7px]',
].join(' ')

const programTitleClass = [
  'mb-3 mt-4 min-h-[42px] text-sm font-semibold leading-[1.5]',
  'md:mt-5 md:min-h-[54px] md:text-[18px]',
  'min-[1180px]:mb-2 min-[1180px]:min-h-0 min-[1180px]:text-[17px]',
].join(' ')

const programCopyClass = [
  'mt-auto flex flex-wrap items-center justify-between gap-2',
  'text-xs font-medium leading-[1.5] text-[color:var(--pamo-color-text-secondary)]',
  'min-[1180px]:font-normal',
].join(' ')

const quickFiltersClass = [
  'mt-6 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-xs',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)]',
  'text-[color:var(--pamo-color-text-secondary)] md:mt-8 md:gap-3 md:p-4',
].join(' ')

const quickFilterLinkClass = [
  'inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 font-semibold',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]',
  'transition-colors duration-200 hover:border-[color:var(--pamo-color-brand-yellow)]',
  'hover:text-[color:var(--pamo-color-accent-text)] active:bg-[var(--pamo-color-surface-subtle)]',
].join(' ')

const ProgramFinder = () => (
  <section className={programSectionClass} aria-labelledby='program-finder-heading'>
    <HomeSectionHeading
      id='program-finder-heading'
      eyebrow={
        <>
          <span className='home-copy-wide'>Find your program</span>
          <span className='home-copy-mobile'>Shop by program</span>
        </>
      }
      title={
        <>
          <span className='home-copy-desktop'>Find your school essentials faster</span>
          <span className='home-copy-tablet'>Find what you need sooner</span>
          <span className='home-copy-mobile'>Find the right essentials</span>
        </>
      }
      description={
        <>
          <span className='home-copy-desktop'>
            Browse by academic program, then refine by gender or search for a specific uniform.
          </span>
          <span className='home-copy-tablet'>Shop by academic program or explore the full collection.</span>
          <span className='home-copy-mobile'>Choose your program or browse everything.</span>
        </>
      }
    />
    <div className={programGridClass}>
      {shortcuts.filter(({ program }) => !program || productPrograms.includes(program)).map(({ program, title, icon }) => {
        const Icon = icon
        let description = 'Explore the full catalog'
        if (program) description = 'Program essentials'
        if (program === 'SHS') description = 'School essentials'
        return (
          <Link
            key={program || 'all'}
            to={program ? `/collection?program=${encodeURIComponent(program)}` : '/collection'}
            className={programCardClass}
          >
            <div className={programLabelClass}>
              <span className={programMarkClass}>
                <Icon size={24} strokeWidth={1.75} aria-hidden='true' />
              </span>
              <span>
                <span className='home-copy-desktop'>{program ? 'Program / ' : 'Browse '}</span>
                {program || 'All'}
              </span>
            </div>
            <h3 className={programTitleClass}>{title}</h3>
            <p className={programCopyClass}>
              <span className='home-copy-desktop'>
                {description}
              </span>
              <span className='home-copy-nondesktop'>View products</span>
              <ArrowUpRight
                className='storefront-action-icon'
                size={18}
                strokeWidth={1.75}
                aria-hidden='true'
              />
            </p>
          </Link>
        )
      })}
    </div>
    <nav className={quickFiltersClass} aria-label='Quick gender filters'>
      <span className='mr-1 basis-full px-1 text-[10px] font-semibold uppercase sm:basis-auto'>
        <span className='home-copy-desktop'>Quick filters</span>
        <span className='home-copy-nondesktop'>Gender filters</span>
      </span>
      {productGenders.map(gender => (
        <Link className={quickFilterLinkClass} key={gender} to={`/collection?gender=${encodeURIComponent(gender)}`}>
          {gender}
        </Link>
      ))}
      <Link className={quickFilterLinkClass} to='/collection'>
        <span className='home-copy-desktop'>View all merchandise</span>
        <span className='home-copy-nondesktop'>All</span>
      </Link>
    </nav>
  </section>
)

export default ProgramFinder
