// Inputs are kept in the browser only on request (decision G06): the stored entry is the request itself.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrivacyDe, PrivacyEn } from "../src/components/legal/Privacy";
import { clearStorage, loadFromStorage, saveToStorage, STORAGE_KEY } from "../src/lib/url-state";
import { de } from "../src/messages/de";
import { en } from "../src/messages/en";

const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

describe("remembered inputs", () => {
  beforeEach(() => {
    store.clear();
    (globalThis as { window?: unknown }).window = { localStorage: fakeStorage };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("nothing is stored until the visitor asks", () => {
    expect(loadFromStorage()).toBeNull();
  });

  it("an empty entry keeps the request for the base case; unticking deletes it", () => {
    saveToStorage("award=6.5");
    expect(store.get(STORAGE_KEY)).toBe("award=6.5");
    saveToStorage("");
    expect(loadFromStorage()).toBe("");
    clearStorage();
    expect(loadFromStorage()).toBeNull();
  });

  it("storage that throws (private mode) is ignored", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(() => saveToStorage("x=1")).not.toThrow();
    expect(() => clearStorage()).not.toThrow();
    expect(loadFromStorage()).toBeNull();
  });

  it("the privacy policy names the checkbox as the interface labels it, and the storage key", () => {
    const enPage = renderToStaticMarkup(createElement(PrivacyEn)) + renderToStaticMarkup(createElement(PrivacyDe));
    const dePage = renderToStaticMarkup(createElement(PrivacyDe, { standalone: true }));
    expect(enPage).toContain(`“${en.actions.remember}”`);
    expect(enPage).toContain(`„${en.actions.remember}“`); // the German text on the English page names the English box
    expect(dePage).toContain(`„${de.actions.remember}“`);
    for (const page of [enPage, dePage]) expect(page).toContain(STORAGE_KEY);
  });
});
