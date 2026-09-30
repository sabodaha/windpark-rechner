import { ReportView } from "@/components/report/ReportView";
import { BASE_CASE } from "@/engine";
import { modelExtras } from "@/lib/extras";
import { pageMetadata } from "@/lib/metadata";
import { PATHS } from "@/lib/site";
import { en } from "@/messages/en";

// A print view of the calculator, not a page of its own: kept out of search results and the sitemap. The
// published PDF (PATHS.reportPdf) is printed from this page with the base case.
export const metadata = {
  ...pageMetadata({ title: en.report.title, description: en.report.description, path: PATHS.report }),
  robots: { index: false, follow: true },
};

export default function ReportPage() {
  // The tornado, bid calculator and IRR curve of the base case, computed once at build time.
  return <ReportView baseExtras={modelExtras(BASE_CASE)} />;
}
