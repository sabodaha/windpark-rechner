// The UI texts per language. Every language's dictionary has the type of the English one, so TypeScript reports a
// missing key.
import type { Locale } from "@/lib/i18n";
import { en, type Messages } from "./en";

export type { Messages };

// The German dictionary arrives with the German pages (phase DE2); until then German resolves to English.
export const MESSAGES: Record<Locale, Messages> = { en, de: en };
