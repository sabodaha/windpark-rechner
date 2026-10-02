import Link from "next/link";
import { BESS_DATA_AS_OF, BESS_UPDATED } from "@/bess/data";
import { BESS_FIELDS } from "@/bess/fields";
import { bessEn } from "@/bess/messages";
import { BESS_SOURCE_GROUPS, BESS_SOURCES, type BessSource } from "@/bess/sources";
import { JsonLd } from "@/components/site/JsonLd";
import { dateLabel } from "@/lib/format";
import { BESS_OG_IMAGE, pageMetadata } from "@/lib/metadata";
import { absoluteUrl, breadcrumbJsonLd, graph, PATHS, PERSON_ID, SITE } from "@/lib/site";

const TITLE = "Sources of the battery storage model";
const DESCRIPTION =
  "Every public source behind the Battery Storage Investment Calculator for Ukraine — Market Operator prices, NEURC " +
  "tariffs, laws and resolutions, cost benchmarks, degradation models, financing and macro data — with dates.";

export const metadata = pageMetadata({ title: "Battery storage model sources", description: DESCRIPTION, path: PATHS.bessSources, image: BESS_OG_IMAGE });

const GROUP_TITLES: Record<BessSource["group"], string> = {
  prices: "Prices",
  technology: "Technology",
  costs: "Investment costs",
  grid: "Grid, tariffs and market rules",
  war: "War risk",
  finance: "Financing and currency rules",
  tax: "Tax and customs",
  macro: "Exchange rates and inflation",
};

/** Inputs whose hint cites a source, by their labels in the calculator. */
function inputsCiting(key: string): string[] {
  return BESS_FIELDS.filter((f) => f.sources?.includes(key)).map((f) => bessEn.fields[f.id]?.label ?? f.id);
}

export default function BessSourcesPage() {
  const total = Object.keys(BESS_SOURCES).length;
  const assumptions = BESS_FIELDS.filter((f) => f.sources?.includes("assumption")).map((f) => bessEn.fields[f.id]?.label ?? f.id);
  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "WebPage",
            "@id": `${absoluteUrl(PATHS.bessSources)}#webpage`,
            url: absoluteUrl(PATHS.bessSources),
            name: TITLE,
            description: DESCRIPTION,
            inLanguage: "en",
            author: { "@id": PERSON_ID },
            dateModified: BESS_UPDATED,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: bessEn.meta.breadcrumb, path: PATHS.bess },
            { name: "Sources", path: PATHS.bessSources },
          ]),
        )}
      />
      <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
        <p className="text-sm font-medium text-muted-foreground">
          <Link href={PATHS.bess} className="!text-muted-foreground !no-underline hover:!underline">
            {bessEn.meta.title}
          </Link>{" "}
          · Sources
        </p>
        <h1 className="!mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
        <p className="text-lg">
          The model rests on {total} public sources. Each entry shows the date it was checked or published and what the
          model takes from it. Where no current public value exists, the input is a documented assumption — listed at the
          end. How the inputs are used is described in the <Link href={PATHS.bessMethodology}>methodology</Link>.
        </p>

        <h2 id="price-data">Price data</h2>
        <p>
          The revenue rests on the hourly day-ahead prices published by the Market Operator of Ukraine, up to{" "}
          {dateLabel(BESS_DATA_AS_OF)}, converted to euros at the National Bank’s daily rates. The site does not republish
          the hourly series: it shows only results derived from it — the precomputed revenue library and the price
          statistics on the Revenue tab. Neighbouring markets come from Energy-Charts under CC BY 4.0.
        </p>

        {BESS_SOURCE_GROUPS.map((g) => {
          const keys = Object.entries(BESS_SOURCES).filter(([, s]) => s.group === g);
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
