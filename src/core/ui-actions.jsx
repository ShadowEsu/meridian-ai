// Toast notifications + shared button actions (navigate, coming soon, intercept).

(function () {
  const TOAST_MS = 4200;
  let seq = 0;
  let items = [];
  const listeners = new Set();

  function emit() {
    listeners.forEach(fn => {
      try { fn(items.slice()); } catch (_) { /* ignore */ }
    });
  }

  function dismiss(id) {
    items = items.filter(t => t.id !== id);
    emit();
  }

  function toast(message, type) {
    const id = ++seq;
    const t = { id, message, type: type || 'info' };
    items = [t, ...items].slice(0, 5);
    emit();
    setTimeout(() => dismiss(id), TOAST_MS);
    return id;
  }

  window.MeridianUI = {
    toast,
    navigate(page) {
      if (!page) return;
      window.dispatchEvent(new CustomEvent('meridian:nav', { detail: page }));
    },
    comingSoon(feature) {
      toast((feature || 'This feature') + ' — coming soon', 'soon');
    },
    intercept(agentName) {
      toast('Intercepted — ' + (agentName || 'agent') + ' paused', 'success');
      window.dispatchEvent(new CustomEvent('meridian:nav', { detail: 'agents' }));
    },
    pauseAutoRoute() {
      toast('Auto-route paused for Engineering', 'success');
    },
    snooze(hours) {
      toast('Alert snoozed for ' + (hours || 1) + 'h', 'info');
    },
    investigate() {
      window.dispatchEvent(new CustomEvent('meridian:nav', { detail: 'agents' }));
      toast('Opening agent monitor…', 'info');
    },
    exportData(label) {
      toast((label || 'Export') + ' queued (preview)', 'info');
    },
  };

  function ToastHost() {
    const [list, setList] = React.useState([]);
    React.useEffect(() => {
      const fn = setList;
      listeners.add(fn);
      setList(items.slice());
      return () => listeners.delete(fn);
    }, []);
    if (!list.length) return null;
    return (
      <div className="meridian-toasts" role="status" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className={'meridian-toast meridian-toast--' + (t.type || 'info')}>
            <span>{t.message}</span>
            <button type="button" className="meridian-toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    );
  }

  window.ToastHost = ToastHost;
})();
