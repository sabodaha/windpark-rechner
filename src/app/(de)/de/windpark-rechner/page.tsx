import { Calculator } from "@/components/calculator/Calculator";
import { JsonLd } from "@/components/site/JsonLd";
import { pageMetadata } from "@/lib/metadata";
import { absoluteUrl, breadcrumbJsonLd, graph, paths, PERSON_ID, SITE } from "@/lib/site";
import { de } from "@/messages/de";

const P = paths("de");

export const metadata = pageMetadata({ title: de.meta.title, description: de.meta.description, path: P.calculator });

// As the English page: the static HTML already shows the base case, in German formats.
export default function WindparkRechnerPage() {
  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "WebApplication",
            "@id": `${absoluteUrl(P.calculator)}#app`,
            name: de.meta.title,
            url: absoluteUrl(P.calculator),
            description: de.meta.description,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Beliebig (Webbrowser)",
            browserRequirements: "Erfordert JavaScript",
            inLanguage: "de",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            author: { "@id": PERSON_ID },
            dateModified: SITE.updated,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: P.home },
            { name: de.meta.title, path: P.calculator },
          ]),
        )}
      />
      <Calculator />
    </>
  );
}
