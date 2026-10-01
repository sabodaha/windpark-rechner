import type { MetadataRoute } from "next";
import { PUBLISHED_LOCALES } from "@/lib/i18n";
import { absoluteUrl, alternates, PAGE_PATHS, SITE, SITEMAP } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLISHED_LOCALES.flatMap((locale) =>
    SITEMAP.map((p) => {
      const languages = alternates(p.page);
      return {
        url: absoluteUrl(PAGE_PATHS[locale][p.page]),
        lastModified: SITE.updated,
        changeFrequency: "monthly" as const,
        priority: p.priority,
        ...(languages && { alternates: { languages: Object.fromEntries(Object.entries(languages).map(([k, v]) => [k, absoluteUrl(v)])) } }),
      };
    }),
  );
}
