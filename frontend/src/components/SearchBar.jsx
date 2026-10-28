import { Search, X } from 'lucide-react';

const searchClassName = [
  'col-span-full flex min-h-12 min-w-0 items-center gap-3 rounded-[7px] border px-3',
  'border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)]',
  'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2',
  'focus-within:outline-[var(--pamo-color-accent-text)]',
  'md:col-start-2 md:col-end-3 md:row-start-1'
].join(' ');

const SearchBar = ({ value, onChange }) => (
  <div className={searchClassName}>
    <Search className='shrink-0 text-[color:var(--pamo-color-text-secondary)]' size={18} strokeWidth={1.75} aria-hidden='true'/>
    <input id='collection-search' type='search' value={value} onChange={event => onChange(event.target.value)} aria-label='Search collection' placeholder='Search merchandise…' className='min-h-[46px] min-w-0 w-full bg-transparent py-2.5 text-sm leading-[1.5] text-[color:var(--pamo-color-text-primary)] placeholder:text-[color:var(--pamo-color-text-secondary)] focus-visible:outline-none md:text-[13px] [&::-webkit-search-cancel-button]:hidden'/>
    {value && (
      <button type='button' onClick={() => onChange('')} aria-label='Clear collection search' className='flex min-h-11 w-11 shrink-0 items-center justify-center rounded-[5px] text-[color:var(--pamo-color-text-secondary)] hover:bg-[var(--pamo-color-surface-subtle)] hover:text-[color:var(--pamo-color-text-primary)]'>
        <X size={18} strokeWidth={1.75} aria-hidden='true'/>
      </button>
    )}
  </div>
);

export default SearchBar;
