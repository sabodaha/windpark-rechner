import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { MESSAGES } from "@/messages";
import { LocaleProvider } from "./LocaleProvider";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

// Downloaded at build time and served from this site: no request to Google when the page runs.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

/** The HTML document of every page of one language: lang attribute, skip link, header, content, footer. */
export function SiteDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={locale} className={inter.variable}>
      <body className="flex min-h-dvh flex-col antialiased">
        <a
          href="#content"
          className="no-print sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          {MESSAGES[locale].site.skip}
        </a>
        <LocaleProvider locale={locale}>
          <SiteHeader locale={locale} />
          <main id="content" className="flex-1">
            {children}
          </main>
          <SiteFooter locale={locale} />
        </LocaleProvider>
      </body>
    </html>
  );
}
