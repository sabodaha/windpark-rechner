import { Placeholder } from "@/components/site/Placeholder";
import { pageMetadata } from "@/lib/metadata";
import { CONTACT, PATHS, SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Legal notice (Impressum)",
  description: "Legal notice (Impressum) of igorsabodakha.com, the website of Igor Sabodakha, Wiesbaden.",
  path: PATHS.impressum,
});

function Address({ country }: { country: string }) {
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
          <Placeholder what="Street and postcode" />
          <br />
        </>
      )}
      {country}
    </p>
  );
}

function Contact({ email, phone }: { email: string; phone: string }) {
  return (
    <p>
      {email}:{" "}
      {CONTACT.email ? <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> : <Placeholder what="E-mail address" />}
      {CONTACT.phone && (
        <>
          <br />
          {phone}: {CONTACT.phone}
        </>
      )}
    </p>
  );
}

export default function ImpressumPage() {
  return (
    <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Legal notice (Impressum)</h1>
      <p className="text-sm text-muted-foreground">
        English below the German text: <a href="#en">English version</a>
      </p>

      <section lang="de" aria-labelledby="de">
        <h2 id="de">Angaben gemäß § 5 DDG</h2>
        <Address country="Deutschland" />
        <Contact email="E-Mail" phone="Telefon" />
        <h3>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h3>
        <p>{SITE.name}, Anschrift wie oben</p>
        <h3>Haftungsausschluss</h3>
        <p>
          Der Windpark-Rechner ist eine Beispielrechnung für ein fiktives Projekt — keine Anlage-, Steuer- oder
          Rechtsberatung. Die Inhalte wurden sorgfältig geprüft; für ihre Richtigkeit, Vollständigkeit und Aktualität
          wird dennoch keine Gewähr übernommen.
        </p>
        <h3>Externe Links</h3>
        <p>
          Diese Website verweist auf externe Websites, überwiegend auf Quellen. Für deren Inhalte sind allein die
          jeweiligen Betreiber verantwortlich. Die Links wurden beim Setzen geprüft; spätere Änderungen liegen außerhalb
          meines Einflusses.
        </p>
      </section>

      <section lang="en" aria-labelledby="en">
        <h2 id="en">Information pursuant to § 5 DDG (German Digital Services Act)</h2>
        <Address country="Germany" />
        <Contact email="E-mail" phone="Phone" />
        <h3>Responsible for the content pursuant to § 18 (2) MStV</h3>
        <p>{SITE.name}, address as above</p>
        <h3>Disclaimer</h3>
        <p>
          The wind farm calculator is an illustrative calculation of a fictional project — not investment, tax or legal
          advice. The content has been checked carefully; still, no guarantee is given that it is correct, complete and
          up to date.
        </p>
        <h3>External links</h3>
        <p>
          This site links to external websites, mostly sources. Their operators alone are responsible for their content.
          The links were checked when they were set; later changes are beyond my control.
        </p>
      </section>
    </article>
  );
}
