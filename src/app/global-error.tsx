"use client";

/*
 * Last-resort error boundary. ONLY renders when the root layout itself
 * throws — at which point it REPLACES the root layout, so neither
 * globals.css nor the theme class is applied. Vox red-team note: relying
 * on the design-token classes here would render an UNSTYLED page (another
 * credibility leak), so this surface is deliberately self-sufficient with
 * inline styles and a system font stack. Light, neutral, theme-agnostic.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          color: "#111111",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "2.5rem 1.5rem",
        }}
      >
        <main style={{ maxWidth: "28rem", width: "100%" }}>
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#737373",
              margin: "0 0 0.75rem",
            }}
          >
            Crate · Error
          </p>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              margin: "0 0 0.5rem",
            }}
          >
            Something went wrong.
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#525252",
              margin: "0 0 1.5rem",
            }}
          >
            Crate ran into an unexpected error while loading. Your inventory
            data is safe. Please try again.
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.75rem",
                color: "#a3a3a3",
                margin: "0 0 1.5rem",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              appearance: "none",
              border: "none",
              borderRadius: "0.5rem",
              backgroundColor: "#111111",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
