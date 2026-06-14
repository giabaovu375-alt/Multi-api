import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FileCode2,
  Play,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getProject,
  upsertProject,
  newMessageId,
  type Project,
  type ProjectFile,
  type ProjectMessage,
} from "@/lib/storage";
import { streamGenerate } from "@/lib/stream-client";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ autorun: z.coerce.number().optional() });

export const Route = createFileRoute("/project/$projectId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Forge — Project" },
      { name: "description", content: "Workspace for a generated project." },
    ],
  }),
  component: ProjectPage,
});

type Phase = "idle" | "analyzer" | "architect" | "coder" | "reviewer" | "refactor" | "security" | "done";
const PHASES: { id: Phase; label: string; icon: LucideIcon }[] = [
  { id: "analyzer", label: "Analyzer", icon: Activity },
  { id: "architect", label: "Architect", icon: Cpu },
  { id: "coder", label: "Coder", icon: FileCode2 },
  { id: "reviewer", label: "Reviewer", icon: CheckCircle2 },
  { id: "refactor", label: "Refactor", icon: ChevronRight },
  { id: "security", label: "Security", icon: ShieldCheck },
];

interface AttemptLog {
  phase: string;
  provider: string;
  model: string;
  ok: boolean;
  error?: string;
  at: number;
}

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { autorun } = Route.useSearch();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [attempts, setAttempts] = useState<AttemptLog[]>([]);
  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const didAutoRun = useRef(false);

  // Load project from storage
  useEffect(() => {
    const p = getProject(projectId);
    if (!p) {
      throw notFound();
    }
    setProject(p);
    if (p.files[0]) setSelectedFile(p.files[0].path);
  }, [projectId]);

  const persist = useCallback((updater: (p: Project) => Project) => {
    setProject((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      next.updatedAt = Date.now();
      upsertProject(next);
      window.dispatchEvent(new Event("forge:projects-changed"));
      return next;
    });
  }, []);

  const runGeneration = useCallback(
    async (userMessage?: string) => {
      if (!project || running) return;
      setRunning(true);
      setPhase("idle");
      setAttempts([]);
      setCurrentModel(null);

      const ctl = new AbortController();
      abortRef.current = ctl;

      // optimistic messages
      const msgs: ProjectMessage[] = [...project.messages];
      const userText = userMessage ?? project.description;
      if (msgs.length === 0 || userMessage) {
        msgs.push({
          id: newMessageId(),
          role: "user",
          content: userText,
          createdAt: Date.now(),
        });
      }
      const assistantId = newMessageId();
      msgs.push({
        id: assistantId,
        role: "assistant",
        content: "Spinning up the agent pipeline…",
        createdAt: Date.now(),
      });
      persist((p) => ({ ...p, messages: msgs }));

      let filesAccum: ProjectFile[] = project.files;
      const stateAccum: Project["state"] = { ...project.state, attempts: [] };

      try {
        await streamGenerate(
          {
            description: userText,
            language: project.language,
            framework: project.framework,
            extra: project.extra,
          },
          (e) => {
            if (e.type === "phase") setPhase((e.phase as Phase) ?? "idle");
            if (e.type === "attempt") {
              const d = e.data as { provider: string; model: string; ok: boolean; error?: string };
              const log: AttemptLog = { ...d, phase: e.phase ?? "?", at: Date.now() };
              setAttempts((a) => [...a, log]);
              if (d.ok) setCurrentModel({ provider: d.provider, model: d.model });
              stateAccum.attempts = [...(stateAccum.attempts ?? []), { provider: d.provider, model: d.model, ok: d.ok, phase: e.phase }];
            }
            if (e.type === "analysis") {
              stateAccum.analysis = e.data;
              stateAccum.lastProvider = e.provider;
              stateAccum.lastModel = e.model;
            }
            if (e.type === "plan") stateAccum.plan = e.data;
            if (e.type === "review") stateAccum.review = e.data;
            if (e.type === "security") stateAccum.security = e.data;
            if (e.type === "files") {
              filesAccum = e.data as ProjectFile[];
              setSelectedFile((cur) => cur ?? filesAccum[0]?.path ?? null);
            }
            if (e.type === "final") {
              const d = e.data as { files: ProjectFile[]; usage: { prompt: number; completion: number; total: number } };
              filesAccum = d.files;
              stateAccum.usage = d.usage;
            }
            if (e.type === "error") {
              toast.error(e.message ?? "Pipeline error");
            }
            if (e.type === "done") {
              setPhase("done");
            }
          },
          ctl.signal,
        );

        const assistantSummary = buildAssistantSummary(filesAccum, stateAccum);
        persist((p) => ({
          ...p,
          files: filesAccum,
          state: stateAccum,
          messages: p.messages.map((m) =>
            m.id === assistantId ? { ...m, content: assistantSummary } : m,
          ),
        }));
        toast.success(`Generated ${filesAccum.length} file${filesAccum.length === 1 ? "" : "s"}.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
        persist((p) => ({
          ...p,
          messages: p.messages.map((m) =>
            m.id === assistantId ? { ...m, content: `Pipeline failed: ${msg}` } : m,
          ),
        }));
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [project, running, persist],
  );

  // autorun on first arrival from new-project form
  useEffect(() => {
    if (!project || didAutoRun.current) return;
    if (autorun && project.files.length === 0 && project.messages.length === 0) {
      didAutoRun.current = true;
      void runGeneration();
      navigate({
        to: "/project/$projectId",
        params: { projectId },
        search: {},
        replace: true,
      });
    }
  }, [project, autorun, runGeneration, navigate, projectId]);

  if (!project) return null;

  const selected = project.files.find((f) => f.path === selectedFile) ?? null;

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[360px_1fr_360px] min-h-0 overflow-hidden">
      {/* LEFT: Chat */}
      <div className="flex flex-col border-r border-border/60 min-h-0">
        <div className="border-b border-border/60 px-4 py-3">
          <h2 className="text-sm font-semibold truncate">{project.title}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {project.language || "any"} · {project.framework || "no framework"}
          </p>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-3 p-4">
            {project.messages.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No messages yet. Hit “Run pipeline” to generate.
              </p>
            )}
            {project.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground ml-4"
                    : "bg-card border border-border/60 mr-4",
                )}
              >
                {m.content}
              </div>
            ))}
            {running && (
              <div className="mr-4 flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Agents working…
              </div>
            )}
          </div>
        </ScrollArea>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!chatInput.trim() || running) return;
            void runGeneration(chatInput.trim());
            setChatInput("");
          }}
          className="border-t border-border/60 p-3 space-y-2"
        >
          <Textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Refine the request or ask for changes…"
            rows={2}
            disabled={running}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (chatInput.trim() && !running) {
                  void runGeneration(chatInput.trim());
                  setChatInput("");
                }
              }
            }}
          />
          <div className="flex justify-between items-center gap-2">
            <span className="text-[10px] text-muted-foreground">⌘/Ctrl+Enter to send</span>
            <div className="flex gap-2">
              {running && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => abortRef.current?.abort()}
                >
                  Stop
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={running}
                onClick={() => void runGeneration()}
                className="gap-1"
              >
                <Play className="h-3 w-3" /> Run pipeline
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* CENTER: Files / Code */}
      <div className="flex min-h-0 flex-col">
        <Tabs defaultValue="code" className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-border/60 px-3">
            <TabsList className="bg-transparent">
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="output">Raw output</TabsTrigger>
            </TabsList>
            <div className="text-xs text-muted-foreground">
              {project.files.length} file{project.files.length === 1 ? "" : "s"}
            </div>
          </div>
          <TabsContent value="code" className="flex-1 min-h-0 m-0">
            <div className="grid h-full grid-cols-[220px_1fr] min-h-0">
              <ScrollArea className="border-r border-border/60">
                <ul className="p-2 space-y-0.5 text-xs font-mono">
                  {project.files.length === 0 && (
                    <li className="px-2 py-1 text-muted-foreground">No files yet.</li>
                  )}
                  {project.files.map((f) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(f.path)}
                        className={cn(
                          "w-full text-left rounded px-2 py-1 truncate hover:bg-accent",
                          selectedFile === f.path && "bg-accent text-accent-foreground",
                        )}
                        title={f.path}
                      >
                        {f.path}
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
              <ScrollArea className="bg-[oklch(0.16_0.02_265)]">
                <pre className="p-4 text-xs leading-relaxed font-mono text-foreground/90 whitespace-pre">
                  <code>{selected?.content ?? "// Select a file"}</code>
                </pre>
              </ScrollArea>
            </div>
          </TabsContent>
          <TabsContent value="output" className="flex-1 min-h-0 m-0">
            <ScrollArea className="h-full">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
{JSON.stringify({ files: project.files, state: project.state }, null, 2)}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* RIGHT: Status panel */}
      <div className="flex flex-col border-l border-border/60 min-h-0">
        <div className="border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold">Pipeline</h3>
          <p className="text-xs text-muted-foreground">Agent + provider status</p>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 p-4">
            {/* Current model */}
            <div className="rounded-md border border-border/60 bg-card/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Active model</div>
              {currentModel ? (
                <div className="mt-1">
                  <Badge variant="secondary" className="font-mono">{currentModel.provider}</Badge>
                  <div className="mt-1 font-mono text-xs">{currentModel.model}</div>
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">idle</div>
              )}
            </div>

            <div className="space-y-1.5">
              {PHASES.map((p) => (
                <PhaseRow key={p.id} item={p} phase={phase} running={running} attempts={attempts} />
              ))}
            </div>

            {project.state.analysis ? <AnalysisCard analysis={project.state.analysis} /> : null}

            {project.state.usage ? (
              <div className="rounded-md border border-border/60 bg-card/40 p-3 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Token usage</div>
                <div className="mt-1 grid grid-cols-3 gap-2 font-mono">
                  <div><div className="text-muted-foreground text-[10px]">prompt</div>{project.state.usage.prompt}</div>
                  <div><div className="text-muted-foreground text-[10px]">completion</div>{project.state.usage.completion}</div>
                  <div><div className="text-muted-foreground text-[10px]">total</div>{project.state.usage.total}</div>
                </div>
              </div>
            ) : null}

            {/* Attempts log */}
            {attempts.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Failover log</div>
                <ul className="space-y-1">
                  {attempts.map((a, i) => (
                    <li
                      key={i}
                      className={cn(
                        "flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-[11px] font-mono",
                        !a.ok && "border-destructive/40 bg-destructive/5",
                      )}
                    >
                      {a.ok ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive shrink-0" />
                      )}
                      <span className="text-muted-foreground">{a.phase}</span>
                      <span className="text-foreground truncate">{a.provider}/{a.model}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Review */}
            {project.state.review ? <ReviewCard review={project.state.review} /> : null}
            {project.state.security ? <SecurityCard security={project.state.security} /> : null}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function wasPhaseRun(attempts: AttemptLog[], id: string) {
  return attempts.some((a) => a.phase === id);
}

function PhaseRow({
  item,
  phase,
  running,
  attempts,
}: {
  item: { id: Phase; label: string; icon: LucideIcon };
  phase: Phase;
  running: boolean;
  attempts: AttemptLog[];
}) {
  const active = phase === item.id && running;
  const done = wasPhaseRun(attempts, item.id) && (phase !== item.id || !running);
  const Icon = item.icon;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-xs",
        active && "border-primary/60 bg-primary/5",
        done && "opacity-70",
      )}
    >
      {active ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      ) : done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className={cn("font-medium", active && "text-primary")}>{item.label}</span>
    </div>
  );
}

function buildAssistantSummary(files: ProjectFile[], state: Project["state"]): string {
  const lines: string[] = [];
  lines.push(`Generated ${files.length} file${files.length === 1 ? "" : "s"}.`);
  const a = state.analysis as { difficulty?: number; project_type?: string; summary?: string } | undefined;
  if (a?.difficulty) lines.push(`Difficulty: ${a.difficulty}/10 (${a.project_type ?? "?"}).`);
  const r = state.review as { verdict?: string; summary?: string } | undefined;
  if (r?.summary) lines.push(`Review: ${r.summary}`);
  const s = state.security as { safe?: boolean; summary?: string } | undefined;
  if (s?.summary) lines.push(`Security: ${s.summary}`);
  return lines.join("\n");
}

function AnalysisCard({ analysis }: { analysis: unknown }) {
  const a = analysis as {
    difficulty?: number;
    project_type?: string;
    frameworks?: string[];
    summary?: string;
    estimated_tokens?: number;
  };
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3 text-xs space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Analyzer</div>
      <div className="flex flex-wrap gap-1.5">
        {typeof a.difficulty === "number" && (
          <Badge variant="outline" className="font-mono">D {a.difficulty}/10</Badge>
        )}
        {a.project_type && <Badge variant="outline">{a.project_type}</Badge>}
        {a.frameworks?.slice(0, 4).map((f) => (
          <Badge key={f} variant="secondary" className="font-mono text-[10px]">{f}</Badge>
        ))}
      </div>
      {a.summary && <p className="text-muted-foreground">{a.summary}</p>}
    </div>
  );
}

function ReviewCard({ review }: { review: unknown }) {
  const r = review as { verdict?: string; summary?: string; issues?: { severity: string; message: string; path?: string }[] };
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3 text-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Review</div>
        {r.verdict && (
          <Badge variant={r.verdict === "approve" ? "default" : "destructive"} className="capitalize">
            {r.verdict}
          </Badge>
        )}
      </div>
      {r.summary && <p className="text-muted-foreground">{r.summary}</p>}
      {r.issues?.slice(0, 5).map((i, idx) => (
        <div key={idx} className="flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 mt-0.5 text-yellow-500 shrink-0" />
          <span><span className="font-mono text-[10px] text-muted-foreground">{i.severity}</span> {i.message}</span>
        </div>
      ))}
    </div>
  );
}

function SecurityCard({ security }: { security: unknown }) {
  const s = security as { safe?: boolean; summary?: string; findings?: { severity: string; issue: string }[] };
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3 text-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Security</div>
        {typeof s.safe === "boolean" && (
          <Badge variant={s.safe ? "default" : "destructive"} className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            {s.safe ? "Safe" : "Issues"}
          </Badge>
        )}
      </div>
      {s.summary && <p className="text-muted-foreground">{s.summary}</p>}
      {s.findings?.slice(0, 5).map((f, i) => (
        <div key={i} className="text-muted-foreground">
          <span className="font-mono text-[10px]">{f.severity}</span> {f.issue}
        </div>
      ))}
    </div>
  );
}