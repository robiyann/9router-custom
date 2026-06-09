import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";

function usageResponse(remaining) {
  return new Response(
    JSON.stringify({
      prepaid: {
        remaining: String(remaining),
      },
      usageWindow: null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("AskJune usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses prepaid remaining credit correctly", async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      usageResponse(839.339517)
    );

    const usage = await getUsageForProvider({
      provider: "askjune",
      apiKey: "test-key",
    });

    expect(usage.message).toBeUndefined();
    expect(usage.plan).toBe("Prepaid");
    expect(usage.quotas["prepaid"]).toMatchObject({
      used: 839.339517,
      total: 1000,
      remaining: 839.339517,
      unit: "credits",
    });
  });

  it("handles invalid key (401 response)", async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    const usage = await getUsageForProvider({
      provider: "askjune",
      apiKey: "invalid-key",
    });

    expect(usage.message).toBe("AskJune API key invalid or expired.");
    expect(usage.quotas).toBeUndefined();
  });
});
