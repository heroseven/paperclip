export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";

import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

// The gemini-api adapter is stateless (no session resumption via REST API).
// We provide a no-op codec for compatibility with the registry interface.
export const sessionCodec: AdapterSessionCodec = {
  deserialize(_raw: unknown) {
    return null;
  },
  serialize(_params: Record<string, unknown> | null) {
    return null;
  },
  getDisplayId(_params: Record<string, unknown> | null) {
    return null;
  },
};
