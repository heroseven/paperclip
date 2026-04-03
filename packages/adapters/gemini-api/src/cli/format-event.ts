import pc from "picocolors";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function printGeminiApiStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    console.log(line);
    return;
  }

  const type = asString(parsed.type);

  if (type === "system") {
    const subtype = asString(parsed.subtype);
    if (subtype === "init") {
      const model = asString(parsed.model);
      console.log(pc.blue(`Gemini API init${model ? ` (model: ${model})` : ""}`));
      return;
    }
    if (subtype === "error") {
      const msg = asString(parsed.message ?? parsed.error);
      if (msg) console.log(pc.red(`error: ${msg}`));
      return;
    }
    console.log(pc.blue(`system: ${subtype || "event"}`));
    return;
  }

  if (type === "assistant") {
    const messageRaw = parsed.message;
    const text = asString(asRecord(messageRaw)?.text ?? messageRaw, "").trim();
    if (text) console.log(pc.green(`assistant: ${text}`));
    return;
  }

  if (type === "result") {
    const usageRaw = asRecord(parsed.usage);
    const input = asNumber(usageRaw?.inputTokens ?? usageRaw?.promptTokenCount);
    const output = asNumber(usageRaw?.outputTokens ?? usageRaw?.candidatesTokenCount);
    const isError = parsed.is_error === true;
    console.log(pc.blue(`tokens: in=${input} out=${output}`));
    if (isError) {
      const errText = asString(parsed.error ?? parsed.message);
      console.log(pc.red(`result: error${errText ? ` — ${errText}` : ""}`));
    } else {
      console.log(pc.blue(`result: success`));
    }
    return;
  }

  if (type === "error") {
    const text = asString(parsed.error ?? parsed.message);
    if (text) console.log(pc.red(`error: ${text}`));
    return;
  }

  console.log(line);
}
