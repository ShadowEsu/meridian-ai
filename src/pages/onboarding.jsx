// Supported providers accepted by the backend.
// 'azure' is not yet supported server-side; it is excluded from the enum.
const PROVIDER_OPTIONS = [
  { value: 'openai',    label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google',    label: 'Google' },
  { value: 'mistral',   label: 'Mistral' },
];

/**
 * Persist a provider key.
 *
 * Demo mode: no-op (key stays in local form state only).
 * Live mode: POST /api/provider-keys via MeridianAPI and returns the created
 * key object.  Throws on network / validation errors so the caller can surface
 * the message in the UI.
 *
 * @param {string} provider - One of 'openai' | 'anthropic' | 'google' | 'mistral'
 * @param {string} apiKey   - Raw API key string (min 8 chars)
 * @param {string} [label]  - Optional human-readable label
 * @returns {Promise<object|null>} Created key record in live mode, null in demo mode
 */
async function saveProviderKey(provider, apiKey, label) {
  if (!window.MeridianAPI || !window.MeridianAPI.live) {
    // Demo mode: keep existing in-memory / local-state behaviour; nothing to persist.
    return null;
  }
  return window.MeridianAPI.providerKeys.create({ provider, apiKey, label: label || undefined });
}

// Provider key form shown on the "Connect your APIs" wizard step.
function ProviderKeyForm({ onSaved }) {
  const [provider, setProvider] = React.useState('openai');
  const [apiKey, setApiKey]     = React.useState('');
  const [label, setLabel]       = React.useState('');
  const [saving, setSaving]     = React.useState(false);
  const [error, setError]       = React.useState(null);
  const [saved, setSaved]       = React.useState(false);
  const live = window.MeridianAPI && window.MeridianAPI.live;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!apiKey.trim()) {
      setError('API key is required.');
      return;
    }

    if (!live) {
      // Demo mode: acknowledge the form without persisting.
      setSaved(true);
      if (onSaved) onSaved(null);
      return;
    }

    setSaving(true);
    try {
      const result = await saveProviderKey(provider, apiKey.trim(), label.trim() || undefined);
      setSaved(true);
      if (onSaved) onSaved(result);
    } catch (err) {
      setError(err.message || 'Failed to save provider key.');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="setup-key-success">
        <p style={{ color: 'var(--color-success, #22c55e)', marginBottom: 4 }}>
          {live ? 'Provider key saved.' : 'Got it (demo mode — key not persisted).'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-muted, #888)' }}>
          You can add more keys later from the Keys page.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
      {!live && (
        <p style={{ fontSize: 12, color: 'var(--color-muted, #888)', marginBottom: 8 }}>
          Demo mode — keys are not persisted to the backend.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <select
          value={provider}
          onChange={e => setProvider(e.target.value)}
          className="input"
          style={{ width: '100%' }}
          disabled={saving}
          aria-label="Provider"
        >
          {PROVIDER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="password"
          className="input"
          placeholder="API key"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          disabled={saving}
          autoComplete="off"
          aria-label="API key"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <input
          type="text"
          className="input"
          placeholder="Label (optional)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          disabled={saving}
          aria-label="Label"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        {error && (
          <p role="alert" style={{ color: 'var(--color-danger, #ef4444)', fontSize: 13, margin: 0 }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving}
          style={{ alignSelf: 'flex-start' }}
        >
          {saving ? 'Saving…' : 'Save key'}
        </button>
      </div>
    </form>
  );
}

// First-time setup wizard after sign up / first login
function SetupWizard({ user, onDone }) {
  const [step, setStep] = React.useState(0);
  const [keySaved, setKeySaved] = React.useState(false);
  const total = 3;

  const next = () => {
    if (step < total - 1) setStep(step + 1);
    else finish();
  };
  const back = () => step > 0 && setStep(step - 1);

  const finish = () => {
    try {
      localStorage.setItem('meridian_setup_v1_' + user.id, '1');
    } catch { /* ignore */ }
    onDone();
  };

  // Step 2 ("Connect your APIs") advances automatically after a key is saved.
  const handleKeySaved = (_result) => {
    setKeySaved(true);
  };

  const steps = [
    {
      title: 'Welcome aboard',
      body: 'Meridian helps you see AI spend, route models, and watch agents — all in one place. Your account is ready; everything you see next is designed to get you productive quickly.',
      hint: 'You can reopen tips anytime from Settings (coming soon).',
      extra: null,
    },
    {
      title: 'Connect your APIs',
      body: 'Add a provider API key so Meridian can track usage against your account. You can add more keys later from the Keys page.',
      hint: 'Azure support is coming soon. For now, use OpenAI, Anthropic, Google, or Mistral.',
      extra: <ProviderKeyForm onSaved={handleKeySaved} />,
    },
    {
      title: 'Sample dashboard',
      body: 'Charts, dollars, and call counts on Overview and other pages are placeholder examples so the UI feels real. They are not your live usage yet.',
      hint: 'When you connect billing or ingest logs, these panels will swap to real data.',
      extra: null,
    },
  ];

  const s = steps[step];
  // On the key step, the primary button label changes once a key has been saved.
  const primaryLabel = step === 1 && !keySaved
    ? 'Skip for now'
    : step < total - 1
      ? 'Next'
      : 'Open Meridian';

  return (
    <div className="setup-overlay" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <div className="setup-modal">
        <div className="setup-progress">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className={'setup-dot' + (i === step ? ' active' : '') + (i < step ? ' done' : '')} />
          ))}
        </div>
        <h2 id="setup-title" className="setup-title">{s.title}</h2>
        <p className="setup-body">{s.body}</p>
        {s.extra}
        <p className="setup-hint">{s.hint}</p>
        <div className="setup-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={back}>Back</button>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {step !== 1 && (
              <button type="button" className="btn btn-ghost" onClick={finish}>Skip</button>
            )}
            <button type="button" className="btn btn-primary" onClick={next}>
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.SetupWizard = SetupWizard;
