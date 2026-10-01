import Link from "next/link";
import { Fragment } from "react";
import { JsonLd } from "@/components/site/JsonLd";
import { Typeset } from "@/components/site/Typeset";
import { assumptionsByGroup, inputsCiting, sourceGroups, type SourceGroupId } from "@/content/sources";
import { DATA_AS_OF, SOURCES } from "@/engine";
import { FORMAT } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { absoluteUrl, breadcrumbJsonLd, graph, paths, PERSON_ID, SITE } from "@/lib/site";
import { de } from "@/messages/de";

const P = paths("de");
const { dateLabel } = FORMAT.de;

const TITLE = "Quellen des Windparkmodells";
const DESCRIPTION =
  "Alle öffentlichen Quellen des Windpark-Investitionsrechners – Ausschreibungen der Bundesnetzagentur, EEG 2023, " +
  "Kosten der Deutschen WindGuard, KfW-Konditionen, Marktwerte, Steuerrecht – mit Datum und den Eingaben, die sie belegen.";

export const metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: P.sources });

const GROUPS: Record<SourceGroupId, { id: string; title: string }> = {
  tenders: { id: "ausschreibungen-eeg", title: "Ausschreibungen und EEG" },
  prices: { id: "strompreise-marktwerte", title: "Strompreise und Marktwerte" },
  costs: { id: "kosten-standort-energieertrag", title: "Kosten, Standort und Energieertrag" },
  financing: { id: "finanzierung", title: "Finanzierung" },
  tax: { id: "steuern", title: "Steuern und Umsatzsteuer" },
  valuation: { id: "inflation-bewertung", title: "Inflation und Bewertung" },
  other: { id: "sonstige", title: "Sonstige" },
};

export default function QuellenPage() {
  const groups = sourceGroups().map((g) => ({ ...g, ...GROUPS[g.id] }));
  const assumptions = assumptionsByGroup("de");
  const total = Object.keys(SOURCES).length;

  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "WebPage",
            "@id": `${absoluteUrl(P.sources)}#webpage`,
            url: absoluteUrl(P.sources),
            name: TITLE,
            description: DESCRIPTION,
            inLanguage: "de",
            author: { "@id": PERSON_ID },
            dateModified: SITE.updated,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: P.home },
            { name: de.meta.title, path: P.calculator },
            { name: "Quellen", path: P.sources },
          ]),
        )}
      />
      <Typeset>
        <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
          <p className="text-sm font-medium text-muted-foreground">
            <Link href={P.calculator} className="!text-muted-foreground !no-underline hover:!underline">
              {de.meta.title}
            </Link>{" "}
            · Quellen
          </p>
          <h1 className="!mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
          <p className="text-lg">
            Der Basisfall stützt sich auf {total} öffentliche Quellen, alle geprüft am {dateLabel(DATA_AS_OF)}. Jeder
            Eintrag zeigt das Datum der Quelle und die Eingaben, die sie belegt. Wo es keinen aktuellen öffentlichen Wert
            gibt, ist die Eingabe eine dokumentierte Annahme – aufgeführt am Ende. Wie die Eingaben verwendet werden,
            beschreibt die <Link href={P.methodology}>Methodik</Link>.
          </p>

          {groups.map((g) => (
            <section key={g.id} aria-labelledby={g.id}>
              <h2 id={g.id}>{g.title}</h2>
              <ul className="!list-none !pl-0">
                {g.keys.map((key) => {
                  const s = SOURCES[key]!;
                  const used = inputsCiting("de", key);
                  return (
                    <li key={key} className="border-b border-border py-3">
                      <a href={s.url} className="font-medium">
                        {de.sourceTitles[key] ?? s.title}
                      </a>
                      <span className="block text-sm text-muted-foreground">
                        Stand {dateLabel(s.date)}
                        {used.length > 0 && <> · Belegt: {used.join("; ")}</>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <h2 id="annahmen">Annahmen</h2>
          <p>
            Für diese Eingaben gibt es keinen aktuellen öffentlichen Wert, der zum Fall passt. Der Basisfall verwendet eine
            dokumentierte Annahme, oft neben einem öffentlichen Anhaltspunkt; das Tornado-Diagramm und die Szenarien zeigen,
            wie viel jede einzelne ausmacht.
          </p>
          <dl>
            {assumptions.map(([group, labels]) => (
              <Fragment key={group}>
                <dt>{de.groups[group] ?? group}</dt>
                <dd>{labels.join("; ")}</dd>
              </Fragment>
            ))}
          </dl>
        </article>
      </Typeset>
    </>
  );
}
