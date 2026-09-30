import type { MetadataRoute } from "next";
import { absoluteUrl, SITE, SITEMAP } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP.map((p) => ({
    url: absoluteUrl(p.path),
    lastModified: SITE.updated,
    changeFrequency: "monthly",
    priority: p.priority,
  }));
}
