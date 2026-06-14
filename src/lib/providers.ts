// Client+server safe provider catalog. NO SECRETS HERE.
export type ProviderId =
  | "groq"
  | "cerebras"
  | "siliconflow"
  | "sambanova"
  | "together"
  | "openrouter"
  | "nvidia"
  | "cloudflare"
  | "mistral"
  | "cohere"
  | "upstage"
  | "replicate"
  | "coco";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  envKey: string;
  baseUrl?: string; // some are dynamic
  openaiCompatible: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  groq:        { id: "groq",        label: "Groq",         envKey: "GROQ_API_KEY",        baseUrl: "https://api.groq.com/openai/v1",        openaiCompatible: true },
  cerebras:    { id: "cerebras",    label: "Cerebras",     envKey: "CEREBRAS_API_KEY",    baseUrl: "https://api.cerebras.ai/v1",            openaiCompatible: true },
  siliconflow: { id: "siliconflow", label: "SiliconFlow",  envKey: "SILICONFLOW_API_KEY", baseUrl: "https://api.siliconflow.cn/v1",         openaiCompatible: true },
  sambanova:   { id: "sambanova",   label: "SambaNova",    envKey: "SAMBANOVA_API_KEY",   baseUrl: "https://api.sambanova.ai/v1",           openaiCompatible: true },
  together:    { id: "together",    label: "Together AI",  envKey: "TOGETHER_API_KEY",    baseUrl: "https://api.together.xyz/v1",           openaiCompatible: true },
  openrouter:  { id: "openrouter",  label: "OpenRouter",   envKey: "OPENROUTER_API_KEY",  baseUrl: "https://openrouter.ai/api/v1",          openaiCompatible: true },
  nvidia:      { id: "nvidia",      label: "NVIDIA NIM",   envKey: "NVIDIA_API_KEY",      baseUrl: "https://integrate.api.nvidia.com/v1",   openaiCompatible: true },
  cloudflare:  { id: "cloudflare",  label: "Cloudflare AI",envKey: "CLOUDFLARE_API_KEY",                                                     openaiCompatible: true },
  mistral:     { id: "mistral",     label: "Mistral AI",   envKey: "MISTRAL_API_KEY",     baseUrl: "https://api.mistral.ai/v1",             openaiCompatible: true },
  cohere:      { id: "cohere",      label: "Cohere",       envKey: "COHERE_API_KEY",      baseUrl: "https://api.cohere.ai/compatibility/v1",openaiCompatible: true },
  upstage:     { id: "upstage",     label: "Upstage Solar",envKey: "UPSTAGE_API_KEY",     baseUrl: "https://api.upstage.ai/v1/solar",       openaiCompatible: true },
  replicate:   { id: "replicate",   label: "Replicate",    envKey: "REPLICATE_API_TOKEN",                                                    openaiCompatible: false },
  coco:        { id: "coco",        label: "Coco Link",    envKey: "COCO_API_KEY",        baseUrl: "https://api.cocolink.ai/v1",            openaiCompatible: true },
};

export interface ModelChoice {
  provider: ProviderId;
  model: string;
}

// Ordered failover chains by difficulty tier. First viable provider wins.
export const SIMPLE_CHAIN: ModelChoice[] = [
  { provider: "groq",        model: "llama-3.1-8b-instant" },
  { provider: "cerebras",    model: "llama3.1-8b" },
  { provider: "groq",        model: "gemma2-9b-it" },
  { provider: "together",    model: "meta-llama/Llama-3.2-3B-Instruct-Turbo" },
  { provider: "siliconflow", model: "Qwen/Qwen2.5-7B-Instruct" },
  { provider: "openrouter",  model: "google/gemini-flash-1.5" },
];

export const MEDIUM_CHAIN: ModelChoice[] = [
  { provider: "groq",        model: "llama-3.3-70b-versatile" },
  { provider: "cerebras",    model: "llama-3.3-70b" },
  { provider: "sambanova",   model: "Meta-Llama-3.3-70B-Instruct" },
  { provider: "together",    model: "deepseek-ai/DeepSeek-V3" },
  { provider: "siliconflow", model: "deepseek-ai/DeepSeek-V3" },
  { provider: "openrouter",  model: "deepseek/deepseek-chat" },
  { provider: "mistral",     model: "mistral-large-latest" },
];

export const COMPLEX_CHAIN: ModelChoice[] = [
  { provider: "openrouter",  model: "anthropic/claude-3.5-sonnet" },
  { provider: "openrouter",  model: "deepseek/deepseek-r1" },
  { provider: "openrouter",  model: "openai/gpt-4o" },
  { provider: "together",    model: "deepseek-ai/DeepSeek-R1" },
  { provider: "sambanova",   model: "DeepSeek-R1" },
  { provider: "nvidia",      model: "deepseek-ai/deepseek-r1" },
  { provider: "mistral",     model: "mistral-large-latest" },
];

export function chainForDifficulty(d: number): ModelChoice[] {
  if (d <= 4) return SIMPLE_CHAIN;
  if (d <= 7) return MEDIUM_CHAIN;
  return COMPLEX_CHAIN;
}

export const ALL_PROVIDERS = Object.values(PROVIDERS);