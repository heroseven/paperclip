import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_OPENAI_API_MODEL } from "../index.js";

export function buildOpenAiApiConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.apiKey) ac.apiKey = v.apiKey;
  ac.model = v.model || DEFAULT_OPENAI_API_MODEL;
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  if (v.systemPrompt) ac.systemPrompt = v.systemPrompt;
  ac.maxTokens = typeof v.maxTokens === "number" ? v.maxTokens : 4096;
  ac.temperature = typeof v.temperature === "number" ? v.temperature : 1.0;
  ac.timeoutSec = 120;
  return ac;
}
