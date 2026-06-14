import { PROVIDERS, type ModelChoice, type ProviderId } from "./providers";

export interface CallResult {
  text: string;
  provider: ProviderId;
  model: string;
  attempts: { provider: ProviderId; model: string; ok: boolean; error?: string }[];
  usage?: { prompt?: number; completion?: number; total?: number };
}

export interface CallOptions {
  system?: string;
  user: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

function getKey(p: ProviderId): string | undefined {
  // Cloudflare Workers không có process.env — thử nhiều cách
  const key = PROVIDERS[p].envKey;
  return (
    process.env[key] ??
    (globalThis as any).__env__?.[key] ??
    (globalThis as any)[key] ??
    undefined
  );
}

export function hasProvider(p: ProviderId): boolean {
  if (p === "cloudflare") {
    return !!getKey(p) && !!(
      process.env.CLOUDFLARE_ACCOUNT_ID ??
      (globalThis as any).__env__?.CLOUDFLARE_ACCOUNT_ID ??
      (globalThis as any).CLOUDFLARE_ACCOUNT_ID
    );
  }
  return !!getKey(p);
}

function getAccountId(): string | undefined {
  return (
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    (globalThis as any).__env__?.CLOUDFLARE_ACCOUNT_ID ??
    (globalThis as any).CLOUDFLARE_ACCOUNT_ID
  );
}

function baseUrlFor(p: ProviderId): string | undefined {
  if (p === "cloudflare") {
    const acc = getAccountId();
    if (!acc) return undefined;
    return `https://api.cloudflare.com/client/v4/accounts/${acc}/ai/v1`;
  }
  return PROVIDERS[p].baseUrl;
}

async function callOne(
  choice: ModelChoice,
  opts: CallOptions,
  signal?: AbortSignal,
): Promise<{ text: string; usage?: CallResult["usage"] }> {
  const provider = PROVIDERS[choice.provider];
  if (!provider.openaiCompatible) throw new Error(`${provider.label} not OpenAI-compatible`);
  const key = getKey(choice.provider);
  if (!key) throw new Error(`Missing ${provider.envKey}`);
  const base = baseUrlFor(choice.provider);
  if (!base) throw new Error(`Missing base URL for ${provider.label}`);

  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.user },
  ];

  const body: Record<string, unknown> = {
    model: choice.model,
    messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.json) body.response_format = { type: "json_object" };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (choice.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://lovable.app";
    headers["X-Title"] = "AI Coding Platform";
  }

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90_000);
  const upstreamSignal = signal
    ? AbortSignal.any([ctl.signal, signal])
    : ctl.signal;
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: upstreamSignal,
    });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${provider.label} ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider.label} returned empty content`);
  return {
    text,
    usage: data.usage && {
      prompt: data.usage.prompt_tokens,
      completion: data.usage.completion_tokens,
      total: data.usage.total_tokens,
    },
  };
}

export async function callWithFailover(
  chain: ModelChoice[],
  opts: CallOptions,
  onAttempt?: (a: { provider: ProviderId; model: string; ok: boolean; error?: string }) => void,
  signal?: AbortSignal,
): Promise<CallResult> {
  const attempts: CallResult["attempts"] = [];
  const filtered = chain.filter((c) => hasProvider(c.provider));
  if (filtered.length === 0) {
    throw new Error(
      "No provider API keys configured. Add at least one provider key (e.g. GROQ_API_KEY, OPENROUTER_API_KEY) in project secrets.",
    );
  }
  let lastErr: unknown;
  for (const choice of filtered) {
    try {
      const { text, usage } = await callOne(choice, opts, signal);
      const attempt = { provider: choice.provider, model: choice.model, ok: true };
      attempts.push(attempt);
      onAttempt?.(attempt);
      return { text, provider: choice.provider, model: choice.model, attempts, usage };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const attempt = { provider: choice.provider, model: choice.model, ok: false, error: msg };
      attempts.push(attempt);
      onAttempt?.(attempt);
      lastErr = err;
    }
  }
  throw new Error(
    `All ${filtered.length} providers failed. Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

export function extractJson<T = unknown>(text: string): T {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const start = Math.min(
    ...[t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0),
  );
  if (Number.isFinite(start) && start > 0) t = t.slice(start);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (end >= 0) t = t.slice(0, end + 1);
  return JSON.parse(t) as T;
}
