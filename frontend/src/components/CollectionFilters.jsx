import { productGenders, productPrograms } from '../../../shared/productTaxonomy'
import { ChevronDown } from 'lucide-react'

const CollectionFilters = ({ genders, programs, onToggle }) => (
  <div className='collection-filter-fields'>
    {[
      ['gender', 'Gender', productGenders, genders],
      ['program', 'Academic program', productPrograms, programs]
    ].map(([key, title, values, selected]) => (
      <details key={key} className='collection-filter-group' open>
        <summary>{title}<ChevronDown size={18} strokeWidth={1.75} aria-hidden='true'/></summary>
        <fieldset>
          <legend className='sr-only'>{title}</legend>
          <div className='collection-filter-options'>
            {values.map(value => <label key={value} className={'collection-filter-option' + (selected.includes(value) ? ' is-selected' : '')}>
              <input type='checkbox' value={value} checked={selected.includes(value)} onChange={() => onToggle(key, value)}/>
              <span>{value}</span>
            </label>)}
          </div>
        </fieldset>
      </details>
    ))}
  </div>
)

export default CollectionFilters
