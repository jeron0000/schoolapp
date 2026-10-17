import useThemeLifecycle from '../../../shared/useThemeLifecycle'
import { ThemeContext } from '../hooks/useTheme'

const ThemeContextProvider = ({ children }) => {
  const value = useThemeLifecycle()

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export default ThemeContextProvider
