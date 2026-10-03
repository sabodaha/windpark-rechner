import { DE_UPDATED } from "@/bess/de/data";
import { deEn } from "@/bess/de/messages";
import { deBase, loadDeLibrary, loadDeStats } from "@/bess/de/server";
import { bessEn } from "@/bess/messages";
import { DeCalculator } from "@/components/bess-de/DeCalculator";
import { JsonLd } from "@/components/site/JsonLd";
import { BESS_DE_OG_IMAGE, pageMetadata } from "@/lib/metadata";
import { absoluteUrl, BESS_DE_ID, breadcrumbJsonLd, graph, PATHS, PERSON_ID, SITE } from "@/lib/site";

export const metadata = pageMetadata({ title: deEn.meta.title, description: deEn.meta.description, path: PATHS.bessDe, image: BESS_DE_OG_IMAGE });

// The calculator is a client component; the base case — its break-even toll price, sensitivity and the comparison with
// Ukraine included — is computed here at build time, so the static HTML already shows its results. Other inputs are
// calculated in the browser by a worker that loads the revenue library.
export default function GermanBatteryStorageCalculatorPage() {
  const base = deBase();
  const stats = loadDeStats().snapshots;
  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "WebApplication",
            "@id": BESS_DE_ID,
            name: deEn.meta.title,
            url: absoluteUrl(PATHS.bessDe),
            description: deEn.meta.description,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any (web browser)",
            browserRequirements: "Requires JavaScript",
            inLanguage: "en",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            author: { "@id": PERSON_ID },
            dateModified: DE_UPDATED,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: bessEn.meta.breadcrumb, path: PATHS.bess },
            { name: deEn.meta.breadcrumb, path: PATHS.bessDe },
          ]),
        )}
      />
      <DeCalculator initial={base} stats={stats} libraryVersion={loadDeLibrary().manifest.version} />
    </>
  );
}
