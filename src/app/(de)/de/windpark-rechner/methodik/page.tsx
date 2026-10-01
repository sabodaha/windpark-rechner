import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/site/JsonLd";
import { ProseTable } from "@/components/site/ProseTable";
import { Typeset, typesetNode } from "@/components/site/Typeset";
import { BASE, TENDER_FACTS } from "@/content/baseCase";
import { methodologyFacts, yearSpan } from "@/content/methodology";
import { CORRECTION_FACTOR_TABLE, DATA_AS_OF, P90_Z, SCENARIOS, TORNADO_DRIVERS } from "@/engine";
import { FORMAT } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { settingLabel } from "@/lib/tornado";
import { absoluteUrl, breadcrumbJsonLd, graph, paths, PERSON_ID, SITE } from "@/lib/site";
import { VERIFIED_VARIANTS } from "@/lib/workbook/verification";
import { de } from "@/messages/de";

const P = paths("de");
const { ct, dateLabel, eurCompact, meur, num, pct, ratio } = FORMAT.de;

const TITLE = "So funktioniert das Windparkmodell";
const DESCRIPTION =
  "Methodik des Windpark-Investitionsrechners: Energieertrag, Marktprämie nach EEG 2023, Kosten, KfW-Darlehen nach " +
  "DSCR, Gewerbe- und Körperschaftsteuer, Cashflow-Wasserfall, Kennzahlen, Szenarien und Prüfungen – mit Formeln.";

export const metadata = pageMetadata({ title: "Methodik des Windparkmodells", description: DESCRIPTION, path: P.methodology, type: "article" });

const SECTIONS = [
  ["principles", "Grundsätze"],
  ["timeline", "Zeitplan"],
  ["energy", "Energieertrag"],
  ["revenue", "Erlöse"],
  ["opex", "Betriebskosten"],
  ["investment", "Investition und Finanzierung"],
  ["debt", "Dimensionierung des Darlehens"],
  ["taxes", "Steuern"],
  ["waterfall", "Cashflow-Wasserfall"],
  ["results", "Ergebnisse"],
  ["scenarios", "Szenarien, Sensitivität und Gebotsrechner"],
  ["checks", "Prüfungen und Gültigkeit"],
  ["verification", "Verifikation"],
  ["limitations", "Grenzen des Modells"],
] as const;

function H2({ id, children }: { id: (typeof SECTIONS)[number][0]; children: ReactNode }) {
  return <h2 id={id}>{children}</h2>;
}

/** A table whose cells get the page's no-break spaces too. */
function Table(props: { head: string[]; rows: ReactNode[][]; num?: number[] }) {
  return <ProseTable {...props} rows={props.rows.map((r) => r.map(typesetNode))} />;
}

export default function MethodikPage() {
  const {
    b,
    k,
    tl,
    i,
    f,
    su,
    p90share,
    p90share10,
    siteYield,
    mv,
    instalments,
    firstRepaymentYear,
    financing,
    bid,
    basePremium,
    downsidePremium,
    reviewed,
    negativeBook,
    codMonths,
    unrounded,
    itemsTotal,
    checkGroups,
  } = methodologyFacts();
  const basis = de.overview.basis[b.sizing.bankPriceBasis] ?? "";
  const capexItems = i.capex.items;
  const capexLabel: Record<string, string> = {
    turbine: "Anlagen inkl. Transport und Errichtung",
    foundation: "Fundamente",
    infrastructure: "Wege und Kranstellflächen",
    gridConnection: "Netzanschluss",
    development: "Projektentwicklung und Genehmigung",
    compensation: "Ausgleichsmaßnahmen",
    other: "Sonstiges",
  };
  const profileLabel: Record<string, string> = {
    turbine: "10 % bei Financial Close, 70 % bei Lieferung (4–2 Monate vor Inbetriebnahme), 20 % bei Inbetriebnahme",
    thirds: "40 / 40 / 20 % über die Drittel der Bauzeit",
    atStart: "bei Financial Close",
    linear: "gleichmäßig über die Bauzeit",
  };
  const scenarioText: Record<(typeof SCENARIOS)[number], string> = {
    base: "P50-Erzeugung, Basispreise und -kosten; dimensioniert das Darlehen",
    p90: `Stresstest der Bank: einjährige P90-Erzeugung in jedem Jahr (${pct(p90share, 1)} von P50)`,
    resource: `Zehnjährige P90-Erzeugung in jedem Jahr (${pct(p90share10, 1)}), mit der Überprüfung nach § 36h`,
    downside:
      "Zehnjährige P90-Erzeugung, Marktpreise −20 %, fixe Betriebskosten und Einspeiseentgelt +10 %, Investitionskosten +5 % zulasten der Gesellschafter, mit der Überprüfung nach § 36h",
  };

  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "TechArticle",
            "@id": `${absoluteUrl(P.methodology)}#article`,
            headline: TITLE,
            description: DESCRIPTION,
            url: absoluteUrl(P.methodology),
            inLanguage: "de",
            author: { "@id": PERSON_ID },
            about: { "@id": `${absoluteUrl(P.calculator)}#app` },
            datePublished: SITE.updated,
            dateModified: SITE.updated,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: P.home },
            { name: de.meta.title, path: P.calculator },
            { name: "Methodik", path: P.methodology },
          ]),
        )}
      />
      <div className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 pb-4 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <Typeset>
          <article className="prose-page min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              <Link href={P.calculator} className="!text-muted-foreground !no-underline hover:!underline">
                {de.meta.title}
              </Link>{" "}
              · Methodik
            </p>
            <h1 className="!mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
            <p className="text-lg">
              Diese Seite beschreibt, was der Rechner berechnet, in welcher Reihenfolge und mit welchen Formeln. Der
              Windpark ist fiktiv; jede Eingabe stammt aus einer öffentlichen Quelle oder ist eine dokumentierte Annahme –
              beide sind auf der <Link href={P.sources}>Quellenseite</Link> aufgeführt, geprüft am {dateLabel(DATA_AS_OF)}.
              Die Zahlen unten stammen aus demselben Rechenkern, der im Rechner läuft.
            </p>
            <p className="text-sm text-muted-foreground">{de.header.disclaimer}</p>

            <h2 id="glance">Der Basisfall auf einen Blick</h2>
            <dl>
              <dt>Windpark</dt>
              <dd>
                {i.project.turbines} × {num(i.project.turbineMw, 1)} MW = {num(k.capacityMw, 1)} MW in Hessen, außerhalb
                der Südregion
              </dd>
              <dt>Energieertrag</dt>
              <dd>
                Standortgüte (Gütefaktor) {pct(i.energy.siteQuality, 0)} → {num(k.fullLoadHoursP50, 0)} Volllaststunden
                (P50, netto) → {num((k.capacityMw * k.fullLoadHoursP50) / 1000, 1)} GWh pro Jahr
              </dd>
              <dt>Ausschreibung</dt>
              <dd>
                Zuschlagswert {ct(i.revenue.awardPriceCt)}, Durchschnitt der Runde vom {dateLabel(TENDER_FACTS.lastRoundDate)},
                bekanntgegeben am {dateLabel(i.revenue.awardNoticeDate)} → anzulegender Wert (AW) {ct(k.awCt)}
              </dd>
              <dt>Zeitplan</dt>
              <dd>
                Financial Close {dateLabel(tl.financialClose)} → {i.project.constructionMonths} Monate Bauzeit →
                Inbetriebnahme {dateLabel(tl.cod)} → Ende der Betriebsdauer {dateLabel(tl.endOfLife)} (
                {i.project.lifetimeYears} Jahre)
              </dd>
              <dt>Investition</dt>
              <dd>
                {num(k.capexPerKw, 0)} €/kW netto ohne Umsatzsteuer, {meur(k.capex)}; Mittelverwendung gesamt einschließlich
                Finanzierungskosten, Reserven und Anlaufliquidität {meur(k.totalUses)}
              </dd>
              <dt>Darlehen</dt>
              <dd>
                KfW-Programm 270, {pct(f.interestRate, 2)} fest, {f.tenorYearsFromClose} Jahre ab Financial Close mit{" "}
                {f.graceYears} tilgungsfreien Jahren, {instalments} gleiche vierteljährliche Raten vom{" "}
                {tl.firstInstalment ? dateLabel(tl.firstInstalment) : "—"} bis {dateLabel(tl.loanMaturity)};{" "}
                {meur(k.debt)} ({pct(k.gearing, 0)} der Mittelverwendung)
              </dd>
              <dt>Steuern</dt>
              <dd>GmbH & Co. KG (GmbH als Schalter), Gewerbesteuer-Hebesatz {pct(i.tax.hebesatz, 0)}</dd>
            </dl>

            <nav aria-labelledby="toc-inline" className="rounded-xl border border-border bg-card p-4 lg:hidden">
              <p id="toc-inline" className="!mt-0 font-semibold">
                Inhalt
              </p>
              <ol className="!mt-2 columns-2 text-sm">
                {SECTIONS.map(([id, label]) => (
                  <li key={id}>
                    <a href={`#${id}`}>{label}</a>
                  </li>
                ))}
              </ol>
            </nav>

            <H2 id="principles">1. Grundsätze</H2>
            <ul>
              <li>
                <strong>Deterministisch und nominal.</strong> Gleiche Eingaben ergeben immer dasselbe Ergebnis. Beträge
                sind nominale Euro; Stückpreise werden in Preisen von 2025 oder 2026 eingegeben und mit der Inflation
                fortgeschrieben. Zwei Größen sind von Natur aus nominal: die Strom-Terminpreise und der AW, der nicht
                indexiert wird (zu seinen Überprüfungen siehe Abschnitt 4).
              </li>
              <li>
                <strong>Datierte Zahlungen.</strong> Die Bauphase läuft monatlich mit Zahlungen zum Monatsende, der Betrieb
                in Kalenderjahren mit Zahlungen zum 31. Dezember. Das erste und das letzte Jahr zählen nur die Tage in
                Betrieb. Das Darlehen läuft in einem Monatsraster mit vierteljährlichen Raten, summiert je Kalenderjahr.
              </li>
              <li>
                <strong>Renditen aus Daten.</strong> IRR und Kapitalwert verwenden die genauen Daten mit der Zinskonvention
                Actual/365, wie XINTZINSFUSS und XKAPITALWERT in Excel; so werden ein halbes erstes Jahr und die monatliche
                Bauphase richtig gewichtet.
              </li>
              <li>
                <strong>Zwei Sichten.</strong> Die Projektsicht (ohne Fremdkapital) zeigt, was der Windpark verdient; die
                Sicht der Gesellschafter (mit Fremdkapital) zeigt, was nach Schuldendienst und Reserven beim Eigenkapital
                ankommt.
              </li>
              <li>
                <strong>Geprüfte Eingaben.</strong> Vor jeder Berechnung – ob aus dem Eingabebereich, einem geteilten Link
                oder einer gespeicherten Sitzung – wird jede Eingabe auf ihren Bereich und ihre Stimmigkeit geprüft.
                Eingaben, die sich nicht berechnen lassen, erzeugen eine Meldung statt eines Ergebnisses.
              </li>
            </ul>

            <H2 id="timeline">2. Zeitplan</H2>
            <ul>
              <li>
                Der Financial Close am {dateLabel(tl.financialClose)} ist zugleich der Bewertungsstichtag. Nach{" "}
                {i.project.constructionMonths} Monaten geht der Park am {dateLabel(tl.cod)} in Betrieb; das erste
                Betriebsjahr hat also sechs Monate.
              </li>
              <li>
                Der Zuschlag wurde am {dateLabel(tl.awardNotice)} bekanntgegeben. Er erlischt, wenn der Park 36 Monate
                später, am {dateLabel(tl.awardLapse)}, nicht in Betrieb ist (§ 36e EEG), und eine Inbetriebnahme mehr als 30
                Monate nach der Bekanntgabe löst eine Pönale aus (§ 55 EEG). Der Basisfall geht nach etwa {codMonths}{" "}
                Monaten in Betrieb; spätere Termine markieren die Prüfungen.
              </li>
              <li>
                Die EEG-Förderung dauert 20 Jahre ab der Inbetriebnahme (§ 25 EEG; bei bezuschlagten Anlagen nicht bis zum
                Jahresende verlängert). Sie verlängert sich um die Zeiträume mit negativen Preisen im Jahr der
                Inbetriebnahme und in den 19 folgenden Kalenderjahren, aufgerundet auf ganze Tage (§ 51a EEG). Bei{" "}
                {pct(i.energy.negativePriceTimeShare, 1)} der Zeit mit negativen Preisen endet die Förderung am{" "}
                {dateLabel(tl.eegEnd)}.
              </li>
              <li>
                Die Betriebsdauer beträgt {i.project.lifetimeYears} Jahre (30 als Variante); am Ende, am{" "}
                {dateLabel(tl.endOfLife)}, wird der Park zurückgebaut.
              </li>
              <li>
                Das KfW-Darlehen läuft {f.tenorYearsFromClose} Jahre ab der Zusage, die das Modell auf den Financial Close
                legt. {f.graceYears} Jahre lang werden nur Zinsen gezahlt; danach wird es in {instalments} gleichen
                vierteljährlichen Raten getilgt, die erste am {tl.firstInstalment ? dateLabel(tl.firstInstalment) : "—"},
                die letzte am {dateLabel(tl.loanMaturity)} (KfW-Merkblatt 270). Die tilgungsfreien Jahre müssen mindestens
                bis zur Inbetriebnahme reichen: Raten während der Bauzeit bildet das Modell nicht ab.
              </li>
              <li>
                Die KfW zahlt ein Darlehen innerhalb von 12 Monaten nach der Zusage aus, verlängerbar um bis zu 24 Monate.
                Eine Bauzeit von {i.project.constructionMonths} Monaten braucht eine solche Verlängerung; das Modell
                unterstellt sie.
              </li>
            </ul>

            <H2 id="energy">3. Energieertrag</H2>
            <pre>{`Leistung          P       = Anzahl der Anlagen × Anlagenleistung
Standortertrag    h_site  = Standortgüte × Referenzertrag              (Anlage 2 Nr. 7 EEG)
P50, netto        h_P50   = h_site × min(1, Verfügbarkeit / 98 %) × (1 − sonstige Verluste)
Erzeugung         E_y     = P × h_P50 × f_y × (1 − Degradation)^n_y
Verkaufte Menge   E_sold  = E_y × (1 − Anteil der Erzeugung bei negativen Preisen)
P90               E_P90   = E_P50 × (1 − ${num(P90_Z, 4)} × σ)`}</pre>
            <ul>
              <li>
                Der Referenzertrag der 6-MW-Klasse beträgt {num(i.energy.referenceYieldHours, 0)} Volllaststunden am
                100-%-Referenzstandort (Deutsche WindGuard, 2025). Bei einer Standortgüte von {pct(i.energy.siteQuality, 0)}{" "}
                ergibt sich ein Standortertrag von {num(siteYield, 0)} Stunden.
              </li>
              <li>
                Die Standortgüte ist eine Eingabe, kein Ergebnis: Sie bestimmt – wie im Gesetz – sowohl die Erzeugung als
                auch den Korrekturfaktor. Ein besserer Standort erzeugt mehr Strom, erhält aber einen niedrigeren AW.
              </li>
              <li>
                Nach dem Gesetz sind im Standortertrag Abschattungsverluste, bis zu 2 % Nichtverfügbarkeit, elektrische
                Verluste und Abregelungen aus der Genehmigung bereits abgezogen. Das Modell zieht nur die Verfügbarkeit
                unter 98 % ({pct(i.energy.availability, 0)} im Basisfall) und optionale sonstige Verluste ab:{" "}
                {num(k.fullLoadHoursP50, 0)} Stunden.
              </li>
              <li>
                f<sub>y</sub> ist der Anteil des Jahres in Betrieb, n<sub>y</sub> die Zahl der Kalenderjahre seit dem Jahr
                der Inbetriebnahme; die Degradation beträgt {pct(i.energy.degradationPerYear, 1)} pro Jahr.
              </li>
              <li>
                In Zeiten negativer Preise regelt der Direktvermarkter den Park ab, und es wird keine Marktprämie gezahlt
                (§ 51 EEG). Im Basisfall fallen {pct(i.energy.negativePriceOutputShare, 0)} der Erzeugung in solche Zeiten.
              </li>
              <li>Abregelungen im Redispatch 2.0 werden entschädigt (§ 13a EnWG) und nicht abgezogen.</li>
              <li>
                P90 nutzt die Standardabweichung des Ertrags: σ = {pct(i.energy.sigma1y, 1)} für ein einzelnes Jahr (P90 ={" "}
                {pct(p90share, 1)} von P50) und {pct(i.energy.sigma10y, 1)} für einen Zehnjahresdurchschnitt (
                {pct(p90share10, 1)}). Der Einjahreswert testet den Schuldendienst in einem schlechten Jahr; der
                Zehnjahreswert beschreibt ein schwächeres Windangebot.
              </li>
            </ul>

            <H2 id="revenue">4. Erlöse</H2>
            <pre>{`Korrekturfaktor     KF      = Tabelle nach § 36h EEG, linear dazwischen
Anzulegender Wert   AW      = Zuschlagswert × KF, gerundet auf 2 Nachkommastellen in ct/kWh  (§ 36h Abs. 5)
Base-Preis          B_y     = Strom-Terminpreise 2027–2029, danach langfristiger Preis (Preise 2026) × Preisindex
Marktwert           JW_y    = B_y × Marktwertfaktor Wind            (Jahresmarktwert Wind an Land)
Marktprämie         MP_y    = max(0, AW − JW_y)                     (Anlage 1 Nr. 4 EEG)
Markterlöse                 = E_y × JW_y × Förderanteil des Jahres
Prämienerlöse               = E_sold × MP_y × Förderanteil des Jahres
Nach der Förderung          = E_y × JW_y oder E_sold × PPA-Preis, × Rest des Jahres`}</pre>
            <Table
              head={["Standortgüte", "Korrekturfaktor"]}
              num={[0, 1]}
              rows={CORRECTION_FACTOR_TABLE.map(([g, x]) => [`${g} %${g === 50 ? " *" : ""}`, num(x, 2)])}
            />
            <p className="text-sm text-muted-foreground">
              * 50 % gilt nur in der Südregion; anderswo bleibt der Faktor unter 60 % bei 1,42. Bei{" "}
              {pct(i.energy.siteQuality, 0)} beträgt der Faktor {num(k.correctionFactor, 3)}, der AW also{" "}
              {num(i.revenue.awardPriceCt, 2)} × {num(k.correctionFactor, 3)} = {num(unrounded, 5)}, gerundet{" "}
              {ct(k.awCt)}.
            </p>
            <ul>
              <li>
                <strong>Warum die beiden Erlösteile unterschiedliche Mengen nutzen.</strong> Der Jahresmarktwert mittelt den
                Preis über die gesamte Winderzeugung, einschließlich der Stunden mit negativen Preisen. Ein abgeregelter
                Park verzichtet nur auf Preise von null oder darunter; Erzeugung × Marktwert ist daher eine vorsichtige
                Schätzung seiner Markterlöse. Die Marktprämie ist nach dem Gesetz in Zeiten negativer Preise null und gilt
                daher nur für die verkaufte Menge.
              </li>
              <li>
                <strong>Jahresmarktwert.</strong> Für Zuschläge nach dem 1. Januar 2023 richtet sich die Marktprämie nach
                dem jährlichen, nicht dem monatlichen Marktwert. Die einzige Vereinfachung: Der eigene Erlöspreis des Parks
                entspricht dem Marktwert aller Windenergie an Land.
              </li>
              <li>
                <strong>Preise im Basisfall.</strong> Terminpreise von{" "}
                {i.revenue.futuresEurMwh.map((x) => `${num(x.value, 2)}`).join(" / ")} €/MWh für{" "}
                {i.revenue.futuresEurMwh[0]!.year}–{i.revenue.futuresEurMwh.at(-1)!.year}, danach{" "}
                {num(i.revenue.longTermBaseEurMwh2026, 0)} €/MWh in Preisen von 2026 zuzüglich Inflation, multipliziert mit
                einem Marktwertfaktor von {num(i.revenue.captureFactor, 2)}: ein Marktwert von {num(mv(2029), 1)} €/MWh im
                Jahr 2029 und {num(mv(2035), 1)} €/MWh im Jahr 2035. Der langfristige Preis ist die stärkste Annahme des
                Modells; das Tornado-Diagramm zeigt ihr Gewicht.
              </li>
              <li>
                <strong>Das EEG als Untergrenze.</strong>{" "}
                {basePremium === 0 ? (
                  <>
                    Der AW ({num(k.awCt * 10, 1)} €/MWh) bleibt in jedem Jahr unter dem erwarteten Marktwert; im Basisfall
                    wird also keine Marktprämie gezahlt.
                  </>
                ) : (
                  <>
                    Der AW ({num(k.awCt * 10, 1)} €/MWh) liegt in {basePremium} Jahren über dem erwarteten Marktwert; in
                    diesen Jahren wird die Marktprämie gezahlt.
                  </>
                )}{" "}
                Im Downside-Fall mit 20 % niedrigeren Preisen wird die Marktprämie in {downsidePremium} Jahren gezahlt – die
                Untergrenze wirkt dann wie eine Versicherung.
              </li>
              <li>
                <strong>Überprüfung der Standortgüte.</strong> Der AW ist nominal fest, aber § 36h Abs. 2 EEG legt ihn zu
                Beginn des 6., 11. und 16. Jahres anhand des Standortertrags der vorangegangenen fünf Jahre neu fest und
                rechnet die Zahlungen dieser Jahre ab, wenn sich die Standortgüte um mehr als 2 Prozentpunkte verändert hat.
                Der Basisfall nimmt an, dass die festgestellte Standortgüte von {pct(i.energy.siteQuality, 0)} für den
                gesamten Zeitraum gilt; der AW bleibt also bei {ct(k.awCt)}. Die mehrjährigen Stressfälle wenden die
                Überprüfung an:{" "}
                {reviewed ? (
                  <>
                    Mit dem zehnjährigen P90-Ertrag beträgt die Standortgüte {pct(reviewed.siteQuality, 1)}, der AW wird ab
                    dem {dateLabel(reviewed.start)} zu {ct(reviewed.awCt)}, und die ersten fünf Jahre werden zu diesem Wert
                    abgerechnet.
                  </>
                ) : (
                  "Der überprüfte AW folgt dann dem gestressten Ertrag."
                )}{" "}
                Zinsen auf Rückzahlungen an den Netzbetreiber werden nicht modelliert.
              </li>
              <li>
                <strong>Zahlungszeitpunkte.</strong> Der Netzbetreiber zahlt monatliche Abschläge, fällig am 15. des
                Folgemonats. § 26 EEG erlaubt, sie nach dem Marktwert des Vorjahres zu bemessen; davon geht das Modell aus.
                Der Rest der Marktprämie und die Erstattung nach § 6 kommen mit der Endabrechnung, angenommen zum 31. März
                des Folgejahres. Die Verzögerung der Endabrechnung ist eine Eingabe, das Modell rechnet aber in
                Kalenderjahren: Eine Verzögerung von 1 bis 12 Monaten legt die Endabrechnung ins Folgejahr, eine von 13 bis
                24 Monaten ins Jahr danach – das ist der Verzögerungsstress –, und der Monat innerhalb des Jahres ändert die
                jährlichen Zahlungen nicht. Im ersten Jahr, in dem der Marktwert unter den AW fällt, sind die Abschläge
                deshalb noch null, und die gesamte Marktprämie fließt im Jahr darauf; der Bankfall enthält dieselbe
                Verzögerung. Der Dezember-Abschlag, gezahlt am 15. Januar, ist zum Jahresende nur offen, solange der
                Förderzeitraum im Dezember läuft. Markterlöse gehen mit einer Forderungslaufzeit von{" "}
                {i.revenue.receivableDays} Tagen ein, bezogen auf die tatsächlichen Betriebstage eines Teiljahres.
              </li>
              <li>
                <strong>Zweiseitige Marktprämie (Schalter).</strong> Ein vereinfachter Stresstest, nicht die Berechnung des
                EEG-2027-Entwurfs, der weitere Regeln wie Viertelstunden-Anpassungen und einen Mindestbetrag für den
                Betreiber vorsieht: Die Marktprämie wird negativ, wenn der Marktwert über dem AW liegt. Standardmäßig ist
                sie aus – ein Zuschlag von 2026 fällt unter das EEG 2023, und ob der Entwurf für ihn gelten wird, ist
                offen. Abschläge sind nie negativ; eine Rückzahlung wird mit der Endabrechnung verrechnet.
              </li>
              <li>
                <strong>Nach der Förderung</strong> verkauft der Park zum Marktwert oder, per Schalter, über ein PPA zu
                einem Festpreis in Preisen von 2026. Das PPA hat annahmegemäß eine Klausel für negative Preise: Der Park wird
                in Zeiten negativer Preise abgeregelt und nur für die verkaufte Menge bezahlt.
              </li>
            </ul>

            <H2 id="opex">5. Betriebskosten</H2>
            <pre>{`Fixe Posten          = €/kW pro Jahr (Preise 2025) × Leistung × Preisindex × f_y
Pacht                = max(${pct(i.opex.leaseShareOfRevenue, 0)} der Erlöse, ${num(i.opex.leaseMinPerTurbine2026, 0)} € je Anlage in Preisen 2026)
Direktvermarktung    = ${num(i.revenue.directMarketingCtKwh2026, 2)} ct/kWh × verkaufte Menge        (Preise 2026, indexiert)
Kommunalbeteiligung  = ${num(i.revenue.municipalCtKwh, 1)} ct/kWh × Erzeugung                 (§ 6 EEG)
Avalprovision        = ${pct(i.opex.guaranteeFeeRate, 2)} pro Jahr × Rückbausicherheit
Einspeiseentgelt     = €/kW pro Jahr                          (${num(i.opex.gridFeePerKw2026, 0)} im Basisfall)`}</pre>
            <Table
              head={["€/kW pro Jahr, Preise 2025", "Jahre 1–10", "11–20", "ab 21"]}
              num={[1, 2, 3]}
              rows={(
                [
                  ["Wartung (Vollwartung)", i.opex.maintenancePerKw],
                  ["Technische und kaufmännische Betriebsführung", i.opex.managementPerKw],
                  ["Versicherung", i.opex.insurancePerKw],
                  ["Sonstiges", i.opex.otherPerKw],
                ] as const
              ).map(([label, v]) => [label, ...v.map((x) => num(x, x % 1 ? 1 : 0))])}
            />
            <ul>
              <li>
                Das Direktvermarktungsentgelt von {num(i.revenue.directMarketingCtKwh2026, 2)} ct/kWh ist eine Annahme. Der
                gesetzliche Abzug von 0,228 ct/kWh für ausgeförderte Anlagen (Netztransparenz, 2026) ist ein Anhaltspunkt,
                kein Marktangebot für einen neuen Park.
              </li>
              <li>
                Die Kommunalbeteiligung ist nach § 6 EEG freiwillig. Der Netzbetreiber erstattet bis zu 0,2 ct/kWh mit der
                Endabrechnung des Folgejahres für Mengen, die eine Marktprämie erhalten haben – im Modell in Jahren mit
                positiver Marktprämie; was über 0,2 ct/kWh hinausgeht, ist reiner Aufwand. Nach der Förderung läuft die
                Zahlung als reiner Aufwand weiter (Schalter).
              </li>
              <li>
                Die Rückbausicherheit folgt der hessischen Regel – Nabenhöhe × {num(i.opex.decommissioningBondPerMeterHub, 0)}{" "}
                € je Anlage – und wird durch eine Bankbürgschaft gestellt.
              </li>
              <li>
                Der Rückbau kostet am Ende der Betriebsdauer {num(i.opex.decommissioningCostPerKw2026, 0)} €/kW in Preisen
                von 2026. Das Geld wird in gleichen Raten über die letzten {i.opex.decommissioningReserveYears} Jahre
                zurückgelegt.
              </li>
              <li>
                Die Inflation folgt der Projektion der Bundesbank für {i.macro.inflation[0]!.year}–
                {i.macro.inflation.at(-1)!.year} ({i.macro.inflation.map((x) => pct(x.value, 1)).join(" / ")}) und danach
                dem Ziel der EZB von {pct(i.macro.longRunInflation, 0)}.
              </li>
            </ul>

            <H2 id="investment">6. Investition und Finanzierung</H2>
            <Table
              head={["Investitionsposten (netto ohne USt.)", "€/kW", "Zahlungsprofil"]}
              num={[1]}
              rows={[
                ...capexItems.map((it) => [capexLabel[it.key] ?? it.key, num(it.eurPerKw, 0), profileLabel[it.profile]]),
                [`Reserve für Unvorhergesehenes (${pct(i.capex.contingencyPct, 0)})`, num(itemsTotal * i.capex.contingencyPct, 0), profileLabel.linear],
                [<strong key="t">Summe</strong>, <strong key="v">{num(k.capexPerKw, 0)}</strong>, meur(k.capex)],
              ]}
            />
            <ul>
              <li>
                Die Kosten entsprechen dem Stand 2025 der Deutschen WindGuard für Projekte mit Inbetriebnahme 2025–2028,
                ohne Fortschreibung bis zum Financial Close; die Anlagenpreise waren 2026 stabil.
              </li>
              <li>
                Die Umsatzsteuer von {pct(i.capex.vatRate, 0)} wird mit jeder Rechnung gezahlt und{" "}
                {i.capex.vatRefundLagMonths} Monate später erstattet. Ein Umsatzsteuerdarlehen zum Zinssatz des
                Bankdarlehens plus {num(f.vatFacilitySpread * 100, 2)} Prozentpunkte überbrückt die Lücke; seine Zinsen,
                einschließlich der Monate nach der Inbetriebnahme, gehören zur Mittelverwendung.
              </li>
              <li>
                Finanzierungskosten in der Bauphase: ein Bearbeitungsentgelt von {pct(f.upfrontFeePct, 0)} des Darlehens bei
                Financial Close; eine Bereitstellungsprovision von {pct(f.commitmentFeePerMonth, 2)} pro Monat auf den nicht
                abgerufenen Betrag ab Monat {f.commitmentFeeStartMonth} (Regel der KfW); Zinsen auf das abgerufene
                Darlehen. Die KfW berechnet in den tilgungsfreien Jahren nur Zinsen; diese Zinsen werden daher bar gezahlt
                und wie Investitionskosten finanziert, nicht dem Darlehen zugeschlagen.
              </li>
              <li>
                Die Kapitaldienstreserve (DSRA) wird bei Inbetriebnahme mit {f.dsraMonths} Monaten des Schuldendienstes des
                ersten vollen Tilgungsjahres ({firstRepaymentYear}) dotiert: {eurCompact(su.dsraInitial)}.
              </li>
              <li>
                Die Anlaufliquidität von {eurCompact(su.workingCapitalInitial)} finanziert die Forderungen des ersten
                Betriebsjahres; die Verkäufe der ersten Monate brauchen so kein zusätzliches Geld.
              </li>
              <li>Fremd- und Eigenkapital werden jeden Monat anteilig abgerufen (Eigenkapital zuerst als Schalter).</li>
            </ul>
            <pre>{`Mittelverwendung = Investitionskosten + Bearbeitungsentgelt + Bereitstellungsprovision + Bauzeitzinsen
                   + Zinsen des Umsatzsteuerdarlehens + Erstdotierung DSRA + Anlaufliquidität
Mittelherkunft   = Bankdarlehen + Eigenkapital          Prüfung: Mittelherkunft − Mittelverwendung = 0`}</pre>
            <p>
              Im Basisfall beträgt die Mittelverwendung {meur(su.totalUses)}: Investitionskosten {meur(su.capex)},
              Finanzierungskosten {meur(financing)}, Erstdotierung der DSRA {meur(su.dsraInitial)} und Anlaufliquidität{" "}
              {meur(su.workingCapitalInitial)}. Finanziert wird sie mit einem Darlehen von {meur(su.debt)} und Eigenkapital
              von {meur(su.equity)}.
            </p>

            <H2 id="debt">7. Dimensionierung des Darlehens</H2>
            <p>
              Der <strong>Bankfall</strong> des Modells rechnet während der Förderung nur mit der garantierten Untergrenze:
              höchstens dem AW je verkaufter kWh. Das ist eine konservative Konvention des Modells, keine Aussage darüber,
              wie jede Bank rechnet. Marktprämie und Erstattung nach § 6 kommen zu denselben Zeitpunkten wie im
              Betriebsfall, einschließlich der Verzögerung nach § 26; nach der Förderung rechnet der Bankfall mit
              Basispreisen (ein Schalter dimensioniert durchgehend mit Basispreisen). Der Cashflow für den Schuldendienst
              hat eine Definition für Dimensionierung, Covenant und Ausschüttungssperre:
            </p>
            <pre>{`CFADS_y   = EBITDA_y − Veränderung des Working Capital_y − Steuern_y
Schuldendienst je Euro Darlehen   a_y    (vierteljährliche Raten und monatliche Zinsen, je Jahr summiert)
Darlehen aus den DSCR-Zielen      D_DSCR = min über y von  min( CFADS_y[Bank, P50] / (${num(f.targetDscrP50, 2)} × a_y),
                                                              CFADS_y[Bank, P90 1 Jahr] / (${num(f.targetDscrP90, 2)} × a_y) )
Darlehen                          D      = min( D_DSCR, ${pct(f.maxGearing, 0)} × Mittelverwendung )`}</pre>
            <ul>
              <li>
                <strong>Zirkularität.</strong> Die Steuern hängen von den Zinsen ab, und die Mittelverwendung hängt über
                Gebühren, Bauzeitzinsen und DSRA vom Darlehen ab. Das Modell iteriert, bis sich das Darlehen um weniger als
                0,50 € ändert, rechnet dann beide Bankfälle mit dem endgültigen Darlehen neu und prüft beide Ziele erneut.
              </li>
              <li>
                <strong>Varianten.</strong> Annuität und Sculpting sind übliche kommerzielle Profile, nicht KfW 270.
                Annuität: gleiche vierteljährliche Zahlungen. Sculpting: Der Schuldendienst jedes Jahres ist der kleinere
                Wert aus CFADS ÷ Ziel für P50 und P90; das Darlehen ist der Betrag, den diese Zahlungen bis zur Fälligkeit
                genau tilgen – in geschlossener Form bestimmt, da die Salden linear im Darlehen sind –, und kleiner, wenn ein
                schwaches Jahr sonst eine negative Rate bräuchte.
              </li>
              <li>
                <strong>Basisfall.</strong> Bindende Grenze: {de.overview.binding[b.sizing.binding]}
                {b.sizing.binding.startsWith("dscr") ? ` ${basis}` : ""} – ein Darlehen von {meur(k.debt)},{" "}
                {pct(k.gearing, 0)} der Mittelverwendung; die niedrigsten DSCR im Bankfall betragen{" "}
                {ratio(b.sizing.minBankDscrP50)} bei P50 und {ratio(b.sizing.minBankDscrP90)} bei P90. Bürgerwindparks,
                die zu niedrigeren Zinsen und höheren Zuschlagswerten finanziert wurden, weisen in ihren Prospekten 79–90 %
                Fremdkapital aus; bei {pct(f.interestRate, 2)} und einer Untergrenze von {ct(k.awCt)} ist die
                Verschuldungskapazität weit geringer. Im September 2026 warnte eine Gruppe von 18 Banken vor steigenden
                Eigenkapitalanforderungen für Windprojekte.
              </li>
              <li>
                <strong>Dimensionierungsziel und Covenant.</strong> Das einjährige P90-Ziel von {ratio(f.targetDscrP90)}{" "}
                liegt unter dem Covenant von {ratio(f.covenantDscr)}. Das Ziel gilt für den Bankfall zu Preisen der
                Untergrenze; der Covenant wird an den Cashflows des Betriebs getestet, wo der einjährige P90-Stress im
                Basisfall noch {ratio(BASE.p90.kpis.minDscr)} zeigt. Für keine der beiden Schwellen gibt es einen
                veröffentlichten Marktwert; beide sind Annahmen und Eingaben.
              </li>
              <li>
                <strong>Kein Darlehen.</strong> Hat der Bankfall ein Jahr ohne Geld für den Schuldendienst – CFADS null oder
                darunter –, passt keine Höhe gleicher Raten, und das Modell dimensioniert kein Darlehen. Ein Darlehen mit
                Sculpting wird vor einem solchen Jahr getilgt, wenn die früheren Jahre das erlauben. Darlehen unter 1 € gelten
                als keines, und Jahre mit weniger als 1 € Schuldendienst haben keinen DSCR.
              </li>
            </ul>

            <H2 id="taxes">8. Steuern</H2>
            <pre>{`EBT              = EBITDA − Abschreibung − Zinsen − Zuführung zur Rückbaurückstellung
Hinzurechnung    = 25 % × max(0, Zinsen + 50 % × Pacht − 200.000 €)                  § 8 Nr. 1 GewStG
Gewerbeertrag    = EBT + Hinzurechnung − Verlustvortrag (1 Mio. € voll, darüber 60 %)   § 10a GewStG
                   abgerundet auf 100 €, abzüglich 24.500 € bei Personengesellschaften    § 11 GewStG
Gewerbesteuer    = 3,5 % × Gewerbeertrag × Hebesatz
Körperschaftst.  = Satz_y × (EBT − Verlustvortrag: 1 Mio. € voll, darüber
                   70 % bis 2027, 60 % ab 2028)            nur GmbH; § 23 KStG, § 10d EStG
                   Satz_y: 15 % bis 2027; 14 / 13 / 12 / 11 % in 2028–2031; 10 % ab 2032
Soli             = 5,5 % × Körperschaftsteuer`}</pre>
            <ul>
              <li>
                <strong>Abschreibung.</strong> Bemessungsgrundlage sind die Investitionskosten zuzüglich der aktivierten
                Finanzierungskosten. Alle Wirtschaftsgüter des Windparks werden linear über {i.tax.depreciationYears} Jahre
                abgeschrieben (AfA-Tabelle; BFH IV R 46/09); das erste Jahr zählt ab dem Monat der Inbetriebnahme. Die
                degressive AfA (das Dreifache der linearen, höchstens 30 %: 18,75 %) ist ein Schalter, der nur für
                Wirtschaftsgüter gilt, die zwischen dem 1. Juli 2025 und dem 31. Dezember 2027 fertiggestellt werden –
                nicht für den Basisfall –, und wechselt zur linearen AfA, sobald diese höher ist. Ein beim Rückbau
                verbleibender Buchwert wird im letzten Jahr abgeschrieben.
              </li>
              <li>
                <strong>Rückbaurückstellung.</strong> Steuerlich wird die Verpflichtung zeitanteilig über die Betriebsdauer
                zu den Preisen des jeweiligen Bilanzstichtags angesammelt und mit 5,5 % abgezinst – außer wenn weniger als
                zwölf Monate verbleiben (§ 6 Abs. 1 Nr. 3a Buchst. e EStG). Ihre Zuführung mindert den steuerpflichtigen
                Gewinn. Die Rücklage in bar ist davon getrennt.
              </li>
              <li>
                Steuern sind nicht abziehbar (§ 4 Abs. 5b EStG), die Steuerberechnung selbst ist also nicht zirkulär.
                Steuern werden im Jahr ihrer Entstehung gezahlt.
              </li>
              <li>
                <strong>Rechtsform.</strong> Eine GmbH & Co. KG zahlt nur Gewerbesteuer; die Einkommensteuer trifft ihre
                Gesellschafter und wird nicht modelliert. Die Eigenkapital-IRR der KG ist daher eine Rendite vor den Steuern
                der Gesellschafter und nicht unmittelbar mit der GmbH vergleichbar, die zusätzlich Körperschaftsteuer und
                Solidaritätszuschlag zahlt.
              </li>
              <li>
                Die Gewerbesteuer fließt der Gemeinde der Anlagen zu: Bei Windparks zerlegt § 29 Abs. 1 Nr. 2 GewStG den
                Steuermessbetrag zu 9/10 nach installierter Leistung und zu 1/10 nach Arbeitslöhnen; mit einem Standort und
                ohne eigenes Personal geht die gesamte Bemessungsgrundlage dorthin, und es gilt ein einziger Hebesatz. Die
                Prüfungen markieren einen Hebesatz unter dem gesetzlichen Minimum von 280 % ab 2027 sowie Zinsen über der
                Freigrenze von 3 Mio. € der Zinsschranke (§ 4h EStG), die das Modell nicht berechnet.
              </li>
            </ul>

            <H2 id="waterfall">9. Cashflow-Wasserfall</H2>
            <pre>{`CFADS           = EBITDA − Veränderung des Working Capital − Steuern
− Zinsen − Tilgung
  Fehlbetrag    gedeckt zuerst aus Mitteln, die die Ausschüttungssperre zurückhält, dann aus der DSRA
± DSRA          auffüllen auf ${f.dsraMonths} Monate des Schuldendienstes im Folgejahr, Überschuss freigeben,
                bei einem Fehlbetrag ziehen
− Rücklage      gleiche Raten für den Rückbau in den letzten ${i.opex.decommissioningReserveYears} Jahren
  Sperre        bei DSCR < ${num(f.lockupDscr, 2)} während der Laufzeit bleibt das Geld des Jahres in der Gesellschaft,
                bis der DSCR wieder über der Schwelle liegt
= ausschüttungsfähiger Cashflow`}</pre>
            <ul>
              <li>
                Im letzten Jahr werden DSRA, zurückgehaltene Mittel und Rücklage freigegeben, und der Rückbau wird bezahlt.
                Reicht das Geld des letzten Jahres nicht, gilt der Fall wie bei jedem anderen Fehlbetrag als nicht
                finanziert: Zahlungen der Gesellschafter werden nicht modelliert.
              </li>
              <li>
                <strong>Finanzierung.</strong> Fehlt während der Laufzeit weiterhin Geld, führt das Modell den Fehlbetrag als
                negative Kasse und markiert den Fall als nicht finanziert: Eigenkapital-IRR und Kapitalwert erscheinen dann
                als „n. a.“ (nicht aussagekräftig). Zahlungen der Gesellschafter zur Deckung eines Fehlbetrags werden nicht
                modelliert.
              </li>
              <li>
                <strong>Ausschüttungsgrenzen.</strong> Die letzte Zeile ist der ausschüttungsfähige Cashflow vor den
                gesetzlichen Ausschüttungsgrenzen. Eine GmbH darf das zur Erhaltung des Stammkapitals erforderliche Vermögen
                nicht auszahlen (§ 30 GmbHG); ein Kommanditist, dessen Entnahmen sein Kapitalkonto unter die eingetragene
                Haftsumme drücken, haftet den Gläubigern bis zu diesem Betrag wieder (§ 172 Abs. 4 HGB).{" "}
                {negativeBook.length > 0
                  ? `Im Basisfall zeigt die Bilanz des Modells ${negativeBook.length === 1 ? "im Jahr" : "in den Jahren"} ${yearSpan(negativeBook)} ein negatives bilanzielles Eigenkapital – ein Hinweis, dass solche Grenzen greifen könnten, keine rechtliche Prüfung.`
                  : "Im Basisfall bleibt das bilanzielle Eigenkapital des Modells positiv."}{" "}
                Gesellschafterdarlehen, die übliche Abhilfe, werden nicht modelliert.
              </li>
            </ul>

            <H2 id="results">10. Ergebnisse</H2>
            <Table
              head={["Kennzahl", "Definition", "Basisfall"]}
              num={[2]}
              rows={[
                [
                  "Eigenkapital-IRR",
                  "XINTZINSFUSS der monatlichen Einzahlungen der Gesellschafter in der Bauphase und des jährlichen ausschüttungsfähigen Cashflows; n. a., wenn der Gesellschaft das Geld ausgeht",
                  pct(k.equityIrr, 2),
                ],
                [
                  "Projekt-IRR",
                  "XINTZINSFUSS aus Investitionskosten (ohne Umsatzsteuer und Finanzierungskosten), Anlaufliquidität und EBITDA − Veränderung des Working Capital − Rückbau; nach Steuern werden die Steuern ohne Zinsen neu berechnet",
                  `${pct(k.projectIrrPreTax, 2)} vor Steuern, ${pct(k.projectIrrPostTax, 2)} nach Steuern`,
                ],
                [
                  "Kapitalwert (EK)",
                  `XKAPITALWERT der Zahlungen der Gesellschafter zu den Eigenkapitalkosten (${pct(i.macro.costOfEquity, 0)}), abgezinst auf den Financial Close`,
                  meur(k.npvEquity),
                ],
                [
                  "Stromgestehungskosten (LCOE)",
                  `In Anlehnung an Fraunhofer ISE: (Barwert der Investitionskosten + Barwert der Betriebskosten nach der Erstattung nach § 6 + Barwert des Rückbaus) ÷ Barwert der verkauften Menge; reale Preise von 2026 bei einem realen WACC von ${pct(i.macro.waccReal, 1)} (nominal: ${pct(i.macro.waccNominal, 1)}), ohne Steuern und Finanzierungskosten. Anders als bei ISE zählt die verkaufte Menge, und die Pacht hängt an den Erlösen, sodass sich der Wert mit dem Strompreis bewegt`,
                  `${ct(k.lcoeRealCt)} (nominal ${num(k.lcoeNominalCt, 2)})`,
                ],
                [
                  "DSCR",
                  "CFADS ÷ (Zinsen + Tilgung) in jedem Jahr des Darlehens; das Minimum über alle Jahre mit Schuldendienst, der Durchschnitt über die Tilgungsjahre",
                  `${ratio(k.minDscr)} min. (${k.minDscrYear}), ${ratio(k.avgDscr)} im Durchschnitt`,
                ],
                [
                  "LLCR",
                  "Barwert des CFADS über die Laufzeit zum Darlehenszins ÷ Darlehen, bei Inbetriebnahme – das Fälligkeitsjahr nur bis zum Fälligkeitstag; Reserven nicht angerechnet",
                  ratio(k.llcr),
                ],
                ["Amortisation", "Jahre ab Inbetriebnahme, bis der kumulierte Cashflow der Gesellschafter positiv wird", `${num(k.paybackYears, 1)} Jahre`],
                ["Fremdkapitalquote", "Darlehen ÷ Mittelverwendung gesamt", pct(k.gearing, 1)],
              ]}
            />

            <H2 id="scenarios">11. Szenarien, Sensitivität und Gebotsrechner</H2>
            <p>
              Der Basisfall dimensioniert das Darlehen. Die Stressszenarien behalten dieses Darlehen und jede Rate – die
              Sicht der Bank nach dem Financial Close. Ein P90-Ertrag in jedem Jahr ist ein Stresstest, keine
              90-%-Wahrscheinlichkeit für die gesamte Laufzeit: Der Einjahreswert testet den Schuldendienst, der
              Zehnjahreswert ist der bessere Anhaltspunkt für Renditen.
            </p>
            <Table
              head={["Szenario", "Änderungen gegenüber dem Basisfall", "Eigenkapital-IRR", "Min. DSCR", "Kapitalwert (EK)"]}
              num={[2, 3, 4]}
              rows={SCENARIOS.map((name) => {
                const r = BASE[name];
                const meaningful = r.validity.returnsMeaningful;
                return [
                  de.scenarios[name],
                  scenarioText[name],
                  meaningful ? pct(r.kpis.equityIrr, 2) : de.kpis.notMeaningful,
                  ratio(r.kpis.minDscr),
                  meaningful ? meur(r.kpis.npvEquity) : de.kpis.notMeaningful,
                ];
              })}
            />
            <p>
              <strong>Tornado.</strong> Jeder Treiber wird auf seinen niedrigen und seinen hohen Wert gesetzt, mit neu
              dimensioniertem Darlehen – die Sicht vor dem Financial Close –, und die Treiber werden nach der Spannweite der
              gewählten Kennzahl sortiert. Ein Lauf, in dem der Gesellschaft das Geld ausgeht oder eine Rechenprüfung
              fehlschlägt, zeigt keine Eigenkapital-IRR. Der Treiber für negative Preise bewegt auch den Marktwertfaktor mit
              (1 − Anteil): Erzeugung, die in Zeiten negativer Preise fällt, bringt fast nichts ein, also sinkt der Marktwert
              des Windes mit.
            </p>
            <Table
              head={["Treiber", "Niedrig", "Hoch"]}
              rows={TORNADO_DRIVERS.map((d) => [
                de.sensitivity.drivers[d.id] ?? d.id,
                settingLabel(d.setting, "low", FORMAT.de, de.sensitivity.units),
                settingLabel(d.setting, "high", FORMAT.de, de.sensitivity.units),
              ])}
            />
            <p>
              <strong>Gebotsrechner.</strong> Er sucht den niedrigsten Zuschlagswert, bei dem die Eigenkapital-IRR ein Ziel
              erreicht, mit neu dimensioniertem Darlehen bei jedem Schritt, und meldet drei Dinge: den Preis allein für die
              Rendite; den niedrigsten Preis, der außerdem finanzierbar ist – voll finanziert, im Covenant und mit einem
              Zuschlag, der nach § 36e nicht erloschen ist –; und ob dieser Preis den Höchstwert der Eingaben einhält. Die IRR
              ist im Zuschlagswert nicht monoton: Eine höhere Untergrenze erlaubt mehr Fremdkapital zu{" "}
              {pct(f.interestRate, 2)}, was die Eigenkapitalrendite senken kann. Die Suche prüft deshalb ein Raster von
              0,25 ct auf den ersten Preis, der die Bedingungen erfüllt, und halbiert dann innerhalb dieses Schritts. Gebote
              haben zwei Nachkommastellen; die Antwort ist daher der niedrigste solche Preis, der die Bedingungen erfüllt,
              neu gerechnet zu diesem Preis.
              {bid.feasible && (
                <>
                  {" "}
                  Im Basisfall braucht eine Eigenkapital-IRR von {pct(i.macro.costOfEquity, 0)} einen Zuschlagswert von{" "}
                  {ct(bid.feasible.awardPriceCt)} (AW {ct(bid.feasible.awCt)}) –{" "}
                  {bid.admissible ? "innerhalb des Höchstwerts" : "über dem Höchstwert"} von {ct(bid.ceilingCt)}.
                </>
              )}
            </p>

            <H2 id="checks">12. Prüfungen und Gültigkeit</H2>
            <p>
              Jede Neuberechnung führt {b.checks.length} Prüfungen in fünf Gruppen durch. Der Rechner fasst sie unter den
              Kennzahlen in einer Zeile zusammen: ob der Fall voll finanziert ist, den Covenant einhält und im Modellrahmen
              bleibt.
            </p>
            {checkGroups.map(([group, checks]) => (
              <div key={group}>
                <h3>{de.checks.groups[group]}</h3>
                <ul className="columns-1 sm:columns-2">
                  {checks.map((c) => (
                    <li key={c.id} className="break-inside-avoid">
                      {de.checks.ids[c.id] ?? c.id}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <H2 id="verification">13. Verifikation</H2>
            <ul>
              <li>
                Automatisierte Tests decken die Finanzmathematik ab (gegen die von Microsoft veröffentlichten Beispiele für
                XINTZINSFUSS und XKAPITALWERT), die Tabelle und Rundung nach § 36h, den Darlehenskalender, die Zeitpunkte der
                Marktprämie, Steuern und Abschreibung, das Modell und seine Szenarien, den Gebotsrechner und den
                Excel-Export.
              </li>
              <li>
                Ein reproduzierbarer Zufallsdurchlauf mit 500 Eingabesätzen innerhalb der üblichen Bereiche läuft als Test:
                Mit einseitiger Marktprämie verletzt das Basisszenario nie seinen Covenant, der Gesellschaft geht nie das
                Geld aus, und jede Rechenprüfung wird bestanden. Ein breiterer Durchlauf mit 1.000 Sätzen bewegt zusätzlich
                die gesamten Investitions- und Betriebskosten, die Terminpreise, die Inflation, den Schalter für die
                zweiseitige Marktprämie und das Tilgungsprofil: Jedes Szenario besteht jede Rechenprüfung, und kein Jahr
                trägt Rundungsreste im Schuldendienst.
              </li>
              <li>
                Die <a href={P.workbook}>Excel-Arbeitsmappe</a> (vorerst auf Englisch) ist eine zweite Umsetzung des Modells
                in Tabellenformeln. Ihre Kopie ohne gespeicherte Ergebnisse hat Microsoft Excel allein neu berechnet. In{" "}
                {VERIFIED_VARIANTS} Varianten – jeder Schalter (Rechtsform, Tilgungsprofil, Erlösbasis der Bank,
                zweiseitiger Stresstest, PPA, Eigenkapital zuerst, degressive AfA, Südregion, Daten und Verzögerungen) und
                die Grenzfälle der Reviews (kein Darlehen, kein Geld, negative Renditen, ein erloschener Zuschlag, Eingaben
                außerhalb des üblichen Bereichs) – stimmen alle ihre rund 26.000 Formelzellen mit dem Rechenkern überein:
                Geldbeträge auf den Cent, Sätze und Verhältnisse auf 10⁻⁷. Jedes Paar von Schalterwerten kommt in mindestens
                einer Variante zusammen vor. Zwei Änderungen in der Datei verhalten sich wie beschrieben: Neue
                Eigenkapitalkosten stimmen in jeder Zelle mit dem Rechenkern überein; ein neuer Zuschlagswert zeigt keinen
                Fehler und fordert dazu auf, das Darlehen neu zu berechnen. Zwei Negativkontrollen belegen, dass der
                Vergleich fehlschlagen kann: Ein Hebesatz von 410 % statt 400 % und eine verfälschte Gewerbesteuerformel
                bewegen jeweils die Steuerzeilen und die Eigenkapital-IRR, nicht aber Erlöse, Darlehen oder
                Investitionskosten. Der letzte Lauf ist mit der Excel-Version im Repository archiviert
                (verification/excel-run.json); ein Test schlägt fehl, sobald sich die Arbeitsmappe ändert, bis Excel sie
                erneut geprüft hat.
              </li>
              <li>
                Am 1. Oktober 2026 wurde die Arbeitsmappe des Basisfalls zusätzlich in Google Sheets geöffnet: Ihre
                Ergebnisse stimmen mit denen der Website überein, keine Formel zeigt einen Fehler, die Schalter akzeptieren
                nur ihre vorgesehenen Werte, und die beiden Änderungen in der Datei verhalten sich wie in Excel.
              </li>
              <li>
                Die Arbeitsmappe übernimmt drei Ergebnisse der Website als eingefügte Werte: das Darlehen, die
                Mittelverwendung gesamt und, beim Sculpting, die Tilgung je Jahr. Sie sind die Fixpunkte der zirkulären
                Verknüpfungen des Modells. Das Blatt „Checks“ berechnet das Darlehen aus den DSCR-Zielen und der Obergrenze
                der Fremdkapitalquote neu und meldet, wenn die eingefügten Werte nicht mehr passen.
              </li>
              <li>
                Am 30. September 2026, vor den Reviews, hat eine Tabelle, die nach der schriftlichen Spezifikation – nicht
                nach dem Code – aufgebaut wurde, den Basisfall des ersten Rechenkerns in Microsoft Excel nachgerechnet. Alle
                20 Kennzahlen und zwölf Jahreszeilen stimmten auf den Cent überein.
              </li>
              <li>
                Der <a href={P.reportPdf}>PDF-Bericht</a> des Basisfalls (vorerst auf Englisch) wird aus den Diagrammen und
                Zahlen des Rechners selbst gedruckt. Ein Test schlägt fehl, wenn das veröffentlichte PDF älter ist als der
                Code, aus dem es entstanden ist.
              </li>
              <li>
                Der Quellcode einschließlich der Tests ist öffentlich auf <a href={SITE.repository}>GitHub</a>.
              </li>
            </ul>

            <H2 id="limitations">14. Grenzen des Modells</H2>
            <ul>
              <li>Der Betrieb wird jährlich gerechnet; die Erzeugung verteilt sich gleichmäßig über das Jahr (tatsächlich ist der Winter windreicher).</li>
              <li>Der Erlöspreis des Parks entspricht dem Marktwert aller Windenergie an Land.</li>
              <li>Die Einkommensteuer der Gesellschafter einer KG wird nicht modelliert; Steuern werden im Jahr ihrer Entstehung gezahlt.</li>
              <li>
                Ein einziges Bankdarlehen: keine Tranchen, Gesellschafterdarlehen, Refinanzierung oder Cash Sweep; Raten
                während der Bauzeit werden nicht unterstützt.
              </li>
              <li>
                Nicht modelliert: die Pönale nach § 55 bei verspäteter Inbetriebnahme, Zinsen auf Rückzahlungen nach § 36h,
                die Zinsschranke und Zahlungen der Gesellschafter zur Deckung eines Fehlbetrags.
              </li>
              <li>
                Nicht entschädigte Abregelungen (ein Entwurf des Netzpakets) und Einspeiseentgelte (das AgNes-Verfahren der
                Bundesnetzagentur) sind nicht im Basisfall; das Entgelt steht als Eingabe zur Verfügung.
              </li>
              <li>
                In der Excel-Arbeitsmappe werden Darlehen, Mittelverwendung gesamt und die Tilgung beim Sculpting auf der
                Website berechnet; nach einer Änderung, die sie betrifft, dort neu berechnen und erneut herunterladen.
                Tornado und Gebotsrechner sind als Werte enthalten.
              </li>
              <li>Der Windpark ist fiktiv, die Ergebnisse sind beispielhaft.</li>
            </ul>
          </article>
        </Typeset>

        <aside className="hidden lg:block" aria-labelledby="toc">
          <nav className="sticky top-6 rounded-xl border border-border bg-card p-4 text-sm">
            <p id="toc" className="font-semibold">
              Inhalt
            </p>
            <ol className="mt-2 space-y-1">
              {SECTIONS.map(([id, label], n) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                    {n + 1}. {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>
    </>
  );
}
