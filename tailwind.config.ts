import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;

// Spacing in px (Tailwind's default is rem). Text sizes stay in rem so they follow
// the user's text-size setting, while margins and insets stay fixed, like iOS
// Dynamic Type. Without this, 200% text also doubles every padding.
const SPACING_KEYS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96];
const spacing: Record<string, string> = { px: "1px" };
for (const k of SPACING_KEYS) spacing[String(k)] = `${k * 4}px`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    spacing,
    extend: {
      colors: {
        // Lamplight palette (see app/globals.css)
        ink: v("ink"),
        surface: v("surface"),
        paper: v("paper"),
        sage: v("sage"),
        "sage-hover": v("sage-hover"),
        "on-accent": v("on-accent"),
        lavender: v("lavender"),
        oat: v("oat"),
        clay: v("clay"),
        hairline: v("hairline"),
        // Semantic names
        blue: v("system-blue"),
        green: v("system-green"),
        orange: v("system-orange"),
        red: v("system-red"),
        teal: v("system-teal"),
        indigo: v("system-indigo"),
        gray: v("system-gray"),
        tint: v("tint"),
        "tint-fill": v("tint-fill"),
        "red-text": v("red-text"),
        label: v("label"),
        "label-soft": v("label-soft"),
        "secondary-label": v("secondary-label"),
        "tertiary-label": v("tertiary-label"),
        separator: v("separator"),
        bg: v("system-background"),
        grouped: v("system-grouped-background"),
        cell: v("secondary-grouped-background"),
        "secondary-bg": v("secondary-background"),
        fill: v("system-fill"),
        "blue-tint": v("blue-tint"),
        "green-tint": v("green-tint"),
        "orange-tint": v("orange-tint"),
        "red-tint": v("red-tint"),
        "indigo-tint": v("indigo-tint"),
        "teal-tint": v("teal-tint"),
        bar: v("bar-background"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
      },
      // Lamplight type: Inter throughout, 600–650 for titles, 400 for body, 17px body minimum.
      // In rem so it follows the user's text size.
      fontSize: {
        largeTitle: ["2.375rem", { lineHeight: "1.05", fontWeight: "650", letterSpacing: "-0.01em" }], // 38
        title1: ["2rem", { lineHeight: "1.1", fontWeight: "650", letterSpacing: "-0.01em" }], // 32
        title2: ["1.625rem", { lineHeight: "1.2", fontWeight: "500" }], // 26
        title3: ["1.25rem", { lineHeight: "1.3", fontWeight: "500" }], // 20: section headers
        headline: ["1.1875rem", { lineHeight: "1.35", fontWeight: "400" }], // 19: card titles
        body: ["1.0625rem", { lineHeight: "1.45", fontWeight: "400" }], // 17
        callout: ["1rem", { lineHeight: "1.4", fontWeight: "400" }], // 16
        subheadline: ["1rem", { lineHeight: "1.4", fontWeight: "400" }], // 16: secondary lines
        note: ["0.9375rem", { lineHeight: "1.45", fontWeight: "400" }], // 15: italic asides
        footnote: ["0.875rem", { lineHeight: "1.45", fontWeight: "400" }], // 14
        caption1: ["0.8125rem", { lineHeight: "1.35", fontWeight: "400" }], // 13
        caption2: ["0.75rem", { lineHeight: "1.2", fontWeight: "400" }], // 12: tab labels
      },
      borderRadius: {
        cell: "18px", // list cards
        card: "18px",
        status: "20px", // status cards
        tile: "16px", // tiles, date cards
        button: "16px",
        control: "14px", // small buttons, fields
        sheet: "20px",
      },
      transitionTimingFunction: {
        ios: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      maxWidth: {
        app: "430px",
      },
    },
  },
  plugins: [],
};

export default config;
