import { BESS_UPDATED } from "@/bess/data";
import { bessEn } from "@/bess/messages";
import { bessBase, loadLibrary, loadStats } from "@/bess/server";
import { BessCalculator } from "@/components/bess/BessCalculator";
import { JsonLd } from "@/components/site/JsonLd";
import { BESS_OG_IMAGE, pageMetadata } from "@/lib/metadata";
import { absoluteUrl, BESS_ID, breadcrumbJsonLd, graph, PATHS, PERSON_ID, SITE } from "@/lib/site";

export const metadata = pageMetadata({ title: bessEn.meta.title, description: bessEn.meta.description, path: PATHS.bess, image: BESS_OG_IMAGE });

// The calculator is a client component; the base case is computed here at build time, so the static HTML already
// shows its results. Other inputs are calculated in the browser by a worker that loads the revenue library.
export default function BatteryStorageCalculatorPage() {
  const base = bessBase();
  const stats = loadStats().snapshots;
  return (
    <>
      <JsonLd
        data={graph(
          {
            "@type": "WebApplication",
            "@id": BESS_ID,
            name: bessEn.meta.title,
            url: absoluteUrl(PATHS.bess),
            description: bessEn.meta.description,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any (web browser)",
            browserRequirements: "Requires JavaScript",
            inLanguage: "en",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            author: { "@id": PERSON_ID },
            dateModified: BESS_UPDATED,
          },
          breadcrumbJsonLd([
            { name: SITE.name, path: PATHS.home },
            { name: bessEn.meta.breadcrumb, path: PATHS.bess },
          ]),
        )}
      />
      <BessCalculator initial={base} stats={stats} libraryVersion={loadLibrary().manifest.version} />
    </>
  );
}
