import { describe, it, expect } from "vitest";
import { checkPermission } from "../../src/lib/auth/apiKeyPermissions.js";

describe("apiKeyPermissions checkPermission", () => {
  describe("allow_all / default mode", () => {
    it("allows everything if permissions is null", () => {
      expect(checkPermission(null, "model", "kr/claude-experimental")).toEqual({ allowed: true });
      expect(checkPermission(null, "combo", "my-combo")).toEqual({ allowed: true });
    });

    it("allows everything if mode is allow_all", () => {
      const perms = { mode: "allow_all" };
      expect(checkPermission(perms, "model", "kr/claude-experimental")).toEqual({ allowed: true });
      expect(checkPermission(perms, "combo", "my-combo")).toEqual({ allowed: true });
    });

    it("allows everything if mode is missing or invalid (fail-open)", () => {
      expect(checkPermission({}, "model", "kr/claude-experimental")).toEqual({ allowed: true });
      expect(checkPermission({ mode: "corrupt" }, "model", "kr/claude-experimental")).toEqual({ allowed: true });
    });

    it("respects deniedModels even in allow_all mode", () => {
      const perms = { mode: "allow_all", deniedModels: ["kr/claude-sonnet-4.5", "ag/*"] };
      expect(checkPermission(perms, "model", "kr/claude-sonnet-4.5")).toEqual({
        allowed: false,
        reason: 'Model "kr/claude-sonnet-4.5" explicitly denied for this API key',
        code: "model_not_allowed",
      });
      expect(checkPermission(perms, "model", "ag/gemini-pro")).toEqual({
        allowed: false,
        reason: 'Model "ag/gemini-pro" explicitly denied for this API key',
        code: "model_not_allowed",
      });
      expect(checkPermission(perms, "model", "kr/claude-haiku-4.5")).toEqual({ allowed: true });
    });
  });

  describe("restricted mode - combo kind", () => {
    const perms = {
      mode: "restricted",
      allowedCombos: ["my-combo", "another-combo"],
    };

    it("allows combos in the allowlist", () => {
      expect(checkPermission(perms, "combo", "my-combo")).toEqual({
        allowed: true,
        reason: undefined,
      });
      expect(checkPermission(perms, "combo", "another-combo")).toEqual({
        allowed: true,
        reason: undefined,
      });
    });

    it("denies combos not in the allowlist", () => {
      expect(checkPermission(perms, "combo", "secret-combo")).toEqual({
        allowed: false,
        reason: 'Combo "secret-combo" not allowed for this API key',
        code: "combo_not_allowed",
      });
    });
  });

  describe("restricted mode - model kind", () => {
    const perms = {
      mode: "restricted",
      allowedPrefixes: ["kr", "glm"],
      allowedModels: ["cc/*", "cu/claude-opus-4-7", "exact/match-model"],
      deniedModels: ["kr/claude-experimental", "cc/denied-model", "exact/match-model"],
    };

    it("allows prefix match from allowedPrefixes", () => {
      expect(checkPermission(perms, "model", "kr/claude-sonnet")).toEqual({ allowed: true });
      expect(checkPermission(perms, "model", "glm/glm-4")).toEqual({ allowed: true });
    });

    it("allows wildcard match from allowedModels", () => {
      expect(checkPermission(perms, "model", "cc/any-model")).toEqual({ allowed: true });
    });

    it("allows exact match from allowedModels", () => {
      expect(checkPermission(perms, "model", "cu/claude-opus-4-7")).toEqual({ allowed: true });
    });

    it("denies models explicitly in deniedModels even if prefix allowed", () => {
      expect(checkPermission(perms, "model", "kr/claude-experimental")).toEqual({
        allowed: false,
        reason: 'Model "kr/claude-experimental" explicitly denied for this API key',
        code: "model_not_allowed",
      });
    });

    it("denies models explicitly in deniedModels even if allowedModels matches wildcard", () => {
      expect(checkPermission(perms, "model", "cc/denied-model")).toEqual({
        allowed: false,
        reason: 'Model "cc/denied-model" explicitly denied for this API key',
        code: "model_not_allowed",
      });
    });

    it("denies models explicitly in deniedModels even if exact allowedModels matches", () => {
      expect(checkPermission(perms, "model", "exact/match-model")).toEqual({
        allowed: false,
        reason: 'Model "exact/match-model" explicitly denied for this API key',
        code: "model_not_allowed",
      });
    });

    it("denies model if prefix/model is not matched anywhere", () => {
      expect(checkPermission(perms, "model", "unknown/some-model")).toEqual({
        allowed: false,
        reason: 'Model "unknown/some-model" not allowed for this API key',
        code: "model_not_allowed",
      });
    });
  });
});
