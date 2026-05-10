# Building Meridian's smart-route MLP — a deep-dive guide

This is the hands-on companion to [`docs/ML_PLAN.md`](./ML_PLAN.md). The plan tells you *what* to build; this guide tells you *how* — line-by-line, with the architectural choices explained as we go.

**You will build:** a small multi-layer perceptron (MLP) that, given an incoming prompt, predicts the cheapest model tier that will produce acceptable-quality output. Trained in Python (PyTorch), exported to ONNX, served in Node via `onnxruntime-node` so it lives in the same process as Meridian's Express proxy. End-to-end inference budget: **<10ms** at p50.

**Prereqs:** Python 3.10+, Node 18+, comfort reading PyTorch tutorials. Time to first working router: ~6 hours of focused work, then iteration.

---

## 0. Why MLP for this problem (and when *not* to)

The existing `ML_PLAN.md` proposes XGBoost or logistic regression — both of which are excellent first cuts. An MLP is the right level-up when one or more of these is true:

- You're using **dense embeddings as features** (768-dim or 1536-dim vectors). Tree models work fine on them but neural nets handle high-dim continuous features more naturally.
- You want a **single calibrated probability vector** over tiers (`P(cheap), P(mid), P(premium)`) so you can threshold-route, not just argmax-route. MLPs with softmax give this for free.
- You expect to **retrain frequently** with growing data (>10k labeled examples) — MLPs scale better than gradient boosting at this size and are faster to fine-tune incrementally.

When XGBoost is the better choice: <2k labeled rows, hand-crafted tabular features (token count, has-code, language, etc.) only, you need fast SHAP explanations for compliance. **For Meridian's MVP-to-MLP arc, train both and ship whichever wins on cost-savings.** The architecture below is the same either way; the model swap is one file.

---

## 1. Architecture in one diagram

```
                  prompt (string)
                        │
        ┌───────────────┴────────────────┐
        ▼                                ▼
  sentence-transformer            hand-crafted features
   (all-MiniLM-L6-v2)            (token_count, has_code,
   → 384-dim vector              language, conv_turn_count, ...)
                                  → 8–12 dim vector
        └────────┬───────────────────────┘
                 ▼
           concat = ~396 dim
                 │
                 ▼
       ┌──────────────────────┐
       │ Linear(396 → 256)    │
       │ ReLU + Dropout(0.2)  │
       │ Linear(256 → 64)     │
       │ ReLU + Dropout(0.2)  │
       │ Linear(64  → 3)      │  ← 3 tiers: cheap | mid | premium
       └──────────────────────┘
                 │
                 ▼
            softmax → probabilities
                 │
                 ▼
   policy: pick cheapest tier with P > 0.55
   (else: escalate one tier; log for retraining)
```

That's the whole thing. Two encoders feeding a 3-layer MLP feeding a softmax. Nothing fancy — and that's the point.

---

## 2. Define the problem precisely

**Input:** a single prompt string (plus optional metadata: team, task type hint).
**Output:** one of `K` tier labels. Start with `K=3`: `{cheap, mid, premium}`.
**Mapping to providers:** maintained in code, not in the model:

```python
TIER_TO_MODELS = {
    'cheap':   ['gpt-4.1-mini', 'claude-haiku-4-5', 'gemini-2.5-flash'],
    'mid':     ['gpt-4.1', 'claude-sonnet-4-6', 'gemini-2.5-pro'],
    'premium': ['claude-opus-4-7'],
}
```

Routing within a tier is a separate fallback / load-balance decision. The MLP only picks the tier.

---

## 3. Data collection

You need ~5,000 labeled examples to start (you can ship with fewer; quality improves with more). Each row:

| column | type | notes |
|---|---|---|
| `request_id` | str | for joining back to logs |
| `prompt` | str | the actual user input |
| `task_type` | str? | optional hint: `summarize`, `code`, `chat`, `extract`, `translate` |
| `team_id` | int? | for per-team analysis later |
| `chosen_tier` | enum | what was actually used |
| `cheap_quality` | float | quality score 0–1 if cheap tier had been used |
| `mid_quality` | float | same |
| `premium_quality` | float | same |
| `label_tier` | enum | computed from above (see §4) |

**Where the data comes from:**
- **Bootstrap (cheap):** sample your existing `meridian_requests` table, replay each prompt through all 3 tiers, score with a judge LLM (GPT-4.1 as scorer is fine).
- **Production (right way):** for 1–5% of live traffic, fan out to all 3 tiers, score, log. This is "shadow routing" — costs money but generates ground truth.

Store as Parquet (columnar, faster to load): `python/router/data/labeled_v1.parquet`.

---

## 4. Labels: the rubric

`label_tier = cheapest tier whose quality_score >= QUALITY_THRESHOLD`.

Quality threshold is the single most important hyperparameter in the whole product. Start at **0.80** on a 0–1 scale, tune with stakeholder review.

**The judge LLM rubric** (use this exact prompt for the scorer; consistency matters more than cleverness):

> Rate the AI response from 0 to 1 on whether it correctly and completely answers the user's prompt.
> 0 = wrong, hallucinated, or refused inappropriately
> 0.5 = partial / hedged / missed obvious follow-up
> 1.0 = correct, complete, well-formatted
> Reply with only a number to two decimals.

Cache the judge scores aggressively — they're expensive and deterministic enough.

**Sanity check before training:** what's your label distribution? If it's 95% `cheap`, you don't need a model — you need to default to cheap and only escalate on signal. If it's 95% `premium`, your judge threshold is too strict.

Healthy distribution: roughly 50/35/15.

---

## 5. Features

Two encoders, concatenated.

### 5a. Sentence embedding (the "what is this about" signal)

Use [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) — 22M params, 384-dim output, runs in ~3ms/prompt on a CPU. It's the standard small-and-fast choice; alternatives (`bge-small-en-v1.5`, `e5-small`) are 2–4 points better on retrieval benchmarks but barely matter for classification.

```python
from sentence_transformers import SentenceTransformer
encoder = SentenceTransformer('all-MiniLM-L6-v2')
emb = encoder.encode(prompt, normalize_embeddings=True)  # shape (384,)
```

### 5b. Hand-crafted features (the "how complex / what shape" signal)

These compose well with embeddings — embeddings know *what* the prompt is about, hand-crafted features know *how big / what kind*. Pick 8–12, normalize each to roughly [0, 1].

```python
import tiktoken
enc = tiktoken.get_encoding('cl100k_base')

def hand_features(prompt: str) -> list[float]:
    tokens = enc.encode(prompt)
    n_tok = len(tokens)
    sentences = prompt.count('.') + prompt.count('?') + prompt.count('!') or 1
    return [
        min(n_tok / 4000, 1.0),                               # token count, capped
        min(prompt.count('\n') / 50, 1.0),                    # multiline
        1.0 if '```' in prompt else 0.0,                      # has code block
        1.0 if any(w in prompt.lower() for w in ['summari', 'tldr']) else 0.0,
        1.0 if any(w in prompt.lower() for w in ['translate', 'in spanish', 'in french']) else 0.0,
        1.0 if any(w in prompt.lower() for w in ['classif', 'categor', 'label']) else 0.0,
        1.0 if any(w in prompt.lower() for w in ['step by step', 'reason', 'think', 'why']) else 0.0,
        min(n_tok / sentences / 30, 1.0),                     # avg tokens per sentence
        sum(c.isdigit() for c in prompt) / max(len(prompt), 1),  # numeric density
        1.0 if '?' in prompt else 0.0,
    ]
```

10 features. Cheap to compute (<1ms). The embedding will pick up nuance these miss; these will pick up structural patterns the embedding glosses over.

### 5c. Concatenate

```python
import numpy as np
def featurize(prompt: str) -> np.ndarray:
    emb = encoder.encode(prompt, normalize_embeddings=True)  # (384,)
    meta = np.array(hand_features(prompt), dtype=np.float32)  # (10,)
    return np.concatenate([emb, meta]).astype(np.float32)     # (394,)
```

---

## 6. The MLP itself

Three layers, 256→64→K. Dropout 0.2 between layers. ReLU activations. That's it.

```python
import torch
import torch.nn as nn

class TierRouter(nn.Module):
    def __init__(self, in_dim=394, hidden_a=256, hidden_b=64, n_classes=3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden_a),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_a, hidden_b),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_b, n_classes),
        )
    def forward(self, x):
        return self.net(x)  # raw logits; CrossEntropyLoss expects logits
```

**Why these specific numbers:**
- 256 hidden units is enough to reorganize a 394-dim input without underfitting; 512+ overfits at <50k examples.
- 64 in the second layer compresses to a useful representation — small enough to act like a regularizer.
- Dropout 0.2 is conservative; bump to 0.3 if you see train/val gap >5pts.
- No batch norm — dataset is too small for the BN statistics to help, and it complicates ONNX export.

Total params: ~117k. Tiny. Inference is sub-millisecond.

---

## 7. Training loop

Standard. Don't overthink it.

```python
from torch.utils.data import Dataset, DataLoader, random_split
import pandas as pd

LABEL_TO_IX = {'cheap': 0, 'mid': 1, 'premium': 2}

class RouterDataset(Dataset):
    def __init__(self, parquet_path):
        self.df = pd.read_parquet(parquet_path)
        # Pre-featurize once; cache in memory. ~500MB at 100k rows.
        self.X = np.stack([featurize(p) for p in self.df['prompt']])
        self.y = np.array([LABEL_TO_IX[t] for t in self.df['label_tier']])
    def __len__(self):
        return len(self.df)
    def __getitem__(self, i):
        return torch.from_numpy(self.X[i]), torch.tensor(self.y[i])

ds = RouterDataset('python/router/data/labeled_v1.parquet')
n_val = max(500, len(ds) // 10)
train_ds, val_ds = random_split(ds, [len(ds) - n_val, n_val])
train_loader = DataLoader(train_ds, batch_size=64, shuffle=True)
val_loader   = DataLoader(val_ds,   batch_size=128)

model = TierRouter()
opt = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-5)
loss_fn = nn.CrossEntropyLoss()

best_val = 0.0
for epoch in range(40):
    model.train()
    for X, y in train_loader:
        opt.zero_grad()
        loss = loss_fn(model(X), y)
        loss.backward()
        opt.step()

    model.eval()
    correct = total = 0
    with torch.no_grad():
        for X, y in val_loader:
            pred = model(X).argmax(1)
            correct += (pred == y).sum().item()
            total += len(y)
    val_acc = correct / total
    print(f'epoch {epoch:02d}  val_acc {val_acc:.3f}')
    if val_acc > best_val:
        best_val = val_acc
        torch.save(model.state_dict(), 'python/router/artifacts/router_best.pt')
```

40 epochs, batch 64, Adam at 1e-3 with tiny weight decay. Should plateau in 15–25 epochs; early stopping by saving the best validation checkpoint is enough (no fancy scheduler needed).

**What "good" looks like** depends on label distribution, but:
- Validation accuracy >75% with K=3 classes is a useful router.
- Validation accuracy >85% probably means your label rubric is too easy or your judge LLM is being lenient.

---

## 8. Evaluation that matters

Accuracy is necessary but not sufficient. The metric you actually ship on is **dollars saved at acceptable quality** on a held-out set.

```python
def cost_saved(y_true, y_pred, costs, qualities):
    """
    costs[i, k]    = cost of running prompt i at tier k
    qualities[i,k] = quality score of running prompt i at tier k
    y_pred[i]      = predicted tier
    """
    saved = 0.0
    for i, pred in enumerate(y_pred):
        true_tier = y_true[i]
        # Cost we paid (predicted) vs cost we would have paid (max premium baseline)
        baseline_cost = costs[i, 2]  # premium-only baseline
        actual_cost   = costs[i, pred]
        # Quality penalty if prediction was too cheap
        if qualities[i, pred] < QUALITY_THRESHOLD:
            actual_cost = costs[i, 2]  # we'd have escalated, so price as premium
        saved += baseline_cost - actual_cost
    return saved
```

Track three numbers per evaluation:
1. **Accuracy** (sanity)
2. **$ saved vs premium-only** on validation set (the actual product KPI)
3. **% of predictions where quality < threshold** (escalation rate; should be <5%)

Per-class precision/recall via `sklearn.metrics.classification_report` — what you care about is precision on `cheap` (false positives = bad output to the user) and recall on `premium` (false negatives = wasted money).

---

## 9. Export to ONNX

This is the bridge between Python training and Node serving. ONNX is just a serialization format; the math doesn't change.

```python
model = TierRouter()
model.load_state_dict(torch.load('python/router/artifacts/router_best.pt'))
model.eval()

dummy = torch.randn(1, 394)
torch.onnx.export(
    model, dummy,
    'python/router/artifacts/router.onnx',
    input_names=['features'],
    output_names=['logits'],
    dynamic_axes={'features': {0: 'batch'}, 'logits': {0: 'batch'}},
    opset_version=17,
)
```

Verify the export:

```python
import onnxruntime as ort
sess = ort.InferenceSession('python/router/artifacts/router.onnx')
out = sess.run(None, {'features': dummy.numpy()})
print(out[0])  # should match model(dummy) within 1e-5
```

The `.onnx` file is what you ship to Node. About 500KB for this network.

---

## 10. Serve in Node

Two pieces: embedding the prompt (Transformers.js) and running the MLP (`onnxruntime-node`). Both run in-process; no Python sidecar.

```bash
npm install onnxruntime-node @xenova/transformers
```

```javascript
// server/services/router.js
const ort = require('onnxruntime-node');
const path = require('path');

let mlpSession = null;
let embedder = null;

async function initRouter() {
  // Load MLP once
  mlpSession = await ort.InferenceSession.create(
    path.join(__dirname, '..', '..', 'python', 'router', 'artifacts', 'router.onnx')
  );
  // Load embedder once (downloads on first run, ~22MB)
  const { pipeline } = await import('@xenova/transformers');
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
}

function handFeatures(prompt) {
  const lower = prompt.toLowerCase();
  const nTok = Math.ceil(prompt.length / 4); // rough token approx; replace with tiktoken-node if you need exact
  const sentences = (prompt.match(/[.!?]/g) || []).length || 1;
  const digits = (prompt.match(/\d/g) || []).length;
  return new Float32Array([
    Math.min(nTok / 4000, 1.0),
    Math.min((prompt.match(/\n/g) || []).length / 50, 1.0),
    prompt.includes('```') ? 1 : 0,
    /summari|tldr/.test(lower) ? 1 : 0,
    /translate|in spanish|in french/.test(lower) ? 1 : 0,
    /classif|categor|label/.test(lower) ? 1 : 0,
    /step by step|reason|think|why/.test(lower) ? 1 : 0,
    Math.min(nTok / sentences / 30, 1.0),
    digits / Math.max(prompt.length, 1),
    prompt.includes('?') ? 1 : 0,
  ]);
}

async function predictTier(prompt) {
  // Embed (mean-pooled, normalized)
  const out = await embedder(prompt, { pooling: 'mean', normalize: true });
  const emb = new Float32Array(out.data); // (384,)
  const meta = handFeatures(prompt);      // (10,)

  const features = new Float32Array(emb.length + meta.length);
  features.set(emb, 0);
  features.set(meta, emb.length);

  const tensor = new ort.Tensor('float32', features, [1, features.length]);
  const result = await mlpSession.run({ features: tensor });
  const logits = result.logits.data; // Float32Array of length 3

  // softmax
  const max = Math.max(...logits);
  const exps = logits.map(x => Math.exp(x - max));
  const sum = exps.reduce((s, v) => s + v, 0);
  const probs = exps.map(v => v / sum);

  const TIERS = ['cheap', 'mid', 'premium'];
  // Policy: pick cheapest tier with confidence >= 0.55, else escalate
  for (let i = 0; i < TIERS.length; i++) {
    if (probs[i] >= 0.55) return { tier: TIERS[i], probs, confident: true };
  }
  // No tier was confident enough → escalate to mid
  return { tier: 'mid', probs, confident: false };
}

module.exports = { initRouter, predictTier };
```

**Cold-start cost:** ~3 seconds to load both models once. Hot inference: 5–8ms per prompt on a typical server CPU.

**Memory:** ~120MB resident (mostly the embedder). Fine for single-process Node.

---

## 11. Wire into Meridian's proxy

In `server/routes/proxy.js`, before you forward the request to a provider:

```javascript
const { predictTier, initRouter } = require('../services/router');

let ready = false;
initRouter().then(() => { ready = true; }).catch(err => {
  console.error('[router] failed to load model, falling back to default tier', err);
});

async function handleProxyRequest(req, res) {
  const { prompt, model: explicitModel } = req.body;

  // Honor explicit model picks
  if (explicitModel) return forward(explicitModel, req, res);
  if (!ready) return forward(DEFAULT_MODEL, req, res);

  const { tier, probs, confident } = await predictTier(prompt);
  const model = pickModelForTier(tier, req.user.id);  // your existing fallback logic

  // Log the routing decision for retraining
  req.routerDecision = { tier, probs, confident, model };
  return forward(model, req, res);
}
```

The `req.routerDecision` rides through to the response logger and lands in `meridian_requests.task_type` (or a new column). That's your future training data — every routed request becomes a row.

---

## 12. Monitor + retrain

A model is a snapshot of the data it was trained on. Production data drifts: new use cases, new providers, new pricing. Build the loop now or pay later.

**What to log per prediction:**
- The full feature vector (or at minimum the embedding + raw prompt).
- The predicted tier + confidence.
- The chosen model.
- *Eventually:* the actual quality (judge LLM score on the response).

**Dashboards to watch:**
- **Tier mix over time** — sudden shift from `cheap`-heavy to `premium`-heavy = something changed in user prompts.
- **Confidence distribution** — if median confidence drops, model is uncertain on new data.
- **Escalation rate** — % of predictions overridden because no tier was confident enough.
- **$ saved per day** vs the premium-only baseline.

**Retraining cadence:**
- Weekly is overkill at first; monthly is fine until you have 5x the original training set.
- Always retrain from scratch, not fine-tune. With a 117k-param model and a few-hour Python job, there's no reason to do incremental.
- Hold out the most recent 7 days as the validation set, not random — gives you the truest estimate of post-deploy performance.

---

## 13. Common failure modes (and what to do)

| Symptom | Likely cause | Fix |
|---|---|---|
| Val acc plateaus at ~33% with K=3 | Random chance — features are useless | Re-check labels (judge rubric drift?), inspect feature distributions per class |
| Train acc 95%, val acc 60% | Overfitting on small dataset | Bump dropout to 0.4, halve hidden width, get more data |
| Model picks `premium` for everything | Class imbalance + cross-entropy | Use `nn.CrossEntropyLoss(weight=...)` with inverse-frequency weights |
| Inference fast in Python, slow (>50ms) in Node | Cold session per request | Move `initRouter()` to module load, not per-request |
| Live escalation rate >20% | Confidence threshold too high, OR distribution shift since training | Lower threshold to 0.45, OR retrain on recent data |
| ONNX export fails with `dynamic_axes` error | PyTorch op not supported | Either upgrade `opset_version` to 18, or replace the op (e.g. Dropout in eval mode is identity — should be fine) |

---

## 14. Where this fits in the bigger product

The MLP is the brain of "smart-route" — Meridian's headline value prop. Everything else in the product (dashboard, alerts, virtual keys, audit log) is operational scaffolding around this one decision: *for each request, which provider gets it.*

Built well, this single component is what justifies the markup over OpenRouter. Built badly (or not built at all), the product is a glorified key-rotation service. Worth the 6 hours of focused work.

---

## Sources

- [LM-Sys RouteLLM — open-source LLM router framework](https://github.com/lm-sys/RouteLLM)
- [NVIDIA llm-router — production reference implementation](https://github.com/NVIDIA-AI-Blueprints/llm-router)
- [LLMRouter — open-source routing library (UIUC)](https://github.com/ulab-uiuc/LLMRouter)
- [LLM routing in production — LogRocket](https://blog.logrocket.com/llm-routing-right-model-for-requests/)
- [Top 5 LLM routing techniques — Maxim AI](https://www.getmaxim.ai/articles/top-5-llm-routing-techniques/)
- [Sentence-Transformers ONNX inference](https://sbert.net/docs/sentence_transformer/usage/efficiency.html)
- [Transformers.js for client/Node ONNX inference](https://huggingface.co/docs/transformers.js)
- [ONNX Runtime — Node.js binding](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)
- [Xenova/all-MiniLM-L6-v2 — pre-converted ONNX embedder](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
