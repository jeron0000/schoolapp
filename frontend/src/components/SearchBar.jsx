import { Search, X } from 'lucide-react'

const SearchBar = ({ value, onChange }) => (
  <div className='collection-search'>
    <Search size={18} strokeWidth={1.75} aria-hidden='true'/>
    <input id='collection-search' type='search' value={value} onChange={event => onChange(event.target.value)} aria-label='Search collection' placeholder='Search merchandise…'/>
    {value && <button type='button' onClick={() => onChange('')} aria-label='Clear collection search'><X size={18} strokeWidth={1.75} aria-hidden='true'/></button>}
  </div>
)

export default SearchBar
