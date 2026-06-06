import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localDb
vi.mock("@/lib/localDb", () => ({
  getSettings: vi.fn(),
  getProviderConnections: vi.fn(),
  getCombos: vi.fn(() => []),
  getCustomModels: vi.fn(() => []),
  getModelAliases: vi.fn(() => ({})),
}));

// Mock disabledModelsDb
vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledModels: vi.fn(() => ({})),
}));

// Mock auth.js
vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: vi.fn(),
  isValidApiKey: vi.fn(),
}));

// Mock apiKeyPermissions
vi.mock("@/lib/auth/apiKeyPermissions.js", () => ({
  getKeyContext: vi.fn(),
  checkPermission: vi.fn(),
}));

import { GET } from "../../src/app/api/v1/models/route.js";
import { getSettings, getProviderConnections, getCombos } from "@/lib/localDb";
import { extractApiKey } from "@/sse/services/auth.js";
import { getKeyContext, checkPermission } from "@/lib/auth/apiKeyPermissions.js";

describe("GET /v1/models route authentication and filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue({ requireApiKey: true, requireApiKeyForModels: true });
    vi.mocked(getProviderConnections).mockResolvedValue([
      { provider: "openai", isActive: true, providerSpecificData: { enabledModels: ["gpt-4"] } }
    ]);
    vi.mocked(getCombos).mockResolvedValue([
      { name: "my-combo", kind: "llm", models: [] }
    ]);
  });

  it("returns 401 Unauthorized when API key is missing and requireApiKeyForModels is true", async () => {
    vi.mocked(extractApiKey).mockReturnValue(null);

    const mockRequest = new Request("http://localhost/v1/models", { method: "GET" });
    const response = await GET(mockRequest);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toContain("Missing API key");
  });

  it("returns 401 Unauthorized when API key is invalid", async () => {
    vi.mocked(extractApiKey).mockReturnValue("sk-invalid");
    vi.mocked(getKeyContext).mockResolvedValue(null);

    const mockRequest = new Request("http://localhost/v1/models", { method: "GET" });
    const response = await GET(mockRequest);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toContain("Invalid API key");
  });

  it("filters returned model list based on permissions check", async () => {
    vi.mocked(extractApiKey).mockReturnValue("sk-restricted");
    vi.mocked(getKeyContext).mockResolvedValue({
      id: "key-123",
      isActive: true,
      permissions: { mode: "restricted" },
    });

    // Mock checkPermission to allow the combo but block the model
    vi.mocked(checkPermission).mockImplementation((perms, kind, target) => {
      if (kind === "combo" && target === "my-combo") {
        return { allowed: true };
      }
      return { allowed: false };
    });

    const mockRequest = new Request("http://localhost/v1/models", { method: "GET" });
    const response = await GET(mockRequest);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("my-combo");
  });
});
