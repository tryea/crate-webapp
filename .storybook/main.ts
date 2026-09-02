import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-themes"],
  framework: { name: "@storybook/react-vite", options: {} },
  // Vite (Storybook's builder) does not read tsconfig `paths`; inject the `@` alias
  // so component imports like `@/shared/lib/utils` resolve outside Next.
  viteFinal: (cfg) =>
    mergeConfig(cfg, {
      resolve: { alias: { "@": resolve(here, "../src") } },
    }),
};

export default config;
