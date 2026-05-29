"use client";

import { getStoryblokApi } from "@/shared/integrations/storyblok";

/**
 * Pass-through provider used to expose Storyblok's bridge to client subtrees
 * (e.g. Visual Editor mode). Per DEC-001 (2026-05-29), Storyblok is scoped to
 * a future `/help` route — this provider is NOT wired into the root layout
 * and will only be used inside that route's subtree.
 */
void getStoryblokApi;

export function StoryblokProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
