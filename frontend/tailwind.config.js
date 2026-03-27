/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
   daisyui: {
   theme: {
  extend: {
    colors: {
      muted: '#f4f4f5',
      'muted-foreground': '#71717a',
      foreground: '#0f172a',
    },
  },
},
  },
}
