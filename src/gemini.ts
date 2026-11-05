// Minimal Gemini REST client with function calling.
// Swap this file later to move to Claude or any other model.
import type { Env } from "./env.ts";

export type Part = Record<string, any>;

export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export async function generate(env: Env, opts: {
  system: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
}): Promise<Content> {
  const model = env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const base = env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com";
  const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.contents,
      tools: opts.tools?.length ? [{ functionDeclarations: opts.tools }] : undefined,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json?.error ?? json)}`);
  const content = json?.candidates?.[0]?.content;
  return { role: "model", parts: content?.parts ?? [{ text: "" }] };
}

export function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
