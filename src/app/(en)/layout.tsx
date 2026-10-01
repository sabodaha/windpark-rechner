import type { ReactNode } from "react";
import { SiteDocument } from "@/components/site/SiteDocument";
import { rootMetadata, ROOT_VIEWPORT } from "@/lib/metadata";
import "../globals.css";

// Root layout of the English pages (the root of the site). The German pages under /de/ have their own, with
// lang="de": a page's language is set in its static HTML.
export const metadata = rootMetadata("en");
export const viewport = ROOT_VIEWPORT;

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return <SiteDocument locale="en">{children}</SiteDocument>;
}
