import { createContext, useContext } from 'react'

export const ThemeContext = createContext(null)

export const useTheme = () => {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeContextProvider')
  return value
}
