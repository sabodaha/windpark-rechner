// Site-wide facts: canonical address, author, pages and structured data (schema.org JSON-LD).

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

export const PATHS = {
  home: "/",
  calculator: "/wind-farm-calculator/",
  workbook: "/wind-farm-calculator/wind-farm-model.xlsx",
  /** Print view of the report; the calculator's query gives it the user's inputs. Not in the sitemap. */
  report: "/wind-farm-calculator/report/",
  /** The base case as a PDF, printed from the report page and committed to public/ (npm run report:pdf). */
  reportPdf: "/wind-farm-calculator/wind-farm-report.pdf",
  methodology: "/wind-farm-calculator/methodology/",
  sources: "/wind-farm-calculator/sources/",
  about: "/about/",
  impressum: "/impressum/",
  privacy: "/privacy/",
} as const;

/** Pages for the sitemap, most important first. */
export const SITEMAP: { path: string; priority: number }[] = [
  { path: PATHS.home, priority: 1 },
  { path: PATHS.calculator, priority: 0.9 },
  { path: PATHS.methodology, priority: 0.8 },
  { path: PATHS.about, priority: 0.8 },
  { path: PATHS.sources, priority: 0.6 },
  { path: PATHS.impressum, priority: 0.2 },
  { path: PATHS.privacy, priority: 0.2 },
];

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
    inLanguage: "en",
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
