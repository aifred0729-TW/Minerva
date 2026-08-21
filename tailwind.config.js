/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Minerva Cyberpunk Palette (CSS-variable driven for dark/light)
        void: "rgb(var(--color-void) / <alpha-value>)",        // 背景
        signal: "rgb(var(--color-signal) / <alpha-value>)",    // 高亮/文字 (Dynamic)
        accent: "rgb(var(--color-accent) / <alpha-value>)",    // 強調色 (Dynamic)
        ghost: "rgb(var(--color-ghost) / <alpha-value>)",      // 邊框/次要
        machine: "rgb(var(--color-machine) / <alpha-value>)",  // 卡片背景
        error: "#FFFFFF",     // 錯誤
        // Login HUD scheme (see index.css) — login screen only.
        "hud-field": "rgb(var(--color-hud-field) / <alpha-value>)",
        "hud-route": "rgb(var(--color-hud-route) / <alpha-value>)",
        "hud-trace": "rgb(var(--color-hud-trace) / <alpha-value>)",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'], // 數據顯示
        sans: ['"Inter"', 'sans-serif'],         // UI 介面
      },
      backgroundImage: {
        'scanlines': "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))",
      }
    },
  },
  plugins: [],
}
