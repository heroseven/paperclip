import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  const rec = asRecord(value);
  if (!rec) return "";
  return (
    (typeof rec.message === "string" && rec.message) ||
    (typeof rec.error === "string" && rec.error) ||
    (typeof rec.code === "string" && rec.code) ||
    ""
  );
}

export function parseGeminiApiStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const parsed = asRecord(safeJsonParse(line));
  if (!parsed) {
    return [{ kind: "stdout", ts, text: line }];
  }

  const type = asString(parsed.type);

  if (type === "system") {
    const subtype = asString(parsed.subtype);
    if (subtype === "init") {
      return [{ kind: "init", ts, model: asString(parsed.model, "gemini"), sessionId: "" }];
    }
    if (subtype === "error") {
      const text = errorText(parsed.error ?? parsed.message);
      return [{ kind: "stderr", ts, text: text || "error" }];
    }
    return [{ kind: "system", ts, text: `system: ${subtype || "event"}` }];
  }

  if (type === "assistant") {
    const msg = parsed.message;
    const text = asString(asRecord(msg)?.text ?? msg, "").trim();
    return text ? [{ kind: "assistant", ts, text }] : [];
  }

  if (type === "result") {
    const usageRaw = asRecord(parsed.usage);
    const inputTokens = asNumber(usageRaw?.inputTokens ?? usageRaw?.promptTokenCount);
    const outputTokens = asNumber(usageRaw?.outputTokens ?? usageRaw?.candidatesTokenCount);
    const cachedTokens = asNumber(usageRaw?.cachedInputTokens ?? 0);
    const isError = parsed.is_error === true;
    const errors = isError
      ? [errorText(parsed.error ?? parsed.message)].filter(Boolean)
      : [];
    return [
      {
        kind: "result",
        ts,
        text: asString(parsed.result ?? parsed.text ?? "", ""),
        inputTokens,
        outputTokens,
        cachedTokens,
        costUsd: asNumber(parsed.cost_usd ?? parsed.total_cost_usd ?? 0),
        subtype: asString(parsed.subtype, "result"),
        isError,
        errors,
      },
    ];
  }

  if (type === "error") {
    const text = errorText(parsed.error ?? parsed.message);
    return [{ kind: "stderr", ts, text: text || "error" }];
  }

  return [{ kind: "stdout", ts, text: line }];
}
