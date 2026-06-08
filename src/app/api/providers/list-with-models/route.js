import { NextResponse } from "next/server";
import { PROVIDER_MODELS } from "@/shared/constants/models";
import { AI_PROVIDERS } from "@/shared/constants/providers";

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

    return NextResponse.json({ providers: list });
  } catch (error) {
    console.log("Error fetching providers with models:", error);
    return NextResponse.json({ error: "Failed to fetch providers with models" }, { status: 500 });
  }
}
