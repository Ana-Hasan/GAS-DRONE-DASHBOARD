export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#111827",
        panelSoft: "#172133",
        ink: "#e5edf7",
        muted: "#8ea0b8",
        accent: "#15c8a8",
        amber: "#f5b84b",
        danger: "#f04438"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(21, 200, 168, .18), 0 18px 60px rgba(0,0,0,.35)"
      }
    },
  },
  plugins: [],
};
