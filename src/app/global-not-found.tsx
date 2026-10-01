import type { Metadata } from "next";
import Link from "next/link";
import { SiteDocument } from "@/components/site/SiteDocument";
import { Button } from "@/components/ui/button";
import { rootMetadata, ROOT_VIEWPORT } from "@/lib/metadata";
import { PAGE_PATHS, SITE } from "@/lib/site";
import { MESSAGES } from "@/messages";
import "./globals.css";

// One 404 page for the whole site (two root layouts, English and German): a full document of its own.
const t = MESSAGES.en.site.notFound;

export const metadata: Metadata = { ...rootMetadata("en"), title: `${t.title} — ${SITE.name}`, robots: { index: false } };
export const viewport = ROOT_VIEWPORT;

export default function GlobalNotFound() {
  return (
    <SiteDocument locale="en">
      <section className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-3 text-muted-foreground">{t.text}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href={PAGE_PATHS.en.home}>{t.home}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={PAGE_PATHS.en.calculator}>{t.calculator}</Link>
          </Button>
        </div>
      </section>
    </SiteDocument>
  );
}
