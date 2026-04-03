export const type = "gemini_api";
export const label = "Gemini API (key)";
export const DEFAULT_GEMINI_API_MODEL = "gemini-2.5-pro-exp-03-25";

export const models = [
  { id: "gemini-2.5-pro-exp-03-25", label: "Gemini 2.5 Pro (exp)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
];

export const agentConfigurationDoc = `# gemini_api agent configuration

Adapter: gemini_api

Use when:
- You want to call the Gemini REST API directly using an API key (no CLI required)
- The Gemini CLI is not installed or not available on the host
- You want reliable, stateless generation calls to Google AI Studio / Gemini API
- You only need text generation for tasks (not interactive CLI tool use)

Don't use when:
- You need the Gemini CLI's agentic tool-use loop (use gemini_local instead)
- You need session resumption with --resume (no session support in API adapter)
- You need to run shell commands or file edits in a local workspace via the Gemini CLI

Core fields:
- apiKey (string, required): Google Gemini API key (AIzaSy...)
- model (string, optional): Gemini model id. Defaults to gemini-2.5-pro-exp-03-25.
- promptTemplate (string, optional): run prompt template with {{agent.name}}, {{context.taskId}}, etc.
- systemInstruction (string, optional): system instruction text sent to the API
- maxOutputTokens (number, optional): max output tokens. Defaults to 8192.
- temperature (number, optional): sampling temperature 0.0-2.0. Defaults to 1.0.

Operational fields:
- timeoutSec (number, optional): HTTP request timeout in seconds. Defaults to 120.

Notes:
- Uses GEMINI_API_KEY environment variable if apiKey config field is not set.
- Supports multi-turn via the contents array (no session persistence between runs).
- Results are logged as JSON lines compatible with the standard Gemini parsing pipeline.
`;
