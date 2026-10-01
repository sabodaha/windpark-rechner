import localFont from "next/font/local";
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

// Static instances of Inter for this page only: printed to PDF, the site's variable font becomes Type 3 glyph
// outlines, half of the file. See fonts/OFL.txt.
const reportInter = localFont({
  src: [
    { path: "./fonts/Inter-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Inter-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Inter-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Inter-Bold.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

export default function ReportPage() {
  // The tornado, bid calculator and IRR curve of the base case, computed once at build time.
  return (
    <div className={reportInter.className}>
      <ReportView baseExtras={modelExtras(BASE_CASE)} />
    </div>
  );
}
