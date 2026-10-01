// Site-wide facts: canonical address, author, pages and structured data (schema.org JSON-LD).
import { PUBLISHED_LOCALES, type Locale } from "./i18n";

export const SITE = {
  url: "https://igorsabodakha.com",
  name: "Igor Sabodakha",
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

const PAGE_IDS = Object.keys(PAGE_PATHS.en) as PageId[];

/**
 * The pages built in each language. The German report's print view follows with the German report (DE5); until
 * then its links lead to the English one.
 */
export const LOCALE_PAGES: Record<Locale, readonly PageId[]> = {
  en: PAGE_IDS,
  de: ["home", "calculator", "methodology", "sources", "about", "impressum", "privacy"],
};

export const hasPage = (locale: Locale, page: PageId) => LOCALE_PAGES[locale].includes(page);

/** Every address of the site for one language: its pages (the English one where it has none yet) and the downloads. */
export function paths(locale: Locale) {
  const pages = Object.fromEntries(PAGE_IDS.map((id) => [id, PAGE_PATHS[hasPage(locale, id) ? locale : "en"][id]])) as Record<PageId, string>;
  return {
    ...pages,
    // The workbook and the PDF stay English until the German ones exist (phases DE5–DE6).
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

/** hreflang alternates of a page across the published languages that have it (none while only one has it). */
export function alternates(page: PageId): Record<string, string> | undefined {
  const locales = PUBLISHED_LOCALES.filter((l) => hasPage(l, page));
  if (locales.length < 2) return undefined;
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[locale] = PAGE_PATHS[locale][page];
  languages["x-default"] = PAGE_PATHS.en[page];
  return languages;
}

export const absoluteUrl = (path: string) => `${SITE.url}${path}`;

export const PERSON_ID = `${SITE.url}/#person`;
export const WEBSITE_ID = `${SITE.url}/#website`;
export const CALCULATOR_ID = `${absoluteUrl(PATHS.calculator)}#app`;

/** The person in the words of one language; the same @id on every page. */
const PERSON_TEXT: Record<Locale, { jobTitle: string; knowsAbout: string[] }> = {
  en: { jobTitle: SITE.jobTitle, knowsAbout: ["Financial modelling", "Project finance", "Business valuation", "Due diligence", "Audit"] },
  de: {
    jobTitle: "Finanzfachmann",
    knowsAbout: ["Finanzmodellierung", "Projektfinanzierung", "Unternehmensbewertung", "Due Diligence", "Wirtschaftsprüfung"],
  },
};

export function personJsonLd(locale: Locale = "en") {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: SITE.name,
    url: absoluteUrl(PAGE_PATHS[locale].about),
    jobTitle: PERSON_TEXT[locale].jobTitle,
    address: { "@type": "PostalAddress", addressLocality: SITE.city, addressCountry: SITE.countryCode },
    knowsAbout: PERSON_TEXT[locale].knowsAbout,
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
