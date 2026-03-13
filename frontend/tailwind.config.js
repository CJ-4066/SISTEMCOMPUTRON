/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eefbf8',
          100: '#d2f5ed',
          200: '#a8e9db',
          300: '#77d8c4',
          400: '#45bda8',
          500: '#2ca38f',
          600: '#1f8273',
          700: '#1c685d',
          800: '#1b534b',
          900: '#1a463f',
        },
        accent: {
          50: '#fff8ed',
          100: '#ffedcc',
          200: '#ffd897',
          300: '#ffc05f',
          400: '#ffa32f',
          500: '#f98617',
          600: '#dd670f',
          700: '#b74b10',
          800: '#943b14',
          900: '#793214',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 12px 28px rgba(28, 104, 93, 0.14)',
      },
    },
  },
  plugins: [],
};
