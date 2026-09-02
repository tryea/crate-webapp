"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/shared/lib/theme/use-theme";

/**
 * Theme swap as a WIPE, never a colour interpolation.
 *
 * Interpolating the palette makes text and background pass each other through
 * mid-grey, and for a frame or two the words disappear. A View Transition
 * wipes a circle out of this button instead: every pixel is either the old
 * colour or the new one, never an average of the two. The rate is deliberately
 * `linear`, the mask sweeps space, it is not an object with mass, so easing
 * out reads as a stutter.
 *
 * Browsers without startViewTransition, and anyone on prefers-reduced-motion,
 * get the instant swap.
 */
export function ThemeToggle() {
  const { resolvedDark, setTheme } = useTheme();

  function swap(event: React.MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!document.startViewTransition || reduce) {
      setTheme(next);
      return;
    }

    const r = event.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const end = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    document
      .startViewTransition(() => setTheme(next))
      .ready.then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${end}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 380,
            easing: "linear",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      });
  }

  return (
    <button
      type="button"
      className="iconbtn"
      onClick={swap}
      aria-label={
        resolvedDark ? "Switch to light theme" : "Switch to dark theme"
      }
    >
      <Moon className="ic i-moon" strokeWidth={1.75} aria-hidden="true" />
      <Sun className="ic i-sun" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
