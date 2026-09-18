import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/journey");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Journey Map shows the labelled door-to-door replay on mobile and desktop", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Journey Map" }).click();
  await page.getByRole("combobox", { name: "Journey data" }).selectOption("recorded");

  await expect(page.getByText("Demo replay · simulated disruption")).toBeVisible();
  await expect(page.getByRole("link", { name: "© OpenStreetMap contributors" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Routes on the map" })).toContainText("13 min earlier than usual");
  await expect(page.getByText("14 min walking").first()).toBeVisible();
});

test("normal day stays quiet, disruption recommends an action, and reset clears it", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Rachel’s journey" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your usual journey is on schedule." })).toBeVisible();
  await expect(page.getByText("No journey notifications. Minor changes stay quiet.")).toBeVisible();

  await page.getByRole("button", { name: "Save morning routine" }).click();
  await page.getByRole("button", { name: /15-minute disruption/ }).click();
  await expect(page.getByRole("heading", { name: /Use the DTL alternative/ })).toBeVisible();
  await expect(page.getByText("A journey update has been added to your inbox.")).toBeVisible();
  await expect(page.getByText("1 unread")).toBeVisible();

  await page.getByRole("button", { name: "View recommended journey" }).click();
  await expect(page.getByRole("button", { name: /Journey steps shown/ })).toBeVisible();
  await expect(page.getByText("0 unread")).toBeVisible();

  await page.getByRole("button", { name: "Reset replay and inbox" }).click();
  await expect(page.getByRole("heading", { name: "Your usual journey is on schedule." })).toBeVisible();
  await expect(page.getByText("No journey notifications. Minor changes stay quiet.")).toBeVisible();
});

test("five-minute impact does not create an inbox notification", async ({ page }) => {
  await page.getByRole("button", { name: "Save morning routine" }).click();
  await page.getByRole("button", { name: /5-minute delay/ }).click();
  await expect(page.getByRole("heading", { name: "Keep your usual journey." })).toBeVisible();
  await expect(page.getByText("No journey notifications. Minor changes stay quiet.")).toBeVisible();
});

test("recommendation templates follow the saved interface language", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("sgrail-preferences", JSON.stringify({ state: { language: "zh" }, version: 0 })));
  await page.reload();
  await page.getByRole("button", { name: /中断15分钟/ }).click();
  await expect(page.getByRole("heading", { name: /改搭滨海市区线/ })).toBeVisible();
  await expect(page.getByText(/08:42/).first()).toBeVisible();
});
