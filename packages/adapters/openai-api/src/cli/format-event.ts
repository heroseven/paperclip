import pc from "picocolors";

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

export function formatOpenAiApiStreamEvent(raw: string, debug: boolean): void {
  const parsed = asRecord(safeJsonParse(raw));

  if (!parsed) {
    if (debug) {
      process.stdout.write(pc.gray(raw));
    }
    return;
  }

  const type = String(parsed.type);

  if (type === "system") {
    const subtype = String(parsed.subtype);
    if (subtype === "init") {
      process.stdout.write(pc.blue(`[openai-api] model=${parsed.model}\n`));
    } else {
      process.stdout.write(pc.blue(`[openai-api] system: ${subtype}\n`));
    }
  } else if (type === "assistant") {
    const msg = parsed.message;
    const text = typeof msg === "string" ? msg : asRecord(msg)?.text;
    if (typeof text === "string" && text.length > 0) {
      process.stdout.write(pc.green(`${text}\n`));
    }
  } else if (type === "result") {
    const isError = parsed.is_error === true;
    if (isError) {
      process.stdout.write(pc.red(`[openai-api] error: ${parsed.error ?? parsed.message ?? "unknown"}\n`));
    } else {
      process.stdout.write(pc.blue(`[openai-api] execution complete\n`));
    }
  } else if (type === "error") {
    process.stdout.write(pc.red(`[openai-api] error: ${parsed.message ?? "unknown"}\n`));
  } else if (debug) {
    process.stdout.write(pc.gray(raw));
  }
}
