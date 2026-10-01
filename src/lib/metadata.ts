// Per-page metadata: title, description, canonical URL, hreflang, Open Graph and Twitter card. Next.js replaces
// nested objects such as openGraph instead of merging them, so every page builds the full set here.
import type { Metadata, Viewport } from "next";
import { MESSAGES } from "@/messages";
import { OG_LOCALE, PUBLISHED_LOCALES, type Locale } from "./i18n";
import { alternates, PAGE_PATHS, pageOf, SITE } from "./site";

/** Between a page's title and the site name: an em dash in English, a spaced en dash in German. */
export const TITLE_SEPARATOR: Record<Locale, string> = { en: " — ", de: " – " };

/** What every page of one language inherits from its root layout (and the 404 page from the English one). */
export function rootMetadata(locale: Locale): Metadata {
  return {
    metadataBase: new URL(SITE.url),
    title: { default: SITE.name, template: `%s${TITLE_SEPARATOR[locale]}${SITE.name}` },
    description: MESSAGES[locale].site.footer.about,
    authors: [{ name: SITE.name, url: PAGE_PATHS[locale].about }],
    creator: SITE.name,
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const ROOT_VIEWPORT: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f6f3" };

/** The sharing image of each language (scripts/images: og.html, og.de.html). */
export const OG_IMAGE: Record<Locale, { url: string; width: number; height: number; alt: string }> = {
  en: { url: "/og.png", width: 1200, height: 630, alt: "Igor Sabodakha — Wind Farm Investment Calculator" },
  de: { url: "/og-de.png", width: 1200, height: 630, alt: "Igor Sabodakha – Windpark-Investitionsrechner" },
};

/** The language of a page follows from its address (PAGE_PATHS); its hreflang alternates too. */
export function pageMetadata({
  title,
  absoluteTitle,
  description,
  path,
  type = "website",
}: {
  /** Shown as "{title} — Igor Sabodakha". */
  title?: string;
  /** Used as is (the home page). */
  absoluteTitle?: string;
  description: string;
  path: string;
  type?: "website" | "article" | "profile";
}): Metadata {
  const at = pageOf(path);
  const locale: Locale = at?.locale ?? "en";
  const fullTitle = absoluteTitle ?? `${title}${TITLE_SEPARATOR[locale]}${SITE.name}`;
  const languages = at ? alternates(at.page) : undefined;
  const others = languages ? PUBLISHED_LOCALES.filter((l) => l !== locale && languages[l]) : [];
  const image = OG_IMAGE[locale];
  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    alternates: { canonical: path, ...(languages && { languages }) },
    openGraph: {
      type,
      url: path,
      siteName: SITE.name,
      locale: OG_LOCALE[locale],
      ...(others.length > 0 && { alternateLocale: others.map((l) => OG_LOCALE[l]) }),
      title: fullTitle,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image.url] },
  };
}
