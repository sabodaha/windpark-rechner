import Link from "next/link";
import { JsonLd } from "@/components/site/JsonLd";
import { Placeholder } from "@/components/site/Placeholder";
import { pageMetadata } from "@/lib/metadata";
import { absoluteUrl, breadcrumbJsonLd, CONTACT, graph, PATHS, personJsonLd, SITE } from "@/lib/site";

const TITLE = "About Igor Sabodakha";
const DESCRIPTION =
  "Igor Sabodakha — finance professional in Wiesbaden. Grant Thornton (audit and transaction advisory), independent " +
  "valuation and modelling work, fintech finance, and the Storywell app.";

export const metadata = pageMetadata({ absoluteTitle: TITLE, description: DESCRIPTION, path: PATHS.about, type: "profile" });

const EXPERIENCE: { period: string; role: string; org: string; text: string }[] = [
  {
    period: "2025 – today",
    role: "Founder",
    org: "Dartim Media, Wiesbaden",
    text:
      "Designed, built and published Storywell from scratch — an app of illustrated stories and audiobooks for " +
      "children, on the App Store and Google Play.",
  },
  {
    period: "2018 – 2021",
    role: "Finance & Operations Lead",
    org: "Tradelize, fintech start-up",
    text: "Led finance and operations.",
  },
  {
    period: "2013 – 2018",
    role: "Independent consultant",
    org: "Self-employed",
    text: "Business valuation, financial modelling and documentation for loan financing.",
  },
  {
    period: "2011 – 2013",
    role: "Manager, Transaction Support",
    org: "Grant Thornton Ukraine, Advisory",
    text:
      "Due diligence, valuation models and the information memorandum for an initial public offering on the Warsaw " +
      "Stock Exchange.",
  },
  {
    period: "2006 – 2011",
    role: "Audit, up to Manager",
    org: "Grant Thornton Ukraine, Assurance",
    text: "Audit engagements, rising to manager level.",
  },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "ProfilePage",
            "@id": `${absoluteUrl(PATHS.about)}#webpage`,
            url: absoluteUrl(PATHS.about),
            name: TITLE,
            inLanguage: "en",
            dateModified: SITE.updated,
            mainEntity: personJsonLd(),
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: "About", path: PATHS.about },
          ]),
        )}
      />
      <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">About Igor Sabodakha</h1>
        <p className="text-lg">
          I am a finance professional in {SITE.city} with more than 15 years of international experience in audit,
          transaction advisory, valuation and financial modelling.
        </p>
        <p>
          I spent seven years at Grant Thornton Ukraine: first in audit, up to manager level, then as a manager in
          transaction support — due diligence, valuation models and an IPO information memorandum. As an independent
          consultant I valued businesses and built financial models for loan financing. I then led finance and operations
          at a fintech start-up. Since 2025 I have designed, built and published an app for children, Storywell, on my
          own.
        </p>
        <p>
          The <Link href={PATHS.calculator}>wind farm</Link> and <Link href={PATHS.bess}>battery storage</Link>{" "}
          calculators on this site show how I build a model: every input comes from a dated public source or is a
          documented assumption, the mechanics follow the statutes and lenders’ practice, inputs are validated before any
          calculation, and a set of checks flags funding gaps and covenant breaches. The methodology and all sources of
          each model are published (wind farm: <Link href={PATHS.methodology}>methodology</Link>,{" "}
          <Link href={PATHS.sources}>sources</Link>; battery: <Link href={PATHS.bessMethodology}>methodology</Link>,{" "}
          <Link href={PATHS.bessSources}>sources</Link>), so every result can be traced.
        </p>

        <h2>Experience</h2>
        <ol className="!list-none !pl-0">
          {EXPERIENCE.map((e) => (
            <li key={e.period} className="grid gap-1 border-b border-border py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
              <span className="tabular text-sm text-muted-foreground">{e.period}</span>
              <span>
                <strong>{e.role}</strong> · {e.org}
                <br />
                <span className="text-muted-foreground">{e.text}</span>
              </span>
            </li>
          ))}
        </ol>

        <h2>Storywell</h2>
        <p>
          Illustrated stories and audiobooks for children in eight languages: <a href={SITE.storywell.appStore}>App
          Store</a>, <a href={SITE.storywell.googlePlay}>Google Play</a>, <a href={SITE.storywell.website}>dartim-media.com</a>.
        </p>

        <h2>Contact</h2>
        <p>
          {CONTACT.email ? <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> : <Placeholder what="E-mail address" />}
        </p>
      </article>
    </>
  );
}
