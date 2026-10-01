import type { Metadata } from "next";
import Link from "next/link";
import { SiteDocument } from "@/components/site/SiteDocument";
import { Button } from "@/components/ui/button";
import { PUBLISHED_LOCALES } from "@/lib/i18n";
import { rootMetadata, ROOT_VIEWPORT } from "@/lib/metadata";
import { PAGE_PATHS, SITE } from "@/lib/site";
import { MESSAGES } from "@/messages";
import "./globals.css";

// One 404 page for the whole site (two root layouts, English and German): a full document of its own, in English
// with the German text below it.
const t = MESSAGES.en.site.notFound;
const de = MESSAGES.de.site.notFound;

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
        {PUBLISHED_LOCALES.includes("de") && (
          <div lang="de" className="mt-12 border-t border-border pt-8">
            <h2 className="text-xl font-semibold tracking-tight">{de.title}</h2>
            <p className="mt-2 text-muted-foreground">{de.text}</p>
            <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
              <Link href={PAGE_PATHS.de.home} className="text-link hover:underline">
                {de.home} →
              </Link>
              <Link href={PAGE_PATHS.de.calculator} className="text-link hover:underline">
                {de.calculator} →
              </Link>
            </p>
          </div>
        )}
      </section>
    </SiteDocument>
  );
}
