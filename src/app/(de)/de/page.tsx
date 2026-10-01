import Link from "next/link";
import { JsonLd } from "@/components/site/JsonLd";
import { Placeholder } from "@/components/site/Placeholder";
import { Button } from "@/components/ui/button";
import { BASE, BASE_CASE, BID_AT_COST_OF_EQUITY, TENDER_FACTS } from "@/content/baseCase";
import { FORMAT } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { absoluteUrl, CONTACT, graph, PERSON_ID, paths, personJsonLd, SITE, WEBSITE_ID, websiteJsonLd } from "@/lib/site";
import { nbsp } from "@/lib/typography";

const P = paths("de");
const { ct, num, pct, ratio } = FORMAT.de;

const TITLE = "Igor Sabodakha – Finanzexperte in Wiesbaden";
const DESCRIPTION =
  "Igor Sabodakha, Finanzexperte in Wiesbaden: Wirtschaftsprüfung, Transaktionsberatung, Unternehmensbewertung und " +
  "Finanzmodellierung. Offenes, mit Quellen belegtes Projektfinanzierungsmodell eines Windparks an Land in Deutschland.";

export const metadata = pageMetadata({ absoluteTitle: TITLE, description: DESCRIPTION, path: P.home });

const FEATURES: { title: string; text: string }[] = [
  {
    title: "Erlöse nach EEG 2023",
    text:
      "Gleitende Marktprämie auf den Jahresmarktwert, Korrekturfaktor nach § 36h, keine Marktprämie bei negativen Preisen, " +
      "Abschläge und Endabrechnung nach § 26, Verkauf am Markt oder über ein PPA nach dem Ende der Förderung – und als " +
      "Schalter ein vereinfachter Stresstest mit zweiseitiger Marktprämie.",
  },
  {
    title: "Darlehen wie ein KfW-Projektkredit",
    text:
      "KfW-Programm 270 zum aktuellen Zinssatz, vierteljährliche Raten nach den tilgungsfreien Jahren, DSCR-Ziele für P50 " +
      "und einjähriges P90 auf der EEG-Untergrenze – eine konservative Sicht der Bank –, eine Obergrenze für die " +
      "Fremdkapitalquote, eine Kapitaldienstreserve und eine Ausschüttungssperre.",
  },
  {
    title: "Deutsche Steuern",
    text:
      "Gewerbesteuer mit Hinzurechnungen, Freibetrag und Verlustvortrag; Körperschaftsteuer und Solidaritätszuschlag für " +
      "eine GmbH; Abschreibung über 16 Jahre und eine steuerliche Rückstellung für den Rückbau.",
  },
  {
    title: "Bau und Finanzierung",
    text:
      "Monatliche Investitionskosten mit Zahlungsprofilen, ein Umsatzsteuerdarlehen zur Überbrückung, Bearbeitungsentgelt " +
      "und Bereitstellungsprovision, Bauzeitzinsen und Anlaufliquidität. Mittelherkunft und Mittelverwendung stimmen auf " +
      "den Cent überein.",
  },
  {
    title: "Risikosichten",
    text:
      "Der einjährige P90-Stresstest der Bank, ein zehnjähriges P90 und ein Downside-Fall mit unverändertem Darlehen, ein " +
      "Tornado-Diagramm mit zwölf Treibern und ein Gebotsrechner, der prüft, ob ein Preis finanzierbar ist und den " +
      "Höchstwert einhält.",
  },
  {
    title: "Offen und geprüft",
    text:
      "Jede Eingabe hat eine Einheit, eine Erläuterung und eine datierte öffentliche Quelle oder eine dokumentierte " +
      "Annahme. Prüfungen von Rechnung, Finanzierung, Covenant und Modellrahmen laufen bei jeder Neuberechnung, und das " +
      "Modell lässt sich als Excel-Arbeitsmappe mit funktionierenden Formeln herunterladen (vorerst auf Englisch).",
  },
];

export default function Home() {
  const base = BASE.base.kpis;
  const bid = BID_AT_COST_OF_EQUITY.feasible?.awardPriceCt ?? null;
  const kpis: { label: string; value: string }[] = [
    { label: "Eigenkapital-IRR", value: pct(base.equityIrr, 2) },
    { label: "Projekt-IRR nach Steuern", value: pct(base.projectIrrPostTax, 2) },
    { label: "Stromgestehungskosten (real)", value: ct(base.lcoeRealCt) },
    { label: "Minimaler DSCR", value: ratio(base.minDscr) },
  ];
  return (
    <>
      <JsonLd
        data={graph(websiteJsonLd(), personJsonLd("de"), {
          "@type": "WebPage",
          "@id": `${absoluteUrl(P.home)}#webpage`,
          url: absoluteUrl(P.home),
          name: TITLE,
          description: DESCRIPTION,
          isPartOf: { "@id": WEBSITE_ID },
          about: { "@id": PERSON_ID },
          inLanguage: "de",
          dateModified: SITE.updated,
        })}
      />

      <section className="mx-auto w-full max-w-[1100px] px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
        <p className="text-sm font-medium text-muted-foreground">Finanzexperte · Wiesbaden</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Igor Sabodakha</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/85 sm:text-xl">
          {nbsp(
            "Wirtschaftsprüfung, Transaktionsberatung, Unternehmensbewertung und Finanzmodellierung – über 15 Jahre " +
              "internationale Erfahrung, davon sieben Jahre bei Grant Thornton.",
          )}
        </p>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          Diese Website veröffentlicht ein offenes Projektfinanzierungsmodell eines Windparks an Land in Deutschland. Jede
          Eingabe hat eine öffentliche Quelle oder ist eine dokumentierte Annahme, jede Formel ist beschrieben, und die
          gesamte Rechnung läuft in Ihrem Browser.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href={P.calculator}>Zum Rechner</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={P.about}>Über mich</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="featured" className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
        <div className="rounded-xl border border-border bg-card p-5 sm:p-7">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Modell im Fokus</p>
          <h2 id="featured" className="mt-1 text-2xl font-semibold tracking-tight">
            Windpark-Investitionsrechner
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fiktiver Windpark „Musterhöhe“ · {BASE_CASE.project.turbines} × {num(BASE_CASE.project.turbineMw, 1)}&nbsp;MW ·
            Hessen · Basisfall zum Zuschlagswert der Ausschreibung vom August&nbsp;2026
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
            <h3 className="font-semibold">Was der Basisfall zeigt</h3>
            <p className="mt-1.5 leading-relaxed text-foreground/85">
              Beim durchschnittlichen Zuschlagswert der Ausschreibung vom August&nbsp;2026, {ct(TENDER_FACTS.lastRoundAverageCt)},
              erzielt ein Standort mit durchschnittlicher hessischer Standortgüte eine Eigenkapitalrendite von{" "}
              {pct(base.equityIrr, 1)} im Jahr – deutlich unter typischen Eigenkapitalkosten von{" "}
              {pct(BASE_CASE.macro.costOfEquity, 0)}. Die Bank im Modell dimensioniert das Darlehen auf der garantierten
              EEG-Untergrenze – eine konservative Sicht –, deshalb deckt das Darlehen nur {pct(base.gearing, 0)} der
              Investition.{" "}
              {bid !== null && (
                <>
                  Für eine Eigenkapitalrendite von {pct(BASE_CASE.macro.costOfEquity, 0)} wäre ein Zuschlagswert von etwa{" "}
                  {ct(bid)} nötig – über dem Höchstwert 2026 von {ct(TENDER_FACTS.ceiling2026Ct)}.
                </>
              )}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
            <Link href={P.calculator} className="text-link hover:underline">
              Zum Rechner →
            </Link>
            <Link href={P.methodology} className="text-link hover:underline">
              So funktioniert das Modell →
            </Link>
            <Link href={P.sources} className="text-link hover:underline">
              Alle Quellen →
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="covers" className="mx-auto w-full max-w-[1100px] px-4 pt-12 sm:px-6">
        <h2 id="covers" className="text-xl font-semibold tracking-tight">
          Was das Modell abdeckt
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold">{nbsp(f.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{nbsp(f.text)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="storywell" className="mx-auto w-full max-w-[1100px] px-4 pt-12 sm:px-6">
        <h2 id="storywell" className="text-xl font-semibold tracking-tight">
          Ebenfalls von mir: Storywell
        </h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
          Illustrierte Geschichten und Hörbücher für Kinder in acht Sprachen. Die App habe ich von Grund auf konzipiert,
          entwickelt und veröffentlicht.
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
          Kontakt
        </h2>
        <p className="mt-2 text-muted-foreground">
          {CONTACT.email ? (
            <a href={`mailto:${CONTACT.email}`} className="font-medium text-link hover:underline">
              {CONTACT.email}
            </a>
          ) : (
            <Placeholder what="E-Mail-Adresse" locale="de" />
          )}
        </p>
      </section>
    </>
  );
}
