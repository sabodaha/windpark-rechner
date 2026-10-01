import Link from "next/link";
import { JsonLd } from "@/components/site/JsonLd";
import { Placeholder } from "@/components/site/Placeholder";
import { Typeset } from "@/components/site/Typeset";
import { pageMetadata } from "@/lib/metadata";
import { absoluteUrl, breadcrumbJsonLd, CONTACT, graph, paths, personJsonLd, SITE } from "@/lib/site";

const P = paths("de");

const TITLE = "Über Igor Sabodakha";
const DESCRIPTION =
  "Igor Sabodakha – Finanzexperte in Wiesbaden. Grant Thornton (Wirtschaftsprüfung und Transaktionsberatung), " +
  "selbstständige Bewertungs- und Modellierungsprojekte, Finanzen in einem Fintech-Start-up und die App Storywell.";

export const metadata = pageMetadata({ absoluteTitle: TITLE, description: DESCRIPTION, path: P.about, type: "profile" });

const EXPERIENCE: { period: string; role: string; org: string; text: string }[] = [
  {
    period: "2025 – heute",
    role: "Gründer",
    org: "Dartim Media, Wiesbaden",
    text:
      "Storywell von Grund auf konzipiert, entwickelt und veröffentlicht – eine App mit illustrierten Geschichten und " +
      "Hörbüchern für Kinder, im App Store und bei Google Play.",
  },
  {
    period: "2018 – 2021",
    role: "Finance & Operations Lead",
    org: "Tradelize, Fintech-Start-up",
    text: "Leitung des Finanzbereichs und des operativen Geschäfts.",
  },
  {
    period: "2013 – 2018",
    role: "Unabhängiger Berater",
    org: "Selbstständig",
    text: "Unternehmensbewertung, Finanzmodellierung und Unterlagen für Kreditfinanzierungen.",
  },
  {
    period: "2011 – 2013",
    role: "Manager, Transaction Support",
    org: "Grant Thornton Ukraine, Advisory",
    text: "Due Diligence, Bewertungsmodelle und das Informationsmemorandum für einen Börsengang an der Warschauer Börse.",
  },
  {
    period: "2006 – 2011",
    role: "Wirtschaftsprüfung, zuletzt Manager",
    org: "Grant Thornton Ukraine, Assurance",
    text: "Prüfungsmandate mit Aufstieg zum Manager.",
  },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "ProfilePage",
            "@id": `${absoluteUrl(P.about)}#webpage`,
            url: absoluteUrl(P.about),
            name: TITLE,
            inLanguage: "de",
            dateModified: SITE.updated,
            mainEntity: personJsonLd("de"),
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: P.home },
            { name: "Über mich", path: P.about },
          ]),
        )}
      />
      <Typeset>
        <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Über Igor Sabodakha</h1>
          <p className="text-lg">
            Ich bin Finanzexperte in {SITE.city} mit über 15&nbsp;Jahren internationaler Erfahrung in Wirtschaftsprüfung,
            Transaktionsberatung, Unternehmensbewertung und Finanzmodellierung.
          </p>
          <p>
            Sieben Jahre war ich bei Grant Thornton Ukraine: zunächst in der Wirtschaftsprüfung, wo ich zum Manager
            aufstieg, dann als Manager im Transaction Support – Due Diligence, Bewertungsmodelle und ein Informationsmemorandum für einen
            Börsengang. Als unabhängiger Berater habe ich Unternehmen bewertet und Finanzmodelle für Kreditfinanzierungen
            erstellt. Danach habe ich den Finanzbereich und das operative Geschäft eines Fintech-Start-ups geleitet. Seit
            2025 habe ich Storywell, eine App für Kinder, allein konzipiert, entwickelt und veröffentlicht.
          </p>
          <p>
            Der <Link href={P.calculator}>Windpark-Investitionsrechner</Link> auf dieser Website zeigt, wie ich ein Modell
            aufbaue: Jede Eingabe stammt aus einer datierten öffentlichen Quelle oder ist eine dokumentierte Annahme, die
            Berechnungslogik folgt den gesetzlichen Vorgaben und der Praxis der Banken, die Eingaben werden vor jeder
            Berechnung geprüft, und eine Reihe von Prüfungen kennzeichnet Finanzierungslücken und Covenant-Verletzungen.
            Die{" "}
            <Link href={P.methodology}>Methodik</Link> und alle <Link href={P.sources}>Quellen</Link> sind veröffentlicht,
            sodass sich jedes Ergebnis nachvollziehen lässt.
          </p>

          <h2>Berufserfahrung</h2>
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
            Illustrierte Geschichten und Hörbücher für Kinder in acht Sprachen: <a href={SITE.storywell.appStore}>App
            Store</a>, <a href={SITE.storywell.googlePlay}>Google Play</a>, <a href={SITE.storywell.website}>dartim-media.com</a>.
          </p>

          <h2>Kontakt</h2>
          <p>
            {CONTACT.email ? (
              <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            ) : (
              <Placeholder what="E-Mail-Adresse" locale="de" />
            )}
          </p>
        </article>
      </Typeset>
    </>
  );
}
