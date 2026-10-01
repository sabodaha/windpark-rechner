"use client";

// EN | DE: the same page in the other language, or its home page where that language has no such page yet. The
// calculator keeps its inputs: the link carries the current query.
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { LANGUAGE_NAME, PUBLISHED_LOCALES, type Locale } from "@/lib/i18n";
import { hasPage, PAGE_PATHS, pageOf } from "@/lib/site";
import { cn } from "@/lib/utils";

export function LanguageSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const here = pageOf(pathname);
  const target = (other: Locale) => PAGE_PATHS[other][here && hasPage(other, here.page) ? here.page : "home"];
  // The pages of the two languages have different root layouts: a full page load, with the calculator's inputs.
  const go = (e: MouseEvent<HTMLAnchorElement>, other: Locale) => {
    if (here?.page !== "calculator" || !window.location.search) return;
    e.preventDefault();
    window.location.assign(`${target(other)}${window.location.search}`);
  };
  return (
    <ul className="flex items-center text-sm" aria-label="Language / Sprache">
      {PUBLISHED_LOCALES.map((l, i) => (
        <li key={l} className="flex items-center">
          {i > 0 && (
            <span className="px-1 text-muted-foreground" aria-hidden>
              |
            </span>
          )}
          {l === locale ? (
            <span aria-current="true" className="rounded-md px-1 py-1.5 font-medium" title={LANGUAGE_NAME[l]}>
              {l.toUpperCase()}
            </span>
          ) : (
            <a
              href={target(l)}
              hrefLang={l}
              lang={l}
              title={LANGUAGE_NAME[l]}
              onClick={(e) => go(e, l)}
              className={cn(
                "rounded-md px-1 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {l.toUpperCase()}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
