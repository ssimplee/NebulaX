import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { CompleteUiTranslator } from "@/i18n/CompleteUiTranslator";
import { uiCatalog } from "@/i18n/uiCatalog";

describe("complete interface translation", () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage("en"));
  });

  it("keeps the same complete phrase catalogue in every language", () => {
    const englishKeys = Object.keys(uiCatalog.en).sort();
    expect(englishKeys.length).toBeGreaterThan(150);
    for (const language of ["zh", "ms", "ta"] as const) {
      expect(Object.keys(uiCatalog[language]).sort()).toEqual(englishKeys);
      expect(Object.values(uiCatalog[language]).every(Boolean)).toBe(true);
    }
  });

  it("translates legacy text and accessibility attributes when language changes", async () => {
    await act(() => i18n.changeLanguage("zh"));
    render(
      <>
        <h1>Route Planning</h1>
        <input aria-label="Search MRT stations" placeholder="Search stations…" />
        <CompleteUiTranslator />
      </>,
    );

    await waitFor(() => expect(screen.getByText("路线规划")).toBeInTheDocument());
    expect(screen.getByLabelText("搜索地铁站")).toHaveAttribute("placeholder", "搜索车站…");

    await act(() => i18n.changeLanguage("ta"));
    await waitFor(() => expect(screen.getByText("வழித் திட்டமிடல்")).toBeInTheDocument());
    expect(screen.getByLabelText("MRT நிலையங்களைத் தேடுக")).toHaveAttribute(
      "placeholder",
      "நிலையங்களைத் தேடுக…",
    );
  });
});

