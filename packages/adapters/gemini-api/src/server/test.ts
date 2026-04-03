import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asNumber, asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_GEMINI_API_MODEL } from "../index.js";

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
  const hostGeminiApiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const hostGoogleApiKey = process.env.GOOGLE_API_KEY?.trim() ?? "";
  const resolvedApiKey = configApiKey || hostGeminiApiKey || hostGoogleApiKey;

  if (resolvedApiKey) {
    const source = configApiKey ? "adapter config" : hostGeminiApiKey ? "GEMINI_API_KEY env" : "GOOGLE_API_KEY env";
    checks.push({
      code: "gemini_api_key_present",
      level: "info",
      message: "Gemini API key is configured.",
      detail: `Detected from ${source}.`,
    });
  } else {
    checks.push({
      code: "gemini_api_key_missing",
      level: "error",
      message: "No Gemini API key found.",
      hint: "Set apiKey in adapter config, or set GEMINI_API_KEY / GOOGLE_API_KEY in the server environment.",
    });
  }

  const model = asString(config.model, DEFAULT_GEMINI_API_MODEL).trim() || DEFAULT_GEMINI_API_MODEL;
  checks.push({
    code: "gemini_api_model",
    level: "info",
    message: `Model: ${model}`,
  });

  // Only run the probe if we have a key
  const hasErrors = checks.some((c) => c.level === "error");
  if (!hasErrors && resolvedApiKey) {
    const probeTimeoutSec = Math.max(1, asNumber(config.helloProbeTimeoutSec, 15));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(resolvedApiKey)}`;
    const requestBody = {
      contents: [{ role: "user", parts: [{ text: "Respond with hello." }] }],
      generationConfig: { maxOutputTokens: 64, temperature: 0 },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), probeTimeoutSec * 1000);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
            code: "gemini_api_probe_quota_exhausted",
            level: "warn",
            message: "Gemini API probe hit quota/rate limit.",
            detail: errSnippet || undefined,
            hint: "The API key is valid but quota is exhausted. Check ai.google.dev billing/usage.",
          });
        } else if (requiresAuth) {
          checks.push({
            code: "gemini_api_probe_auth_failed",
            level: "error",
            message: "Gemini API key authentication failed.",
            detail: errSnippet || undefined,
            hint: "Verify the API key is correct and has the Generative Language API enabled.",
          });
        } else {
          checks.push({
            code: "gemini_api_probe_http_error",
            level: "error",
            message: `Gemini API probe returned HTTP ${resp.status}.`,
            detail: errSnippet || undefined,
          });
        }
      } else {
        const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = (data.candidates?.[0]?.content?.parts ?? [])
          .map((p: { text?: string }) => typeof p.text === "string" ? p.text : "")
          .join("")
          .trim();
        const hasHello = /\bhello\b/i.test(text);
        checks.push({
          code: hasHello ? "gemini_api_probe_passed" : "gemini_api_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "Gemini API hello probe succeeded."
            : "Gemini API probe ran but did not return `hello` as expected.",
          detail: text ? text.slice(0, 240) : undefined,
        });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        checks.push({
          code: "gemini_api_probe_timed_out",
          level: "warn",
          message: `Gemini API probe timed out after ${probeTimeoutSec}s.`,
          hint: "Check network connectivity or increase helloProbeTimeoutSec.",
        });
      } else {
        checks.push({
          code: "gemini_api_probe_error",
          level: "error",
          message: `Gemini API probe error: ${err instanceof Error ? err.message : String(err)}`,
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
