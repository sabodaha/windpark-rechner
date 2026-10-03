// The privacy policy in English and in German. The English page shows both; the German page shows the German text
// on its own, one heading level higher.
import Link from "next/link";
import { Placeholder } from "@/components/site/Placeholder";
import type { Locale } from "@/lib/i18n";
import { CONTACT, PAGE_PATHS, SITE } from "@/lib/site";
import { bessEn } from "@/bess/messages";
import { DE_STORAGE_KEY } from "@/bess/de/url-state";
import { BESS_STORAGE_KEY } from "@/bess/url-state";
import { STORAGE_KEY } from "@/lib/url-state";
import { MESSAGES } from "@/messages";

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
        served from this site. There is no contact form. The <Link href={PAGE_PATHS.en.calculator}>wind farm</Link> and the
        battery storage calculators for <Link href={PAGE_PATHS.en.bess}>Ukraine</Link> and{" "}
        <Link href={PAGE_PATHS.en.bessDe}>Germany</Link> run entirely in your browser: what you enter is
        calculated there and not sent to the server. Only when an address that contains inputs is loaded — when you, or
        someone you shared it with, open or reload a calculator link with inputs after the “?” — does that address, inputs
        included, reach the server like any page address (see “Hosting and server logs”). When you change an input of a
        battery storage calculator, your browser downloads its revenue data, a file of this site; with your own inputs, the
        German calculator’s comparison tab also downloads the Ukrainian revenue data. These requests contain no inputs.
      </p>

      <h2 id="en-controller">Controller</h2>
      <Controller locale="en" />

      <h2 id="en-hosting">Hosting and server logs</h2>
      <p>
        The site is hosted by Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA (Cloudflare Pages). To
        deliver the pages and protect them against attacks, Cloudflare processes technical data of every request: IP
        address, date and time, the page requested (its full address, including any inputs in a calculator link), the
        referring page, browser and operating system. This data is kept only as long as delivering and protecting the site
        requires; Cloudflare’s privacy policy names no fixed period.
      </p>
      <p>
        Legal basis: Art. 6 (1) (f) GDPR — the legitimate interest in delivering the site securely and reliably.
        Cloudflare acts as a processor (Art. 28 GDPR). Data may be transferred to the USA; Cloudflare is certified under
        the EU–US Data Privacy Framework, for which the European Commission has adopted an adequacy decision (Art. 45
        GDPR). Details: <a href={CLOUDFLARE_POLICY}>Cloudflare privacy policy</a>.
      </p>

      <h2 id="en-storage">Local storage in your browser</h2>
      <p>
        Only if you tick “{MESSAGES.en.actions.remember}” in a calculator does it keep your latest inputs in your
        browser’s local storage (key <code>{STORAGE_KEY}</code> for the wind farm calculator,{" "}
        <code>{BESS_STORAGE_KEY}</code> and <code>{DE_STORAGE_KEY}</code> for the battery storage calculators for Ukraine
        and Germany), so they are still there on your next visit;
        without the tick nothing is stored. Local storage itself is never sent to the server; a calculator address with inputs reaches
        the server only when it is loaded, as described above. The stored inputs are deleted when you untick the box or
        clear this site’s data in your browser. Legal basis: § 25 (2) no. 2 TDDDG — storage you have expressly asked for.
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
        Subject to the conditions of the law, you have the right to access (Art. 15 GDPR), rectification (Art. 16),
        erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to object (Art. 21). Write
        to the address above. You may also lodge a complaint with a supervisory authority (Art. 77 GDPR), for example the{" "}
        <a href={HESSEN_DPA}>Hessian Commissioner for Data Protection and Freedom of Information</a>.
      </p>

      <h2 id="en-objection">Right to object</h2>
      <p>
        Where I process your data on the basis of Art. 6 (1) (f) GDPR, you may object to this processing at any time on
        grounds relating to your particular situation (Art. 21 GDPR). Write to the address above.
      </p>
      <p>There is no automated decision-making or profiling. As of October 2026.</p>
    </section>
  );
}

/**
 * The German text. On the English page (`standalone` false) it is a section under its own heading and names the
 * English interface's checkbox; on the German page its parts are the page's main sections.
 */
export function PrivacyDe({ standalone = false }: { standalone?: boolean }) {
  const H = standalone ? "h2" : "h3";
  const remember = standalone ? MESSAGES.de.actions.remember : MESSAGES.en.actions.remember;
  const calculator = standalone ? <Link href={PAGE_PATHS.de.calculator}>Rechner</Link> : "Rechner";
  return (
    <section lang="de" aria-labelledby={standalone ? "de-summary" : "de"}>
      {!standalone && <h2 id="de">Datenschutzerklärung</h2>}
      <H id={standalone ? "de-summary" : undefined}>Kurz gesagt</H>
      <p>
        Diese Website setzt keine Cookies, nutzt keine Analyse- oder Tracking-Dienste und lädt keine Inhalte von Dritten;
        die Schriften werden von dieser Website geladen. Es gibt kein Kontaktformular. Der {calculator} und die
        Batteriespeicher-Rechner für die Ukraine und Deutschland (auf Englisch) laufen vollständig in Ihrem Browser: Ihre
        Eingaben werden dort berechnet
        und nicht an den Server übertragen. Nur wenn eine Adresse mit Eingaben aufgerufen wird – wenn Sie oder eine Person,
        an die Sie den Link weitergegeben haben, einen Rechner-Link mit Eingaben nach dem „?“ öffnen oder neu laden –,
        erreicht diese Adresse samt Eingaben den Server wie jede Seitenadresse (siehe „Hosting und Server-Logfiles“). Ändern
        Sie eine Eingabe in einem Batteriespeicher-Rechner, lädt Ihr Browser dessen Erlösdaten, eine Datei dieser Website;
        mit eigenen Eingaben lädt der Vergleichsreiter des Rechners für Deutschland zusätzlich die ukrainischen Erlösdaten.
        Diese Anfragen enthalten keine Eingaben.
      </p>

      <H id={standalone ? "de-controller" : undefined}>Verantwortlicher</H>
      <Controller locale="de" />

      <H id={standalone ? "de-hosting" : undefined}>Hosting und Server-Logfiles</H>
      <p>
        Die Website wird bei Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA (Cloudflare Pages) gehostet.
        Um die Seiten auszuliefern und vor Angriffen zu schützen, verarbeitet Cloudflare bei jedem Aufruf technische Daten:
        IP-Adresse, Datum und Uhrzeit, aufgerufene Seite (die vollständige Adresse, einschließlich etwaiger Eingaben in
        einem Rechner-Link), verweisende Seite, Browser und Betriebssystem. Diese Daten werden nur so lange gespeichert, wie
        es die Auslieferung und der Schutz der Website erfordern; eine feste Frist nennt die Datenschutzerklärung von
        Cloudflare nicht.
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
        Nur wenn Sie im Rechner „{remember}“ anhaken
        {standalone && <> (im Batteriespeicher-Rechner „{bessEn.actions.remember}“)</>}, speichert er Ihre zuletzt
        verwendeten Eingaben im lokalen Speicher Ihres Browsers (Schlüssel <code>{STORAGE_KEY}</code> für den
        Windpark-Rechner, <code>{BESS_STORAGE_KEY}</code> und <code>{DE_STORAGE_KEY}</code> für die Batteriespeicher-Rechner
        für die Ukraine und Deutschland), damit sie beim nächsten Besuch
        erhalten bleiben; ohne den Haken wird nichts gespeichert. Der lokale Speicher selbst wird nicht an den Server
        übertragen; eine Rechner-Adresse mit Eingaben erreicht den Server nur beim Aufruf, wie oben beschrieben. Die gespeicherten Eingaben werden gelöscht,
        wenn Sie den Haken entfernen oder die Websitedaten in Ihrem Browser löschen. Rechtsgrundlage ist §&nbsp;25
        Abs.&nbsp;2 Nr.&nbsp;2 TDDDG: Die Speicherung erfolgt auf Ihren ausdrücklichen Wunsch.
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
        Unter den jeweiligen gesetzlichen Voraussetzungen haben Sie das Recht auf Auskunft (Art.&nbsp;15 DSGVO),
        Berichtigung (Art.&nbsp;16), Löschung (Art.&nbsp;17), Einschränkung der Verarbeitung (Art.&nbsp;18),
        Datenübertragbarkeit (Art.&nbsp;20) und Widerspruch (Art.&nbsp;21). Wenden Sie sich dazu an die oben genannte
        Adresse. Sie können sich außerdem bei einer Aufsichtsbehörde beschweren (Art.&nbsp;77 DSGVO), zum Beispiel beim{" "}
        <a href={HESSEN_DPA}>Hessischen Beauftragten für Datenschutz und Informationsfreiheit</a>.
      </p>

      <H id={standalone ? "de-objection" : undefined}>Widerspruchsrecht</H>
      <p>
        Verarbeite ich Ihre Daten auf Grundlage von Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;f DSGVO, können Sie dieser
        Verarbeitung aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen (Art.&nbsp;21
        DSGVO). Wenden Sie sich dazu an die oben genannte Adresse.
      </p>
      <p>Eine automatisierte Entscheidungsfindung oder ein Profiling findet nicht statt. Stand: Oktober 2026.</p>
    </section>
  );
}
