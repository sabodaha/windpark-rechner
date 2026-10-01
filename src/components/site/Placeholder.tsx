import type { Locale } from "@/lib/i18n";
import { MESSAGES } from "@/messages";

/** Visible marker for content that must be supplied before the site goes live. */
export function Placeholder({ what, locale = "en" }: { what: string; locale?: Locale }) {
  return (
    <mark className="rounded bg-warning/25 px-1.5 py-0.5 text-foreground" data-placeholder>
      [{what} — {MESSAGES[locale].site.placeholder}]
    </mark>
  );
}
