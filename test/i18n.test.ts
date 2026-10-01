// The site's two languages: German number formats, one address per page and language, hreflang and sitemap.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sitemap from "../src/app/sitemap";
import { FORMAT } from "../src/lib/format";
import { LOCALES, PUBLISHED_LOCALES } from "../src/lib/i18n";
import { alternates, hasPage, LOCALE_PAGES, PAGE_PATHS, pageOf, paths, SITEMAP, type PageId } from "../src/lib/site";

const de = FORMAT.de;
const en = FORMAT.en;

describe("German number formats (de-DE)", () => {
  it("decimal comma, thousands point, € after the amount", () => {
    expect(de.num(1234.5, 1)).toBe("1.234,5");
    expect(de.num(-0.0001, 2)).toBe("0,00");
    expect(de.pct(0.0784, 1)).toBe("7,8 %");
    expect(de.pct(-0.0004, 1)).toBe("0,0 %");
    expect(de.pct(-0.021, 1)).toBe("−2,1 %");
    expect(de.meur(21_456_000)).toBe("21,5\u00a0Mio.\u00a0€");
    expect(de.meur(-16_063_858)).toBe("−16,1\u00a0Mio.\u00a0€");
    expect(de.eurCompact(15_400)).toBe("15\u00a0Tsd.\u00a0€");
    expect(de.eurCompact(1_234_000)).toBe("1,2\u00a0Mio.\u00a0€");
    expect(de.keur(59_312_000)).toBe("59.312");
    expect(de.ratio(1.4389)).toBe("1,44x");
    expect(de.ct(4.79)).toBe("4,79\u00a0ct/kWh");
    expect(de.dateLabel("2026-09-30")).toBe("30.09.2026");
    expect([de.num(null), de.pct(NaN)]).toEqual(["k. A.", "k. A."]);
  });

  it("leave the English formats as they were", () => {
    expect([en.num(1234.5, 1), en.pct(0.0784), en.meur(21_456_000), en.eurCompact(15_400), en.ratio(1.4389), en.dateLabel("2026-09-30")]).toEqual([
      "1,234.5",
      "7.8%",
      "€21.5m",
      "€15k",
      "1.44x",
      "30 Sep 2026",
    ]);
  });
});

describe("one address per page and language", () => {
  const pages = Object.keys(PAGE_PATHS.en) as PageId[];

  it("every page has an English and a German address, German under /de/ with German words", () => {
    for (const locale of LOCALES) expect(Object.keys(PAGE_PATHS[locale]).sort()).toEqual([...pages].sort());
    for (const page of pages) {
      expect(PAGE_PATHS.de[page], page).toMatch(/^\/de\//);
      expect(PAGE_PATHS.en[page], page).not.toMatch(/^\/de\//);
      expect(PAGE_PATHS.de[page]).toMatch(/\/$/);
    }
    expect(new Set(Object.values(PAGE_PATHS.de)).size).toBe(pages.length);
    expect(PAGE_PATHS.de.calculator).toBe("/de/windpark-rechner/");
    expect(PAGE_PATHS.de.about).toBe("/de/ueber-mich/");
    expect(PAGE_PATHS.de.privacy).toBe("/de/datenschutz/");
  });

  it("finds the page and language of an address, with or without the trailing slash", () => {
    for (const locale of LOCALES) for (const page of pages) expect(pageOf(PAGE_PATHS[locale][page])).toEqual({ page, locale });
    expect(pageOf("/de/windpark-rechner/methodik")).toEqual({ page: "methodology", locale: "de" });
    expect(pageOf("/nowhere/")).toBeNull();
  });

  it("the German calculator offers the English report and files until the German ones exist (DE5, DE6)", () => {
    expect(paths("de").report).toBe(PAGE_PATHS.en.report);
    expect(paths("de").workbook).toBe(paths("en").workbook);
    expect(paths("de").reportPdf).toBe(paths("en").reportPdf);
  });

  it("a page a language does not have yet links to the English one", () => {
    expect(LOCALE_PAGES.en).toEqual(pages);
    for (const page of pages) expect(paths("de")[page]).toBe(PAGE_PATHS[hasPage("de", page) ? "de" : "en"][page]);
  });

  it("every page a language has is built, and no other", () => {
    const root = new URL("../src/app/", import.meta.url);
    for (const locale of LOCALES) {
      for (const page of pages) {
        const file = new URL(`(${locale})${PAGE_PATHS[locale][page]}page.tsx`, root);
        expect(existsSync(file), `${locale} ${page}`).toBe(hasPage(locale, page));
      }
    }
  });
});

describe("hreflang and sitemap follow the published languages", () => {
  it("one sitemap entry per page and published language that has it", () => {
    const entries = sitemap();
    const expected = PUBLISHED_LOCALES.flatMap((l) => SITEMAP.filter((p) => hasPage(l, p.page)).map((p) => PAGE_PATHS[l][p.page]));
    expect(entries.map((e) => e.url.replace("https://igorsabodakha.com", ""))).toEqual(expected);
  });

  it("alternates link the languages that have a page; none where only one has it", () => {
    expect(PUBLISHED_LOCALES).toEqual(["en", "de"]);
    expect(alternates("calculator")).toEqual({ en: PAGE_PATHS.en.calculator, de: PAGE_PATHS.de.calculator, "x-default": PAGE_PATHS.en.calculator });
    expect(alternates("report")).toBeUndefined();
    for (const e of sitemap()) {
      const at = pageOf(e.url.replace("https://igorsabodakha.com", ""))!;
      const languages = e.alternates?.languages as Record<string, string> | undefined;
      if (LOCALES.every((l) => hasPage(l, at.page))) {
        expect(languages, e.url).toEqual({
          en: `https://igorsabodakha.com${PAGE_PATHS.en[at.page]}`,
          de: `https://igorsabodakha.com${PAGE_PATHS.de[at.page]}`,
          "x-default": `https://igorsabodakha.com${PAGE_PATHS.en[at.page]}`,
        });
      } else {
        expect(languages, e.url).toBeUndefined();
      }
    }
  });
});
