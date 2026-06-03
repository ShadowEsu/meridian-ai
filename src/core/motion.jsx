// Motion primitives (spring-like, reduced-motion safe). Works without a bundler.

(function () {
  function useReducedMotion() {
    const [reduce, setReduce] = React.useState(false);
    React.useEffect(() => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduce(mq.matches);
      const fn = () => setReduce(mq.matches);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    }, []);
    return reduce;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function CountUp({ value, format, duration, className, onDone }) {
    const reduce = useReducedMotion();
    const [display, setDisplay] = React.useState(0);
    const ran = React.useRef(false);

    React.useEffect(() => {
      if (reduce) {
        setDisplay(value);
        return;
      }
      if (ran.current && duration === 0) {
        setDisplay(value);
        return;
      }
      const from = ran.current ? display : 0;
      const to = Number(value) || 0;
      const start = performance.now();
      const dur = duration ?? (ran.current ? 400 : 900);
      let raf;
      function tick(now) {
        const p = Math.min(1, (now - start) / dur);
        setDisplay(from + (to - from) * easeOutCubic(p));
        if (p < 1) raf = requestAnimationFrame(tick);
        else {
          ran.current = true;
          onDone && onDone();
        }
      }
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [value, duration, reduce]);

    const text = format ? format(display) : String(Math.round(display));
    return <span className={className}>{text}</span>;
  }

  function LiveValue({ value, format, className, improved }) {
    const [flash, setFlash] = React.useState(null);
    const prev = React.useRef(value);
    React.useEffect(() => {
      if (prev.current === value) return;
      setFlash(improved ? 'good' : 'bad');
      prev.current = value;
      const t = setTimeout(() => setFlash(null), 420);
      return () => clearTimeout(t);
    }, [value, improved]);
    const anim = flash === 'good' ? 'animate-flash-good' : flash === 'bad' ? 'animate-flash-bad' : '';
    return (
      <span className={[className, anim].filter(Boolean).join(' ')}>
        {format ? format(value) : value}
      </span>
    );
  }

  function Fade({ show, children, className }) {
    const reduce = useReducedMotion();
    if (!show) return null;
    return (
      <div
        className={[className, reduce ? '' : 'm-page-enter'].filter(Boolean).join(' ')}
        style={{ opacity: show ? 1 : 0 }}
      >
        {children}
      </div>
    );
  }

  function SlideIndicator({ style }) {
    const reduce = useReducedMotion();
    return (
      <span
        className="absolute left-0 w-0.5 rounded-full bg-accent transition-transform duration-200 ease-meridian"
        style={{
          ...style,
          transition: reduce ? 'none' : style.transition || 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        aria-hidden="true"
      />
    );
  }

  function DrawChart({ children, className }) {
    const reduce = useReducedMotion();
    const [drawn, setDrawn] = React.useState(reduce);
    React.useEffect(() => {
      if (reduce) return;
      const t = requestAnimationFrame(() => setDrawn(true));
      return () => cancelAnimationFrame(t);
    }, [reduce]);
    return (
      <div
        className={className}
        style={{
          opacity: drawn ? 1 : 0,
          transform: drawn ? 'none' : 'translateY(4px)',
          transition: reduce ? 'none' : 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        {children}
      </div>
    );
  }

  window.MeridianMotion = {
    useReducedMotion,
    CountUp,
    LiveValue,
    Fade,
    SlideIndicator,
    DrawChart,
  };
})();
