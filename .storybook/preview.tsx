import type { Preview } from "@storybook/react-vite";
import { withThemeByClassName } from "@storybook/addon-themes";

// Tailwind v4 + design tokens. Vite picks up postcss.config.mjs (@tailwindcss/postcss)
// automatically, so importing the app's globals.css is all the styling Storybook needs.
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // a11y violations fail the test-runner (Bima DoD / Nadia WCAG 2.1 AA).
    // `region` is disabled: isolated component stories have no page landmarks
    // (`<main>`/`<nav>`), so the rule fires on #storybook-root as a harness
    // false-positive. color-contrast stays ON — it caught the real light-theme
    // destructive-token AA failure (see DEC-029).
    a11y: {
      test: "error",
      config: { rules: [{ id: "region", enabled: false }] },
    },
  },
  decorators: [
    // Maps to the app's `.dark`-on-<html> Tailwind v4 dark mode (DEFAULT_ELEMENT_SELECTOR="html").
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
    // Render each story on its true themed surface so light/dark are both faithful.
    (Story) => (
      <div className="bg-background text-foreground rounded-lg p-8">
        <Story />
      </div>
    ),
  ],
};

export default preview;
