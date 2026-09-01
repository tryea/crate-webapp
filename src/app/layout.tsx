import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import { THEME_SCRIPT } from "@/shared/lib/theme/script";

/**
 * ONE typeface for the whole product. Geist (sans + mono) was the Next.js
 * starter default, and a default typeface is one axis of "looks generated".
 * Archivo is self-hosted as a single variable file (400-700), so there is no
 * second family to fall back to and no network hop to a font CDN.
 *
 * Numerals get `font-variant-numeric: tabular-nums` where they line up in a
 * column; that replaces the old mono family entirely.
 */
const archivo = localFont({
  src: "./fonts/archivo.woff2",
  variable: "--font-archivo",
  weight: "400 700",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Crate, Inventory Management",
  description:
    "Crate is a production-grade inventory management system with transactional stock integrity.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved from the NEXT_LOCALE cookie via i18n/request.ts (DEC-007).
  // NextIntlClientProvider inherits locale + messages from that request
  // config automatically in RSC — no need to pass them as props.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${archivo.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col"
      >
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
