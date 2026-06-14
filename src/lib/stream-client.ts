import type { PipelineEvent } from "./pipeline.server";

export async function streamGenerate(
  body: { description: string; language: string; framework: string; extra: string },
  onEvent: (e: PipelineEvent) => void,
  signal?: AbortSignal,
) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Generate failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as PipelineEvent);
      } catch {
        /* ignore malformed line */
      }
    }
  }
  if (buf.trim()) {
    try {
      onEvent(JSON.parse(buf) as PipelineEvent);
    } catch {
      /* ignore */
    }
  }
}