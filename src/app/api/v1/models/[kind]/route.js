import { buildModelsList } from "../route.js";
import { getSettings } from "@/lib/localDb";
import { extractApiKey } from "@/sse/services/auth.js";

// URL slug → service kind(s). `web` covers both webSearch and webFetch.
const KIND_SLUG_MAP = {
  "image": ["image"],
  "tts": ["tts"],
  "stt": ["stt"],
  "embedding": ["embedding"],
  "image-to-text": ["imageToText"],
  "web": ["webSearch", "webFetch"],
};

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * GET /v1/models/{kind} - OpenAI-compatible models list filtered by capability.
 * Supported kinds: image, tts, stt, embedding, image-to-text, web.
 */
export async function GET(request, { params }) {
  try {
    const { kind } = await params;
    const kindFilter = KIND_SLUG_MAP[kind];

    if (!kindFilter) {
      return Response.json(
        {
          error: {
            message: `Unknown model kind: ${kind}. Supported: ${Object.keys(KIND_SLUG_MAP).join(", ")}`,
            type: "invalid_request_error",
          },
        },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const settings = await getSettings();
    const requireModelsAuth = settings.requireApiKeyForModels !== false;
    const apiKey = extractApiKey(request);
    let permissions = null;

    if (apiKey) {
      const { getKeyContext } = await import("@/lib/auth/apiKeyPermissions.js");
      const keyCtx = await getKeyContext(apiKey);
      if (keyCtx) {
        if (!keyCtx.isActive) {
          return Response.json(
            { error: { message: "Inactive API key", type: "invalid_request_error" } },
            { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
          );
        }
        permissions = keyCtx.permissions;
      } else {
        if (settings.requireApiKey || requireModelsAuth) {
          return Response.json(
            { error: { message: "Invalid API key", type: "invalid_request_error" } },
            { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
          );
        }
      }
    } else {
      if (settings.requireApiKey || requireModelsAuth) {
        return Response.json(
          { error: { message: "Missing API key", type: "invalid_request_error" } },
          { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
        );
      }
    }

    let data = await buildModelsList(kindFilter);

    if (permissions) {
      const { checkPermission } = await import("@/lib/auth/apiKeyPermissions.js");
      data = data.filter(model => {
        if (model.owned_by === "combo") {
          return checkPermission(permissions, "combo", model.id).allowed;
        } else {
          return checkPermission(permissions, "model", model.id).allowed;
        }
      });
    }

    return Response.json({ object: "list", data }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    console.log("Error fetching models by kind:", error);
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}
