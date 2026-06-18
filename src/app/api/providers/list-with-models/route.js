import { NextResponse } from "next/server";
import { PROVIDER_MODELS } from "@/shared/constants/models";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderNodes, getModelAliases } from "@/models";

export async function GET() {
  try {
    const list = Object.entries(AI_PROVIDERS)
      .filter(([, info]) => !info.hidden)
      .map(([id, info]) => {
        const alias = info.alias || id;
        const staticModels = PROVIDER_MODELS[alias] || [];
        const modelIds = staticModels.map(m => m.id);

      // Merge TTS models
      if (Array.isArray(info.ttsConfig?.models)) {
        for (const m of info.ttsConfig.models) {
          if (m?.id && !modelIds.includes(m.id)) {
            modelIds.push(m.id);
          }
        }
      }
      // Merge Embedding models
      if (Array.isArray(info.embeddingConfig?.models)) {
        for (const m of info.embeddingConfig.models) {
          if (m?.id && !modelIds.includes(m.id)) {
            modelIds.push(m.id);
          }
        }
      }

      // Add Search/Fetch models
      if (info.searchConfig) {
        modelIds.push("search");
      }
      if (info.fetchConfig) {
        modelIds.push("fetch");
      }

      return {
        id,
        name: info.name || id,
        alias,
        models: modelIds,
      };
    });

    // Merge custom compatible providers from the database (providerNodes)
    try {
      const customNodes = await getProviderNodes();
      const modelAliases = await getModelAliases();

      for (const node of customNodes) {
        const nodePrefix = node.prefix || node.id;
        // Find aliases that map to this node (e.g. key: "nodePrefix/model-id", value: "nodeId/model-id" or similar)
        // Note: Aliases are stored using the raw providerId as key, i.e., fullModel starts with "node.id/"
        const nodeModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => typeof fullModel === "string" && fullModel.startsWith(`${node.id}/`))
          .map(([, fullModel]) => fullModel.replace(`${node.id}/`, ""));

        // Always include a generic 'model-id' or placeholder model to allow configuration when no alias exists
        const uniqueModels = Array.from(new Set(["model-id", ...nodeModels]));

        list.push({
          id: node.id,
          name: node.name || node.id,
          alias: nodePrefix,
          models: uniqueModels,
        });
      }
    } catch (dbError) {
      console.log("Error loading custom providers/aliases from database:", dbError);
    }

    return NextResponse.json({ providers: list });
  } catch (error) {
    console.log("Error fetching providers with models:", error);
    return NextResponse.json({ error: "Failed to fetch providers with models" }, { status: 500 });
  }
}
