"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  /** Shown instead of the label on phones, so the whole menu fits on one line. */
  short?: string;
}

/** Main navigation; marks the current page, and a calculator's link also on its methodology and sources pages. */
export function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const here = pathname.endsWith("/") ? pathname : `${pathname}/`;
  /** A home page ("/", "/de/") is never a section: every address starts with it. */
  const home = (href: string) => /^\/([a-z]{2}\/)?$/.test(href);
  const current = (href: string): "page" | "true" | undefined =>
    here === href ? "page" : !home(href) && here.startsWith(href) ? "true" : undefined;
  return (
    <nav aria-label={label} className="-mx-1.5 overflow-x-auto [scrollbar-width:none] sm:-mx-2">
      <ul className="flex items-center gap-1 whitespace-nowrap text-sm">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={current(it.href)}
              className={cn(
                "rounded-md px-1.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2",
                current(it.href) && "font-medium text-foreground",
              )}
            >
              {it.short ? (
                <>
                  <span className="sm:hidden">{it.short}</span>
                  <span className="hidden sm:inline">{it.label}</span>
                </>
              ) : (
                it.label
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
