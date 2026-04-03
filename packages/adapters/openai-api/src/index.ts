export const type = "openai_api";
export const label = "OpenAI API (key)";
export const DEFAULT_OPENAI_API_MODEL = "gpt-4o-mini";

export const models = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini (most economical)" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano (cheapest)" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  { id: "o4-mini", label: "o4-mini (reasoning)" },
  { id: "o3-mini", label: "o3-mini (reasoning)" },
];

export const agentConfigurationDoc = `# openai_api agent configuration

Adapter: openai_api

Use when:
- You want to call the OpenAI Chat Completions API directly using an API key (no CLI required)
- You want to use OpenAI models (GPT-4o, GPT-4o Mini, etc.) for cost-effective text generation
- You need a simple, stateless single-turn generation call
- The most cost-efficient option: use gpt-4o-mini or gpt-4.1-nano

Don't use when:
- You need an agentic loop with tool calls and file edits (no local tool use)
- You need session resumption across runs (stateless adapter, no conversation history)
- You need streaming response updates during a long run

Core fields:
- apiKey (string, required): OpenAI API key (sk-...)
- model (string, optional): OpenAI model id. Defaults to gpt-4o-mini.
- promptTemplate (string, optional): run prompt template with {{agent.name}}, {{context.taskId}}, etc.
- systemPrompt (string, optional): system message sent to the API
- maxTokens (number, optional): max output tokens. Defaults to 4096.
- temperature (number, optional): sampling temperature 0.0-2.0. Defaults to 1.0.

Operational fields:
- timeoutSec (number, optional): HTTP request timeout in seconds. Defaults to 120.

Notes:
- Uses OPENAI_API_KEY environment variable if apiKey config field is not set.
- Stateless: no conversation history is maintained between runs.
- Results are logged as JSON lines compatible with the standard parsing pipeline.
`;
