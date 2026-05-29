"use client";

import { getStoryblokApi } from "@/lib/storyblok";

/**
 * Pass-through provider used to expose Storyblok's bridge to client subtrees
 * (e.g. Visual Editor mode). Currently only ensures the SDK is referenced
 * client-side — wire into the root layout when DEC-001 confirms Storyblok is
 * the content store for catalog assets (product images / marketing pages).
 */
void getStoryblokApi;

export function StoryblokProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
