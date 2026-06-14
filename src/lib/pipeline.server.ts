import { callWithFailover, extractJson, hasProvider, type CallResult } from "./ai.server";
import {
  analyzerPrompt,
  architectPrompt,
  coderPrompt,
  reviewerPrompt,
  refactorPrompt,
  securityPrompt,
} from "./agents.server";
import {
  chainForDifficulty,
  SIMPLE_CHAIN,
  COMPLEX_CHAIN,
  type ModelChoice,
  type ProviderId,
} from "./providers";

export interface GenRequest {
  description: string;
  language: string;
  framework: string;
  extra: string;
}

export interface PipelineEvent {
  type:
    | "phase"
    | "attempt"
    | "analysis"
    | "plan"
    | "files"
    | "review"
    | "security"
    | "final"
    | "error"
    | "done";
  phase?: string;
  data?: unknown;
  message?: string;
  model?: string;
  provider?: ProviderId;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

function viableChain(chain: ModelChoice[]): ModelChoice[] {
  return chain.filter((c) => hasProvider(c.provider));
}

export async function runPipeline(
  req: GenRequest,
  emit: (e: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const totalUsage = { prompt: 0, completion: 0, total: 0 };
  const trackUsage = (r: CallResult) => {
    totalUsage.prompt += r.usage?.prompt ?? 0;
    totalUsage.completion += r.usage?.completion ?? 0;
    totalUsage.total += r.usage?.total ?? 0;
  };

  // ---------- Analyzer (cheap) ----------
  emit({ type: "phase", phase: "analyzer", message: "Analyzing project difficulty" });
  const analyzer = await callWithFailover(
    viableChain(SIMPLE_CHAIN),
    { system: "You are a precise project analyzer. Return JSON only.", user: analyzerPrompt(req), json: true, temperature: 0.2 },
    (a) => emit({ type: "attempt", phase: "analyzer", data: a }),
    signal,
  );
  trackUsage(analyzer);
  let analysis: { difficulty: number; project_type: string; frameworks?: string[]; estimated_tokens?: number };
  try {
    analysis = extractJson(analyzer.text);
  } catch {
    analysis = { difficulty: 5, project_type: "fullstack", frameworks: [], estimated_tokens: 0 };
  }
  if (typeof analysis.difficulty !== "number") analysis.difficulty = 5;
  emit({ type: "analysis", data: analysis, provider: analyzer.provider, model: analyzer.model });

  const mainChain = viableChain(chainForDifficulty(analysis.difficulty));
  const reviewChain = viableChain(analysis.difficulty >= 6 ? COMPLEX_CHAIN : SIMPLE_CHAIN);

  // ---------- Architect ----------
  emit({ type: "phase", phase: "architect", message: "Designing project architecture" });
  const arch = await callWithFailover(
    mainChain,
    {
      system: "You are a senior software architect. Return JSON only.",
      user: architectPrompt({ ...req, analysis }),
      json: true,
      temperature: 0.3,
    },
    (a) => emit({ type: "attempt", phase: "architect", data: a }),
    signal,
  );
  trackUsage(arch);
  let plan: { summary: string; files: { path: string; purpose: string }[]; notes?: string[] };
  try {
    plan = extractJson(arch.text);
  } catch {
    plan = { summary: "Generated plan", files: [], notes: [] };
  }
  emit({ type: "plan", data: plan, provider: arch.provider, model: arch.model });

  // ---------- Coder ----------
  emit({ type: "phase", phase: "coder", message: "Generating source files" });
  const code = await callWithFailover(
    mainChain,
    {
      system: "You are an expert software engineer. Return ONLY a JSON object with a 'files' array. No prose.",
      user: coderPrompt({ ...req, plan }),
      json: true,
      temperature: 0.2,
      maxTokens: 8000,
    },
    (a) => emit({ type: "attempt", phase: "coder", data: a }),
    signal,
  );
  trackUsage(code);
  let filesObj: { files: GeneratedFile[] };
  try {
    filesObj = extractJson(code.text);
    if (!Array.isArray(filesObj.files)) throw new Error("missing files array");
  } catch (e) {
    emit({ type: "error", message: `Coder output invalid: ${(e as Error).message}` });
    filesObj = { files: [] };
  }
  emit({ type: "files", data: filesObj.files, provider: code.provider, model: code.model });

  // ---------- Reviewer ----------
  emit({ type: "phase", phase: "reviewer", message: "Reviewing code quality" });
  const review = await callWithFailover(
    reviewChain,
    {
      system: "You are a strict senior code reviewer. Return JSON only.",
      user: reviewerPrompt({ description: req.description, files: filesObj.files }),
      json: true,
      temperature: 0.2,
    },
    (a) => emit({ type: "attempt", phase: "reviewer", data: a }),
    signal,
  );
  trackUsage(review);
  let reviewData: { issues?: unknown[]; verdict?: string; summary?: string };
  try {
    reviewData = extractJson(review.text);
  } catch {
    reviewData = { issues: [], verdict: "approve", summary: "Review unavailable" };
  }
  emit({ type: "review", data: reviewData, provider: review.provider, model: review.model });

  // ---------- Refactor (only if revise) ----------
  let finalFiles = filesObj.files;
  if (reviewData.verdict === "revise" && (reviewData.issues?.length ?? 0) > 0) {
    emit({ type: "phase", phase: "refactor", message: "Refactoring based on review" });
    try {
      const refactor = await callWithFailover(
        mainChain,
        {
          system: "You are a refactoring expert. Return ONLY the JSON files object.",
          user: refactorPrompt({ files: finalFiles, review: reviewData }),
          json: true,
          temperature: 0.2,
          maxTokens: 8000,
        },
        (a) => emit({ type: "attempt", phase: "refactor", data: a }),
        signal,
      );
      trackUsage(refactor);
      const refObj = extractJson<{ files: GeneratedFile[] }>(refactor.text);
      if (Array.isArray(refObj.files) && refObj.files.length > 0) {
        finalFiles = refObj.files;
        emit({ type: "files", data: finalFiles, provider: refactor.provider, model: refactor.model });
      }
    } catch (e) {
      emit({ type: "error", message: `Refactor failed: ${(e as Error).message}` });
    }
  }

  // ---------- Security ----------
  emit({ type: "phase", phase: "security", message: "Running security audit" });
  try {
    const sec = await callWithFailover(
      viableChain(SIMPLE_CHAIN),
      {
        system: "You are a security auditor. Return JSON only.",
        user: securityPrompt({ files: finalFiles }),
        json: true,
        temperature: 0.2,
      },
      (a) => emit({ type: "attempt", phase: "security", data: a }),
      signal,
    );
    trackUsage(sec);
    let secData: unknown;
    try {
      secData = extractJson(sec.text);
    } catch {
      secData = { findings: [], safe: true, summary: "No issues detected" };
    }
    emit({ type: "security", data: secData, provider: sec.provider, model: sec.model });
  } catch (e) {
    emit({ type: "error", message: `Security audit failed: ${(e as Error).message}` });
  }

  emit({
    type: "final",
    data: { files: finalFiles, usage: totalUsage, analysis },
  });
  emit({ type: "done" });
}