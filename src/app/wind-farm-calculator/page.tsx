import { Calculator } from "@/components/calculator/Calculator";
import { JsonLd } from "@/components/site/JsonLd";
import { pageMetadata } from "@/lib/metadata";
import { absoluteUrl, breadcrumbJsonLd, CALCULATOR_ID, graph, PATHS, PERSON_ID, SITE } from "@/lib/site";
import { en } from "@/messages/en";

export const metadata = pageMetadata({ title: en.meta.title, description: en.meta.description, path: PATHS.calculator });

// The calculator is a client component, but it is rendered at build time with the base case, so the
// static HTML already contains the KPIs, charts and tables.
export default function WindFarmCalculatorPage() {
  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "WebApplication",
            "@id": CALCULATOR_ID,
            name: en.meta.title,
            url: absoluteUrl(PATHS.calculator),
            description: en.meta.description,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any (web browser)",
            browserRequirements: "Requires JavaScript",
            inLanguage: "en",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            author: { "@id": PERSON_ID },
            dateModified: SITE.updated,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: en.meta.title, path: PATHS.calculator },
          ]),
        )}
      />
      <Calculator />
    </>
  );
}
