import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  buildPaperclipEnv,
  parseObject,
  renderTemplate,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_OPENAI_API_MODEL } from "../index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChoice {
  message?: OpenAIMessage;
  finish_reason?: string;
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
}

interface OpenAIApiResponse {
  id?: string;
  model?: string;
  choices?: OpenAIChoice[];
  usage?: OpenAIUsage;
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emitJsonLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + "\n";
}

// ---------------------------------------------------------------------------
// execute
// ---------------------------------------------------------------------------

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;

  const configApiKey = asString(config.apiKey, "").trim();
  const envApiKey = asString(process.env.OPENAI_API_KEY, "").trim();
  const apiKey = configApiKey || envApiKey;

  const model = asString(config.model, DEFAULT_OPENAI_API_MODEL).trim() || DEFAULT_OPENAI_API_MODEL;
  const maxTokens = asNumber(config.maxTokens, 4096);
  const temperature = asNumber(config.temperature, 1.0);
  const timeoutSec = asNumber(config.timeoutSec, 120);

  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );
  const systemPrompt = asString(config.systemPrompt, "").trim();

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
      adapterType: "openai_api",
      command: "https://api.openai.com",
      cwd: process.cwd(),
      commandNotes: [
        `Calling OpenAI Chat Completions API: model=${model}`,
        apiKey
          ? `API key configured (${configApiKey ? "from config" : "from env"})`
          : "WARNING: No API key found",
      ],
      commandArgs: [`model=${model}`, `maxTokens=${maxTokens}`, `temperature=${temperature}`],
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
      message: "No OpenAI API key configured. Set apiKey in adapter config or OPENAI_API_KEY env var.",
    });
    await onLog("stderr", errLine);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "No OpenAI API key configured. Set apiKey in adapter config or OPENAI_API_KEY env var.",
    };
  }

  // Build messages array
  const messages: OpenAIMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: renderedPrompt });

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  const initLine = emitJsonLine({
    type: "system",
    subtype: "init",
    model,
    session_id: null,
  });
  await onLog("stdout", initLine);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

  let responseData: OpenAIApiResponse;
  let timedOut = false;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
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
        message: `OpenAI API HTTP error ${resp.status}: ${errorBody.slice(0, 500)}`,
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
        errorMessage: `OpenAI API HTTP error ${resp.status}: ${errorBody.slice(0, 300)}`,
        provider: "openai",
        model,
      };
    }

    responseData = (await resp.json()) as OpenAIApiResponse;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      timedOut = true;
    }
    if (timedOut) {
      const timeoutLine = emitJsonLine({
        type: "error",
        message: `OpenAI API call timed out after ${timeoutSec}s`,
      });
      await onLog("stderr", timeoutLine);
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
        provider: "openai",
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
      provider: "openai",
      model,
    };
  }

  // Check for API-level errors
  if (responseData.error) {
    const apiErr = responseData.error;
    const errMsg = apiErr.message ?? `OpenAI API error (${apiErr.code ?? "unknown"})`;
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
      provider: "openai",
      model,
    };
  }

  const text = responseData.choices?.[0]?.message?.content?.trim() ?? "";
  const usage = responseData.usage;

  if (text) {
    const assistantLine = emitJsonLine({
      type: "assistant",
      message: { text },
    });
    await onLog("stdout", assistantLine);
  }

  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;

  const resolvedModel = responseData.model ?? model;

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
    model: resolvedModel,
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
    provider: "openai",
    model: resolvedModel,
    summary: text || undefined,
    resultJson: {
      result: text,
      model: resolvedModel,
      finishReason: responseData.choices?.[0]?.finish_reason ?? null,
    },
  };
}
