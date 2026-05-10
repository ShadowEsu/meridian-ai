'use strict';

/**
 * Model catalogue for the manual smart-routing placeholder.
 *
 * Sourced from 5 parallel research agents (May 2026), covering frontier /
 * mid-tier / cheap-fast / open-source / specialized models on OpenRouter.
 * 106 candidate models were narrowed to the ~50 below — the ones that
 * actually win a routing decision somewhere on the cost × quality × latency
 * frontier.
 *
 * Schema:
 *   id              OpenRouter slug (or direct provider id)
 *   provider        anthropic | openai | google | meta | qwen | mistral |
 *                   deepseek | xai | cohere | nvidia | microsoft | nous |
 *                   mistral | bge | voyage | jina | ibm | bigcode | meetkai
 *   tier            frontier | mid | cheap | tiny | specialized
 *   family          short family slug for grouping
 *   contextK        context window in thousands of tokens
 *   maxOutK         max output tokens (thousands)
 *   inUsdM          USD per 1M input tokens
 *   outUsdM         USD per 1M output tokens
 *   latencyP50ms    estimated p50 TTFT-to-first-output, milliseconds
 *   bestFor         array of task tags (see TASK_TYPES)
 *   avoidFor        array of task tags
 *   notes           one-line routing wisdom
 *   sovereign       true if open-weight + permissive license + self-hostable
 *   modalities      ['text'] or ['text','vision'] or ['text','vision','audio']
 *
 * The router (manual-router.js) reads this catalogue.
 */

const TASK_TYPES = [
  // Reasoning / agent
  'deep_reasoning', 'multi_file_refactor', 'agentic_planning', 'tool_orchestration',
  'formal_math', 'phd_reasoning',
  // General workhorse
  'general_chat', 'rag_synthesis', 'code_completion', 'long_context_qa',
  'computer_use', 'iterative_dev',
  // High-volume cheap
  'classification', 'ner_extraction', 'ticket_triage', 'summary_short',
  'moderation', 'embeddings_prep', 'simple_chat',
  // Specialized
  'long_doc_analysis', 'multi_doc_synthesis', 'multilingual', 'chinese',
  'video_audio', 'image_chart_extract', 'doc_ocr',
  'python_codegen', 'ide_fim', 'code_review',
  'speech_to_text', 'text_to_speech',
  'embedding', 'rerank',
  'enterprise_compliance', 'gdpr_eu',
];

const CATALOG = [
  // ──────────── FRONTIER (deep reasoning, hardest tasks) ────────────
  { id: 'anthropic/claude-opus-4.7', provider: 'anthropic', tier: 'frontier', family: 'claude-4',
    contextK: 1000, maxOutK: 128, inUsdM: 5.0, outUsdM: 25.0, latencyP50ms: 3500,
    bestFor: ['multi_file_refactor', 'agentic_planning', 'tool_orchestration', 'iterative_dev'],
    avoidFor: ['classification', 'simple_chat', 'low_latency'],
    notes: 'Multi-file code refactors > 5 files. Tokenizer +35% vs Opus 4.6 — true cost higher than sticker.',
    sovereign: false, modalities: ['text', 'vision'] },

  { id: 'anthropic/claude-sonnet-4.6', provider: 'anthropic', tier: 'frontier', family: 'claude-4',
    contextK: 1000, maxOutK: 128, inUsdM: 3.0, outUsdM: 15.0, latencyP50ms: 1200,
    bestFor: ['iterative_dev', 'computer_use', 'rag_synthesis', 'code_completion', 'agentic_planning'],
    avoidFor: ['phd_reasoning', 'classification'],
    notes: 'Default workhorse. 60% cheaper than Opus 4.7 with near-parity for single-session tasks.',
    sovereign: false, modalities: ['text', 'vision'] },

  { id: 'openai/gpt-5.5', provider: 'openai', tier: 'frontier', family: 'gpt-5',
    contextK: 1000, maxOutK: 128, inUsdM: 5.0, outUsdM: 30.0, latencyP50ms: 2000,
    bestFor: ['computer_use', 'long_doc_analysis', 'tool_orchestration', 'iterative_dev'],
    avoidFor: ['multi_file_refactor', 'low_latency'],
    notes: 'Best terminal/browser agent. Long-context > 272K billed at 2x — watch cost on huge docs.',
    sovereign: false, modalities: ['text', 'vision'] },

  { id: 'openai/o3', provider: 'openai', tier: 'frontier', family: 'o-series',
    contextK: 200, maxOutK: 100, inUsdM: 2.0, outUsdM: 8.0, latencyP50ms: 6000,
    bestFor: ['deep_reasoning', 'formal_math', 'phd_reasoning'],
    avoidFor: ['low_latency', 'simple_chat', 'classification'],
    notes: 'Hidden reasoning tokens billed at output rate — actual per-task cost 3-10x sticker.',
    sovereign: false, modalities: ['text'] },

  { id: 'openai/o4-mini', provider: 'openai', tier: 'frontier', family: 'o-series',
    contextK: 200, maxOutK: 100, inUsdM: 0.55, outUsdM: 2.20, latencyP50ms: 2500,
    bestFor: ['deep_reasoning', 'tool_orchestration', 'iterative_dev'],
    avoidFor: ['simple_chat', 'long_doc_analysis'],
    notes: 'Best cost-to-reasoning ratio in o-series. ~80% of o3 quality at 27% the cost.',
    sovereign: false, modalities: ['text'] },

  { id: 'google/gemini-2.5-pro', provider: 'google', tier: 'frontier', family: 'gemini-2.5',
    contextK: 1000, maxOutK: 65, inUsdM: 1.25, outUsdM: 10.0, latencyP50ms: 2500,
    bestFor: ['long_doc_analysis', 'video_audio', 'multi_doc_synthesis', 'long_context_qa'],
    avoidFor: ['low_latency'],
    notes: '$1.25/M is best frontier price for < 200K context. Native video/audio understanding.',
    sovereign: false, modalities: ['text', 'vision', 'audio'] },

  { id: 'x-ai/grok-4.3', provider: 'xai', tier: 'frontier', family: 'grok-4',
    contextK: 1000, maxOutK: 131, inUsdM: 1.25, outUsdM: 2.5, latencyP50ms: 2000,
    bestFor: ['enterprise_compliance', 'long_doc_analysis', 'rag_synthesis'],
    avoidFor: ['formal_math', 'multi_file_refactor'],
    notes: '#1 on legal/financial benchmarks (CaseLaw, CorpFin). Cheapest frontier output.',
    sovereign: false, modalities: ['text'] },

  { id: 'deepseek/deepseek-v3.2', provider: 'deepseek', tier: 'frontier', family: 'deepseek-v3',
    contextK: 164, maxOutK: 65, inUsdM: 0.25, outUsdM: 0.38, latencyP50ms: 1200,
    bestFor: ['python_codegen', 'formal_math', 'long_doc_analysis', 'iterative_dev'],
    avoidFor: ['low_latency', 'enterprise_compliance'],
    notes: 'Frontier quality at mid-tier price. IMO/IOI gold-medal performance. Slow but cheap.',
    sovereign: true, modalities: ['text'] },

  // ──────────── MID-TIER (workhorses) ────────────
  { id: 'openai/gpt-4.1', provider: 'openai', tier: 'mid', family: 'gpt-4.1',
    contextK: 1048, maxOutK: 32, inUsdM: 2.0, outUsdM: 8.0, latencyP50ms: 800,
    bestFor: ['rag_synthesis', 'tool_orchestration', 'long_context_qa', 'code_completion'],
    avoidFor: ['low_latency'],
    notes: '1M context at $2/M, best non-o-series instruction following. JSON mode ~100% schema adherence.',
    sovereign: false, modalities: ['text', 'vision'] },

  { id: 'openai/gpt-4.1-mini', provider: 'openai', tier: 'mid', family: 'gpt-4.1',
    contextK: 1048, maxOutK: 32, inUsdM: 0.40, outUsdM: 1.60, latencyP50ms: 550,
    bestFor: ['general_chat', 'rag_synthesis', 'classification', 'ner_extraction', 'summary_short'],
    avoidFor: ['phd_reasoning', 'agentic_planning'],
    notes: 'OpenAI volume workhorse. 5x cheaper than GPT-4.1, ~85% quality on typical tasks.',
    sovereign: false, modalities: ['text'] },

  { id: 'google/gemini-2.5-flash', provider: 'google', tier: 'mid', family: 'gemini-2.5',
    contextK: 1048, maxOutK: 65, inUsdM: 0.30, outUsdM: 2.50, latencyP50ms: 500,
    bestFor: ['rag_synthesis', 'long_context_qa', 'image_chart_extract', 'summary_short'],
    avoidFor: ['multi_file_refactor'],
    notes: 'Fastest output (~194 tok/s). Best value for long-context RAG at volume.',
    sovereign: false, modalities: ['text', 'vision', 'audio'] },

  { id: 'meta-llama/llama-4-scout', provider: 'meta', tier: 'mid', family: 'llama-4',
    contextK: 10000, maxOutK: 32, inUsdM: 0.08, outUsdM: 0.30, latencyP50ms: 600,
    bestFor: ['long_doc_analysis', 'rag_synthesis', 'classification', 'multi_doc_synthesis'],
    avoidFor: ['agentic_planning', 'formal_math'],
    notes: '10M context at $0.08/M. Best context-per-dollar by an order of magnitude.',
    sovereign: true, modalities: ['text', 'vision'] },

  { id: 'meta-llama/llama-4-maverick', provider: 'meta', tier: 'mid', family: 'llama-4',
    contextK: 1000, maxOutK: 32, inUsdM: 0.19, outUsdM: 0.85, latencyP50ms: 750,
    bestFor: ['general_chat', 'code_completion', 'rag_synthesis', 'iterative_dev'],
    avoidFor: ['enterprise_compliance'],
    notes: 'Best open-weight GPT-4o-class. 15x cheaper than Sonnet for 1M context.',
    sovereign: true, modalities: ['text', 'vision'] },

  { id: 'qwen/qwen3-235b-a22b', provider: 'qwen', tier: 'mid', family: 'qwen-3',
    contextK: 262, maxOutK: 32, inUsdM: 0.20, outUsdM: 1.56, latencyP50ms: 900,
    bestFor: ['multilingual', 'chinese', 'rag_synthesis', 'general_chat', 'iterative_dev'],
    avoidFor: ['enterprise_compliance'],
    notes: 'Frontier intelligence at sub-$1 blended cost. Thinking mode toggleable.',
    sovereign: true, modalities: ['text'] },

  { id: 'mistralai/mistral-large-2512', provider: 'mistral', tier: 'mid', family: 'mistral-large',
    contextK: 262, maxOutK: 32, inUsdM: 0.50, outUsdM: 1.50, latencyP50ms: 700,
    bestFor: ['gdpr_eu', 'enterprise_compliance', 'long_doc_analysis', 'multilingual'],
    avoidFor: ['phd_reasoning'],
    notes: 'EU-hosted, Apache 2.0, self-hostable. Default for GDPR-sensitive deployments.',
    sovereign: true, modalities: ['text', 'vision'] },

  // ──────────── CHEAP / HIGH-VOLUME ────────────
  { id: 'anthropic/claude-haiku-4.5', provider: 'anthropic', tier: 'cheap', family: 'claude-4',
    contextK: 200, maxOutK: 64, inUsdM: 1.0, outUsdM: 5.0, latencyP50ms: 350,
    bestFor: ['ner_extraction', 'ticket_triage', 'long_context_qa', 'summary_short'],
    avoidFor: ['classification'],
    notes: 'Use prompt caching (cuts input cost ~90%) or batch API (50% off) — true tier when those are on.',
    sovereign: false, modalities: ['text', 'vision'] },

  { id: 'openai/gpt-4.1-nano', provider: 'openai', tier: 'cheap', family: 'gpt-4.1',
    contextK: 1048, maxOutK: 32, inUsdM: 0.10, outUsdM: 0.40, latencyP50ms: 300,
    bestFor: ['classification', 'ner_extraction', 'embeddings_prep', 'moderation'],
    avoidFor: ['deep_reasoning', 'multi_doc_synthesis'],
    notes: 'OpenAI cheapest. Fails immediately on tasks requiring synthesis across facts.',
    sovereign: false, modalities: ['text'] },

  { id: 'google/gemini-2.5-flash-lite', provider: 'google', tier: 'cheap', family: 'gemini-2.5',
    contextK: 1048, maxOutK: 65, inUsdM: 0.10, outUsdM: 0.40, latencyP50ms: 250,
    bestFor: ['classification', 'long_doc_analysis', 'ticket_triage', 'embeddings_prep'],
    avoidFor: ['deep_reasoning'],
    notes: '1M context at $0.10/M — unmatched for long-doc triage at volume.',
    sovereign: false, modalities: ['text', 'vision'] },

  { id: 'qwen/qwen3-32b', provider: 'qwen', tier: 'cheap', family: 'qwen-3',
    contextK: 131, maxOutK: 32, inUsdM: 0.08, outUsdM: 0.28, latencyP50ms: 450,
    bestFor: ['classification', 'ner_extraction', 'code_completion', 'multilingual'],
    avoidFor: ['enterprise_compliance'],
    notes: 'Top open-weight model under $0.10. Disable thinking mode for production cost control.',
    sovereign: true, modalities: ['text'] },

  { id: 'qwen/qwen3-30b-a3b', provider: 'qwen', tier: 'cheap', family: 'qwen-3',
    contextK: 131, maxOutK: 32, inUsdM: 0.07, outUsdM: 0.27, latencyP50ms: 380,
    bestFor: ['classification', 'simple_chat', 'embeddings_prep'],
    avoidFor: ['deep_reasoning'],
    notes: 'MoE 3.3B active params — exceptionally fast at low cost. Quality cliff on multi-step.',
    sovereign: true, modalities: ['text'] },

  { id: 'mistralai/mistral-small-3.2-24b-instruct', provider: 'mistral', tier: 'cheap', family: 'mistral-small',
    contextK: 131, maxOutK: 8, inUsdM: 0.075, outUsdM: 0.20, latencyP50ms: 260,
    bestFor: ['classification', 'ner_extraction', 'ticket_triage', 'tool_orchestration'],
    avoidFor: ['phd_reasoning'],
    notes: 'Best Mistral mid-cheap. Function-call reliability much improved over 3.1.',
    sovereign: true, modalities: ['text'] },

  { id: 'meta-llama/llama-3.1-8b-instruct', provider: 'meta', tier: 'cheap', family: 'llama-3.1',
    contextK: 131, maxOutK: 8, inUsdM: 0.02, outUsdM: 0.05, latencyP50ms: 180,
    bestFor: ['classification', 'ner_extraction', 'ticket_triage', 'moderation'],
    avoidFor: ['multi_doc_synthesis', 'multilingual'],
    notes: 'Cheapest reliable English classifier. Cliff at >5 nested entities.',
    sovereign: true, modalities: ['text'] },

  { id: 'meta-llama/llama-3.3-70b-instruct', provider: 'meta', tier: 'cheap', family: 'llama-3.3',
    contextK: 131, maxOutK: 8, inUsdM: 0.12, outUsdM: 0.30, latencyP50ms: 60,
    bestFor: ['classification', 'simple_chat', 'rag_synthesis', 'general_chat'],
    avoidFor: ['video_audio'],
    notes: 'Cerebras delivers ~1800 tok/s. Latency champion for 70B-class.',
    sovereign: true, modalities: ['text'] },

  { id: 'microsoft/phi-4-mini-instruct', provider: 'microsoft', tier: 'cheap', family: 'phi-4',
    contextK: 131, maxOutK: 16, inUsdM: 0.08, outUsdM: 0.35, latencyP50ms: 80,
    bestFor: ['classification', 'ner_extraction', 'embeddings_prep'],
    avoidFor: ['multilingual', 'long_context_qa'],
    notes: 'Best 128K-context option for true on-device deployment. MIT license.',
    sovereign: true, modalities: ['text'] },

  { id: 'google/gemma-3-27b-it', provider: 'google', tier: 'cheap', family: 'gemma-3',
    contextK: 131, maxOutK: 8, inUsdM: 0.08, outUsdM: 0.16, latencyP50ms: 400,
    bestFor: ['classification', 'multilingual', 'ner_extraction', 'image_chart_extract'],
    avoidFor: ['agentic_planning'],
    notes: 'Free tier on OpenRouter. 140+ languages. Multimodal at this price point.',
    sovereign: true, modalities: ['text', 'vision'] },

  // ──────────── SPECIALIZED ────────────
  { id: 'mistralai/codestral-2507', provider: 'mistral', tier: 'specialized', family: 'codestral',
    contextK: 256, maxOutK: 32, inUsdM: 0.30, outUsdM: 0.90, latencyP50ms: 500,
    bestFor: ['ide_fim', 'code_completion', 'code_review', 'python_codegen'],
    avoidFor: ['general_chat', 'agentic_planning'],
    notes: 'Best fill-in-the-middle for IDE autocomplete. 256K context. Drop-in Copilot replacement.',
    sovereign: true, modalities: ['text'] },

  { id: 'qwen/qwen2.5-coder-32b-instruct', provider: 'qwen', tier: 'specialized', family: 'qwen-coder',
    contextK: 131, maxOutK: 16, inUsdM: 0.07, outUsdM: 0.16, latencyP50ms: 700,
    bestFor: ['python_codegen', 'code_completion', 'code_review'],
    avoidFor: ['enterprise_compliance'],
    notes: 'Beats GPT-4o on code at 3% the price. Best cost-efficient code model.',
    sovereign: true, modalities: ['text'] },

  { id: 'deepseek/deepseek-coder-v3', provider: 'deepseek', tier: 'specialized', family: 'deepseek-coder',
    contextK: 128, maxOutK: 16, inUsdM: 0.27, outUsdM: 1.10, latencyP50ms: 800,
    bestFor: ['python_codegen', 'multi_file_refactor', 'code_review'],
    avoidFor: ['enterprise_compliance'],
    notes: 'SOTA on SWE-Bench Lite for open-weight. Strong multi-file repo handling up to 128K.',
    sovereign: true, modalities: ['text'] },

  { id: 'mistralai/pixtral-large-2411', provider: 'mistral', tier: 'specialized', family: 'pixtral',
    contextK: 131, maxOutK: 32, inUsdM: 2.0, outUsdM: 6.0, latencyP50ms: 1200,
    bestFor: ['gdpr_eu', 'image_chart_extract', 'doc_ocr'],
    avoidFor: ['video_audio'],
    notes: 'Largest open multimodal. EU-hostable. Diagram/flowchart understanding.',
    sovereign: true, modalities: ['text', 'vision'] },

  { id: 'openai/whisper-large-v3-turbo', provider: 'openai', tier: 'specialized', family: 'whisper',
    contextK: 0, maxOutK: 0, inUsdM: 0, outUsdM: 0, latencyP50ms: 400,
    bestFor: ['speech_to_text', 'multilingual'],
    avoidFor: ['low_latency'],
    notes: '$0.006/min. 100-language coverage. Self-hostable on single A10G.',
    sovereign: true, modalities: ['audio'] },

  { id: 'deepgram/nova-3', provider: 'deepgram', tier: 'specialized', family: 'nova',
    contextK: 0, maxOutK: 0, inUsdM: 0, outUsdM: 0, latencyP50ms: 150,
    bestFor: ['speech_to_text'],
    avoidFor: ['multilingual'],
    notes: '$0.0043/min, ~150ms streaming p50. Best for English call-center / telephony.',
    sovereign: false, modalities: ['audio'] },

  { id: 'openai/text-embedding-3-large', provider: 'openai', tier: 'specialized', family: 'embed-3',
    contextK: 8, maxOutK: 0, inUsdM: 0.13, outUsdM: 0, latencyP50ms: 50,
    bestFor: ['embedding'],
    avoidFor: ['multilingual'],
    notes: 'Default English RAG. Matryoshka — truncate to 256/512/1536d to cut storage 6x.',
    sovereign: false, modalities: ['text'] },

  { id: 'cohere/embed-multilingual-v3.0', provider: 'cohere', tier: 'specialized', family: 'cohere-embed',
    contextK: 0.5, maxOutK: 0, inUsdM: 0.10, outUsdM: 0, latencyP50ms: 60,
    bestFor: ['embedding', 'multilingual'],
    avoidFor: [],
    notes: '100+ languages. input_type parameter alone boosts precision 5-8% on cross-lingual.',
    sovereign: false, modalities: ['text'] },

  { id: 'voyageai/voyage-3-large', provider: 'voyage', tier: 'specialized', family: 'voyage-3',
    contextK: 32, maxOutK: 0, inUsdM: 0.18, outUsdM: 0, latencyP50ms: 80,
    bestFor: ['embedding'],
    avoidFor: ['multilingual'],
    notes: 'Best English RAG quality. 32K context — only embedding model handling long docs natively.',
    sovereign: false, modalities: ['text'] },

  { id: 'BAAI/bge-m3', provider: 'bge', tier: 'specialized', family: 'bge-m3',
    contextK: 8, maxOutK: 0, inUsdM: 0, outUsdM: 0, latencyP50ms: 100,
    bestFor: ['embedding', 'multilingual'],
    avoidFor: [],
    notes: 'Best open-weight. Hybrid dense+sparse retrieval in one model. Self-host stack.',
    sovereign: true, modalities: ['text'] },

  { id: 'cohere/rerank-v3.5', provider: 'cohere', tier: 'specialized', family: 'cohere-rerank',
    contextK: 4, maxOutK: 0, inUsdM: 0, outUsdM: 0, latencyP50ms: 200,
    bestFor: ['rerank', 'multilingual'],
    avoidFor: [],
    notes: 'Default multilingual reranker. ~$2/1K searches. +15-30% precision over first-stage retrieval.',
    sovereign: false, modalities: ['text'] },

  { id: 'voyageai/rerank-2', provider: 'voyage', tier: 'specialized', family: 'voyage-rerank',
    contextK: 16, maxOutK: 0, inUsdM: 0, outUsdM: 0, latencyP50ms: 180,
    bestFor: ['rerank'],
    avoidFor: ['multilingual'],
    notes: 'Best English. 16K passage context — uniquely valuable for long contracts/filings.',
    sovereign: false, modalities: ['text'] },
];

module.exports = { CATALOG, TASK_TYPES };
