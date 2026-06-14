import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import { hasProvider } from "@/lib/ai.server";

export const Route = createFileRoute("/api/providers")({
  server: {
    handlers: {
      GET: async ({ request, context }: { request: Request; context?: any }) => {
        // Cloudflare Workers inject env qua context.env, không phải process.env
        if (context?.env && typeof context.env === "object") {
          Object.assign(globalThis, context.env);
          // Cũng inject vào process.env cho các code dùng process.env
          Object.assign(process.env, context.env);
        }

        const data = (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({
          id,
          label: PROVIDERS[id].label,
          envKey: PROVIDERS[id].envKey,
          configured: hasProvider(id),
        }));
        return Response.json({ providers: data });
      },
    },
  },
});
          
