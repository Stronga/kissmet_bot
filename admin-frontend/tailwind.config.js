/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#0D9488", dark: "#0F766E", light: "#14B8A6" },
      },
    },
  },
  plugins: [],
};
