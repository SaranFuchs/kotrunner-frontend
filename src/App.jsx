import React, { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { api } from './api.js';
import { clearTransferred, readGuest, saveGuest } from './storage.js';

const Context = createContext();
const KotlinEditor = lazy(() => import('./KotlinEditor.jsx'));
const pretty = value => JSON.stringify(value);
const indexRecords = records => Object.fromEntries(records.map(record => [record.problemId, record]));

function Arrow({ back = false }) { return <span aria-hidden="true">{back ? '←' : '↗'}</span>; }
function Check() { return <span className="check" aria-label="Completed">✓</span>; }
function ErrorBox({ children, retry }) { return <div className="notice error" role="alert">{children}{retry && <button className="text-button" onClick={retry}>Retry</button>}</div>; }

export default function App() {
  const initialGuest = useRef(readGuest());
  const [guest, setGuest] = useState(initialGuest.current.records);
  const [warning, setWarning] = useState(initialGuest.current.warning);
  const [user, setUser] = useState(null);
  const [accountProgress, setAccountProgress] = useState({});
  const [sessionStatus, setSessionStatus] = useState('loading');
  const [sessionError, setSessionError] = useState('');
  const [accountsAvailable, setAccountsAvailable] = useState(false);
  const [categories, setCategories] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [authMode, setAuthMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState(null);
  const identity = useRef(0);
  const location = useLocation();

  async function loadCatalog() {
    setCatalogError('');
    try { setCategories(await api('/categories')); } catch (error) { setCatalogError(error.message); }
  }
  async function refreshSession() {
    setSessionStatus('loading'); setSessionError('');
    const epoch = ++identity.current;
    try {
      const session = await api('/auth/me');
      const records = session.user ? indexRecords((await api('/progress')).records) : {};
      if (epoch !== identity.current) return;
      setUser(session.user); setAccountProgress(records); setAccountsAvailable(session.accountsAvailable); setSessionStatus('ready');
    } catch (error) {
      if (epoch !== identity.current) return;
      setUser(null); setAccountProgress({}); setSessionStatus('error'); setSessionError(error.message);
    }
  }
  useEffect(() => { loadCatalog(); refreshSession(); }, []);
  useEffect(() => {
    const expire = () => { ++identity.current; setUser(null); setAccountProgress({}); setSessionStatus('ready'); setTransfer(null); setWarning('Your session expired. Log in again to use account progress.'); };
    const sync = () => { const state = readGuest(); setGuest(state.records); setWarning(state.warning); };
    window.addEventListener('kotrunner-session-expired', expire);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('kotrunner-session-expired', expire); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => { document.querySelector('main')?.focus({ preventScroll: true }); }, [location.pathname]);

  async function mergeGuest(epoch = identity.current) {
    const records = Object.values(readGuest().records);
    let done = 0, rejected = 0;
    setTransfer({ running: true, message: `Verifying browser progress: 0 of ${records.length}`, retry: false });
    try {
      for (const record of records) {
        if (epoch !== identity.current) return;
        const result = await api('/progress/import-guest', { candidates: [{ problemId: record.problemId, successfulSolution: record.successfulSolution }] });
        if (epoch !== identity.current) return;
        const outcome = result.outcomes[0];
        if (['imported', 'preserved'].includes(outcome.status)) setGuest(clearTransferred(record.problemId, record.successfulSolution));
        else rejected++;
        done++;
        setTransfer({ running: true, message: `Verifying browser progress: ${done} of ${records.length}`, retry: false });
        setAccountProgress(indexRecords((await api('/progress')).records));
      }
      setTransfer(records.length ? { running: false, message: rejected ? `${done - rejected} solutions transferred. ${rejected} did not pass verification; their browser copies are retained.` : `${done} browser solutions transferred. Existing account solutions were preserved.`, retry: rejected > 0 } : null);
    } catch (error) {
      if (epoch === identity.current) setTransfer({ running: false, message: `${error.message} Unconfirmed browser solutions are retained.`, retry: true });
    }
  }
  async function authenticated(nextUser) {
    const epoch = ++identity.current;
    setUser(nextUser); setAccountProgress({}); setAuthMode(null); setSessionStatus('loading');
    try {
      setAccountProgress(indexRecords((await api('/progress')).records)); setSessionStatus('ready');
      await mergeGuest(epoch);
    } catch (error) { setSessionStatus('error'); setSessionError(error.message); }
  }
  async function logout() {
    setBusy(true);
    try {
      await api('/auth/logout', {}); ++identity.current; setUser(null); setAccountProgress({}); setTransfer(null); setWarning('');
      setGuest(readGuest().records);
    } catch (error) { setWarning(error.message); }
    finally { setBusy(false); }
  }
  const progress = user ? accountProgress : guest;
  const value = { categories, progress, user, busy, setBusy, sessionStatus, setAccountProgress, setGuest, setWarning, identity, refreshSession };
  const total = categories.reduce((sum, category) => sum + category.total, 0);
  const locked = busy || transfer?.running;
  return <Context.Provider value={value}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar">
      <Link className="brand" to="/" aria-label="KotRunner home"><span className="brand-symbol" aria-hidden="true">k<span>›</span></span>KotRunner<span className="brand-dot">.</span></Link>
      <nav aria-label="Main navigation"><NavLink to="/" end>Practice</NavLink><span className="nav-separator" />
        {user ? <><span className="username">{user.username}</span><button className="button subtle small" disabled={locked} onClick={logout}>Log out</button></> : <>
          <span className="guest-label">Guest mode</span><button className="button subtle small" disabled={locked} onClick={() => setAuthMode('login')}>Log in <Arrow /></button>
        </>}
      </nav>
    </header>
    <main id="main" tabIndex={-1}>
      {sessionError && sessionStatus === 'error' && <ErrorBox retry={refreshSession}>{sessionError} Account state could not be checked.</ErrorBox>}
      {warning && <div className="notice" role="status">{warning}</div>}
      {transfer && <div className="notice" role="status">{transfer.running && <span className="spinner" />}{transfer.message}{transfer.retry && <button className="text-button" disabled={locked} onClick={() => mergeGuest()}>Retry transfer</button>}</div>}
      {catalogError ? <ErrorBox retry={loadCatalog}>{catalogError}</ErrorBox> : !categories.length ? <div className="loading" role="status">Loading your practice space…</div> : <Routes>
        <Route path="/" element={<Home total={total} />} />
        <Route path="/category/:categoryId" element={<CategoryPage />} />
        <Route path="/problem/:problemId" element={<ProblemPage key={location.pathname} />} />
        <Route path="*" element={<div className="empty"><h1>That page wandered off.</h1><Link to="/">Back to practice <Arrow /></Link></div>} />
      </Routes>}
    </main>
    <footer><span>A little Kotlin, every day.</span><span>Original exercises. Free to practice.</span></footer>
    {authMode && <AuthDialog mode={authMode} setMode={setAuthMode} available={accountsAvailable} onSuccess={authenticated} />}
  </Context.Provider>;
}

function Home({ total }) {
  const { categories, progress, user } = useContext(Context);
  // Known catalog IDs determine the total; the backend has exactly 90 stable IDs.
  const count = Math.min(Object.keys(progress).length, total);
  return <div className="home page">
    <section className="hero">
      <div><div className="eyebrow"><span className="live-dot" /> YOUR KOTLIN PRACTICE SPACE</div><h1>Small functions.<br /><span>Steady progress.</span></h1><p>A few lines of Kotlin. A fresh way to think.<br />Find a topic, work through a challenge, and make it click.</p><a className="button primary" href="#topics">Find your next challenge <span aria-hidden="true">↓</span></a></div>
      <div className="hero-note"><div className="note-label"><span className="code-dot" /> ONE FUNCTION AT A TIME <span aria-hidden="true">↗</span></div><pre><span className="syntax-purple">fun</span> <span className="syntax-green">makeProgress</span>() {'{'}{`\n    `}<span className="syntax-purple">val</span> practice = <span className="syntax-orange">"a little, often"</span>{`\n    `}<span className="syntax-purple">return</span> practice{`\n`}{'}'}</pre><div className="note-bottom"><span className="green-dot" /> Curiosity is the only prerequisite.</div></div>
    </section>
    <section className="progress-strip" aria-label="Overall progress"><div className="progress-number">{count}<span> / {total}</span></div><div className="progress-description"><strong>Your practice, taking shape.</strong><span>{user ? 'Your successful solutions are saved to your account.' : 'Successful solutions stay in this browser. Log in to carry them with you.'}</span></div><div className="overall-meter" role="progressbar" aria-label="Exercises completed" aria-valuenow={count} aria-valuemin={0} aria-valuemax={total}><span style={{ width: `${total ? count / total * 100 : 0}%` }} /></div></section>
    <section id="topics" className="topics"><div className="section-heading"><div><span className="eyebrow">THE PRACTICE LIBRARY</span><h2>Where shall we start?</h2></div><span className="topic-count">13 topics <span>·</span> 90 challenges</span></div>
      <div className="category-grid">{categories.map((category, i) => <CategoryCard key={category.id} category={category} index={i} progress={progress} />)}</div>
    </section>
    <div className="quiet-note"><span aria-hidden="true">✳</span><p>No timer. No leaderboard. Just you, a function, and that little moment when it works.</p></div>
  </div>;
}

function CategoryCard({ category, index, progress }) {
  const [ids, setIds] = useState([]);
  useEffect(() => { let active = true; api(`/categories/${category.id}/problems`).then(rows => { if (active) setIds(rows.map(row => row.id)); }).catch(() => {}); return () => { active = false; }; }, [category.id]);
  const done = ids.filter(id => progress[id]).length;
  return <Link className={`category-card tone-${Math.floor(index / 4)}`} to={`/category/${category.id}`}>
    <div className="card-top"><span className="category-glyph" aria-hidden="true">{['{ }', '{…}', '&&', '||', '"a"', 'a→', '[ ]', '[…]', '↻', '?.', '↦', 'ƒ', '↳'][index]}</span><span className="card-number">{String(index + 1).padStart(2, '0')} <Arrow /></span></div>
    <h3>{category.name}</h3><p>{category.description}</p><div className="card-bottom"><span>{done} of {category.total} complete</span><span className="mini-meter"><span style={{ width: `${done / category.total * 100}%` }} /></span></div>
  </Link>;
}

function useCategory(id) {
  const [problems, setProblems] = useState([]), [error, setError] = useState('');
  const load = async () => { setError(''); try { setProblems(await api(`/categories/${id}/problems`)); } catch (e) { setError(e.message); } };
  useEffect(() => { setProblems([]); load(); }, [id]);
  return { problems, error, load };
}

function CategoryPage() {
  const { categoryId } = useParams();
  const { categories, progress } = useContext(Context);
  const category = categories.find(c => c.id === categoryId);
  const { problems, error, load } = useCategory(categoryId);
  if (!category) return <div className="page"><h1>Category not found.</h1><Link to="/">All topics</Link></div>;
  const done = problems.filter(p => progress[p.id]).length;
  return <div className="page category-page"><Link className="back-link" to="/"><Arrow back /> All topics</Link><div className="category-heading"><div><div className="eyebrow">ONE FUNCTION AT A TIME</div><h1>{category.name}</h1><p>{category.description} Start anywhere, and go at your own pace.</p></div><div className="category-counter"><strong>{done}<span> / {category.total}</span></strong><span>challenges complete</span></div></div>
    {error ? <ErrorBox retry={load}>{error}</ErrorBox> : <ol className="problem-list">{problems.map((p, i) => <li key={p.id}><Link to={`/problem/${p.id}`}><span className="problem-number">{String(i + 1).padStart(2, '0')}</span><div><h2>{p.title}</h2><code>{p.starterCode.split('\n')[0].replace(' {', '')}</code></div><span className="problem-list-status">{progress[p.id] ? <><Check /> Completed</> : <>Practice <Arrow /></>}</span></Link></li>)}</ol>}
    <p className="page-footnote">Successful solutions are saved. Unfinished code stays only in the open editor.</p>
  </div>;
}

function ProblemPage() {
  const { problemId } = useParams();
  const ctx = useContext(Context);
  const { progress, categories, user, busy, setBusy, sessionStatus, identity } = ctx;
  const [problem, setProblem] = useState(null), [source, setSource] = useState(''), [hint, setHint] = useState(false);
  const [error, setError] = useState(''), [result, setResult] = useState(null), [loadError, setLoadError] = useState('');
  const categoryId = problem?.category;
  const { problems } = useCategory(categoryId || 'warmup-1');
  const category = categories.find(c => c.id === categoryId);
  const savedSource = progress[problemId]?.successfulSolution;
  async function load() {
    setLoadError('');
    try { const p = await api(`/problems/${problemId}`); setProblem(p); setSource(savedSource || p.starterCode); }
    catch (e) { setLoadError(e.message); }
  }
  useEffect(() => { load(); }, [problemId]);
  const loadedOwner = useRef(null);
  useEffect(() => {
    const owner = `${user?.username || 'guest'}:${problemId}`;
    if (sessionStatus === 'ready' && problem && loadedOwner.current !== owner) {
      loadedOwner.current = owner; setResult(null); setError('');
      setSource(savedSource || problem.starterCode);
    }
  }, [user?.username, sessionStatus, problemId, problem, savedSource]);
  const index = problems.findIndex(p => p.id === problemId);
  async function go() {
    if (busy) return;
    const epoch = identity.current;
    setBusy(true); setError(''); setResult(null);
    try {
      const graded = await api(`/problems/${problemId}/run`, { source });
      if (epoch !== identity.current) return;
      setResult(graded);
      if (graded.allPassed) {
        if (user) {
          if (graded.saved) ctx.setAccountProgress(indexRecords((await api('/progress')).records));
          else setError(graded.summary);
        } else if (!graded.saved) {
          try { ctx.setGuest(saveGuest(problemId, source)); } catch (e) { setError(e.message); }
        } else await ctx.refreshSession();
      }
    } catch (e) { if (epoch === identity.current) setError(e.message); }
    finally { setBusy(false); }
  }
  if (loadError) return <div className="page"><ErrorBox retry={load}>{loadError}</ErrorBox></div>;
  if (!problem) return <div className="loading" role="status">Opening the challenge…</div>;
  return <div className="workspace page">
    <div className="workspace-breadcrumb"><Link to="/">Practice</Link><span>/</span><Link to={`/category/${categoryId}`}>{category?.name}</Link><span>/</span><span>{problem.title}</span></div>
    <div className="workspace-heading"><div><div className="eyebrow">CHALLENGE {String(problem.ordinal).padStart(2, '0')} <span> / {category?.total}</span></div><h1>{problem.title} {progress[problemId] && <Check />}</h1></div><div className="problem-navigation" aria-label="Challenge navigation">{index > 0 ? <Link className="button subtle small" to={`/problem/${problems[index - 1].id}`}><Arrow back /> Previous</Link> : <button className="button subtle small" disabled>← Previous</button>}{index >= 0 && index < problems.length - 1 ? <Link className="button subtle small" to={`/problem/${problems[index + 1].id}`}>Next →</Link> : <button className="button subtle small" disabled>Next →</button>}</div></div>
    <div className="workspace-grid"><section className="instructions"><div className="panel-label">THE CHALLENGE</div><p className="statement">{problem.statement}</p><h2>For example</h2><div className="examples">{problem.examples.map(example => <div key={example.call}><code>{example.call}</code><span aria-hidden="true">→</span><code className="example-answer">{pretty(example.expected)}</code></div>)}</div><details className="constraints"><summary>Input & comparison notes</summary><p>{problem.constraints}</p></details><button className="hint-toggle" aria-expanded={hint} aria-controls="problem-hint" onClick={() => setHint(!hint)}><span aria-hidden="true">✧</span> {hint ? 'Hide hint' : 'A nudge in the right direction'}<span aria-hidden="true">{hint ? '−' : '+'}</span></button>{hint && <p id="problem-hint" className="hint">{problem.hint}</p>}<div className="editor-note"><span aria-hidden="true">↳</span><p>Complete the function, then press <strong>Go</strong>.<br />No <code>main()</code> needed. Helpers are welcome.</p></div></section>
    <section className="editor-panel" aria-label="Kotlin editor and results"><div className="editor-toolbar"><span><span className="code-dot" /> Solution.kt</span><span>Kotlin / JVM</span></div><Suspense fallback={<div className="loading" role="status">Opening the Kotlin editor…</div>}><KotlinEditor value={source} onChange={setSource} editable={!busy} /></Suspense><div className="editor-actions"><button className="text-button" disabled={busy} onClick={() => { setSource(problem.starterCode); setResult(null); setError(''); }}>↺ Reset Code</button><span className="editor-short-note">Successful solutions only are saved</span><button className="button primary go-button" disabled={busy || sessionStatus !== 'ready'} onClick={go}>{busy ? <><span className="spinner" /> Running…</> : <>Go <span aria-hidden="true">▶</span></>}</button></div>
    <div className="results-area" aria-live="polite" aria-atomic="false">{error && <ErrorBox>{error}</ErrorBox>}{busy ? <div className="results-placeholder"><span className="spinner" /><strong>Giving your function a run.</strong><span>Compiling Kotlin and checking the tests…</span></div> : result ? <Results result={result} /> : <div className="results-placeholder"><span className="terminal-symbol" aria-hidden="true">›_</span><strong>A small experiment starts here.</strong><span>Run your code to see test results.</span></div>}</div></section></div>
  </div>;
}

export function Results({ result }) {
  return <div className="results"><div className={`result-heading ${result.allPassed ? 'success' : ''}`}><strong>{result.allPassed ? '✓ ' : ''}{result.summary}</strong>{result.allPassed && <span>{result.saved ? 'Saved to your account' : 'Verified by KotRunner'}</span>}</div>{result.diagnostics && <pre className="diagnostics">{result.diagnostics}</pre>}{result.visible.length > 0 && <div className="results-scroll"><table><caption className="sr-only">Visible test results</caption><thead><tr><th>Call</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>{result.visible.map((row, i) => <tr key={i}><td><code>{row.call}</code></td><td><code>{pretty(row.expected)}</code></td><td><code>{row.error || pretty(row.actual)}</code></td><td><span className={row.passed ? 'passed' : 'failed'}>{row.passed ? 'Pass' : 'Fail'}</span></td></tr>)}</tbody></table></div>}<div className="hidden-summary"><span aria-hidden="true">◈</span><strong>Hidden tests</strong><span>{result.hidden.passed} / {result.hidden.total} passed</span></div></div>;
}

function AuthDialog({ mode, setMode, available, onSuccess }) {
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [pending, setPending] = useState(false);
  const dialog = useRef(null);
  const returnFocus = useRef(document.activeElement);
  const register = mode === 'register';
  useEffect(() => {
    dialog.current.showModal();
    return () => returnFocus.current?.focus();
  }, []);
  async function submit(event) {
    event.preventDefault(); setPending(true); setError('');
    try { await onSuccess(await api(`/auth/${mode}`, { username, password })); }
    catch (e) { setError(e.message); }
    finally { setPending(false); }
  }
  return <dialog ref={dialog} className="auth-dialog" aria-labelledby="auth-title" onCancel={event => { if (pending) event.preventDefault(); else setMode(null); }}>
    <button className="close-dialog" aria-label="Close account dialog" disabled={pending} onClick={() => setMode(null)}>×</button><span className="eyebrow">TAKE YOUR PROGRESS WITH YOU</span><h2 id="auth-title">{register ? 'Your own practice space.' : 'Welcome back.'}</h2><p>{register ? 'A username, a password, and room to grow.' : 'Pick up where you left off, on any device.'}</p>
    {!available && <div className="notice">Account storage may be unavailable. Guest practice remains open.</div>}
    {register && <div className="auth-rules"><p>Username: 3–24 letters, digits, or underscores. Usernames are case-insensitive.</p><p>Password: at least 10 characters, at most 72 UTF-8 bytes.</p><strong>There is no password recovery. Keep your password somewhere safe.</strong></div>}
    <form onSubmit={submit}><label htmlFor="username">Username</label><input id="username" name="username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoFocus /><label htmlFor="password">Password</label><input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : undefined} />{error && <ErrorBox>{error}</ErrorBox>}<button className="button primary auth-submit" disabled={pending}>{pending ? 'Just a moment…' : register ? 'Create account' : 'Log in'} <Arrow /></button></form><p className="auth-switch">{register ? 'Already have an account?' : 'New to KotRunner?'} <button className="text-button" disabled={pending} onClick={() => { setMode(register ? 'login' : 'register'); setError(''); }}>{register ? 'Log in' : 'Create an account'}</button></p><p className="auth-footnote">Browser solutions are verified before transfer.<br />Existing account solutions always stay.</p>
  </dialog>;
}
