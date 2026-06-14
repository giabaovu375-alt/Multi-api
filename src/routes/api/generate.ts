import { createFileRoute } from "@tanstack/react-router";
import { runPipeline, type GenRequest, type PipelineEvent } from "@/lib/pipeline.server";

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request, context }: { request: Request; context?: any }) => {
        // Cloudflare Workers inject env qua context.env, không phải process.env
        if (context?.env && typeof context.env === "object") {
          Object.assign(globalThis, context.env);
          Object.assign(process.env, context.env);
        }

        // Debug log
        console.log("[ENV] GROQ_API_KEY:", !!process.env.GROQ_API_KEY);
        console.log("[ENV] SAMBANOVA_API_KEY:", !!process.env.SAMBANOVA_API_KEY);
        console.log("[ENV] context.env keys:", context?.env ? Object.keys(context.env) : "none");

        let body: GenRequest;
        try {
          body = (await request.json()) as GenRequest;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!body.description || typeof body.description !== "string") {
          return new Response("description required", { status: 400 });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (e: PipelineEvent) => {
              try {
                controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
              } catch {
                /* closed */
              }
            };
            try {
              await runPipeline(
                {
                  description: body.description,
                  language: body.language ?? "",
                  framework: body.framework ?? "",
                  extra: body.extra ?? "",
                },
                send,
                request.signal,
              );
            } catch (err) {
              send({ type: "error", message: err instanceof Error ? err.message : String(err) });
              send({ type: "done" });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
