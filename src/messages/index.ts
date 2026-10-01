// The UI texts per language. Every language's dictionary has the type of the English one, so TypeScript reports a
// missing key.
import type { Locale } from "@/lib/i18n";
import { de } from "./de";
import { en, type Messages } from "./en";

export type { Messages };

export const MESSAGES: Record<Locale, Messages> = { en, de };
