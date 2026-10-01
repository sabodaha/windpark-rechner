"use client";

// The language of the page for client components: its dictionary and its number formats. Each root layout sets it
// once; server components take the locale as a parameter instead.
import { createContext, useContext, type ReactNode } from "react";
import { FORMAT, type Format } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { MESSAGES, type Messages } from "@/messages";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext);
export const useMessages = (): Messages => MESSAGES[useLocale()];
export const useFormat = (): Format => FORMAT[useLocale()];
