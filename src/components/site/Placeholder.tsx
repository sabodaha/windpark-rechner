import { en } from "@/messages/en";

/** Visible marker for content that must be supplied before the site goes live. */
export function Placeholder({ what }: { what: string }) {
  return (
    <mark className="rounded bg-warning/25 px-1.5 py-0.5 text-foreground" data-placeholder>
      [{what} — {en.site.placeholder}]
    </mark>
  );
}
