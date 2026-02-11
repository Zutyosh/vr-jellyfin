/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./client/**/*.{js,jsx,ts,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom dark theme palette
        background: '#0f0f0f',
        surface: '#1a1a1a',
        primary: '#00a8ff',
        secondary: '#e50914', // Netflix-like red
      },
      gridTemplateColumns: {
        'card-sm': 'repeat(auto-fill, minmax(140px, 1fr))',
        'card-md': 'repeat(auto-fill, minmax(180px, 1fr))',
      }
    },
  },
  plugins: [],
}
