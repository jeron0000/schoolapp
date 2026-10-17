import { useTheme } from '../hooks/useTheme'
import { Moon, Sun } from 'lucide-react'

const ThemeToggle = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button type='button' role='switch' aria-checked={isDark} aria-label='Dark mode' title={label} onClick={toggleTheme} className={'group inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:focus-visible:outline-amber-400 ' + className}>
      <span className='relative h-8 w-14 rounded-full bg-slate-100 ring-1 ring-inset ring-slate-500 transition-colors duration-150 group-hover:bg-slate-200 dark:bg-slate-800 dark:ring-slate-500 dark:group-hover:bg-slate-700 motion-reduce:transition-none' aria-hidden='true'>
        <span className={'absolute left-1 top-1 h-6 w-6 rounded-full bg-amber-100 ring-1 ring-inset ring-amber-700 transition-transform duration-150 ease-out dark:bg-amber-400 dark:ring-amber-400 motion-reduce:transition-none ' + (isDark ? 'translate-x-6' : 'translate-x-0')}/>
        <span className='absolute inset-1 grid grid-cols-2 place-items-center'>
          <Sun size={18} strokeWidth={1.75} aria-hidden='true' className={isDark ? 'text-slate-400' : 'text-amber-900'} />
          <Moon size={18} strokeWidth={1.75} aria-hidden='true' className={isDark ? 'text-slate-950' : 'text-slate-500'} />
        </span>
      </span>
    </button>
  )
}

export default ThemeToggle
