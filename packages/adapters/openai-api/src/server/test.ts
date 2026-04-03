import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asNumber, asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_OPENAI_API_MODEL } from "../index.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);

  // Check API key
  const configApiKey = asString(config.apiKey, "").trim();
  const hostOpenaiApiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const resolvedApiKey = configApiKey || hostOpenaiApiKey;

  if (resolvedApiKey) {
    const source = configApiKey ? "adapter config" : "OPENAI_API_KEY env";
    checks.push({
      code: "openai_api_key_present",
      level: "info",
      message: "OpenAI API key is configured.",
      detail: `Detected from ${source}.`,
    });
  } else {
    checks.push({
      code: "openai_api_key_missing",
      level: "error",
      message: "No OpenAI API key found.",
      hint: "Set apiKey in adapter config, or set OPENAI_API_KEY in the server environment.",
    });
  }

  const model = asString(config.model, DEFAULT_OPENAI_API_MODEL).trim() || DEFAULT_OPENAI_API_MODEL;
  checks.push({
    code: "openai_api_model",
    level: "info",
    message: `Model: ${model}`,
  });

  // Only run the probe if we have a key
  const hasErrors = checks.some((c) => c.level === "error");
  if (!hasErrors && resolvedApiKey) {
    const probeTimeoutSec = Math.max(1, asNumber(config.helloProbeTimeoutSec, 15));
    const url = "https://api.openai.com/v1/chat/completions";
    const requestBody = {
      model,
      messages: [{ role: "user", content: "Respond with hello." }],
      max_tokens: 16,
      temperature: 0,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), probeTimeoutSec * 1000);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedApiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        let errBody = "";
        try { errBody = await resp.text(); } catch { /* ignore */ }
        const errSnippet = errBody.slice(0, 300).replace(/\s+/g, " ").trim();

        const requiresAuth = resp.status === 401 || resp.status === 403 ||
          /api[_ ]?key.*invalid|not.*authenticated|unauthorized/i.test(errSnippet);
        const quotaExhausted = resp.status === 429 ||
          /resource_exhausted|quota|rate.*limit|too many requests/i.test(errSnippet);

        if (quotaExhausted) {
          checks.push({
            code: "openai_api_probe_quota_exhausted",
            level: "warn",
            message: "OpenAI API probe hit quota/rate limit.",
            detail: errSnippet || undefined,
            hint: "The API key is valid but quota is exhausted. Check platform.openai.com billing/usage.",
          });
        } else if (requiresAuth) {
          checks.push({
            code: "openai_api_probe_auth_failed",
            level: "error",
            message: "OpenAI API key authentication failed.",
            detail: errSnippet || undefined,
            hint: "Verify the API key is correct and active.",
          });
        } else {
          checks.push({
            code: "openai_api_probe_http_error",
            level: "error",
            message: `OpenAI API probe returned HTTP ${resp.status}.`,
            detail: errSnippet || undefined,
          });
        }
      } else {
        const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content?.trim() || "";
        const hasHello = /\bhello\b/i.test(text);
        checks.push({
          code: hasHello ? "openai_api_probe_passed" : "openai_api_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "OpenAI API hello probe succeeded."
            : "OpenAI API probe ran but did not return `hello` as expected.",
          detail: text ? text.slice(0, 240) : undefined,
        });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        checks.push({
          code: "openai_api_probe_timed_out",
          level: "warn",
          message: `OpenAI API probe timed out after ${probeTimeoutSec}s.`,
          hint: "Check network connectivity or increase helloProbeTimeoutSec.",
        });
      } else {
        checks.push({
          code: "openai_api_probe_error",
          level: "error",
          message: `OpenAI API probe error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
