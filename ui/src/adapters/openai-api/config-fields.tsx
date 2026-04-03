import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
} from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function SecretField({
  label,
  value,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors z-10"
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <DraftInput
          value={value}
          onCommit={onCommit}
          immediate
          type={visible ? "text" : "password"}
          className={inputClass + " pl-8"}
          placeholder={placeholder}
        />
      </div>
    </Field>
  );
}

export function OpenAiApiConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <>
      <SecretField
        label="OpenAI API Key"
        value={
          isCreate
            ? values!.apiKey ?? ""
            : eff("adapterConfig", "apiKey", String(config.apiKey ?? ""))
        }
        onCommit={(v) =>
          isCreate ? set!({ apiKey: v }) : mark("adapterConfig", "apiKey", v || undefined)
        }
        placeholder="sk-..."
      />

      <Field label="System Prompt (stateless)">
        <textarea
          rows={3}
          value={
            isCreate
              ? values!.systemPrompt ?? ""
              : eff("adapterConfig", "systemPrompt", String(config.systemPrompt ?? ""))
          }
          onChange={(e) =>
            isCreate
              ? set!({ systemPrompt: e.target.value })
              : mark("adapterConfig", "systemPrompt", e.target.value || undefined)
          }
          className={inputClass + " resize-y min-h-[80px] py-2"}
          placeholder="You are a helpful assistant..."
        />
      </Field>

      {!isCreate && (
        <Field label="Max Output Tokens">
          <DraftInput
            value={eff("adapterConfig", "maxTokens", String(config.maxTokens ?? "4096"))}
            onCommit={(v) => {
              const parsed = Number.parseInt(v, 10);
              mark(
                "adapterConfig",
                "maxTokens",
                Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
              );
            }}
            immediate
            className={inputClass}
            placeholder="4096"
          />
        </Field>
      )}
    </>
  );
}
