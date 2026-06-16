# Cloudflare LLM Research

## Summary

Cloudflare has two relevant AI layers:

- Workers AI: Cloudflare-hosted models callable from Workers or REST.
- AI Gateway: observability, caching, rate limiting, retries, fallback, and provider routing across Workers AI and third-party providers.

For this project, the monitor itself should not call LLMs. A separate merge service can later use Workers AI directly or route through AI Gateway.

## Workers AI

Cloudflare Workers AI lists many Cloudflare-hosted models. Current text-generation options include models from OpenAI open-weight, Meta, Qwen, DeepSeek, Moonshot/Kimi, Google Gemma, Mistral, IBM Granite, Zhipu/GLM, and NVIDIA Nemotron.

Relevant examples from the model catalog:

- `@cf/openai/gpt-oss-120b`
- `@cf/openai/gpt-oss-20b`
- `@cf/qwen/qwen3-30b-a3b-fp8`
- `@cf/qwen/qwq-32b`
- `@cf/qwen/qwen2.5-coder-32b-instruct`
- `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- `@cf/meta/llama-4-scout-17b-16e-instruct`
- `@cf/mistralai/mistral-small-3.1-24b-instruct`
- `@cf/zai-org/glm-4.7-flash`
- `@cf/moonshotai/kimi-k2.6`

Workers AI also supports embeddings such as:

- `@cf/baai/bge-m3`
- `@cf/qwen/qwen3-embedding-0.6b`
- `@cf/baai/bge-large-en-v1.5`

Embedding models may be useful for later program matching, but deterministic matching should come first.

## Pricing Notes

Workers AI pricing uses "Neurons". Cloudflare docs state Workers AI is available on Free and Paid Workers plans, with 10,000 Neurons/day free allocation, and Workers Paid charges usage above that allocation at `$0.011 / 1,000 Neurons`.

Cloudflare also publishes token-equivalent pricing for individual LLMs. Example rows from the docs include:

- `@cf/qwen/qwen3-30b-a3b-fp8`: `$0.051/M input tokens`, `$0.335/M output tokens`
- `@cf/openai/gpt-oss-120b`: `$0.350/M input tokens`, `$0.750/M output tokens`
- `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`: `$0.497/M input tokens`, `$4.881/M output tokens`
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast`: `$0.293/M input tokens`, `$2.253/M output tokens`
- `@cf/ibm-granite/granite-4.0-h-micro`: `$0.017/M input tokens`, `$0.112/M output tokens`

These prices can change, so production code should keep model and cost assumptions in config.

## AI Gateway

AI Gateway is not itself a model. It provides visibility and control for AI calls:

- Analytics
- Logging
- Caching
- Rate limiting
- Retries
- Fallbacks
- Provider routing

It supports Workers AI and external providers, including OpenAI, Anthropic, Google, DeepSeek, Mistral, OpenRouter, Replicate, xAI, and others.

If we later support DeepSeek/Qwen direct APIs and Cloudflare Workers AI, AI Gateway is a good place to centralize:

- request logs
- cost tracking
- cache
- fallback model selection
- spend/rate limits

## Recommendation

Keep the monitor LLM-free.

Later add a separate `merge-provider` interface:

```ts
type MergeProvider = {
  name: string;
  merge(input: MergeInput): Promise<MergeResult>;
};
```

Provider candidates:

1. `mock`: deterministic test provider.
2. `workers-ai-qwen`: use `@cf/qwen/qwen3-30b-a3b-fp8` for low-cost structured merge.
3. `workers-ai-gpt-oss`: use `@cf/openai/gpt-oss-120b` for higher quality.
4. `ai-gateway`: route to Cloudflare Workers AI or third-party APIs with caching/fallback.
5. `external-deepseek` / `external-qwen`: direct user-managed APIs.

For Chinese program descriptions, Qwen-family and DeepSeek-distill models are natural candidates, but real quality should be tested with a fixed evaluation set.

## Sources

- Cloudflare Workers AI model catalog
- Cloudflare Workers AI pricing
- Cloudflare AI Gateway overview
