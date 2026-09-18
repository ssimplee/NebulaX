import { apiClient } from "@/services/api";

const ENABLED_KEY = "sgrail-journey-push-enabled";
const SUBSCRIPTION_KEY = "sgrail-push-subscription-id";

export type PushState = "unsupported" | "off" | "blocked" | "on";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const currentPushState = (): PushState => {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return localStorage.getItem(ENABLED_KEY) === "true" && Notification.permission === "granted" ? "on" : "off";
};

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export async function enableWebPush() {
  if (!supported()) throw new Error("unsupported");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("blocked");
  const registration = await navigator.serviceWorker.register("/sw.js");
  const { data } = await apiClient.get<{ publicKey: string }>("/notifications/push/public-key");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(data.publicKey),
    });
  }
  const saved = await apiClient.post<{ subscriptionId: string }>("/notifications/push/subscriptions", subscription.toJSON());
  localStorage.setItem(ENABLED_KEY, "true");
  localStorage.setItem(SUBSCRIPTION_KEY, saved.data.subscriptionId);
}

export async function disableWebPush() {
  if (!supported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
  const identifier = localStorage.getItem(SUBSCRIPTION_KEY);
  if (identifier) {
    try { await apiClient.delete(`/notifications/push/subscriptions/${identifier}`); } catch { /* local opt-out still applies */ }
  }
  localStorage.removeItem(ENABLED_KEY);
  localStorage.removeItem(SUBSCRIPTION_KEY);
}

export async function sendTestPush() {
  const identifier = localStorage.getItem(SUBSCRIPTION_KEY);
  if (!identifier) throw new Error("not_subscribed");
  await apiClient.post(`/notifications/push/subscriptions/${identifier}/test`);
}

export async function showJourneySystemNotification(title: string, body: string, tag: string) {
  if (currentPushState() !== "on") return;
  const registration = await navigator.serviceWorker.getRegistration() ?? await navigator.serviceWorker.register("/sw.js");
  await registration.showNotification(title, { body, tag, data: { url: "/journey" } });
}

