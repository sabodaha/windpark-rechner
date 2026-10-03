import Link from "next/link";
import { PATHS } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Ukraine | Germany in the battery calculators' headers (spec v1.2 §12): two links, the current market marked. */
export function MarketSwitch({ current, ukraine, germany, label }: { current: "ukraine" | "germany"; ukraine: string; germany: string; label: string }) {
  const items = [
    { id: "ukraine" as const, href: PATHS.bess, text: ukraine },
    { id: "germany" as const, href: PATHS.bessDe, text: germany },
  ];
  return (
    <nav aria-label={label} className="flex rounded-md border border-border bg-card p-0.5 text-xs">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          aria-current={i.id === current ? "page" : undefined}
          className={cn(
            "rounded px-2 py-0.5 font-medium transition-colors",
            i.id === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {i.text}
        </Link>
      ))}
    </nav>
  );
}
