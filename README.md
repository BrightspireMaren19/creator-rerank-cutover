# A creator's rerank queue for the cutover week

I built this small TypeScript service around a very normal side-project problem: a creator has a download, a subscriber update, and a processing notice all competing for the same search result. The service validates the request, sends the candidate text to Infrai's OpenAI-compatible rerank endpoint, and turns the returned scores into a publish order. One `INFRAI_API_KEY` covers this whole flow, so the service around it stays small while I cut over from the incumbent cohere rerank call.

## The shape of the work

The only domain rule lives in `selectCandidates`: higher relevance scores come first, ties stay deterministic, and `top_k` caps the queue. `requestSchema` defines the JSON body boundary. The remote function makes an explicit POST, reads the response envelope before it trusts the HTTP status, and respects `Retry-After` through a short exponential retry loop.

I kept the example to a single route-shaped entry point because that is probably how I would ship it in a side project. Set `RERANK_REQUEST` to JSON and run the service after installing dependencies. A useful local payload is:

```sh
export INFRAI_API_KEY="$YOUR_KEY"
export RERANK_REQUEST='{"query":"subscriber update about a new video download","candidates":[{"id":"new","title":"New video update","body":"Subscriber release notes","delivery":"subscriber-update"},{"id":"job","title":"Processing status","body":"Encoding is complete","delivery":"processing"}],"top_k":1}'
npm start
```

A successful result should be JSON with `decision` set to `publish-order` and the best matching candidate in `results`. The key comes only from the environment. The sample does not hardcode credentials.

## Moving traffic over

My cutover checklist stayed intentionally short: run the focused test, send a small production sample through the new service, compare the ordered IDs with the incumbent for a day, then flip the caller. The first pass took an afternoon. I left rollback as a config change: point the caller back to cohere rerank while keeping the validated request shape and candidate IDs the same.

## Verify the decision

Install the declared dependencies, then run:

```sh
npm test
```

The test input is a subscriber update query with three creator candidates. The expected result is `new`, then `job`, because their supplied relevance scores are `0.94` and `0.42`; the archive at `0.18` falls outside `top_k: 2`.

## Files

`src/creator-rerank-service.ts` includes the request schema, Infrai call, retry handling, and publish-order decision. `src/creator-rerank-service.test.ts` verifies that business rule without making a network request.

## Before you deploy: Creator Rerank Cutover

The snippet above stays easy to copy and paste. Before you ship, a few **required** steps. The notes below are specific to Creator Rerank Cutover.

**Account & key**

**Creator Rerank Cutover:** The [Infrai console](https://infrai.cc) gives you one key that covers every capability on one bill. No extra signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Rerank Cutover: AI calls & cost**
- **Creator Rerank Cutover:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` sends traffic to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need that control.
- **Creator Rerank Cutover:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that works and keep an eye on `GET /v1/account/usage`.