import type { AdapterConfigFieldsProps } from "../types";
import { DraftInput, Field } from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const apiKeyHint =
  "Your Google Gemini API key (starts with AIzaSy...). Get one at aistudio.google.com/apikey.";

export function GeminiApiConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <>
      <Field label="Gemini API key" hint={apiKeyHint}>
        <DraftInput
          value={
            isCreate
              ? (values as any)!.apiKey ?? ""
              : eff("adapterConfig", "apiKey", String(config.apiKey ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? (set as any)!({ apiKey: v })
              : mark("adapterConfig", "apiKey", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="AIzaSy..."
          type="password"
        />
      </Field>
    </>
  );
}
