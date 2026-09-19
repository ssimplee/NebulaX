import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessibilitySettings } from "@/components/profile/AccessibilitySettings";
import { LanguageSelector } from "@/components/profile/LanguageSelector";
import { PrivacyControls } from "@/components/profile/PrivacyControls";
import { ReporterStats } from "@/components/profile/ReporterStats";
import { SavedRoutes } from "@/components/profile/SavedRoutes";
import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";

/**
 * ProfilePage — full profile page with reporter stats, saved routes,
 * accessibility settings, language selector, and privacy controls.
 *
 * Layout:
 * - Desktop (>= 768px): two-column grid
 *   - Left column: reporter stats + saved routes
 *   - Right column: accessibility + language + privacy
 * - Mobile (< 768px): single column stacked
 *
 * Validates: Requirements 25.1–25.5, 29.5
 */
export function ProfilePage() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        icon={<UserRound />}
        title={t("profile.title")}
        subtitle="Saved routes, reporter stats, language and accessibility"
      />
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Left column: Stats + Saved Routes */}
        <div className="flex flex-col gap-6">
          <ReporterStats />

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                {t("profile.savedRoutes.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SavedRoutes />
            </CardContent>
          </Card>
        </div>

        {/* Right column: Settings */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                {t("profile.settings")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <AccessibilitySettings />
              <div className="border-t pt-4">
                <LanguageSelector />
              </div>
              <div className="border-t pt-4">
                <PrivacyControls />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </div>
  );
}
