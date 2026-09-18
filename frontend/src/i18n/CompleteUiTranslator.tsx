import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { SupportedLanguage } from "@/store/preferencesStore";
import { uiCatalog } from "./uiCatalog";

const originals = new WeakMap<Node, string>();
const applied = new WeakMap<Node, string>();
const translatedAttributes = ["aria-label", "placeholder", "title", "alt"] as const;

function interpolateDynamic(value: string, language: SupportedLanguage): string | null {
  const page = value.match(/^Page (\d+) of (\d+)$/);
  if (page) {
    if (language === "zh") return `第 ${page[1]} 页，共 ${page[2]} 页`;
    if (language === "ms") return `Halaman ${page[1]} daripada ${page[2]}`;
    if (language === "ta") return `பக்கம் ${page[1]} / ${page[2]}`;
  }
  return null;
}

function translateValue(value: string, language: SupportedLanguage) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const phrase = value.trim();
  if (!phrase) return value;
  return `${leading}${uiCatalog[language][phrase] ?? interpolateDynamic(phrase, language) ?? phrase}${trailing}`;
}

function translateTextNode(node: Text, language: SupportedLanguage) {
  const last = applied.get(node);
  if (!originals.has(node) || (last !== undefined && node.data !== last)) originals.set(node, node.data);
  const translated = translateValue(originals.get(node) ?? node.data, language);
  applied.set(node, translated);
  if (node.data !== translated) node.data = translated;
}

function translateElement(element: Element, language: SupportedLanguage) {
  for (const attribute of translatedAttributes) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const marker = `data-sgrail-original-${attribute}`;
    const original = element.getAttribute(marker) ?? value;
    if (!element.hasAttribute(marker)) element.setAttribute(marker, original);
    const translated = translateValue(original, language).trim();
    if (translated !== value) element.setAttribute(attribute, translated);
  }
}

function translateTree(root: Node, language: SupportedLanguage) {
  if (root instanceof Text) translateTextNode(root, language);
  if (root instanceof Element) translateElement(root, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) translateTextNode(node, language);
    else if (node instanceof Element) translateElement(node, language);
    node = walker.nextNode();
  }
}

/**
 * Localises legacy interface copy while teammate-owned components are migrated
 * to direct `t()` calls. Only exact catalogue phrases are changed, so station
 * names, line codes, reports and API-provided service text remain untouched.
 */
export function CompleteUiTranslator() {
  const { i18n } = useTranslation();
  const language = (["en", "zh", "ms", "ta"].includes(i18n.resolvedLanguage ?? "")
    ? i18n.resolvedLanguage
    : "en") as SupportedLanguage;

  useEffect(() => {
    document.documentElement.lang = language;
    translateTree(document.body, language);
    let translating = false;
    const observer = new MutationObserver((mutations) => {
      if (translating) return;
      translating = true;
      observer.disconnect();
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateTree(mutation.target, language);
        for (const node of mutation.addedNodes) translateTree(node, language);
      }
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      translating = false;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  return null;
}

