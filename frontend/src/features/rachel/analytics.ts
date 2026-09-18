import i18n from "@/i18n";
import { apiClient } from "@/services/api";
import { notificationKey, type InboxItem } from "./store";
import type { JourneySnapshot } from "./contract";

export type NotificationEventType = "shown" | "opened" | "dismissed" | "useful" | "not_useful";

const language = () => {
  const code = i18n.resolvedLanguage?.split("-")[0];
  return code && ["en", "zh", "ms", "ta"].includes(code) ? code : "en";
};

export function analyticsPayload(
  source: JourneySnapshot | InboxItem,
  eventType: NotificationEventType,
  eventId: string = crypto.randomUUID(),
) {
  const snapshot = "recommendation" in source;
  return {
    eventId,
    notificationId: snapshot ? notificationKey(source) : source.key,
    recommendationId: snapshot ? source.recommendation.id : source.recommendationId,
    eventType,
    mode: source.mode,
    language: language(),
    occurredAt: new Date().toISOString(),
  };
}

export async function recordNotificationEvent(source: JourneySnapshot | InboxItem, eventType: NotificationEventType) {
  try {
    await apiClient.post("/notifications/analytics", analyticsPayload(source, eventType));
  } catch {
    // Analytics must never block or change journey advice.
  }
}
