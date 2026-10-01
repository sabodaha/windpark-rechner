// The site's languages. English stays at the root (its addresses are indexed); German lives under /de/ with German
// words in its addresses. Each page has one address per language (PAGE_PATHS in site.ts).

export type Locale = "en" | "de";
export const LOCALES: readonly Locale[] = ["en", "de"];

/** Locales whose pages are built and linked (language switcher, hreflang, sitemap). */
export const PUBLISHED_LOCALES: readonly Locale[] = ["en", "de"];

/** Number and date formats: en-GB for English, de-DE for German. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", de: "de-DE" };

/** Open Graph locale. */
export const OG_LOCALE: Record<Locale, string> = { en: "en_GB", de: "de_DE" };

/** Language names in their own language, for the switcher. */
export const LANGUAGE_NAME: Record<Locale, string> = { en: "English", de: "Deutsch" };
