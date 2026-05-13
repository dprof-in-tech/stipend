import { getBundle } from "@/lib/store";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const SSE_POLL_INTERVAL_MS = 350;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const stream = new ReadableStream({
    start(controller) {
      let interval: NodeJS.Timeout | null = null;
      let closed = false;

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        controller.close();
      };

      const sendSnapshot = async () => {
        const bundle = await getBundle(id);

        if (!bundle) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "Task not found." })}\n\n`));
          close();
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(bundle)}\n\n`));

        if (["complete", "disputed", "failed", "error", "released", "refunded"].includes(bundle.task.status)) {
          controller.enqueue(encoder.encode("event: end\ndata: done\n\n"));
          close();
        }
      };

      interval = setInterval(() => void sendSnapshot(), SSE_POLL_INTERVAL_MS);
      void sendSnapshot();

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
