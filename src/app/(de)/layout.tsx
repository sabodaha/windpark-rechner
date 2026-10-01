import type { ReactNode } from "react";
import { SiteDocument } from "@/components/site/SiteDocument";
import { rootMetadata, ROOT_VIEWPORT } from "@/lib/metadata";
import "../globals.css";

// Root layout of the German pages under /de/: lang="de", German texts and number formats.
export const metadata = rootMetadata("de");
export const viewport = ROOT_VIEWPORT;

export default function GermanLayout({ children }: { children: ReactNode }) {
  return <SiteDocument locale="de">{children}</SiteDocument>;
}
