/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../shared/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        amber: { 300: '#ffe04d', 400: '#ffd100', 500: '#d9b200' },
        emerald: { 300: '#22c55e', 400: '#22c55e', 500: '#22c55e', 700: '#15803d' },
        blue: { 50: '#f0f9ff', 300: '#38bdf8', 400: '#0ea5e9', 500: '#0ea5e9', 700: '#0369a1' },
        violet: { 50: '#f0f9ff', 300: '#38bdf8', 400: '#0ea5e9', 700: '#0369a1' },
        orange: { 50: '#fffbeb', 300: '#ffe04d', 400: '#ffd100', 700: '#b45309' },
      },
      backgroundColor: { 'gray-50': '#f8fafc' },
      textColor: { 'slate-100': '#ffffff', 'slate-300': '#94a3b8' },
      outlineColor: {
        'amber-400': 'var(--pamo-color-focus)',
        'amber-500': 'var(--pamo-color-focus)',
      },
    },
  },
  plugins: [],
}
