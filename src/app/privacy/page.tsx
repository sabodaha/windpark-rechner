import Link from "next/link";
import { Placeholder } from "@/components/site/Placeholder";
import { pageMetadata } from "@/lib/metadata";
import { CONTACT, PATHS, SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "Privacy policy of igorsabodakha.com: no cookies, no tracking, no third-party content. The calculator runs in your browser.",
  path: PATHS.privacy,
});

const STORAGE_KEY = "windpark-rechner:v1:inputs";
const CLOUDFLARE_POLICY = "https://www.cloudflare.com/privacypolicy/";
const HESSEN_DPA = "https://datenschutz.hessen.de/";

function Controller() {
  return (
    <p>
      {SITE.name}
      <br />
      {CONTACT.addressLines ? CONTACT.addressLines.join(", ") : <Placeholder what="Postal address" />}
      <br />
      {CONTACT.email ? <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> : <Placeholder what="E-mail address" />}
    </p>
  );
}

export default function PrivacyPage() {
  return (
    <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy policy</h1>
      <p className="text-sm text-muted-foreground">
        Deutsche Fassung unten: <a href="#de">Datenschutzerklärung</a>
      </p>

      <section lang="en" aria-labelledby="en-summary">
        <h2 id="en-summary">In short</h2>
        <p>
          This site sets no cookies, uses no analytics or tracking and loads no content from third parties; its fonts are
          served from this site. There is no contact form. The <Link href={PATHS.calculator}>calculator</Link> runs
          entirely in your browser: your inputs are not sent to the server.
        </p>

        <h2 id="en-controller">Controller</h2>
        <Controller />

        <h2 id="en-hosting">Hosting and server logs</h2>
        <p>
          The site is hosted by Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA (Cloudflare Pages). To
          deliver the pages and protect them against attacks, Cloudflare processes technical data of every request: IP
          address, date and time, the page requested, the referring page, browser and operating system.
        </p>
        <p>
          Legal basis: Art. 6 (1) (f) GDPR — the legitimate interest in delivering the site securely and reliably.
          Cloudflare acts as a processor (Art. 28 GDPR). Data may be transferred to the USA; Cloudflare is certified under
          the EU–US Data Privacy Framework, for which the European Commission has adopted an adequacy decision (Art. 45
          GDPR). Details: <a href={CLOUDFLARE_POLICY}>Cloudflare privacy policy</a>.
        </p>

        <h2 id="en-storage">Local storage in your browser</h2>
        <p>
          Once you change an input, the calculator keeps your latest inputs in your browser’s local storage (key{" "}
          <code>{STORAGE_KEY}</code>), so they are still there on your next visit. This data stays on your device and is
          never sent to the server. It is deleted when you press “Reset” or clear this site’s data in your browser. Legal
          basis: § 25 (2) no. 2 TDDDG.
        </p>

        <h2 id="en-downloads">Downloads and links</h2>
        <p>
          The Excel file is created in your browser; no data is transmitted. Links to other websites, for example to
          sources, take you to other providers, whose privacy policies apply.
        </p>

        <h2 id="en-email">Contact by e-mail</h2>
        <p>
          If you write to me, I process your e-mail address and message to reply (Art. 6 (1) (f) GDPR; Art. 6 (1) (b)
          GDPR where the enquiry concerns a contract). I delete them when they are no longer needed, unless statutory
          retention periods apply.
        </p>

        <h2 id="en-rights">Your rights</h2>
        <p>
          You have the right to access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of
          processing (Art. 18), data portability (Art. 20) and to object (Art. 21). Write to the address above. You may
          also lodge a complaint with a supervisory authority (Art. 77 GDPR), for example the{" "}
          <a href={HESSEN_DPA}>Hessian Commissioner for Data Protection and Freedom of Information</a>.
        </p>
        <p>There is no automated decision-making or profiling. As of September 2026.</p>
      </section>

      <section lang="de" aria-labelledby="de">
        <h2 id="de">Datenschutzerklärung</h2>
        <h3>Kurz gesagt</h3>
        <p>
          Diese Website setzt keine Cookies, nutzt keine Analyse- oder Tracking-Dienste und lädt keine Inhalte von
          Dritten; die Schriften werden von dieser Website geladen. Es gibt kein Kontaktformular. Der Rechner läuft
          vollständig in Ihrem Browser: Ihre Eingaben werden nicht an den Server übertragen.
        </p>

        <h3>Verantwortlicher</h3>
        <Controller />

        <h3>Hosting und Server-Logfiles</h3>
        <p>
          Die Website wird bei Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA (Cloudflare Pages)
          gehostet. Um die Seiten auszuliefern und vor Angriffen zu schützen, verarbeitet Cloudflare bei jedem Aufruf
          technische Daten: IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, verweisende Seite, Browser und
          Betriebssystem.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der sicheren und
          zuverlässigen Bereitstellung der Website. Cloudflare ist Auftragsverarbeiter (Art. 28 DSGVO). Eine Übermittlung
          in die USA ist möglich; Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert, für das ein
          Angemessenheitsbeschluss der Europäischen Kommission vorliegt (Art. 45 DSGVO). Einzelheiten:{" "}
          <a href={CLOUDFLARE_POLICY}>Datenschutzerklärung von Cloudflare</a>.
        </p>

        <h3>Lokaler Speicher im Browser</h3>
        <p>
          Sobald Sie eine Eingabe ändern, speichert der Rechner Ihre zuletzt verwendeten Eingaben im lokalen Speicher
          Ihres Browsers (Schlüssel <code>{STORAGE_KEY}</code>), damit sie beim nächsten Besuch erhalten bleiben. Die
          Daten verbleiben auf Ihrem Gerät und werden nicht an den Server übertragen. Sie werden gelöscht, wenn Sie
          „Reset“ wählen oder die Websitedaten in Ihrem Browser löschen. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG.
        </p>

        <h3>Downloads und Links</h3>
        <p>
          Die Excel-Datei wird in Ihrem Browser erzeugt; dabei werden keine Daten übertragen. Links auf andere Websites,
          etwa auf Quellen, führen zu anderen Anbietern, deren Datenschutzerklärungen gelten.
        </p>

        <h3>Kontakt per E-Mail</h3>
        <p>
          Wenn Sie mir schreiben, verarbeite ich Ihre E-Mail-Adresse und Nachricht, um zu antworten (Art. 6 Abs. 1 lit. f
          DSGVO; bei Anfragen zu einem Vertrag Art. 6 Abs. 1 lit. b DSGVO). Ich lösche sie, sobald sie nicht mehr
          erforderlich sind, soweit keine gesetzlichen Aufbewahrungspflichten bestehen.
        </p>

        <h3>Ihre Rechte</h3>
        <p>
          Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
          Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Wenden Sie sich dazu an die
          oben genannte Adresse. Sie können sich außerdem bei einer Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum
          Beispiel beim <a href={HESSEN_DPA}>Hessischen Beauftragten für Datenschutz und Informationsfreiheit</a>.
        </p>
        <p>Eine automatisierte Entscheidungsfindung oder ein Profiling findet nicht statt. Stand: September 2026.</p>
      </section>
    </article>
  );
}
