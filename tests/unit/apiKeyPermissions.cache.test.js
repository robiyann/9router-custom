import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getApiKeyByKey } from "../../src/lib/db/repos/apiKeysRepo.js";
import { getKeyContext, invalidateKey, invalidateAllKeys } from "../../src/lib/auth/apiKeyPermissions.js";

vi.mock("../../src/lib/db/repos/apiKeysRepo.js", () => {
  return {
    getApiKeyByKey: vi.fn(),
  };
});

describe("apiKeyPermissions Cache & TTL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    invalidateAllKeys();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caches key context on first retrieval and reuse cached context thereafter", async () => {
    const key = "sk-test-key-123";
    const dbRecord = {
      id: "id-123",
      key,
      name: "Test Key",
      isActive: true,
      permissions: { mode: "allow_all" },
    };

    vi.mocked(getApiKeyByKey).mockResolvedValue(dbRecord);

    // First call: cache miss, hits DB
    const ctx1 = await getKeyContext(key);
    expect(ctx1).toEqual({ id: "id-123", isActive: true, permissions: { mode: "allow_all" } });
    expect(getApiKeyByKey).toHaveBeenCalledTimes(1);

    // Second call: cache hit, does not hit DB
    const ctx2 = await getKeyContext(key);
    expect(ctx2).toEqual({ id: "id-123", isActive: true, permissions: { mode: "allow_all" } });
    expect(getApiKeyByKey).toHaveBeenCalledTimes(1);
  });

  it("hits DB again after cache TTL (5 minutes) expires", async () => {
    const key = "sk-test-key-ttl";
    const dbRecord = {
      id: "id-ttl",
      key,
      name: "TTL Key",
      isActive: true,
      permissions: { mode: "restricted" },
    };

    vi.mocked(getApiKeyByKey).mockResolvedValue(dbRecord);

    // First call
    await getKeyContext(key);
    expect(getApiKeyByKey).toHaveBeenCalledTimes(1);

    // Advance time by 4 minutes (still cached)
    vi.advanceTimersByTime(4 * 60 * 1000);
    await getKeyContext(key);
    expect(getApiKeyByKey).toHaveBeenCalledTimes(1);

    // Advance time by another 2 minutes (total 6 minutes, expired)
    vi.advanceTimersByTime(2 * 60 * 1000);
    await getKeyContext(key);
    expect(getApiKeyByKey).toHaveBeenCalledTimes(2);
  });

  it("hits DB again after explicit invalidateKey", async () => {
    const key = "sk-test-key-invalidate";
    const dbRecord = {
      id: "id-inv",
      key,
      name: "Inv Key",
      isActive: true,
      permissions: null,
    };

    vi.mocked(getApiKeyByKey).mockResolvedValue(dbRecord);

    await getKeyContext(key);
    expect(getApiKeyByKey).toHaveBeenCalledTimes(1);

    invalidateKey(key);

    await getKeyContext(key);
    expect(getApiKeyByKey).toHaveBeenCalledTimes(2);
  });

  it("hits DB again after invalidateAllKeys", async () => {
    const key1 = "sk-1";
    const key2 = "sk-2";

    vi.mocked(getApiKeyByKey).mockImplementation(async (k) => ({
      id: k,
      key: k,
      name: "Key " + k,
      isActive: true,
      permissions: null,
    }));

    await getKeyContext(key1);
    await getKeyContext(key2);
    expect(getApiKeyByKey).toHaveBeenCalledTimes(2);

    invalidateAllKeys();

    await getKeyContext(key1);
    await getKeyContext(key2);
    expect(getApiKeyByKey).toHaveBeenCalledTimes(4);
  });
});
