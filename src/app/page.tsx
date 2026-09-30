import Link from "next/link";
import { JsonLd } from "@/components/site/JsonLd";
import { Placeholder } from "@/components/site/Placeholder";
import { Button } from "@/components/ui/button";
import { BASE, BASE_CASE, BID_AT_COST_OF_EQUITY, TENDER_FACTS } from "@/content/baseCase";
import { ct, num, pct, ratio } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { absoluteUrl, CONTACT, graph, PATHS, PERSON_ID, personJsonLd, SITE, WEBSITE_ID, websiteJsonLd } from "@/lib/site";

const TITLE = "Igor Sabodakha — Finance professional in Wiesbaden";
const DESCRIPTION =
  "Igor Sabodakha, finance professional in Wiesbaden: audit, transaction advisory, valuation and financial modelling. " +
  "Open, source-backed project-finance model of a German onshore wind farm.";

export const metadata = pageMetadata({ absoluteTitle: TITLE, description: DESCRIPTION, path: PATHS.home });

const FEATURES: { title: string; text: string }[] = [
  {
    title: "Revenue under EEG 2023",
    text:
      "Sliding market premium on the annual market value, the § 36h correction factor, no premium at negative prices, " +
      "market sales or a PPA after support ends — and the two-sided premium of the EEG 2027 draft as a switch.",
  },
  {
    title: "Debt the way German lenders size it",
    text:
      "KfW programme 270 at the current rate, linear repayment after grace years, DSCR targets for P50 and P90 on the " +
      "EEG floor, a gearing cap, a debt service reserve and a distribution lock-up.",
  },
  {
    title: "German taxes",
    text:
      "Trade tax with add-backs, allowance and loss carry-forward; corporate tax and solidarity surcharge for a GmbH; " +
      "16-year depreciation and a tax provision for decommissioning.",
  },
  {
    title: "Construction and funding",
    text:
      "Monthly capex with payment profiles, a VAT bridge loan, upfront and commitment fees and interest during " +
      "construction. Sources equal uses to the cent.",
  },
  {
    title: "Risk views",
    text:
      "P90 and downside cases with the loan held fixed, a tornado of twelve drivers and a bid calculator that finds the " +
      "award price for a target return.",
  },
  {
    title: "Open and checked",
    text:
      "Every input has a unit, a hint and a dated public source. Fifteen integrity checks run on every recalculation, " +
      "and the results export to Excel.",
  },
];

export default function Home() {
  const base = BASE.base.kpis;
  const bid = BID_AT_COST_OF_EQUITY.awardPriceCt;
  const kpis: { label: string; value: string }[] = [
    { label: "Equity IRR", value: pct(base.equityIrr, 2) },
    { label: "Project IRR after tax", value: pct(base.projectIrrPostTax, 2) },
    { label: "LCOE (real)", value: ct(base.lcoeRealCt) },
    { label: "Minimum DSCR", value: ratio(base.minDscr) },
  ];
  return (
    <>
      <JsonLd
        data={graph(websiteJsonLd(), personJsonLd(), {
          "@type": "WebPage",
          "@id": `${absoluteUrl(PATHS.home)}#webpage`,
          url: absoluteUrl(PATHS.home),
          name: TITLE,
          description: DESCRIPTION,
          isPartOf: { "@id": WEBSITE_ID },
          about: { "@id": PERSON_ID },
          inLanguage: "en",
          dateModified: SITE.updated,
        })}
      />

      <section className="mx-auto w-full max-w-[1100px] px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
        <p className="text-sm font-medium text-muted-foreground">Finance professional · Wiesbaden, Germany</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Igor Sabodakha</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/85 sm:text-xl">
          Audit, transaction advisory, valuation and financial modelling — more than 15 years of international experience,
          seven of them at Grant Thornton.
        </p>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          This site publishes an open project-finance model of a German onshore wind farm. Every input has a public
          source, every formula is documented, and the whole calculation runs in your browser.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href={PATHS.calculator}>Open the calculator</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={PATHS.about}>About me</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="featured" className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
        <div className="rounded-xl border border-border bg-card p-5 sm:p-7">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Featured model</p>
          <h2 id="featured" className="mt-1 text-2xl font-semibold tracking-tight">
            Wind Farm Investment Calculator
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fictional wind farm “Musterhöhe” · {BASE_CASE.project.turbines} × {num(BASE_CASE.project.turbineMw, 1)} MW ·
            Hesse, Germany · base case at the tender price of August 2026
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{k.label}</dt>
                <dd className="text-lg font-semibold tabular">{k.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 rounded-lg bg-muted px-4 py-3.5">
            <h3 className="font-semibold">What the base case shows</h3>
            <p className="mt-1.5 leading-relaxed text-foreground/85">
              At the average award of the August 2026 tender, {ct(TENDER_FACTS.lastRoundAverageCt)}, a site of average
              Hessian quality earns {pct(base.equityIrr, 1)} a year on equity — well below a typical{" "}
              {pct(BASE_CASE.macro.costOfEquity, 0)} cost of equity. Lenders size the loan on the guaranteed EEG floor, so
              debt covers only {pct(base.gearing, 0)} of the investment.{" "}
              {bid !== null && (
                <>
                  An equity return of {pct(BASE_CASE.macro.costOfEquity, 0)} would need an award of about {ct(bid)} —
                  above the 2026 ceiling of {ct(TENDER_FACTS.ceiling2026Ct)}.
                </>
              )}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
            <Link href={PATHS.calculator} className="text-link hover:underline">
              Open the calculator →
            </Link>
            <Link href={PATHS.methodology} className="text-link hover:underline">
              How the model works →
            </Link>
            <Link href={PATHS.sources} className="text-link hover:underline">
              All sources →
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="covers" className="mx-auto w-full max-w-[1100px] px-4 pt-12 sm:px-6">
        <h2 id="covers" className="text-xl font-semibold tracking-tight">
          What the model covers
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="storywell" className="mx-auto w-full max-w-[1100px] px-4 pt-12 sm:px-6">
        <h2 id="storywell" className="text-xl font-semibold tracking-tight">
          Also built by me: Storywell
        </h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
          Illustrated stories and audiobooks for children in eight languages. I designed, built and published the app
          from scratch.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
          <a href={SITE.storywell.appStore} className="text-link hover:underline">
            App Store →
          </a>
          <a href={SITE.storywell.googlePlay} className="text-link hover:underline">
            Google Play →
          </a>
          <a href={SITE.storywell.website} className="text-link hover:underline">
            dartim-media.com →
          </a>
        </p>
      </section>

      <section aria-labelledby="contact" className="mx-auto w-full max-w-[1100px] px-4 pt-12 sm:px-6">
        <h2 id="contact" className="text-xl font-semibold tracking-tight">
          Contact
        </h2>
        <p className="mt-2 text-muted-foreground">
          {CONTACT.email ? (
            <a href={`mailto:${CONTACT.email}`} className="font-medium text-link hover:underline">
              {CONTACT.email}
            </a>
          ) : (
            <Placeholder what="E-mail address" />
          )}
        </p>
      </section>
    </>
  );
}
