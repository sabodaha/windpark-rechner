import Link from "next/link";
import { DATA_AS_OF } from "@/engine";
import { FORMAT } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { paths, SITE } from "@/lib/site";
import { MESSAGES } from "@/messages";

/** Footer on every page: the author block, the disclaimer and the legal links. */
export function SiteFooter({ locale }: { locale: Locale }) {
  const m = MESSAGES[locale];
  const t = m.site;
  const P = paths(locale);
  const link = "rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <footer className="no-print mt-12 border-t border-border bg-card/60 text-sm">
      <div className="mx-auto grid w-full max-w-[1400px] gap-8 px-4 py-8 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="footer-author">
          <h2 id="footer-author" className="font-semibold">
            {t.footer.aboutTitle}
          </h2>
          <p className="mt-2 max-w-prose text-muted-foreground">{t.footer.about}</p>
          <Link href={P.about} className={`mt-2 inline-block font-medium text-link ${link}`}>
            {t.footer.more} →
          </Link>
        </section>
        <nav aria-labelledby="footer-site">
          <h2 id="footer-site" className="font-semibold">
            {t.footer.site}
          </h2>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            {(
              [
                [P.calculator, t.nav.calculator, P.methodology, P.sources],
                [P.bess, t.nav.bess, P.bessMethodology, P.bessSources],
              ] as const
            ).map(([home, name, methodology, sources]) => (
              <li key={home}>
                <Link href={home} className={link}>
                  {name}
                </Link>
                <span className="mt-0.5 flex gap-3 pl-3 text-xs">
                  <Link href={methodology} className={link}>
                    {t.nav.methodology}
                  </Link>
                  <Link href={sources} className={link}>
                    {t.nav.sources}
                  </Link>
                </span>
              </li>
            ))}
            <li>
              <Link href={P.about} className={link}>
                {t.nav.about}
              </Link>
            </li>
            <li>
              <a href={SITE.repository} className={link}>
                {t.footer.sourceCode}
              </a>
            </li>
          </ul>
        </nav>
        <nav aria-labelledby="footer-legal">
          <h2 id="footer-legal" className="font-semibold">
            {t.footer.legal}
          </h2>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li>
              <Link href={P.impressum} className={link}>
                {t.footer.impressum}
              </Link>
            </li>
            <li>
              <Link href={P.privacy} className={link}>
                {t.footer.privacy}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p>{t.footer.disclaimer}</p>
          <p>
            {t.footer.noTracking} {t.footer.dataAsOf} {FORMAT[locale].dateLabel(DATA_AS_OF)}. © {DATA_AS_OF.slice(0, 4)} {t.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
