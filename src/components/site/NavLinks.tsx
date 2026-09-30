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

/** Main navigation; marks the current page (the calculator link stays active on its sub-pages only by exact match). */
export function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const current = (href: string) => {
    const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
    return p === href;
  };
  return (
    <nav aria-label={label} className="-mx-1.5 overflow-x-auto [scrollbar-width:none] sm:-mx-2">
      <ul className="flex items-center gap-1 whitespace-nowrap text-sm">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={current(it.href) ? "page" : undefined}
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
