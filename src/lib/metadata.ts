// Per-page metadata: title, description, canonical URL, Open Graph and Twitter card. Next.js replaces
// nested objects such as openGraph instead of merging them, so every page builds the full set here.
import type { Metadata } from "next";
import { SITE } from "./site";

export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Igor Sabodakha — Wind Farm Investment Calculator",
};

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
  const fullTitle = absoluteTitle ?? `${title} — ${SITE.name}`;
  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      url: path,
      siteName: SITE.name,
      locale: SITE.locale,
      title: fullTitle,
      description,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [OG_IMAGE.url] },
  };
}
