// The legal notice in German and in English. The English page shows both (the German text is the binding one);
// the German page shows the German text.
import { Placeholder } from "@/components/site/Placeholder";
import type { Locale } from "@/lib/i18n";
import { CONTACT, SITE } from "@/lib/site";

function Address({ country, locale }: { country: string; locale: Locale }) {
  return (
    <p>
      {SITE.name}
      <br />
      {CONTACT.addressLines ? (
        CONTACT.addressLines.map((l) => (
          <span key={l}>
            {l}
            <br />
          </span>
        ))
      ) : (
        <>
          <Placeholder what={locale === "de" ? "Straße und Postleitzahl" : "Street and postcode"} locale={locale} />
          <br />
        </>
      )}
      {country}
    </p>
  );
}

function Contact({ email, phone, locale }: { email: string; phone: string; locale: Locale }) {
  return (
    <p>
      {email}:{" "}
      {CONTACT.email ? (
        <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
      ) : (
        <Placeholder what={locale === "de" ? "E-Mail-Adresse" : "E-mail address"} locale={locale} />
      )}
      {CONTACT.phone && (
        <>
          <br />
          {phone}: {CONTACT.phone}
        </>
      )}
    </p>
  );
}

export function ImpressumDe() {
  return (
    <section lang="de" aria-labelledby="de">
      <h2 id="de">Angaben gemäß §&nbsp;5 DDG</h2>
      <Address country="Deutschland" locale="de" />
      <Contact email="E-Mail" phone="Telefon" locale="de" />
      <h3>Verantwortlich für den Inhalt nach §&nbsp;18 Abs.&nbsp;2 MStV</h3>
      <p>{SITE.name}, Anschrift wie oben</p>
      <h3>Haftungsausschluss</h3>
      <p>
        Der Windpark-Investitionsrechner ist eine Beispielrechnung für ein fiktives Projekt – keine Anlage-, Steuer- oder
        Rechtsberatung. Die Inhalte wurden sorgfältig geprüft; für ihre Richtigkeit, Vollständigkeit und Aktualität wird
        dennoch keine Gewähr übernommen.
      </p>
      <h3>Externe Links</h3>
      <p>
        Diese Website verweist auf externe Websites, überwiegend auf Quellen. Für deren Inhalte sind allein die jeweiligen
        Betreiber verantwortlich. Die Links wurden beim Setzen geprüft; spätere Änderungen liegen außerhalb meines
        Einflusses.
      </p>
    </section>
  );
}

export function ImpressumEn() {
  return (
    <section lang="en" aria-labelledby="en">
      <h2 id="en">Information pursuant to § 5 DDG (German Digital Services Act)</h2>
      <Address country="Germany" locale="en" />
      <Contact email="E-mail" phone="Phone" locale="en" />
      <h3>Responsible for the content pursuant to § 18 (2) MStV</h3>
      <p>{SITE.name}, address as above</p>
      <h3>Disclaimer</h3>
      <p>
        The wind farm calculator is an illustrative calculation of a fictional project — not investment, tax or legal
        advice. The content has been checked carefully; still, no guarantee is given that it is correct, complete and up
        to date.
      </p>
      <h3>External links</h3>
      <p>
        This site links to external websites, mostly sources. Their operators alone are responsible for their content.
        The links were checked when they were set; later changes are beyond my control.
      </p>
    </section>
  );
}
