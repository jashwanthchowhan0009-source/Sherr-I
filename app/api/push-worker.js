// Queue consumer: Vercel calls this when a reminder or brief is due.
import { handleCallback } from "@vercel/queue";
import { runJob } from "../lib/push.js";

export const POST = handleCallback(
  async (job, meta) => {
    const outcome = await runJob(job);
    console.log("push job", job?.kind, job?.id, outcome, meta?.deliveryCount);
  },
  {
    retry: (err, meta) => {
      console.error("push job failed", err?.message || err);
      return meta.deliveryCount >= 5 ? { acknowledge: true } : { afterSeconds: 20 * meta.deliveryCount };
    },
  },
);
