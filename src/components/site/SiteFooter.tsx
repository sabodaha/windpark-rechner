import Link from "next/link";
import { DATA_AS_OF } from "@/engine";
import { dateLabel } from "@/lib/format";
import { PATHS, SITE } from "@/lib/site";
import { en } from "@/messages/en";

const t = en.site;

/** Footer on every page: the author block, the disclaimer and the legal links. */
export function SiteFooter() {
  const link = "rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <footer className="mt-12 border-t border-border bg-card/60 text-sm">
      <div className="mx-auto grid w-full max-w-[1400px] gap-8 px-4 py-8 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="footer-author">
          <h2 id="footer-author" className="font-semibold">
            {t.footer.aboutTitle}
          </h2>
          <p className="mt-2 max-w-prose text-muted-foreground">{t.footer.about}</p>
          <Link href={PATHS.about} className={`mt-2 inline-block font-medium text-link ${link}`}>
            {t.footer.more} →
          </Link>
        </section>
        <nav aria-labelledby="footer-site">
          <h2 id="footer-site" className="font-semibold">
            {t.footer.site}
          </h2>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li>
              <Link href={PATHS.calculator} className={link}>
                {t.nav.calculator}
              </Link>
            </li>
            <li>
              <Link href={PATHS.methodology} className={link}>
                {t.nav.methodology}
              </Link>
            </li>
            <li>
              <Link href={PATHS.sources} className={link}>
                {t.nav.sources}
              </Link>
            </li>
            <li>
              <Link href={PATHS.about} className={link}>
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
              <Link href={PATHS.impressum} className={link}>
                {t.footer.impressum}
              </Link>
            </li>
            <li>
              <Link href={PATHS.privacy} className={link}>
                {t.footer.privacy}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p>{en.header.disclaimer}</p>
          <p>
            {t.footer.noTracking} {t.footer.dataAsOf} {dateLabel(DATA_AS_OF)}. © {DATA_AS_OF.slice(0, 4)} {t.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
