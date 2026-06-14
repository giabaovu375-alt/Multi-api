// Threaded project storage in localStorage. Browser-only.
export interface ProjectMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export interface ProjectFile {
  path: string;
  content: string;
}

export interface PipelineStateSnapshot {
  analysis?: unknown;
  plan?: unknown;
  review?: unknown;
  security?: unknown;
  usage?: { prompt: number; completion: number; total: number };
  lastProvider?: string;
  lastModel?: string;
  attempts?: { provider: string; model: string; ok: boolean; phase?: string }[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  language: string;
  framework: string;
  extra: string;
  createdAt: number;
  updatedAt: number;
  messages: ProjectMessage[];
  files: ProjectFile[];
  state: PipelineStateSnapshot;
}

const KEY = "ai-coding-platform:projects:v1";

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadProjects(): Project[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(projects));
  } catch {
    /* ignore quota */
  }
}

export function upsertProject(p: Project) {
  const all = loadProjects();
  const idx = all.findIndex((x) => x.id === p.id);
  if (idx >= 0) all[idx] = p;
  else all.unshift(p);
  saveProjects(all);
}

export function deleteProject(id: string) {
  saveProjects(loadProjects().filter((p) => p.id !== id));
}

export function getProject(id: string): Project | undefined {
  return loadProjects().find((p) => p.id === id);
}

export function newProjectId(): string {
  return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newMessageId(): string {
  return "m_" + Math.random().toString(36).slice(2, 10);
}

export function createBlankProject(input: {
  title: string;
  description: string;
  language: string;
  framework: string;
  extra: string;
}): Project {
  const now = Date.now();
  return {
    id: newProjectId(),
    title: input.title || input.description.slice(0, 60) || "Untitled Project",
    description: input.description,
    language: input.language,
    framework: input.framework,
    extra: input.extra,
    createdAt: now,
    updatedAt: now,
    messages: [],
    files: [],
    state: {},
  };
}