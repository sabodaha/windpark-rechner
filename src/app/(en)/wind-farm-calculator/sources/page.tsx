import Link from "next/link";
import { Fragment } from "react";
import { JsonLd } from "@/components/site/JsonLd";
import { assumptionsByGroup, inputsCiting, sourceGroups, type SourceGroupId } from "@/content/sources";
import { DATA_AS_OF, SOURCES } from "@/engine";
import { dateLabel } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { absoluteUrl, breadcrumbJsonLd, graph, PATHS, PERSON_ID, SITE } from "@/lib/site";
import { en } from "@/messages/en";

const TITLE = "Sources of the wind farm model";
const DESCRIPTION =
  "Every public source behind the Wind Farm Investment Calculator — Bundesnetzagentur tenders, EEG 2023, Deutsche " +
  "WindGuard costs, KfW terms, market values, tax law — with dates and the inputs each one supports.";

export const metadata = pageMetadata({ title: "Wind farm model sources", description: DESCRIPTION, path: PATHS.sources });

const GROUP_TITLES: Record<SourceGroupId, string> = {
  tenders: "Tenders and the EEG",
  prices: "Power prices and market values",
  costs: "Costs, site and energy yield",
  financing: "Financing",
  tax: "Tax and VAT",
  valuation: "Inflation and valuation",
  other: "Other",
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function SourcesPage() {
  const groups = sourceGroups().map((g) => ({ ...g, title: GROUP_TITLES[g.id] }));
  const assumptions = assumptionsByGroup("en");
  const total = Object.keys(SOURCES).length;

  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "WebPage",
            "@id": `${absoluteUrl(PATHS.sources)}#webpage`,
            url: absoluteUrl(PATHS.sources),
            name: TITLE,
            description: DESCRIPTION,
            inLanguage: "en",
            author: { "@id": PERSON_ID },
            dateModified: SITE.updated,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: en.meta.title, path: PATHS.calculator },
            { name: "Sources", path: PATHS.sources },
          ]),
        )}
      />
      <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
        <p className="text-sm font-medium text-muted-foreground">
          <Link href={PATHS.calculator} className="!text-muted-foreground !no-underline hover:!underline">
            {en.meta.title}
          </Link>{" "}
          · Sources
        </p>
        <h1 className="!mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
        <p className="text-lg">
          The base case rests on {total} public sources, all checked on {dateLabel(DATA_AS_OF)}. Each entry shows the
          date of the source and the inputs it supports. Where no current public value exists, the input is a documented
          assumption — listed at the end. How the inputs are used is described in the{" "}
          <Link href={PATHS.methodology}>methodology</Link>.
        </p>

        {groups.map((g) => (
          <section key={g.title} aria-labelledby={slug(g.title)}>
            <h2 id={slug(g.title)}>{g.title}</h2>
            <ul className="!list-none !pl-0">
              {g.keys.map((key) => {
                const s = SOURCES[key]!;
                const used = inputsCiting("en", key);
                return (
                  <li key={key} className="border-b border-border py-3">
                    <a href={s.url} className="font-medium">
                      {s.title}
                    </a>
                    <span className="block text-sm text-muted-foreground">
                      Dated {dateLabel(s.date)}
                      {used.length > 0 && <> · Supports: {used.join("; ")}</>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <h2 id="assumptions">Assumptions</h2>
        <p>
          These inputs have no current public value that fits the case. The base case uses a documented assumption,
          often next to a public reference point; the tornado and the scenarios show how much each one matters.
        </p>
        <dl>
          {assumptions.map(([group, labels]) => (
            <Fragment key={group}>
              <dt>{en.groups[group] ?? group}</dt>
              <dd>{labels.join("; ")}</dd>
            </Fragment>
          ))}
        </dl>
      </article>
    </>
  );
}
