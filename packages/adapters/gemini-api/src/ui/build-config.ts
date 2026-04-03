import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_GEMINI_API_MODEL } from "../index.js";

export function buildGeminiApiConfig(v: CreateConfigValues): Record<string, unknown> {
  const values = v as any;
  const ac: Record<string, unknown> = {};
  if (values.apiKey) ac.apiKey = values.apiKey;
  ac.model = values.model || DEFAULT_GEMINI_API_MODEL;
  if (values.promptTemplate) ac.promptTemplate = values.promptTemplate;
  if (values.systemInstruction) ac.systemInstruction = values.systemInstruction;
  ac.maxOutputTokens = typeof values.maxOutputTokens === "number" ? values.maxOutputTokens : 8192;
  ac.temperature = typeof values.temperature === "number" ? values.temperature : 1.0;
  ac.timeoutSec = 120;
  return ac;
}
