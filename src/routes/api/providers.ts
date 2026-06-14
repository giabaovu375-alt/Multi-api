import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import { hasProvider } from "@/lib/ai.server";

export const Route = createFileRoute("/api/providers")({
  server: {
    handlers: {
      GET: async () => {
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