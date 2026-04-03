import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  buildPaperclipEnv,
  parseObject,
  renderTemplate,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_GEMINI_API_MODEL } from "../index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
    role?: string;
  };
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiApiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(response: GeminiApiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
}

function emitJsonLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + "\n";
}

// ---------------------------------------------------------------------------
// execute
// ---------------------------------------------------------------------------

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;

  const configApiKey = asString(config.apiKey, "").trim();
  const envApiKey = asString(process.env.GEMINI_API_KEY, asString(process.env.GOOGLE_API_KEY, "")).trim();
  const apiKey = configApiKey || envApiKey;

  const model = asString(config.model, DEFAULT_GEMINI_API_MODEL).trim() || DEFAULT_GEMINI_API_MODEL;
  const maxOutputTokens = asNumber(config.maxOutputTokens, 8192);
  const temperature = asNumber(config.temperature, 1.0);
  const timeoutSec = asNumber(config.timeoutSec, 120);

  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );
  const systemInstruction = asString(config.systemInstruction, "").trim();

  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };

  const renderedPrompt = renderTemplate(promptTemplate, templateData);

  // Build environment metadata (for onMeta logging)
  const paperclipEnv = buildPaperclipEnv(agent);
  const wakeTaskId =
    (typeof context.taskId === "string" && context.taskId.trim().length > 0 && context.taskId.trim()) ||
    (typeof context.issueId === "string" && context.issueId.trim().length > 0 && context.issueId.trim()) ||
    null;

  if (onMeta) {
    await onMeta({
      adapterType: "gemini_api",
      command: "https://generativelanguage.googleapis.com",
      cwd: process.cwd(),
      commandNotes: [
        `Calling Gemini REST API: model=${model}`,
        apiKey ? `API key configured (${configApiKey ? "from config" : "from env"})` : "WARNING: No API key found",
      ],
      commandArgs: [`model=${model}`, `maxOutputTokens=${maxOutputTokens}`, `temperature=${temperature}`],
      env: {
        PAPERCLIP_AGENT_ID: paperclipEnv.PAPERCLIP_AGENT_ID ?? agent.id,
        PAPERCLIP_COMPANY_ID: paperclipEnv.PAPERCLIP_COMPANY_ID ?? agent.companyId,
        ...(wakeTaskId ? { PAPERCLIP_TASK_ID: wakeTaskId } : {}),
        ...(authToken ? { PAPERCLIP_API_KEY: "[redacted]" } : {}),
      },
      prompt: renderedPrompt,
      promptMetrics: {
        promptChars: renderedPrompt.length,
      },
      context,
    });
  }

  if (!apiKey) {
    const errLine = emitJsonLine({
      type: "error",
      message: "No Gemini API key configured. Set apiKey in adapter config or GEMINI_API_KEY env var.",
    });
    await onLog("stderr", errLine);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "No Gemini API key configured. Set apiKey in adapter config or GEMINI_API_KEY env var.",
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: renderedPrompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens,
      temperature,
    },
  };

  if (systemInstruction) {
    (requestBody as Record<string, unknown>).systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const initLine = emitJsonLine({
    type: "system",
    subtype: "init",
    model,
    session_id: null,
  });
  await onLog("stdout", initLine);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

  let responseData: GeminiApiResponse;
  let timedOut = false;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      let errorBody = "";
      try {
        errorBody = await resp.text();
      } catch {
        // ignore
      }
      const errLine = emitJsonLine({
        type: "error",
        message: `Gemini API HTTP error ${resp.status}: ${errorBody.slice(0, 500)}`,
      });
      await onLog("stderr", errLine);
      const resultLine = emitJsonLine({
        type: "result",
        subtype: "error",
        is_error: true,
        error: `HTTP ${resp.status}`,
      });
      await onLog("stdout", resultLine);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Gemini API HTTP error ${resp.status}: ${errorBody.slice(0, 300)}`,
        provider: "google",
        model,
      };
    }

    responseData = (await resp.json()) as GeminiApiResponse;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      timedOut = true;
    }
    if (timedOut) {
      const timeoutLine = emitJsonLine({
        type: "error",
        message: `Gemini API call timed out after ${timeoutSec}s`,
      });
      await onLog("stderr", timeoutLine);
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
        provider: "google",
        model,
      };
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const errLine = emitJsonLine({ type: "error", message: errMsg });
    await onLog("stderr", errLine);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: errMsg,
      provider: "google",
      model,
    };
  }

  // Check for API-level errors
  if (responseData.error) {
    const apiErr = responseData.error;
    const errMsg = apiErr.message ?? `Gemini API error ${apiErr.code ?? "unknown"}`;
    const errLine = emitJsonLine({ type: "error", message: errMsg });
    await onLog("stderr", errLine);
    const resultLine = emitJsonLine({
      type: "result",
      subtype: "error",
      is_error: true,
      error: errMsg,
    });
    await onLog("stdout", resultLine);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: errMsg,
      provider: "google",
      model,
    };
  }

  const text = extractText(responseData);
  const usage = responseData.usageMetadata;

  if (text) {
    const assistantLine = emitJsonLine({
      type: "assistant",
      message: { text },
    });
    await onLog("stdout", assistantLine);
  }

  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const cachedTokens = usage?.cachedContentTokenCount ?? 0;

  const resultLine = emitJsonLine({
    type: "result",
    subtype: "success",
    is_error: false,
    result: text,
    usage: {
      inputTokens,
      outputTokens,
      cachedInputTokens: cachedTokens,
    },
    model,
  });
  await onLog("stdout", resultLine);

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    errorMessage: null,
    usage: {
      inputTokens,
      outputTokens,
      cachedInputTokens: cachedTokens,
    },
    provider: "google",
    model,
    summary: text || undefined,
    resultJson: {
      result: text,
      model,
      finishReason: responseData.candidates?.[0]?.finishReason ?? null,
    },
  };
}
