import { apiPlugin, storyblokInit } from "@storyblok/react/rsc";

/**
 * Storyblok SDK initialization (server-side / RSC entry point).
 *
 * The component registry is intentionally empty for now — DEC-001 (persistence
 * layer) decides in Phase 1 whether Storyblok carries product content. When
 * components are added, register them here:
 *
 *   components: { page: Page, productHero: ProductHero, ... }
 *
 * Region is configurable via STORYBLOK_REGION (default 'eu') so US/AP spaces
 * work without code change.
 */
export const getStoryblokApi = storyblokInit({
  accessToken: process.env.STORYBLOK_DELIVERY_API_TOKEN,
  use: [apiPlugin],
  components: {},
  apiOptions: {
    region:
      (process.env.STORYBLOK_REGION as "eu" | "us" | "ap" | "ca" | "cn") ??
      "eu",
  },
});
