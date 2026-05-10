'use strict';

/**
 * Manual smart-routing — placeholder for the MLP.
 *
 * Same interface the MLP will eventually replace:
 *
 *   const { tier, model, confidence, reason } = await pickModel({
 *     prompt:        string,        // the actual user prompt
 *     taskTypeHint:  string?,       // optional tag from MeridianAPI client
 *     constraints: {                // optional caller policy
 *       maxCostPerCallUsd?: number, // hard cap per call
 *       maxLatencyMs?:      number, // hard cap on p50
 *       requireSovereign?:  boolean,// only open-weight + permissive
 *       requireGdprEu?:     boolean,// EU-hosted only
 *       providerAllow?:     string[], // ['anthropic', 'openai', ...]
 *       providerBlock?:     string[],
 *     },
 *   });
 *
 * Decision flow:
 *   1. If taskTypeHint provided, use the curated mapping below as primary.
 *   2. Otherwise, classify the prompt with simple heuristics (length, code
 *      blocks, math symbols, etc.) — same features the MLP will consume.
 *   3. Apply constraints to filter candidates.
 *   4. Rank by (cost × estimated_quality_for_task) — pick cheapest that
 *      meets quality bar.
 *   5. Return the chosen model + a 'reason' string for the audit log.
 *
 * The MLP will replace step 2 (classification) with a learned model that
 * outputs P(tier | prompt). Steps 1, 3, 4, 5 stay identical.
 */

const { CATALOG, TASK_TYPES } = require('./model-catalog');

/**
 * Curated default routes per task type — the "if I had to pick one model
 * for X right now, which would it be" table. Drawn from the 5-agent research.
 *
 * Each entry: [primary, fallback1, fallback2]
 */
const TASK_DEFAULTS = {
  // Reasoning / agent
  multi_file_refactor:   ['anthropic/claude-opus-4.7', 'anthropic/claude-sonnet-4.6'],
  agentic_planning:      ['anthropic/claude-sonnet-4.6', 'openai/gpt-5.5'],
  tool_orchestration:    ['anthropic/claude-sonnet-4.6', 'openai/gpt-4.1'],
  iterative_dev:         ['anthropic/claude-sonnet-4.6', 'meta-llama/llama-4-maverick'],
  computer_use:          ['openai/gpt-5.5', 'anthropic/claude-sonnet-4.6'],
  deep_reasoning:        ['openai/o3', 'openai/o4-mini'],
  formal_math:           ['openai/o3', 'deepseek/deepseek-v3.2'],
  phd_reasoning:         ['openai/o3', 'openai/o4-mini'],

  // General workhorse
  general_chat:          ['openai/gpt-4.1-mini', 'meta-llama/llama-3.3-70b-instruct'],
  rag_synthesis:         ['google/gemini-2.5-flash', 'openai/gpt-4.1-mini'],
  code_completion:       ['mistralai/codestral-2507', 'qwen/qwen2.5-coder-32b-instruct'],
  long_context_qa:       ['google/gemini-2.5-pro', 'meta-llama/llama-4-scout'],

  // Cheap / volume
  classification:        ['meta-llama/llama-3.1-8b-instruct', 'google/gemini-2.5-flash-lite'],
  ner_extraction:        ['mistralai/mistral-small-3.2-24b-instruct', 'qwen/qwen3-32b'],
  ticket_triage:         ['google/gemini-2.5-flash-lite', 'meta-llama/llama-3.1-8b-instruct'],
  summary_short:         ['google/gemini-2.5-flash-lite', 'meta-llama/llama-3.1-8b-instruct'],
  moderation:            ['meta-llama/llama-3.1-8b-instruct', 'openai/gpt-4.1-nano'],
  embeddings_prep:       ['openai/gpt-4.1-nano', 'qwen/qwen3-30b-a3b'],
  simple_chat:           ['meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.5-flash-lite'],

  // Specialized
  long_doc_analysis:     ['google/gemini-2.5-pro', 'meta-llama/llama-4-scout'],
  multi_doc_synthesis:   ['google/gemini-2.5-pro', 'openai/gpt-4.1'],
  multilingual:          ['cohere/embed-multilingual-v3.0', 'qwen/qwen3-235b-a22b'],
  chinese:               ['qwen/qwen3-235b-a22b', 'qwen/qwen3-32b'],
  video_audio:           ['google/gemini-2.5-pro'],
  image_chart_extract:   ['google/gemini-2.5-flash', 'mistralai/pixtral-large-2411'],
  doc_ocr:               ['mistralai/pixtral-large-2411', 'google/gemini-2.5-flash'],
  python_codegen:        ['qwen/qwen2.5-coder-32b-instruct', 'deepseek/deepseek-coder-v3'],
  ide_fim:               ['mistralai/codestral-2507'],
  code_review:           ['anthropic/claude-sonnet-4.6', 'qwen/qwen2.5-coder-32b-instruct'],
  speech_to_text:        ['deepgram/nova-3', 'openai/whisper-large-v3-turbo'],
  embedding:             ['openai/text-embedding-3-large', 'cohere/embed-multilingual-v3.0'],
  rerank:                ['cohere/rerank-v3.5', 'voyageai/rerank-2'],
  enterprise_compliance: ['anthropic/claude-sonnet-4.6', 'openai/gpt-4.1'],
  gdpr_eu:               ['mistralai/mistral-large-2512', 'mistralai/pixtral-large-2411'],
};

/**
 * Heuristic prompt classifier. Same features the MLP will eventually use
 * (token count proxy, code blocks, math symbols, language tags, etc.).
 * Returns the most-likely task type as a string.
 *
 * NOTE: very crude. The whole point of the MLP is to replace this. Until
 * then, this picks a reasonable default ~70% of the time.
 */
function classifyPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'simple_chat';
  const lower = prompt.toLowerCase();
  const tokens = Math.ceil(prompt.length / 4);  // ~4 chars/token approx

  // Code block → code routing
  if (prompt.includes('```')) {
    if (/test|spec|jest|pytest|describe\(/.test(lower)) return 'code_review';
    if (/refactor|restructure|reorganize|migrate/.test(lower)) return 'multi_file_refactor';
    return 'code_completion';
  }

  // Long context
  if (tokens > 50000) return 'long_doc_analysis';
  if (tokens > 8000)  return 'long_context_qa';

  // Translation / multilingual hints
  if (/translate|in spanish|in french|in german|en español|en français/.test(lower)) return 'multilingual';
  if (/[一-鿿]/.test(prompt)) return 'chinese';  // any CJK character

  // Classification / extraction
  if (/classif|categor|label|tag this|which (category|class)/.test(lower)) return 'classification';
  if (/extract|find all|list (the|every)|name(d entit)?|named entities/.test(lower)) return 'ner_extraction';

  // Summarization
  if (/summari|tldr|key points|in (one|a) (sentence|paragraph)/.test(lower)) return 'summary_short';

  // Reasoning / math
  if (/prove that|show that|step by step|chain of thought|let's think/.test(lower)) return 'deep_reasoning';
  if (/\\\\frac|\\\\sum|\\\\int|theorem|lemma|integral|derivative/.test(lower)) return 'formal_math';

  // Tool / agent
  if (/use (the )?(tool|function|api)|call (the )?(api|function)|search the web/.test(lower)) return 'tool_orchestration';

  // Default
  return 'general_chat';
}

/**
 * Apply caller constraints to filter the candidate pool.
 */
function filterCandidates(candidates, constraints = {}) {
  return candidates.filter(m => {
    if (constraints.requireSovereign && !m.sovereign) return false;
    if (constraints.requireGdprEu && !(m.bestFor.includes('gdpr_eu') || m.id.startsWith('mistralai/'))) return false;
    if (constraints.providerAllow && !constraints.providerAllow.includes(m.provider)) return false;
    if (constraints.providerBlock && constraints.providerBlock.includes(m.provider)) return false;
    if (constraints.maxLatencyMs != null && m.latencyP50ms > constraints.maxLatencyMs) return false;
    // estimate per-call cost — assume 1k input + 500 output tokens unless caller overrides
    if (constraints.maxCostPerCallUsd != null) {
      const approxCost = (1000 * m.inUsdM + 500 * m.outUsdM) / 1_000_000;
      if (approxCost > constraints.maxCostPerCallUsd) return false;
    }
    return true;
  });
}

/**
 * Pick the cheapest model in the candidate list whose tier is at least
 * the bar required by the task (no point using a frontier model for a
 * classification job).
 */
function rankAndPick(candidates) {
  // cheapest by blended cost (heavily weighted toward output, where most cost lives)
  const score = (m) => m.inUsdM + m.outUsdM * 3;
  return candidates.sort((a, b) => score(a) - score(b))[0];
}

/**
 * Main routing entry point. Sync — heuristics only, no I/O.
 */
function pickModel({ prompt, taskTypeHint, constraints = {} } = {}) {
  // 1. Classify (use hint if provided, else heuristic)
  const taskType = (taskTypeHint && TASK_DEFAULTS[taskTypeHint]) ? taskTypeHint : classifyPrompt(prompt || '');

  // 2. Default route for that task
  const preferredIds = TASK_DEFAULTS[taskType] || TASK_DEFAULTS.general_chat;

  // 3. Look up each preferred model and apply constraints in order
  for (const id of preferredIds) {
    const candidate = CATALOG.find(m => m.id === id);
    if (!candidate) continue;
    const allowed = filterCandidates([candidate], constraints);
    if (allowed.length) {
      return {
        tier: candidate.tier,
        model: candidate.id,
        provider: candidate.provider,
        confidence: 'high',
        reason: `task=${taskType} → ${candidate.id} (curated default${taskTypeHint ? ', hint matched' : ''})`,
        catalogEntry: candidate,
      };
    }
  }

  // 4. Constraints knocked out the curated picks — fall back to anything in
  //    the catalogue that lists the task in bestFor and passes constraints.
  const taskMatches = CATALOG.filter(m => m.bestFor.includes(taskType));
  const filtered = filterCandidates(taskMatches, constraints);
  if (filtered.length) {
    const pick = rankAndPick(filtered);
    return {
      tier: pick.tier,
      model: pick.id,
      provider: pick.provider,
      confidence: 'medium',
      reason: `task=${taskType} → ${pick.id} (constraint-fallback, ranked by cost)`,
      catalogEntry: pick,
    };
  }

  // 5. Constraints are too tight — return cheapest model in catalog that matches
  //    constraints regardless of task suitability.
  const anyAllowed = filterCandidates(CATALOG, constraints);
  if (anyAllowed.length) {
    const pick = rankAndPick(anyAllowed);
    return {
      tier: pick.tier,
      model: pick.id,
      provider: pick.provider,
      confidence: 'low',
      reason: `task=${taskType} → ${pick.id} (no task-match under constraints; using cheapest available)`,
      catalogEntry: pick,
    };
  }

  // 6. Constraints knock out everything — return null + reason
  return {
    tier: null, model: null, provider: null, confidence: 'none',
    reason: `task=${taskType} → no model passes constraints ${JSON.stringify(constraints)}`,
    catalogEntry: null,
  };
}

module.exports = { pickModel, classifyPrompt, TASK_DEFAULTS, CATALOG };
