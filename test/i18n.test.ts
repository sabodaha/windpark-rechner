// The site's two languages: German number formats, one address per page and language, hreflang and sitemap.
import { describe, expect, it } from "vitest";
import sitemap from "../src/app/sitemap";
import { FORMAT } from "../src/lib/format";
import { LOCALES, PUBLISHED_LOCALES } from "../src/lib/i18n";
import { alternates, PAGE_PATHS, pageOf, paths, type PageId } from "../src/lib/site";

const de = FORMAT.de;
const en = FORMAT.en;

describe("German number formats (de-DE)", () => {
  it("decimal comma, thousands point, € after the amount", () => {
    expect(de.num(1234.5, 1)).toBe("1.234,5");
    expect(de.num(-0.0001, 2)).toBe("0,00");
    expect(de.pct(0.0784, 1)).toBe("7,8 %");
    expect(de.pct(-0.0004, 1)).toBe("0,0 %");
    expect(de.pct(-0.021, 1)).toBe("−2,1 %");
    expect(de.meur(21_456_000)).toBe("21,5 Mio. €");
    expect(de.meur(-16_063_858)).toBe("−16,1 Mio. €");
    expect(de.eurCompact(15_400)).toBe("15 Tsd. €");
    expect(de.eurCompact(1_234_000)).toBe("1,2 Mio. €");
    expect(de.keur(59_312_000)).toBe("59.312");
    expect(de.ratio(1.4389)).toBe("1,44x");
    expect(de.ct(4.79)).toBe("4,79 ct/kWh");
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
});

describe("hreflang and sitemap follow the published languages", () => {
  it("one entry per published page and language; alternates only with two languages", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(PUBLISHED_LOCALES.length * 7);
    if (PUBLISHED_LOCALES.length === 1) {
      expect(alternates("calculator")).toBeUndefined();
      expect(entries.every((e) => !e.alternates)).toBe(true);
    } else {
      expect(alternates("calculator")).toEqual({ en: PAGE_PATHS.en.calculator, de: PAGE_PATHS.de.calculator, "x-default": PAGE_PATHS.en.calculator });
    }
  });
});
