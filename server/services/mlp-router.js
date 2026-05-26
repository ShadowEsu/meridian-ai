'use strict';

/**
 * Bridge from Node to the Python MLP router (python/router_service/predict_cli.py).
 *
 * Manages a single long-lived child process that loads the joblib bundle once,
 * then services predictions over a stdin/stdout JSON-line protocol.
 *
 * Public surface:
 *   const mlp = require('./services/mlp-router').getMlpRouter();
 *   const out = await mlp.classifyTier(prompt, taskTypeHint);
 *   // out = { tier: 'cheap'|'mid'|'premium', confidence: 0.92, probs: {...},
 *   //         elapsedMs: 8 }
 *   mlp.isReady() // boolean — true once the python process printed the ready signal
 *   mlp.lastError() // last error string, or null
 *
 * Config (env):
 *   MLP_ROUTER_DISABLE  — if '1', getMlpRouter returns null (server falls back
 *                         to the JS heuristic)
 *   MLP_ROUTER_PYTHON   — python binary, default 'python3'
 *   MLP_ROUTER_SCRIPT   — predict_cli.py path, default ../python/router_service/predict_cli.py
 *   MLP_ROUTER_MODEL    — joblib path, default ../python/router_service/artifacts/router.joblib
 *   MLP_ROUTER_TIMEOUT_MS — per-request timeout, default 1500
 *
 * If the python process dies or fails to boot, classifyTier resolves to
 * { tier: null, error: '<reason>' } — callers fall back to the JS heuristic.
 */

const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_SCRIPT = path.join(ROOT, 'python', 'router_service', 'predict_cli.py');
const DEFAULT_MODEL = path.join(ROOT, 'python', 'router_service', 'artifacts', 'router.joblib');
const DEFAULT_TIMEOUT = 1500;

let _singleton = null;

class MlpRouter {
  constructor(opts) {
    this.python = opts.python || process.env.MLP_ROUTER_PYTHON || 'python3';
    this.scriptPath = opts.script || process.env.MLP_ROUTER_SCRIPT || DEFAULT_SCRIPT;
    this.modelPath = opts.model || process.env.MLP_ROUTER_MODEL || DEFAULT_MODEL;
    this.timeoutMs = Number(opts.timeoutMs || process.env.MLP_ROUTER_TIMEOUT_MS || DEFAULT_TIMEOUT);
    this.ready = false;
    this.dead = false;
    this.lastErr = null;
    this.seq = 0;
    this.pending = new Map(); // id -> { resolve, reject, timer }
    this._spawn();
  }

  _spawn() {
    try {
      this.child = spawn(this.python, [this.scriptPath, '--model', this.modelPath], {
        cwd: path.dirname(this.scriptPath),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      this.dead = true;
      this.lastErr = `spawn failed: ${e.message}`;
      console.error('[mlp-router]', this.lastErr);
      return;
    }

    this.rl = readline.createInterface({ input: this.child.stdout });
    this.rl.on('line', (line) => this._onLine(line));

    this.child.stderr.on('data', (buf) => {
      const text = buf.toString();
      // The first line on stderr is the ready signal: "[predict_cli] ready ..."
      if (text.includes('[predict_cli] ready')) {
        this.ready = true;
        console.log('[mlp-router] ready:', text.trim());
        return;
      }
      // Forward other stderr (warnings etc) but downgrade to debug
      if (text.trim()) console.warn('[mlp-router:stderr]', text.trim());
    });

    this.child.on('exit', (code, sig) => {
      this.dead = true;
      this.ready = false;
      this.lastErr = `python exited code=${code} signal=${sig}`;
      console.error('[mlp-router]', this.lastErr);
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.resolve({ tier: null, error: 'mlp process exited' });
      }
      this.pending.clear();
    });

    this.child.on('error', (e) => {
      this.dead = true;
      this.lastErr = `child error: ${e.message}`;
      console.error('[mlp-router]', this.lastErr);
    });
  }

  _onLine(line) {
    line = line.trim();
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      console.warn('[mlp-router] bad json from python:', line.slice(0, 200));
      return;
    }
    const id = msg.id;
    const p = this.pending.get(id);
    if (!p) return; // unknown / timed out
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.resolve(msg);
  }

  isReady() { return this.ready && !this.dead; }
  lastError() { return this.lastErr; }

  /**
   * Classify a prompt's tier via the MLP.
   * Resolves to { tier, confidence, probs, elapsedMs } on success
   * or { tier: null, error } on failure. Never rejects.
   */
  classifyTier(prompt, taskTypeHint) {
    if (this.dead) return Promise.resolve({ tier: null, error: this.lastErr || 'mlp dead' });
    if (!this.ready) return Promise.resolve({ tier: null, error: 'mlp not ready' });
    const id = `r${++this.seq}`;
    const payload = JSON.stringify({ id, prompt: String(prompt || ''), task_type: taskTypeHint || null });
    const started = Date.now();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ tier: null, error: `mlp timeout after ${this.timeoutMs}ms` });
      }, this.timeoutMs);
      this.pending.set(id, { resolve: (msg) => resolve({ ...msg, elapsedMs: Date.now() - started }), timer });
      try {
        this.child.stdin.write(payload + '\n');
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ tier: null, error: `stdin write failed: ${e.message}` });
      }
    });
  }

  shutdown() {
    if (this.child && !this.dead) {
      try { this.child.stdin.end(); } catch (_) {}
      try { this.child.kill('SIGTERM'); } catch (_) {}
    }
    this.dead = true;
  }
}

function getMlpRouter() {
  if (process.env.MLP_ROUTER_DISABLE === '1') return null;
  if (!_singleton) _singleton = new MlpRouter({});
  return _singleton;
}

// Clean shutdown on process exit so we don't leak python children.
process.on('exit', () => { if (_singleton) _singleton.shutdown(); });
process.on('SIGINT', () => { if (_singleton) _singleton.shutdown(); process.exit(0); });
process.on('SIGTERM', () => { if (_singleton) _singleton.shutdown(); process.exit(0); });

module.exports = { getMlpRouter, MlpRouter };
