import Link from "next/link";
import { DE_DATA_AS_OF, DE_UPDATED } from "@/bess/de/data";
import { DE_FIELDS } from "@/bess/de/fields";
import { deEn } from "@/bess/de/messages";
import { DE_SOURCE_GROUPS, DE_SOURCES, type DeSource } from "@/bess/de/sources";
import { bessEn } from "@/bess/messages";
import { JsonLd } from "@/components/site/JsonLd";
import { dateLabel } from "@/lib/format";
import { BESS_DE_OG_IMAGE, pageMetadata } from "@/lib/metadata";
import { absoluteUrl, breadcrumbJsonLd, graph, PATHS, PERSON_ID, SITE } from "@/lib/site";

const TITLE = "Sources of the German battery storage model";
const DESCRIPTION =
  "Every public source behind the Battery Storage Investment Calculator for Germany — Energy-Charts day-ahead prices, " +
  "Bundesnetzagentur determinations, laws, tolling and cost benchmarks, degradation models, financing and macro data — with dates.";

export const metadata = pageMetadata({ title: "German battery storage model sources", description: DESCRIPTION, path: PATHS.bessDeSources, image: BESS_DE_OG_IMAGE });

const GROUP_TITLES: Record<DeSource["group"], string> = {
  prices: "Prices",
  revenue: "Revenue: tolling and trading",
  technology: "Technology",
  costs: "Investment and operating costs",
  grid: "Grid fees and charges",
  finance: "Financing",
  tax: "Tax",
  macro: "Interest rates and inflation",
  law: "Company and insolvency law",
};

/** Inputs whose hint cites a source, by their labels in the calculator. */
function inputsCiting(key: string): string[] {
  return DE_FIELDS.filter((f) => f.sources?.includes(key)).map((f) => deEn.fields[f.id]?.label ?? f.id);
}

export default function GermanBessSourcesPage() {
  const total = Object.keys(DE_SOURCES).length;
  const assumptions = DE_FIELDS.filter((f) => f.sources?.includes("assumption")).map((f) => deEn.fields[f.id]?.label ?? f.id);
  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "WebPage",
            "@id": `${absoluteUrl(PATHS.bessDeSources)}#webpage`,
            url: absoluteUrl(PATHS.bessDeSources),
            name: TITLE,
            description: DESCRIPTION,
            inLanguage: "en",
            author: { "@id": PERSON_ID },
            dateModified: DE_UPDATED,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: bessEn.meta.breadcrumb, path: PATHS.bess },
            { name: deEn.meta.breadcrumb, path: PATHS.bessDe },
            { name: "Sources", path: PATHS.bessDeSources },
          ]),
        )}
      />
      <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
        <p className="text-sm font-medium text-muted-foreground">
          <Link href={PATHS.bessDe} className="!text-muted-foreground !no-underline hover:!underline">
            {deEn.meta.title}
          </Link>{" "}
          · Sources
        </p>
        <h1 className="!mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
        <p className="text-lg">
          The model rests on {total} public sources. Each entry shows the date it was checked or published and what the
          model takes from it. Where no current public value exists, the input is a documented assumption — listed at the
          end. How the inputs are used is described in the <Link href={PATHS.bessDeMethodology}>methodology</Link>.
        </p>

        <h2 id="price-data">Price data</h2>
        <p>
          The revenue rests on the day-ahead prices of the German–Luxembourg bidding zone published by the Bundesnetzagentur
          on SMARD.de and served by Energy-Charts (Fraunhofer ISE) under CC BY 4.0, up to {dateLabel(DE_DATA_AS_OF)}. Since
          1 October 2025 the day-ahead market trades quarter-hours; the model averages them to hours so that both price years
          compare. The site does not republish the price series: it shows only results derived from it — the precomputed
          revenue library and the price statistics on the Revenue tab.
        </p>

        {DE_SOURCE_GROUPS.map((g) => {
          const keys = Object.entries(DE_SOURCES).filter(([, s]) => s.group === g);
          if (keys.length === 0) return null;
          return (
            <section key={g} aria-labelledby={`src-${g}`}>
              <h2 id={`src-${g}`}>{GROUP_TITLES[g]}</h2>
              <ul className="!list-none !pl-0">
                {keys.map(([key, s]) => {
                  const used = inputsCiting(key);
                  return (
                    <li key={key} className="border-b border-border py-3">
                      <a href={s.url} className="font-medium">
                        {s.title}
                      </a>
                      <span className="block text-sm text-muted-foreground">
                        {dateLabel(s.date)} · {s.used}
                        {used.length > 0 && <> Inputs: {used.join("; ")}.</>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <h2 id="assumptions">Assumptions</h2>
        <p>
          These inputs have no current public value that fits the case. The base case uses a documented assumption, often
          next to a public reference point; the sensitivity and the alternative cases show how much each one matters.
        </p>
        <p>{assumptions.join("; ")}.</p>
      </article>
    </>
  );
}
