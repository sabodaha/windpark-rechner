import { PrivacyDe, PrivacyEn } from "@/components/legal/Privacy";
import { pageMetadata } from "@/lib/metadata";
import { PATHS } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "Privacy policy of igorsabodakha.com: no cookies, no tracking, no third-party content. The calculator runs in your browser.",
  path: PATHS.privacy,
});

export default function PrivacyPage() {
  return (
    <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy policy</h1>
      <p className="text-sm text-muted-foreground">
        Deutsche Fassung unten: <a href="#de">Datenschutzerklärung</a>
      </p>
      <PrivacyEn />
      <PrivacyDe />
    </article>
  );
}
