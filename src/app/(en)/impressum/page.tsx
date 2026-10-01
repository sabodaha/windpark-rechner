import { ImpressumDe, ImpressumEn } from "@/components/legal/Impressum";
import { pageMetadata } from "@/lib/metadata";
import { PATHS } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Legal notice (Impressum)",
  description: "Legal notice (Impressum) of igorsabodakha.com, the website of Igor Sabodakha, Wiesbaden.",
  path: PATHS.impressum,
});

export default function ImpressumPage() {
  return (
    <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Legal notice (Impressum)</h1>
      <p className="text-sm text-muted-foreground">
        English below the German text: <a href="#en">English version</a>
      </p>
      <ImpressumDe />
      <ImpressumEn />
    </article>
  );
}
