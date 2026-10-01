import Link from "next/link";
import { PUBLISHED_LOCALES, type Locale } from "@/lib/i18n";
import { paths } from "@/lib/site";
import { MESSAGES } from "@/messages";
import { LanguageSwitch } from "./LanguageSwitch";
import { NavLinks } from "./NavLinks";

export function SiteHeader({ locale }: { locale: Locale }) {
  const t = MESSAGES[locale].site;
  const P = paths(locale);
  const nav = (
    <NavLinks
      label={t.navLabel}
      items={[
        { href: P.calculator, label: t.nav.calculator, short: t.nav.calculatorShort },
        { href: P.methodology, label: t.nav.methodology },
        { href: P.sources, label: t.nav.sources },
        { href: P.about, label: t.nav.about },
      ]}
    />
  );
  return (
    <header className="no-print border-b border-border bg-card/60">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
        <Link
          href={P.home}
          className="w-fit rounded-md text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.name}
        </Link>
        {PUBLISHED_LOCALES.length > 1 ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {nav}
            <LanguageSwitch locale={locale} />
          </div>
        ) : (
          nav
        )}
      </div>
    </header>
  );
}
