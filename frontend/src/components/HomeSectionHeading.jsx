const headingClass = [
  'flex items-center justify-between gap-6',
  'min-[1180px]:[&>.home-outline-action]:mr-2',
].join(' ')
const eyebrowClass = [
  'home-eyebrow mb-[18px] flex items-center gap-3 text-[11px] font-medium uppercase leading-[1.5]',
  'text-[color:var(--pamo-color-accent-text)] md:mb-5',
  "before:h-[3px] before:w-7 before:shrink-0 before:rounded-sm before:bg-[var(--pamo-color-brand-yellow)] before:content-['']",
].join(' ')
const titleClass = [
  'font-display text-2xl font-semibold leading-[1.3] tracking-[-0.015em]',
  'max-[359px]:text-[22px] md:text-[29px] min-[1180px]:text-[34px]',
].join(' ')
const descriptionClass = [
  'home-section-description mt-[18px] max-w-[65ch] text-sm leading-[1.6]',
  'text-[color:var(--pamo-color-text-secondary)]',
  'min-[1180px]:mt-3.5 min-[1180px]:text-[15px] min-[1180px]:leading-[1.45]',
].join(' ')

const HomeSectionHeading = ({ id, eyebrow, title, description, action }) => (
  <header className={headingClass}>
    <div className='min-w-0'>
      <p className={eyebrowClass}>{eyebrow}</p>
      <h2 id={id} className={titleClass}>
        {title}
      </h2>
      {description && <p className={descriptionClass}>{description}</p>}
    </div>
    {action}
  </header>
)

export default HomeSectionHeading
