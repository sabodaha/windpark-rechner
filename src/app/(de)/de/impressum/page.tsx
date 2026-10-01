import { ImpressumDe } from "@/components/legal/Impressum";
import { pageMetadata } from "@/lib/metadata";
import { paths } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Impressum",
  description: "Impressum von igorsabodakha.com, der Website von Igor Sabodakha, Wiesbaden.",
  path: paths("de").impressum,
});

export default function ImpressumPage() {
  return (
    <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Impressum</h1>
      <ImpressumDe />
    </article>
  );
}
