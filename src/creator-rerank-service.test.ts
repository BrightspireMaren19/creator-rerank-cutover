import test from "node:test";
import assert from "node:assert/strict";
import { selectCandidates, requestSchema } from "./creator-rerank-service.ts";

const request = requestSchema.parse({
  query: "subscriber update about a new video download",
  candidates: [
    { id: "old", title: "Archive", body: "An old note", delivery: "download" },
    { id: "new", title: "New video update", body: "Subscriber release notes", delivery: "subscriber-update" },
    { id: "job", title: "Processing status", body: "Encoding is complete", delivery: "processing" }
  ],
  top_k: 2
});

test("the strongest creator update becomes the first publish item", () => {
  const result = selectCandidates(request, [
    { index: 0, relevance_score: 0.18 },
    { index: 1, relevance_score: 0.94 },
    { index: 2, relevance_score: 0.42 }
  ]);
  assert.deepEqual(result.map((candidate) => candidate.id), ["new", "job"]);
});
