import { ChevronDown } from 'lucide-react';

const getFilterOptionClassName = isSelected => {
  const classNames = [
    'flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded px-0.5 py-2',
    'text-sm leading-[1.5] text-[color:var(--pamo-color-text-primary)]',
    'hover:bg-[var(--pamo-color-surface-subtle)]'
  ];

  if (isSelected) {
    classNames.push(
      'bg-[var(--pamo-color-surface-subtle)] font-semibold text-[color:var(--pamo-color-accent-text)]'
    );
  }

  return classNames.join(' ');
};

const CollectionFilters = ({
  genders,
  programs,
  merchandiseCategories,
  genderOptions,
  programOptions,
  merchandiseOptions,
  categoriesLoading,
  categoryError,
  onRetryCategories,
  onToggle,
  drawer = false,
}) => {
  const groups = [
    ['gender', 'Gender', genderOptions, genders],
    ['program', 'Academic program', programOptions, programs],
    ['merchandise', 'Merchandise category', merchandiseOptions, merchandiseCategories],
  ];

  return (
    <div>
      {groups.map(([key, title, options, selected]) => (
      <details key={key} className='collection-filter-group pt-3' open>
        <summary className='flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded text-[13px] font-medium leading-[1.5]'>
          {title}
          <ChevronDown size={18} strokeWidth={1.75} aria-hidden='true'/>
        </summary>
        <fieldset>
          <legend className='sr-only'>{title}</legend>
          <div className={'mt-2 grid ' + (drawer ? 'grid-cols-2 gap-x-3 gap-y-2' : 'gap-1.5')}>
            {options.map(({ value, label }) => {
              const isSelected = selected.includes(value);

              return (
                <label key={value} className={getFilterOptionClassName(isSelected)}>
                  <input type='checkbox' value={value} checked={isSelected} onChange={() => onToggle(key, value)} className='h-[18px] w-[18px] shrink-0 accent-[var(--pamo-color-brand-yellow)]'/>
                  <span>{label}</span>
                </label>
              );
            })}
            {key === 'merchandise' && categoriesLoading && (
              <p role='status' className='col-span-full py-2 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]'>Loading categories...</p>
            )}
            {key === 'merchandise' && !categoriesLoading && !categoryError && options.length === 0 && (
              <p className='col-span-full py-2 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]'>No merchandise categories available.</p>
            )}
          </div>
        </fieldset>
      </details>
      ))}
      {categoryError && (
      <div className='mt-3 rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-3 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]' role='alert'>
        <p>New category options are unavailable. Legacy filters still work.</p>
        <button type='button' className='mt-2 min-h-11 font-semibold text-[color:var(--pamo-color-accent-text)] underline underline-offset-4' onClick={onRetryCategories}>Try again</button>
      </div>
      )}
    </div>
  );
};

export default CollectionFilters;
