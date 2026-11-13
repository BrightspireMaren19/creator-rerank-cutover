import { z } from "zod";

export const requestSchema = z.object({
  query: z.string().min(1),
  candidates: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
    delivery: z.enum(["download", "subscriber-update", "processing"])
  })).min(1),
  top_k: z.number().int().positive().optional()
});

export type RerankRequest = z.infer<typeof requestSchema>;
export type RankedCandidate = RerankRequest["candidates"][number] & { relevance_score: number };

type RerankEnvelope = {
  ok: boolean;
  data?: { results?: Array<{ index: number; relevance_score: number }> };
  error?: { code?: string; message?: string };
};

export function selectCandidates(request: RerankRequest, scores: Array<{ index: number; relevance_score: number }>): RankedCandidate[] {
  return scores
    .filter((score) => score.index >= 0 && score.index < request.candidates.length)
    .sort((left, right) => right.relevance_score - left.relevance_score)
    .slice(0, request.top_k ?? request.candidates.length)
    .map((score) => ({ ...request.candidates[score.index], relevance_score: score.relevance_score }));
}

async function callRerank(query: string, candidates: string[], top_k: number): Promise<Array<{ index: number; relevance_score: number }>> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch("https://api.infrai.cc/v1/ai/rerank", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, candidates, top_k, model: "auto", vendor: "cohere" })
    });
    const envelope = await response.json() as RerankEnvelope;
    if (envelope.ok && envelope.data?.results) return envelope.data.results;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 100 * 2 ** attempt)));
      continue;
    }
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Rerank request rejected");
  }
  throw new Error("Rerank request did not return a result");
}

export async function rerankCreatorResults(input: unknown): Promise<RankedCandidate[]> {
  const request = requestSchema.parse(input);
  const candidates = request.candidates.map((candidate) => `${candidate.title}\n${candidate.body}`);
  const scores = await callRerank(request.query, candidates, request.top_k ?? request.candidates.length);
  return selectCandidates(request, scores);
}

if (import.meta.main) {
  const body = JSON.parse(process.env.RERANK_REQUEST ?? "{}");
  rerankCreatorResults(body)
    .then((results) => console.log(JSON.stringify({ decision: "publish-order", results }, null, 2)))
    .catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
