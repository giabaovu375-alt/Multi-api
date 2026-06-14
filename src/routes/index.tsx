import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Cpu, Layers, Network, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createBlankProject, upsertProject } from "@/lib/storage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forge — Start a new project" },
      { name: "description", content: "Describe a project and let a multi-agent AI pipeline build it." },
      { property: "og:title", content: "Forge — Start a new project" },
      { property: "og:description", content: "Describe a project and let a multi-agent AI pipeline build it." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("TypeScript");
  const [framework, setFramework] = useState("");
  const [extra, setExtra] = useState("");

  const onCreate = (autoRun: boolean) => {
    if (!description.trim()) return;
    const title = description.split("\n")[0].slice(0, 60);
    const project = createBlankProject({
      title,
      description: description.trim(),
      language,
      framework,
      extra,
    });
    upsertProject(project);
    window.dispatchEvent(new Event("forge:projects-changed"));
    navigate({
      to: "/project/$projectId",
      params: { projectId: project.id },
      search: autoRun ? { autorun: 1 } : undefined,
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> Multi-agent · Multi-provider · Auto-failover
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">
            Describe a project. <span className="text-primary">Forge it.</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            A pipeline of specialized agents — Analyzer, Architect, Coder, Reviewer, Refactor, Security —
            routes your task across 12+ LLM providers with automatic failover.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(true);
          }}
          className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-6 backdrop-blur"
        >
          <div className="space-y-1.5">
            <Label htmlFor="desc">Project description</Label>
            <Textarea
              id="desc"
              placeholder="Build a 3D multiplayer survival game using Three.js and Node.js…"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lang">Language</Label>
              <Input id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="TypeScript" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fw">Framework</Label>
              <Input id="fw" value={framework} onChange={(e) => setFramework(e.target.value)} placeholder="Three.js / Node.js" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="extra">Additional requirements</Label>
            <Textarea
              id="extra"
              rows={2}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Realtime sync, mobile-friendly, persist state…"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onCreate(false)} disabled={!description.trim()}>
              Save draft
            </Button>
            <Button type="submit" disabled={!description.trim()} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Generate project
            </Button>
          </div>
        </form>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Bot, title: "Multi-agent pipeline", body: "Analyzer → Architect → Coder → Reviewer → Refactor → Security." },
            { icon: Network, title: "Provider failover", body: "Groq, Cerebras, OpenRouter, Together, Mistral, NVIDIA + more." },
            { icon: Cpu, title: "Adaptive routing", body: "Difficulty score picks fast/cheap vs. heavy reasoning models." },
            { icon: Layers, title: "Skeleton-aware", body: "Skips configs and boilerplate — only generates logic files." },
            { icon: ShieldCheck, title: "Security audited", body: "A dedicated agent reviews for unsafe patterns." },
            { icon: Sparkles, title: "Streaming UI", body: "Watch each agent run live with per-attempt provider status." },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-border/60 bg-card/30 p-4">
              <f.icon className="h-4 w-4 text-primary" />
              <div className="mt-2 text-sm font-medium">{f.title}</div>
              <p className="mt-1 text-xs text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
