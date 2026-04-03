import type { UIAdapterModule } from "../types";
import { parseGeminiApiStdoutLine } from "@paperclipai/adapter-gemini-api/ui";
import { GeminiApiConfigFields } from "./config-fields";
import { buildGeminiApiConfig } from "@paperclipai/adapter-gemini-api/ui";

export const geminiApiUIAdapter: UIAdapterModule = {
  type: "gemini_api",
  label: "Gemini API (key)",
  parseStdoutLine: parseGeminiApiStdoutLine,
  ConfigFields: GeminiApiConfigFields,
  buildAdapterConfig: buildGeminiApiConfig,
};
