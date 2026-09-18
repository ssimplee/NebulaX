import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Moon, MonitorSmartphone, Palette, Type } from "lucide-react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/store/preferencesStore";

const TEXT_SCALE_OPTIONS = [
  { value: "1", key: "normal", scale: 1.0 },
  { value: "1.25", key: "large", scale: 1.25 },
  { value: "1.5", key: "extraLarge", scale: 1.5 },
] as const;

/**
 * AccessibilitySettings — settings panel providing visual and interaction
 * accessibility controls.
 *
 * - Text size (Normal / Large / Extra Large) → sets CSS variable --font-size on <html>
 * - High contrast toggle → adds/removes .high-contrast class on <html>
 * - Colour-blind labels toggle → stored in state for map components
 * - Dark mode toggle → adds/removes .dark class on <html> (applied app-wide
 *   by AppProviders, not just while this screen is mounted)
 * - Reduced motion toggle → adds/removes .reduce-motion class on <html>
 *
 * Validates: Requirements 26.1, 26.2, 26.3, 26.7
 */
export function AccessibilitySettings() {
  const { t } = useTranslation();
  const {
    textScale,
    highContrast,
    colourBlindLabels,
    reducedMotion,
    darkMode,
    setTextScale,
    toggleHighContrast,
    toggleColourBlindLabels,
    toggleReducedMotion,
    toggleDarkMode,
  } = usePreferencesStore();

  // Apply text scale to <html> CSS variable
  useEffect(() => {
    const basePx = 16 * textScale;
    document.documentElement.style.setProperty("--font-size", `${basePx}px`);
  }, [textScale]);

  // Apply high contrast class on <html>
  useEffect(() => {
    if (highContrast) {
      document.documentElement.classList.add("high-contrast");
    } else {
      document.documentElement.classList.remove("high-contrast");
    }
  }, [highContrast]);

  // Apply reduced motion class on <html>
  useEffect(() => {
    if (reducedMotion) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }
  }, [reducedMotion]);

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-medium text-muted-foreground">
        {t("profile.accessibility.title")}
      </h3>

      {/* Text Size */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Type className="size-4 text-muted-foreground" />
          <Label className="text-sm font-medium">{t("profile.textSize")}</Label>
        </div>
        <RadioGroup
          value={String(textScale)}
          onValueChange={(val) => setTextScale(Number(val))}
          className="flex gap-3"
          aria-label={t("profile.textSize")}
        >
          {TEXT_SCALE_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem
                value={option.value}
                id={`text-size-${option.value}`}
              />
              <Label
                htmlFor={`text-size-${option.value}`}
                className="cursor-pointer text-sm"
              >
                {t(`profile.accessibility.textSizes.${option.key}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* High Contrast */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-muted-foreground" />
          <Label htmlFor="high-contrast" className="text-sm font-medium">
            {t("profile.accessibility.highContrast")}
          </Label>
        </div>
        <Switch
          id="high-contrast"
          checked={highContrast}
          onCheckedChange={toggleHighContrast}
          aria-label={t("profile.accessibility.toggleHighContrast")}
        />
      </div>

      {/* Colour-blind Labels */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground" />
          <Label htmlFor="colour-blind-labels" className="text-sm font-medium">
            {t("profile.accessibility.colourBlind")}
          </Label>
        </div>
        <Switch
          id="colour-blind-labels"
          checked={colourBlindLabels}
          onCheckedChange={toggleColourBlindLabels}
          aria-label={t("profile.accessibility.toggleColourBlind")}
        />
      </div>

      {/* Dark Mode */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Moon className="size-4 text-muted-foreground" />
          <Label htmlFor="dark-mode" className="text-sm font-medium">
            {t("profile.accessibility.darkMode")}
          </Label>
        </div>
        <Switch
          id="dark-mode"
          checked={darkMode}
          onCheckedChange={toggleDarkMode}
          aria-label={t("profile.accessibility.toggleDarkMode")}
        />
      </div>

      {/* Reduced Motion */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="size-4 text-muted-foreground" />
          <Label htmlFor="reduced-motion" className="text-sm font-medium">
            {t("profile.accessibility.reducedMotion")}
          </Label>
        </div>
        <Switch
          id="reduced-motion"
          checked={reducedMotion}
          onCheckedChange={toggleReducedMotion}
          aria-label={t("profile.accessibility.toggleReducedMotion")}
        />
      </div>
    </div>
  );
}
