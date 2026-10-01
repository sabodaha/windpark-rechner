// The privacy policy in English and in German. The English page shows both; the German page shows the German text
// on its own, one heading level higher.
import Link from "next/link";
import { Placeholder } from "@/components/site/Placeholder";
import type { Locale } from "@/lib/i18n";
import { CONTACT, PAGE_PATHS, SITE } from "@/lib/site";
import { MESSAGES } from "@/messages";

const STORAGE_KEY = "windpark-rechner:v1:inputs";
const CLOUDFLARE_POLICY = "https://www.cloudflare.com/privacypolicy/";
const HESSEN_DPA = "https://datenschutz.hessen.de/";

function Controller({ locale }: { locale: Locale }) {
  const de = locale === "de";
  return (
    <p>
      {SITE.name}
      <br />
      {CONTACT.addressLines ? CONTACT.addressLines.join(", ") : <Placeholder what={de ? "Postanschrift" : "Postal address"} locale={locale} />}
      <br />
      {CONTACT.email ? (
        <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
      ) : (
        <Placeholder what={de ? "E-Mail-Adresse" : "E-mail address"} locale={locale} />
      )}
    </p>
  );
}

export function PrivacyEn() {
  return (
    <section lang="en" aria-labelledby="en-summary">
      <h2 id="en-summary">In short</h2>
      <p>
        This site sets no cookies, uses no analytics or tracking and loads no content from third parties; its fonts are
        served from this site. There is no contact form. The <Link href={PAGE_PATHS.en.calculator}>calculator</Link> runs
        entirely in your browser: what you enter is calculated there and not sent to the server. Only when an address
        that contains inputs is loaded — when you open, reload or share a calculator link with inputs after the “?” —
        does that address, inputs included, reach the server like any page address (see “Hosting and server logs”).
      </p>

      <h2 id="en-controller">Controller</h2>
      <Controller locale="en" />

      <h2 id="en-hosting">Hosting and server logs</h2>
      <p>
        The site is hosted by Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA (Cloudflare Pages). To
        deliver the pages and protect them against attacks, Cloudflare processes technical data of every request: IP
        address, date and time, the page requested (its full address, including any inputs in a calculator link), the
        referring page, browser and operating system.
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
        The Excel file is created in your browser; no data is transmitted. The report of your own inputs opens as a page
        whose address contains them; you save it as a PDF in your browser. Links to other websites, for example to
        sources, take you to other providers, whose privacy policies apply.
      </p>

      <h2 id="en-email">Contact by e-mail</h2>
      <p>
        If you write to me, I process your e-mail address and message to reply (Art. 6 (1) (f) GDPR; Art. 6 (1) (b) GDPR
        where the enquiry concerns a contract). I delete them when they are no longer needed, unless statutory retention
        periods apply.
      </p>

      <h2 id="en-rights">Your rights</h2>
      <p>
        You have the right to access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of
        processing (Art. 18), data portability (Art. 20) and to object (Art. 21). Write to the address above. You may
        also lodge a complaint with a supervisory authority (Art. 77 GDPR), for example the{" "}
        <a href={HESSEN_DPA}>Hessian Commissioner for Data Protection and Freedom of Information</a>.
      </p>
      <p>There is no automated decision-making or profiling. As of October 2026.</p>
    </section>
  );
}

/**
 * The German text. On the English page (`standalone` false) it is a section under its own heading and names the
 * English interface's button; on the German page its parts are the page's main sections.
 */
export function PrivacyDe({ standalone = false }: { standalone?: boolean }) {
  const H = standalone ? "h2" : "h3";
  const reset = standalone ? MESSAGES.de.actions.reset : MESSAGES.en.actions.reset;
  const calculator = standalone ? <Link href={PAGE_PATHS.de.calculator}>Rechner</Link> : "Rechner";
  return (
    <section lang="de" aria-labelledby={standalone ? "de-summary" : "de"}>
      {!standalone && <h2 id="de">Datenschutzerklärung</h2>}
      <H id={standalone ? "de-summary" : undefined}>Kurz gesagt</H>
      <p>
        Diese Website setzt keine Cookies, nutzt keine Analyse- oder Tracking-Dienste und lädt keine Inhalte von Dritten;
        die Schriften werden von dieser Website geladen. Es gibt kein Kontaktformular. Der {calculator} läuft vollständig
        in Ihrem Browser: Ihre Eingaben werden dort berechnet und nicht an den Server übertragen. Nur wenn eine Adresse mit
        Eingaben aufgerufen wird – wenn Sie einen Rechner-Link mit Eingaben nach dem „?“ öffnen, neu laden oder
        weitergeben –, erreicht diese Adresse samt Eingaben den Server wie jede Seitenadresse (siehe „Hosting und
        Server-Logfiles“).
      </p>

      <H id={standalone ? "de-controller" : undefined}>Verantwortlicher</H>
      <Controller locale="de" />

      <H id={standalone ? "de-hosting" : undefined}>Hosting und Server-Logfiles</H>
      <p>
        Die Website wird bei Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA (Cloudflare Pages) gehostet.
        Um die Seiten auszuliefern und vor Angriffen zu schützen, verarbeitet Cloudflare bei jedem Aufruf technische Daten:
        IP-Adresse, Datum und Uhrzeit, aufgerufene Seite (die vollständige Adresse, einschließlich etwaiger Eingaben in
        einem Rechner-Link), verweisende Seite, Browser und Betriebssystem.
      </p>
      <p>
        Rechtsgrundlage ist Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;f DSGVO; das berechtigte Interesse liegt in der sicheren und
        zuverlässigen Bereitstellung der Website. Cloudflare ist Auftragsverarbeiter (Art.&nbsp;28 DSGVO). Eine
        Übermittlung in die USA ist möglich; Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert, für das ein
        Angemessenheitsbeschluss der Europäischen Kommission vorliegt (Art.&nbsp;45 DSGVO). Einzelheiten:{" "}
        <a href={CLOUDFLARE_POLICY}>Datenschutzerklärung von Cloudflare</a>.
      </p>

      <H id={standalone ? "de-storage" : undefined}>Lokaler Speicher im Browser</H>
      <p>
        Sobald Sie eine Eingabe ändern, speichert der Rechner Ihre zuletzt verwendeten Eingaben im lokalen Speicher Ihres
        Browsers (Schlüssel <code>{STORAGE_KEY}</code>), damit sie beim nächsten Besuch erhalten bleiben. Die Daten
        verbleiben auf Ihrem Gerät und werden nicht an den Server übertragen. Sie werden gelöscht, wenn Sie „{reset}“
        wählen oder die Websitedaten in Ihrem Browser löschen. Rechtsgrundlage ist §&nbsp;25 Abs.&nbsp;2 Nr.&nbsp;2 TDDDG.
      </p>

      <H id={standalone ? "de-downloads" : undefined}>Downloads und Links</H>
      <p>
        Die Excel-Datei wird in Ihrem Browser erzeugt; dabei werden keine Daten übertragen. Der Bericht zu Ihren eigenen
        Eingaben öffnet sich als Seite, deren Adresse diese Eingaben enthält; als PDF speichern Sie ihn in Ihrem Browser.
        Links auf andere Websites, etwa auf Quellen, führen zu anderen Anbietern, deren Datenschutzerklärungen gelten.
      </p>

      <H id={standalone ? "de-email" : undefined}>Kontakt per E-Mail</H>
      <p>
        Wenn Sie mir schreiben, verarbeite ich Ihre E-Mail-Adresse und Nachricht, um zu antworten (Art.&nbsp;6 Abs.&nbsp;1
        lit.&nbsp;f DSGVO; bei Anfragen zu einem Vertrag Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO). Ich lösche sie, sobald
        sie nicht mehr erforderlich sind, soweit keine gesetzlichen Aufbewahrungspflichten bestehen.
      </p>

      <H id={standalone ? "de-rights" : undefined}>Ihre Rechte</H>
      <p>
        Sie haben das Recht auf Auskunft (Art.&nbsp;15 DSGVO), Berichtigung (Art.&nbsp;16), Löschung (Art.&nbsp;17),
        Einschränkung der Verarbeitung (Art.&nbsp;18), Datenübertragbarkeit (Art.&nbsp;20) und Widerspruch
        (Art.&nbsp;21). Wenden Sie sich dazu an die oben genannte Adresse. Sie können sich außerdem bei einer
        Aufsichtsbehörde beschweren (Art.&nbsp;77 DSGVO), zum Beispiel beim{" "}
        <a href={HESSEN_DPA}>Hessischen Beauftragten für Datenschutz und Informationsfreiheit</a>.
      </p>
      <p>Eine automatisierte Entscheidungsfindung oder ein Profiling findet nicht statt. Stand: Oktober 2026.</p>
    </section>
  );
}
