import { PrivacyDe } from "@/components/legal/Privacy";
import { pageMetadata } from "@/lib/metadata";
import { paths } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Datenschutzerklärung",
  description:
    "Datenschutzerklärung von igorsabodakha.com: keine Cookies, kein Tracking, keine Inhalte von Dritten. Der Rechner läuft in Ihrem Browser.",
  path: paths("de").privacy,
});

export default function DatenschutzPage() {
  return (
    <article className="prose-page mx-auto w-full max-w-3xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Datenschutzerklärung</h1>
      <PrivacyDe standalone />
    </article>
  );
}
