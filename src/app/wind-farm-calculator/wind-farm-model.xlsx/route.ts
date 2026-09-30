// The base case as a formula workbook, generated once at build time and served as a static file.
import { BASE_CASE } from "@/engine";
import { absoluteUrl, PATHS } from "@/lib/site";
import { workbookForInputs } from "@/lib/workbook/build";
import { en } from "@/messages/en";

export const dynamic = "force-static";

export function GET(): Response {
  const { bytes } = workbookForInputs(BASE_CASE, en, absoluteUrl(PATHS.calculator));
  return new Response(bytes as BodyInit, {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}
