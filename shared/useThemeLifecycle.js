import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const useThemeLifecycle = () => {
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  )
  const hasManualPreference = useRef(document.documentElement.dataset.themePreference !== 'system')

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = (event) => {
      if (!hasManualPreference.current) setTheme(event.matches ? 'dark' : 'light')
    }
    systemTheme.addEventListener('change', onSystemChange)
    return () => systemTheme.removeEventListener('change', onSystemChange)
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    hasManualPreference.current = true
    document.documentElement.dataset.themePreference = nextTheme
    try {
      localStorage.setItem('pamo-theme', nextTheme)
    } catch {
      // Keep the in-session toggle usable when browser storage is unavailable.
    }
    setTheme(nextTheme)
  }

  return { theme, toggleTheme }
}

export default useThemeLifecycle
