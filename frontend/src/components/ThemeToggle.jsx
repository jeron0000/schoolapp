import { useTheme } from '../hooks/useTheme'

const ThemeToggle = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button type='button' onClick={toggleTheme} className={'icon-button ' + className} aria-label={label} title={label} aria-pressed={theme === 'dark'}>
      <span className='relative h-5 w-5' aria-hidden='true'>
        <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' className='absolute inset-0 h-5 w-5 transition-[transform,opacity] duration-[250ms] dark:rotate-90 dark:scale-75 dark:opacity-0'>
          <circle cx='12' cy='12' r='4'/>
          <path d='M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42'/>
        </svg>
        <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className='absolute inset-0 h-5 w-5 -rotate-90 scale-75 opacity-0 transition-[transform,opacity] duration-[250ms] dark:rotate-0 dark:scale-100 dark:opacity-100'>
          <path d='M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10Z'/>
        </svg>
      </span>
    </button>
  )
}

export default ThemeToggle
