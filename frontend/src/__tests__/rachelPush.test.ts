import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/services/api";
import { currentPushState, disableWebPush, enableWebPush } from "@/features/rachel/webPush";

vi.mock("@/services/api", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

describe("Rachel Web Push opt-in", () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const subscription = {
    toJSON: () => ({ endpoint: "https://push.test/a", keys: { p256dh: "p", auth: "a" } }),
    unsubscribe,
  };
  const pushManager = {
    getSubscription: vi.fn(),
    subscribe: vi.fn(),
  };
  const registration = { pushManager };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    pushManager.getSubscription.mockResolvedValue(null);
    pushManager.subscribe.mockResolvedValue(subscription);
    Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
    Object.defineProperty(window, "Notification", { configurable: true, value: {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    } });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    } });
    vi.mocked(apiClient.get).mockResolvedValue({ data: { publicKey: "BEl6TW6eQ1" } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { subscriptionId: "a".repeat(64) } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
  });

  it("subscribes only after permission and persists the anonymous subscription id", async () => {
    await enableWebPush();
    expect(Notification.requestPermission).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(apiClient.post).toHaveBeenCalledWith("/notifications/push/subscriptions", subscription.toJSON());
    expect(localStorage.getItem("sgrail-push-subscription-id")).toBe("a".repeat(64));
  });

  it("unsubscribes locally and at the backend", async () => {
    localStorage.setItem("sgrail-push-subscription-id", "b".repeat(64));
    pushManager.getSubscription.mockResolvedValue(subscription);
    await disableWebPush();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(apiClient.delete).toHaveBeenCalledWith(`/notifications/push/subscriptions/${"b".repeat(64)}`);
    expect(currentPushState()).toBe("off");
  });
});
