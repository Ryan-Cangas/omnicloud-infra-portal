/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        zinc: {
          950: "#09090b",
          900: "#121215",
          800: "#27272a",
        },
        emerald: {
          500: "#10b981",
          400: "#34d399",
        },
      },
    },
  },
  plugins: [],
};
