import Link from "next/link";
import { PATHS } from "@/lib/site";
import { en } from "@/messages/en";
import { NavLinks } from "./NavLinks";

const t = en.site;

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-card/60">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
        <Link
          href={PATHS.home}
          className="w-fit rounded-md text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.name}
        </Link>
        <NavLinks
          label={t.navLabel}
          items={[
            { href: PATHS.calculator, label: t.nav.calculator, short: t.nav.calculatorShort },
            { href: PATHS.methodology, label: t.nav.methodology },
            { href: PATHS.sources, label: t.nav.sources },
            { href: PATHS.about, label: t.nav.about },
          ]}
        />
      </div>
    </header>
  );
}
