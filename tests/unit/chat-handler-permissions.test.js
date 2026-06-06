import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock out database dependencies of chat.js
vi.mock("../../src/lib/localDb", () => ({
  getSettings: vi.fn(),
  getCombos: vi.fn(),
}));

vi.mock("../../src/sse/services/auth.js", () => ({
  extractApiKey: vi.fn(),
  isValidApiKey: vi.fn(),
}));

vi.mock("../../src/sse/services/model.js", () => ({
  getModelInfo: vi.fn(),
  getComboModels: vi.fn(),
}));

vi.mock("../../src/lib/auth/apiKeyPermissions.js", () => ({
  getKeyContext: vi.fn(),
  checkPermission: vi.fn(),
}));

import { handleChat } from "../../src/sse/handlers/chat.js";
import { getSettings } from "../../src/lib/localDb";
import { extractApiKey } from "../../src/sse/services/auth.js";
import { getModelInfo, getComboModels } from "../../src/sse/services/model.js";
import { getKeyContext, checkPermission } from "../../src/lib/auth/apiKeyPermissions.js";

describe("chat handler authorization & permissions enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue({ requireApiKey: true });
    vi.mocked(getComboModels).mockResolvedValue(null);
  });

  it("returns 403 Forbidden with exact envelope on model block", async () => {
    vi.mocked(extractApiKey).mockReturnValue("sk-restricted");
    vi.mocked(getKeyContext).mockResolvedValue({
      id: "key-123",
      isActive: true,
      permissions: { mode: "restricted" },
    });
    vi.mocked(getModelInfo).mockResolvedValue({
      provider: "kr",
      model: "claude-experimental",
    });
    vi.mocked(checkPermission).mockReturnValue({
      allowed: false,
      reason: 'Model "kr/claude-experimental" explicitly denied for this API key',
      code: "model_not_allowed",
    });

    const mockRequest = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-restricted",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "kr/claude-experimental", messages: [] }),
    });

    const response = await handleChat(mockRequest);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body).toEqual({
      error: {
        message: 'Model "kr/claude-experimental" explicitly denied for this API key',
        type: "permission_denied",
        code: "model_not_allowed",
      },
    });
  });

  it("returns 403 Forbidden with exact envelope on combo block", async () => {
    vi.mocked(extractApiKey).mockReturnValue("sk-restricted-combo");
    vi.mocked(getKeyContext).mockResolvedValue({
      id: "key-456",
      isActive: true,
      permissions: { mode: "restricted" },
    });
    vi.mocked(getComboModels).mockResolvedValue(["kr/claude-sonnet", "cc/gpt-4"]);
    vi.mocked(checkPermission).mockReturnValue({
      allowed: false,
      reason: 'Combo "secret-stack" not allowed for this API key',
      code: "combo_not_allowed",
    });

    const mockRequest = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-restricted-combo",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "secret-stack", messages: [] }),
    });

    const response = await handleChat(mockRequest);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body).toEqual({
      error: {
        message: 'Combo "secret-stack" not allowed for this API key',
        type: "permission_denied",
        code: "combo_not_allowed",
      },
    });
  });
});
