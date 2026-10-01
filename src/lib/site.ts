// Site-wide facts: canonical address, author, pages and structured data (schema.org JSON-LD).
import { PUBLISHED_LOCALES, type Locale } from "./i18n";

export const SITE = {
  url: "https://igorsabodakha.com",
  name: "Igor Sabodakha",
  locale: "en_GB",
  jobTitle: "Finance professional",
  city: "Wiesbaden",
  countryCode: "DE",
  /** Profiles that identify the same person. LinkedIn follows once its name and URL are corrected. */
  sameAs: [
    "https://github.com/sabodaha",
    "https://dartim-media.com/",
    "https://apps.apple.com/app/id6759845142",
    "https://play.google.com/store/apps/details?id=com.dartim_media.storywell",
  ],
  repository: "https://github.com/sabodaha/windpark-rechner",
  storywell: {
    appStore: "https://apps.apple.com/app/id6759845142",
    googlePlay: "https://play.google.com/store/apps/details?id=com.dartim_media.storywell",
    website: "https://dartim-media.com/",
  },
  /** Last content change of the site (sitemap lastmod, dateModified); the data date is DATA_AS_OF. */
  updated: "2026-10-01",
} as const;

/**
 * Contact details for the legal notice and the privacy policy, published with Igor's consent (30 Sep 2026):
 * the address of his dartim-media.com legal notice and his e-mail; no phone. A field left null shows a visible
 * placeholder, and `npm run check:launch` blocks the release.
 */
export const CONTACT: { addressLines: string[] | null; email: string | null; phone: string | null } = {
  addressLines: ["Gneisenaustraße 24", "65195 Wiesbaden"],
  email: "igor.sabodakha@gmail.com",
  phone: null,
};

export type PageId = "home" | "calculator" | "methodology" | "sources" | "report" | "about" | "impressum" | "privacy";

/** One address per page and language: English at the root, German under /de/ with German words (decision G01). */
export const PAGE_PATHS: Record<Locale, Record<PageId, string>> = {
  en: {
    home: "/",
    calculator: "/wind-farm-calculator/",
    methodology: "/wind-farm-calculator/methodology/",
    sources: "/wind-farm-calculator/sources/",
    /** Print view of the report; the calculator's query gives it the user's inputs. Not in the sitemap. */
    report: "/wind-farm-calculator/report/",
    about: "/about/",
    impressum: "/impressum/",
    privacy: "/privacy/",
  },
  de: {
    home: "/de/",
    calculator: "/de/windpark-rechner/",
    methodology: "/de/windpark-rechner/methodik/",
    sources: "/de/windpark-rechner/quellen/",
    report: "/de/windpark-rechner/bericht/",
    about: "/de/ueber-mich/",
    impressum: "/de/impressum/",
    privacy: "/de/datenschutz/",
  },
};

/** Every address of the site for one language: its pages and the downloads. */
export function paths(locale: Locale) {
  return {
    ...PAGE_PATHS[locale],
    // The print view and the downloads stay English until the German report and workbook exist (phases DE5–DE6).
    report: PAGE_PATHS.en.report,
    workbook: "/wind-farm-calculator/wind-farm-model.xlsx",
    /** The base case as a PDF, printed from the report page and committed to public/ (npm run report:pdf). */
    reportPdf: "/wind-farm-calculator/wind-farm-report.pdf",
  };
}

export const PATHS = paths("en");

/** The page and language of a path ("/de/ueber-mich" or "/de/ueber-mich/"), or null for an unknown path. */
export function pageOf(pathname: string): { page: PageId; locale: Locale } | null {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  for (const locale of Object.keys(PAGE_PATHS) as Locale[]) {
    for (const [page, path] of Object.entries(PAGE_PATHS[locale]) as [PageId, string][]) if (path === p) return { page, locale };
  }
  return null;
}

/** Pages for the sitemap, most important first. */
export const SITEMAP: { page: PageId; priority: number }[] = [
  { page: "home", priority: 1 },
  { page: "calculator", priority: 0.9 },
  { page: "methodology", priority: 0.8 },
  { page: "about", priority: 0.8 },
  { page: "sources", priority: 0.6 },
  { page: "impressum", priority: 0.2 },
  { page: "privacy", priority: 0.2 },
];

/** hreflang alternates of a page across the published languages (none while only English is published). */
export function alternates(page: PageId): Record<string, string> | undefined {
  if (PUBLISHED_LOCALES.length < 2) return undefined;
  const languages: Record<string, string> = {};
  for (const locale of PUBLISHED_LOCALES) languages[locale] = PAGE_PATHS[locale][page];
  languages["x-default"] = PAGE_PATHS.en[page];
  return languages;
}

export const absoluteUrl = (path: string) => `${SITE.url}${path}`;

export const PERSON_ID = `${SITE.url}/#person`;
export const WEBSITE_ID = `${SITE.url}/#website`;
export const CALCULATOR_ID = `${absoluteUrl(PATHS.calculator)}#app`;

export function personJsonLd() {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: SITE.name,
    url: absoluteUrl(PATHS.about),
    jobTitle: SITE.jobTitle,
    address: { "@type": "PostalAddress", addressLocality: SITE.city, addressCountry: SITE.countryCode },
    knowsAbout: ["Financial modelling", "Project finance", "Business valuation", "Due diligence", "Audit"],
    sameAs: [...SITE.sameAs],
  };
}

export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: absoluteUrl(PATHS.home),
    name: SITE.name,
    inLanguage: PUBLISHED_LOCALES.length > 1 ? [...PUBLISHED_LOCALES] : PUBLISHED_LOCALES[0],
    publisher: { "@id": PERSON_ID },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

/** A JSON-LD document with several nodes. */
export function graph(...nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}
