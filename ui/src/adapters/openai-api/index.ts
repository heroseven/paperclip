import type { UIAdapterModule } from "../types";
import { parseStdoutLine } from "@paperclipai/adapter-openai-api/ui";
import { buildAdapterConfig } from "@paperclipai/adapter-openai-api/ui";
import { OpenAiApiConfigFields } from "./config-fields";

export const openaiApiUIAdapter: UIAdapterModule = {
  type: "openai_api",
  label: "OpenAI API (key)",
  parseStdoutLine,
  ConfigFields: OpenAiApiConfigFields,
  buildAdapterConfig,
};
