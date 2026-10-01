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
  // Up to tablets: the name and the language switch share the first line, the menu has the second to itself. Wider
  // screens: one line, the switch after the menu.
  return (
    <header className="no-print border-b border-border bg-card/60">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-6 md:flex-nowrap md:gap-x-4">
        <Link
          href={P.home}
          className="w-fit shrink-0 whitespace-nowrap rounded-md text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.name}
        </Link>
        {PUBLISHED_LOCALES.length > 1 && (
          <div className="ml-auto md:order-last md:ml-0">
            <LanguageSwitch locale={locale} />
          </div>
        )}
        <div className="w-full min-w-0 md:ml-auto md:w-auto">{nav}</div>
      </div>
    </header>
  );
}
