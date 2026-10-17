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

const ProgramFinder = () => (
  <section className='home-program-finder' aria-labelledby='program-finder-heading'>
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
    <div className='home-program-grid'>
      {shortcuts.filter(({ program }) => !program || productPrograms.includes(program)).map(({ program, title, icon }) => {
        const Icon = icon
        return (
          <Link
            key={program || 'all'}
            to={program ? `/collection?program=${encodeURIComponent(program)}` : '/collection'}
            className='home-program-card'
          >
            <div className='home-program-label'>
              <span className='home-program-mark'>
                <Icon size={24} strokeWidth={1.75} aria-hidden='true' />
              </span>
              <span>
                <span className='home-copy-desktop'>{program ? 'Program / ' : 'Browse '}</span>
                {program || 'All'}
              </span>
            </div>
            <h3>{title}</h3>
            <p>
              <span className='home-copy-desktop'>
                {program === 'SHS' ? 'School essentials' : program ? 'Program essentials' : 'Explore the full catalog'}
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
    <nav className='home-quick-filters' aria-label='Quick gender filters'>
      <span>
        <span className='home-copy-desktop'>Quick filters</span>
        <span className='home-copy-nondesktop'>Gender filters</span>
      </span>
      {productGenders.map(gender => (
        <Link key={gender} to={`/collection?gender=${encodeURIComponent(gender)}`}>
          {gender}
        </Link>
      ))}
      <Link to='/collection'>
        <span className='home-copy-desktop'>View all merchandise</span>
        <span className='home-copy-nondesktop'>All</span>
      </Link>
    </nav>
  </section>
)

export default ProgramFinder
