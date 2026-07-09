/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // צבעי המותג: טורקיז מרקו קאירי + צבעי הבלוקים מהטפסים הקיימים
        brand: {
          DEFAULT: '#1F6E6B',
          dark: '#14504E',
          light: '#E6F2F1',
        },
        block: {
          customer: '#2743C7',  // פרטי לקוח (כחול)
          curtains: '#7C3AED',  // מידות וילונות (סגול)
          shading: '#EA8C1F',   // זברות/גלילה (כתום)
          payment: '#1E9E4C',   // תשלום (ירוק)
        },
      },
      fontFamily: {
        sans: ['Heebo', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
