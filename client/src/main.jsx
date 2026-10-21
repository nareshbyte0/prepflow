import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import './visual-refresh.css';

const api = async (path, options = {}) => {
  const token = localStorage.getItem('prepflow_token');
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  } catch {
    throw new Error('Could not reach Prepflow. Check your connection and try again.');
  }
  const text = response.status === 204 ? '' : await response.text();
  if (response.status === 204) return null;
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON response */ }
  if (!response.ok) throw new Error(body?.message || `The server returned ${response.status}. Check that the API is running.`);
  if (!body) throw new Error('The API returned an empty response. Check the server log.');
  return body;
};

function topicColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return { gradient: `linear-gradient(135deg, hsl(${h},70%,60%),hsl(${(h+40)%360},70%,50%))`, bg: `hsla(${h},50%,25%,.4)`, color: `hsl(${h},80%,75%)` };
}

function topicIcon(name) {
  const icons = { 'Foundation': '🧱', 'Arrays': '📊', 'Linked List': '🔗', 'Strings': '🔤', 'Stack and Queues': '📚', 'Binary Search Algorithm': '🔍', 'Two Pointers & Sliding Window': '⚡', 'Binary Tree': '🌳', 'Binary Search Tree': '🔨', 'Heap': '⛰️', 'Backtracking': '🔙', 'Greedy Algorithm': '💰', 'Dynamic Programming': '📈', 'Graphs': '🗺️' };
  return icons[name] || '📝';
}

function Brand({ compact = false }) {
  return <div className={`brand${compact ? ' brand-compact' : ''}`} aria-label="Prepflow">
    <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M10 27.5 16.2 21l4.7 4.1L30 14" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M23.5 14H30v6.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="29.5" r="2" fill="currentColor"/></svg></span>
    <span className="brand-word">Prep<span>flow</span></span>
  </div>;
}

function Auth({ onAuth }) {
  const query = new URLSearchParams(window.location.search);
  const verifyToken = query.get('verify');
  const resetToken = query.get('reset');
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''); const [newPassword, setNewPassword] = useState('');
  useEffect(() => {
    if (!verifyToken) return;
    setBusy(true);
    api('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: verifyToken }) })
      .then(({ user }) => { localStorage.removeItem('prepflow_token'); window.history.replaceState({}, '', '/'); onAuth(user); })
      .catch(e => { setError(e.message); setMode('verify'); })
      .finally(() => setBusy(false));
  }, []);
  const submit = async event => {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === 'login') {
        const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(values) });
        localStorage.removeItem('prepflow_token'); onAuth(data.user);
      } else if (mode === 'signup') {
        const data = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(values) });
        setEmail(values.email); setMode('verify'); setMessage(data.message);
      } else if (mode === 'forgot') {
        const data = await api('/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ email: values.email }) });
        setMessage(data.message);
      } else if (mode === 'verify') {
        const data = await api('/api/auth/verify-email/resend', { method: 'POST', body: JSON.stringify({ email: values.email }) });
        setMessage(data.message);
      } else if (mode === 'reset') {
        const data = await api('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token: resetToken, password: values.password }) });
        setMessage(data.message); setMode('login'); window.history.replaceState({}, '', '/');
      }
    } catch (e) {
      if (mode === 'login' && /verify your email/i.test(e.message)) { setEmail(values.email); setMode('verify'); }
      setError(e.message);
    }
    finally { setBusy(false); }
  };
  const title = { login: 'Welcome back', signup: 'Create your account', forgot: 'Reset your password', verify: 'Verify your email', reset: 'Choose a new password' }[mode];
  return <main className="auth"><section className="hero"><Brand/><div className="hero-kicker"><i/> YOUR INTERVIEW PREP, ORGANIZED</div><h1>Prepare with purpose.<br/><em>Show up confident.</em></h1><p>A clear study plan, useful progress tracking, and the practice you need to feel ready.</p><div className="chips"><span><b>01</b> Curated DSA paths</span><span><b>02</b> Progress tracking</span><span><b>03</b> LeetCode sync</span></div><div className="hero-foot">Make steady progress, one problem at a time.</div></section><section className="authPanel"><form onSubmit={submit}><Brand compact/><h2>{title}</h2><p>{mode === 'login' ? 'Pick up where you left off.' : mode === 'signup' ? 'Start your interview preparation today.' : mode === 'verify' ? 'Use the link in your inbox to activate your account.' : mode === 'forgot' ? 'We’ll email you a secure, time-limited reset link.' : 'Your reset link is valid for one hour.'}</p>
    {(mode === 'login' || mode === 'signup') && <div className="tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setMessage(''); }}>Log in</button><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setMessage(''); }}>Sign up</button></div>}
    {mode === 'signup' && <><input name="name" placeholder="Your name" autoComplete="name" required/><div className="optional-social"><span>LeetCode profile <small>optional</small></span><input name="leetcodeUsername" placeholder="Username or LeetCode profile link" autoComplete="off" maxLength={300}/><small>We’ll add your solved totals and streak to your dashboard.</small></div></>}
    {(mode !== 'reset') && <input name="email" type="email" placeholder="Email address" autoComplete="email" required value={mode === 'verify' ? email : undefined} onChange={mode === 'verify' ? e => setEmail(e.target.value) : undefined}/>}
    {(mode === 'login' || mode === 'signup') && <input name="password" type="password" minLength="8" placeholder="Password (8+ characters)" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required/>}
    {mode === 'reset' && <input name="password" type="password" minLength="8" maxLength="128" placeholder="New password (8+ characters)" autoComplete="new-password" required value={newPassword} onChange={e => setNewPassword(e.target.value)}/>}
    <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'verify' ? 'Resend verification email' : 'Update password'}</button>
    {mode === 'signup' && <details className="privacy-note"><summary>How Prepflow uses your data</summary><p>Prepflow stores your email, name, notes, review schedule, and study progress. If you link LeetCode, we request public profile statistics and recent accepted submissions. We never ask for or store your LeetCode password or session.</p></details>}
    {mode === 'login' && <button type="button" className="auth-link" onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}>Forgot password?</button>}
    {(mode === 'forgot' || mode === 'verify' || mode === 'reset') && <button type="button" className="auth-link" onClick={() => { setMode('login'); setError(''); setMessage(''); window.history.replaceState({}, '', '/'); }}>Back to log in</button>}
    {message && <small className="success-message" role="status">{message}</small>}{error && <small className="error" role="alert">{error}</small>}</form></section></main>;
}

function Tracker({ user, onLogout }) {
  const [questions, setQuestions] = useState([]);
  const [solved, setSolved] = useState([]);
  const [notes, setNotes] = useState({});
  const [reviewDue, setReviewDue] = useState({});
  const [reviewOnly, setReviewOnly] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(user.dailyGoal || 3);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');
  const [noteIndex, setNoteIndex] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [leetcode, setLeetcode] = useState(null);
  const [leetcodeInput, setLeetcodeInput] = useState('');
  const [leetcodeBusy, setLeetcodeBusy] = useState(false);
  const [leetcodeError, setLeetcodeError] = useState('');
  const progressRef = useRef({ solved: [], notes: {}, reviewDue: {} });
  const saveQueue = useRef(Promise.resolve());
  const pendingSaves = useRef(0);
  const [detailTopic, setDetailTopic] = useState(null);
  const [expandedTopics, setExpandedTopics] = useState(() => new Set());

  useEffect(() => {
    loadData();
  }, []);
  useEffect(() => { loadLeetcode(); }, []);

  const loadData = async () => {
    setLoadError('');
    try {
      const [q, p] = await Promise.all([api('/api/questions'), api('/api/progress')]);
      setQuestions(q); setSolved(p.solved || []); setNotes(p.notes || {}); setReviewDue(p.reviewDue || {});
      progressRef.current = { solved: p.solved || [], notes: p.notes || {}, reviewDue: p.reviewDue || {} };
      setLoaded(true);
    } catch (error) {
      if (/session has expired|authentication required/i.test(error.message)) onLogout();
      else setLoadError(error.message);
    }
  };

  const loadLeetcode = async (force = false) => {
    setLeetcodeError(''); setLeetcodeBusy(true);
    try {
      const data = await api(`/api/leetcode/streak${force ? '?refresh=1' : ''}`);
      setLeetcode(data);
      if (data.username) setLeetcodeInput(data.username);
    } catch (error) { setLeetcodeError(error.message); }
    finally { setLeetcodeBusy(false); }
  };

  const linkLeetcode = async event => {
    event.preventDefault(); setLeetcodeBusy(true); setLeetcodeError('');
    try {
      const linked = await api('/api/leetcode/streak', { method: 'PUT', body: JSON.stringify({ username: leetcodeInput.trim() }) });
      setLeetcode({ username: linked.username, streak: null, totalActiveDays: null, solved: null });
      await loadLeetcode(true);
    } catch (error) { setLeetcodeError(error.message); }
    finally { setLeetcodeBusy(false); }
  };

  const unlinkLeetcode = async () => {
    setLeetcodeBusy(true); setLeetcodeError('');
    try {
      await api('/api/leetcode/streak', { method: 'PUT', body: JSON.stringify({ username: '' }) });
      setLeetcode({ username: '', streak: null }); setLeetcodeInput('');
    } catch (error) { setLeetcodeError(error.message); }
    finally { setLeetcodeBusy(false); }
  };

  const persist = async (nextSolved, nextNotes, nextReviewDue = progressRef.current.reviewDue) => {
    progressRef.current = { solved: nextSolved, notes: nextNotes, reviewDue: nextReviewDue };
    pendingSaves.current += 1; setSaving(true); setSaveError('');
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => api('/api/progress', { method: 'PUT', body: JSON.stringify(progressRef.current) }));
    try { await saveQueue.current; setSaveError(''); }
    catch (error) {
      if (/session has expired|authentication required/i.test(error.message)) onLogout();
      else setSaveError(error.message);
    } finally { pendingSaves.current -= 1; setSaving(pendingSaves.current > 0); }
  };

  const saveNote = () => {
    if (noteIndex === null) return;
    const current = progressRef.current;
    const next = { ...current.notes, [noteIndex]: noteText.trim() };
    if (!next[noteIndex]) delete next[noteIndex];
    setNotes(next); persist(progressRef.current.solved, next, progressRef.current.reviewDue); setNoteIndex(null);
  };

  const updateDailyGoal = async value => {
    const goal = Number(value);
    try {
      const data = await api('/api/account', { method: 'PUT', body: JSON.stringify({ name: user.name, dailyGoal: goal }) });
      setDailyGoal(data.user.dailyGoal); setSettingsError('');
    } catch (error) { setSettingsError(error.message); }
  };

  const exportAccount = async () => {
    try {
      const data = await api('/api/account/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'prepflow-export.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSettingsError('');
    } catch (error) { setSettingsError(error.message); }
  };

  const deleteAccount = async () => {
    if (!deletePassword) { setSettingsError('Enter your password to confirm account deletion.'); return; }
    try {
      await saveQueue.current.catch(() => {});
      await api('/api/account', { method: 'DELETE', body: JSON.stringify({ password: deletePassword }) });
      localStorage.removeItem('prepflow_token'); onLogout();
    } catch (error) { setSettingsError(error.message); }
  };

  const toggleReview = index => {
    const next = { ...progressRef.current.reviewDue };
    if (next[index]) delete next[index];
    else next[index] = new Date().toISOString();
    setReviewDue(next); persist(progressRef.current.solved, progressRef.current.notes, next);
  };

  const topicStats = useMemo(() => {
    const stats = Object.values(questions.reduce((all, item, index) => {
      const entry = all[item.topic] || { name: item.topic, total: 0, done: 0, easy: 0, medium: 0, hard: 0, easyDone: 0, mediumDone: 0, hardDone: 0 };
      entry.total++;
      if (item.diff === 'Easy') { entry.easy++; if (solved.includes(index)) entry.easyDone++; }
      else if (item.diff === 'Medium') { entry.medium++; if (solved.includes(index)) entry.mediumDone++; }
      else { entry.hard++; if (solved.includes(index)) entry.hardDone++; }
      if (solved.includes(index)) entry.done++;
      all[item.topic] = entry;
      return all;
    }, {}));
    return stats.sort((a, b) => (b.done / b.total) - (a.done / a.total));
  }, [questions, solved]);

  const filtered = useMemo(() =>
    questions.map((question, index) => ({ question, index })).filter(({ question, index }) =>
      question.name.toLowerCase().includes(query.toLowerCase()) &&
      (!difficulty || question.diff === difficulty) &&
      (!topic || question.topic === topic) &&
      (!detailTopic || question.topic === detailTopic) &&
      (!reviewOnly || Boolean(reviewDue[index]))
    ), [questions, query, difficulty, topic, detailTopic, reviewOnly, reviewDue]);

  const groupedQuestions = useMemo(() => {
    const groups = new Map();
    filtered.forEach(item => {
      const name = item.question.topic;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    });
    return [...groups.entries()];
  }, [filtered]);

  const leetcodeQuestionMatches = useMemo(() => {
    if (!Array.isArray(leetcode?.recentAccepted)) return [];
    const questionsBySlug = new Map(questions.map((question, index) => {
      try { return [new URL(question.link).pathname.split('/').filter(Boolean).at(-1), index]; }
      catch { return ['', index]; }
    }));
    return [...new Set(leetcode.recentAccepted.map(item => questionsBySlug.get(item.titleSlug)).filter(Number.isInteger))];
  }, [leetcode, questions]);

  useEffect(() => {
    if (!loaded || !leetcodeQuestionMatches.length) return;
    const current = progressRef.current;
    const next = [...new Set([...current.solved, ...leetcodeQuestionMatches])];
    if (next.length === current.solved.length) return;
    setSolved(next);
    persist(next, current.notes);
  }, [loaded, leetcodeQuestionMatches]);

  const toggleExpandedTopic = name => setExpandedTopics(current => {
    const next = new Set(current);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const total = questions.length;
  const completed = solved.length;
  const pct = total ? Math.round(completed / total * 100) : 0;

  const nextProblem = questions.map((q, i) => ({ q, i })).find(item => !solved.includes(item.i));

  const difficulties = ['Easy', 'Medium', 'Hard'].map(level => ({
    level, total: questions.filter(q => q.diff === level).length,
    done: questions.filter((q, i) => q.diff === level && solved.includes(i)).length
  }));

  const accuracy = completed > 0 ? Math.round((solved.filter(i => { const q = questions[i]; return q && q.important; }).length / completed) * 100) : 0;
  const bestTopic = topicStats.length > 0 ? topicStats[0] : null;

  const activeFilters = [];
  if (topic) activeFilters.push({ label: topic, clear: () => setTopic('') });
  if (difficulty) activeFilters.push({ label: difficulty, clear: () => setDifficulty('') });
  if (detailTopic) activeFilters.push({ label: `Topic: ${detailTopic}`, clear: () => setDetailTopic('') });
  if (reviewOnly) activeFilters.push({ label: 'Review queue', clear: () => setReviewOnly(false) });

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); }
    finally { localStorage.removeItem('prepflow_token'); onLogout(); }
  };

  const clearAllFilters = () => { setQuery(''); setDifficulty(''); setTopic(''); setDetailTopic(''); setReviewOnly(false); };
  const todayKey = new Date().toDateString();
  const todaySolved = new Set((leetcode?.recentAccepted || []).filter(item => item.timestamp && new Date(item.timestamp * 1000).toDateString() === todayKey).map(item => item.titleSlug)).size;

  return (
    <main className="app">
      <header>
        <Brand/>
        <div className={`sync ${saveError ? 'sync-error' : ''}`} aria-live="polite">{saving ? 'Saving changes…' : saveError ? 'Save needs attention' : 'Progress saved'}</div>
        <div className="profile">
          <i>{user.name[0].toUpperCase()}</i>
          {user.name}
          <button onClick={() => { setSettingsOpen(true); setSettingsError(''); }}>Settings</button>
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      <section className="dashboard">
        <div className="welcome">
          <p>YOUR INTERVIEW WORKSPACE</p>
          <h1>Keep moving, {user.name.split(' ')[0]}.</h1>
          <span>Small wins add up. Your preparation is already in motion.</span>
          <div className="welcome-row">
            {bestTopic && <span className="achievement"><span className="ach-icon">🏆</span> Best: {bestTopic.name}</span>}
            <span className="achievement"><span className="ach-icon">📊</span> {accuracy}% priority hit rate</span>
            <span className="achievement"><span className="ach-icon">⚡</span> One problem at a time</span>
          </div>
        </div>
        <div className="score-card">
          <div className="ring" style={{ '--progress': `${pct * 3.6}deg` }}><b>{pct}%</b></div>
          <div><strong>{completed} <small>/ {total} solved</small></strong><p>Overall completion</p></div>
        </div>
      </section>

      <section className="metrics">
        <div className="metric">
          <span>Solved</span>
          <strong>{completed}<small>/ {total}</small></strong>
          <small>{total - completed} waiting for you</small>
        </div>
        <div className="metric">
          <div className="icon">📈</div>
          <span>Best topic</span>
          <strong style={{ fontSize: '16px' }}>{bestTopic ? bestTopic.name : '—'}</strong>
          <small>{bestTopic ? `${Math.round(bestTopic.done / bestTopic.total * 100)}% complete` : 'Start a topic'}</small>
        </div>
        <div className="metric">
          <div className="icon">🎯</div>
          <span>Priority hit rate</span>
          <strong>{accuracy}%<small> {solved.filter(i => { const q = questions[i]; return q && q.important; }).length}/{completed} starred</small></strong>
          <small>Interview essentials answered</small>
        </div>
        <div className="metric">
          <div className="icon">📝</div>
          <span>Notes taken</span>
          <strong>{Object.values(notes).filter(Boolean).length}</strong>
          <small>Patterns captured for review</small>
        </div>
        <div className="metric leetcode-metric">
          <div className="icon">🔥</div>
          <span>LeetCode profile</span>
          {leetcode?.username ? <>
            <div className="lc-profile-heading">
              {leetcode.avatarUrl ? <img src={leetcode.avatarUrl} alt="" /> : <i>{(leetcode.displayName || leetcode.username)[0]?.toUpperCase()}</i>}
              <div><strong>{leetcode.displayName || leetcode.username}</strong><a href={`https://leetcode.com/u/${encodeURIComponent(leetcode.username)}/`} target="_blank" rel="noreferrer">@{leetcode.username} ↗</a></div>
            </div>
            <div className="lc-profile-totals">
              <div><strong>{leetcode.solved?.total ?? '—'}</strong><small>problems solved</small></div>
              <div><strong>{leetcode.streak ?? '—'}<small> days</small></strong><small>current streak</small></div>
            </div>
            <div className="lc-difficulty-stats">
              {[['Easy', leetcode.solved?.easy], ['Medium', leetcode.solved?.medium], ['Hard', leetcode.solved?.hard]].map(([label, value]) => <div key={label} className={label.toLowerCase()}><small>{label}</small><b>{value ?? '—'}</b></div>)}
            </div>
            <small className="leetcode-account">{leetcode.totalActiveDays == null ? 'Loading activity calendar…' : `${leetcode.totalActiveDays} active days`}{leetcode.ranking ? ` · rank #${leetcode.ranking.toLocaleString()}` : ''}</small>
            {leetcode.syncedAt && <small className={leetcode.stale ? 'leetcode-stale' : 'leetcode-account'}>{leetcode.stale ? 'LeetCode is unavailable; showing last successful sync.' : leetcode.cached ? 'Showing cached LeetCode data.' : 'Updated'} · {new Date(leetcode.syncedAt).toLocaleString()}</small>}
            <small className="lc-sync-note" role="status">{leetcode.recentAccepted == null ? 'LeetCode did not provide recent accepted submissions. Solved questions will update when a sync is available.' : `${leetcodeQuestionMatches.length} matching question${leetcodeQuestionMatches.length === 1 ? '' : 's'} auto marked from LeetCode’s ${leetcode.recentAccepted.length} recent accepted submissions. Question status is read-only.`}</small>
            {leetcodeError && <small className="leetcode-inline-error" role="alert">{leetcodeError}</small>}
            <div className="leetcode-actions"><button onClick={() => loadLeetcode(true)} disabled={leetcodeBusy}>{leetcodeBusy ? 'Syncing…' : 'Sync LeetCode'}</button><button onClick={unlinkLeetcode} disabled={leetcodeBusy}>Unlink</button></div>
          </> : <>
            <small className="leetcode-help">See your solved totals, difficulty breakdown, and current streak.</small>
            <form className="leetcode-link-form" onSubmit={linkLeetcode}>
              <input aria-label="LeetCode username or profile link" value={leetcodeInput} onChange={event => setLeetcodeInput(event.target.value)} placeholder="Username or profile link" maxLength={300} required />
              <button type="submit" disabled={leetcodeBusy}>{leetcodeBusy ? 'Linking…' : 'Link'}</button>
            </form>
            {leetcodeError && <small className="leetcode-inline-error" role="alert">{leetcodeError}</small>}
          </>}
        </div>
        <div className="metric goal-metric">
          <div className="icon">🎯</div><span>Today’s LeetCode goal</span>
          <strong>{todaySolved}<small>/ {dailyGoal}</small></strong>
          <div className="mini-progress"><i style={{ width: `${Math.min(100, todaySolved / dailyGoal * 100)}%` }} /></div>
          <small>{Math.max(0, dailyGoal - todaySolved)} to go · from recent accepted submissions</small>
        </div>
      </section>

      <section className="insights">
        <div className="panel">
          <div className="panel-title">
            <div><p>LEARNING PATHS</p><h2>Topic performance</h2></div>
            <span>{topicStats.length} topics</span>
          </div>
          <div className="topic-grid">
            {topicStats.map(item => {
              const progress = Math.round(item.done / item.total * 100);
              const colors = topicColor(item.name);
              const isActive = detailTopic === item.name;
              return (
                <button
                  className={`topic-card ${isActive ? 'active' : ''}`}
                  key={item.name}
                  style={{ '--topic-color': colors.color, '--topic-bg': colors.bg }}
                  onClick={() => {
                    setDetailTopic(detailTopic === item.name ? '' : item.name);
                    setExpandedTopics(current => new Set(current).add(item.name));
                    document.getElementById('practice')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <div className="topic-icon" style={{ background: colors.bg, color: colors.color }}>{topicIcon(item.name)}</div>
                  <div><b style={{ color: colors.color }}>{item.name}</b><span>{item.done}/{item.total}</span></div>
                  <div className="mini-progress"><i style={{ width: `${progress}%`, background: colors.gradient }} /></div>
                  <small>{progress}% complete</small>
                </button>
              );
            })}
          </div>
          {detailTopic && topicStats.find(t => t.name === detailTopic) && (() => { const dt = topicStats.find(t => t.name === detailTopic); return (
            <div className="topic-detail" style={{ '--topic-color': topicColor(dt.name).color }}>
              <div className="topic-detail-header">
                <strong style={{ color: topicColor(dt.name).color }}>{topicIcon(dt.name)} {dt.name}</strong>
                <button type="button" onClick={() => setDetailTopic('')} className="clear-topic-filter">✕ Clear filter</button>
              </div>
              <span>{dt.done} of {dt.total} solved ({Math.round(dt.done / dt.total * 100)}%)</span>
              <div className="topic-diff-list">
                <div className="topic-diff-item"><div className="td-label">Easy</div><div className="td-value" style={{ color: '#6ee7b7' }}>{dt.easyDone}/{dt.easy}</div></div>
                <div className="topic-diff-item"><div className="td-label">Medium</div><div className="td-value" style={{ color: '#fcd34d' }}>{dt.mediumDone}/{dt.medium}</div></div>
                <div className="topic-diff-item"><div className="td-label">Hard</div><div className="td-value" style={{ color: '#fda4af' }}>{dt.hardDone}/{dt.hard}</div></div>
              </div>
            </div>
          ); })()}
        </div>
        <div className="panel difficulty-panel">
          <div className="panel-title">
            <div><p>BY DIFFICULTY</p><h2>Skill balance</h2></div>
          </div>
          {difficulties.map(item => (
            <div className="difficulty-row" key={item.level}>
              <span className={item.level.toLowerCase()}>{item.level}</span>
              <div className="mini-progress"><i style={{ width: `${item.total ? item.done / item.total * 100 : 0}%` }} /></div>
              <b>{item.done}/{item.total}</b>
            </div>
          ))}
        </div>
      </section>

      {saveError && <div className="global-notice error-notice" role="alert"><span>Progress couldn’t be saved. Your changes are still on this screen.</span><button onClick={() => persist(progressRef.current.solved, progressRef.current.notes)}>Retry save</button></div>}
      {loadError && <div className="global-notice error-notice" role="alert"><span>{loadError}</span><button onClick={loadData}>Try again</button></div>}
      {!loaded && !loadError && <div className="loading-state" role="status"><span className="spinner"/> Loading your workspace…</div>}
      {loaded && <section className="practice" id="practice">
        <div className="practice-heading">
          <div><p>PROBLEM LIBRARY</p><h2>Practice queue</h2></div>
          <div className="practice-actions"><button className={reviewOnly ? 'active' : ''} onClick={() => setReviewOnly(value => !value)}>Review queue ({Object.keys(reviewDue).length})</button><span>{filtered.length} results</span></div>
        </div>
        <div className="toolbar">
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a problem…" />
          <select value={topic} onChange={event => setTopic(event.target.value)}>
            <option value="">All topics</option>
            {topicStats.map(item => <option key={item.name}>{item.name}</option>)}
          </select>
          <select value={difficulty} onChange={event => setDifficulty(event.target.value)}>
            <option value="">All difficulties</option>
            {difficulties.map(item => <option key={item.level}>{item.level}</option>)}
          </select>
        </div>
        {activeFilters.length > 0 && (
          <div className="filter-pills">
            {activeFilters.map(f => (
              <button type="button" className="filter-pill" key={f.label} onClick={f.clear} aria-label={`Remove ${f.label} filter`}>{f.label} <span className="x" aria-hidden="true">✕</span></button>
            ))}
            <button type="button" className="filter-pill" style={{ background: '#ffffff0d', color: '#8290b2' }} onClick={clearAllFilters}>Clear all</button>
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <p>No problems match your filters.</p>
          </div>
        ) : (
          <section className="topic-queue">
            {groupedQuestions.map(([groupName, items]) => {
              const expanded = expandedTopics.has(groupName);
              const doneCount = items.filter(({ index }) => solved.includes(index)).length;
              return <section className={`topic-group ${expanded ? 'expanded' : ''}`} key={groupName}>
                <button className="topic-group-heading" aria-expanded={expanded} onClick={() => toggleExpandedTopic(groupName)}>
                  <span className="topic-group-title"><span className="topic-group-icon">{topicIcon(groupName)}</span><span><b>{groupName}</b><small>{doneCount} of {items.length} complete</small></span></span>
                  <span className="topic-group-meta">{items.length} {items.length === 1 ? 'question' : 'questions'} <i>{expanded ? '−' : '+'}</i></span>
                </button>
                {expanded && <div className="list">
                  {items.map(({ question, index }) => {
                    const done = solved.includes(index);
                    const hasNote = Boolean(notes[index]);
                    return <article id={`question-${index}`} key={question.link} className={done ? 'done' : ''}>
                      <span className={`complete-indicator ${done ? 'complete' : ''}`} role="img" aria-label={done ? `${question.name} is marked solved` : `${question.name} is not marked solved`} title={done ? 'Solved on LeetCode or previously tracked' : 'Not found in the recent LeetCode sync'}>{done ? '✓' : '○'}</span>
                      <div className="question-copy"><h3>{question.name}{question.important && <sup title="Interview priority">★</sup>}</h3><p>{question.topic}</p></div>
                      <span className={question.diff.toLowerCase()}>{question.diff}</span>
                      <button className={`note-button ${hasNote ? 'has-note' : ''}`} onClick={() => { setNoteIndex(index); setNoteText(notes[index] || ''); }}>{hasNote ? '📝 Note' : '+ Note'}</button>
                      <button className={`review-button ${reviewDue[index] ? 'scheduled' : ''}`} onClick={() => toggleReview(index)}>{reviewDue[index] ? 'In review' : 'Review'}</button>
                      <a className="leetcode-btn" href={question.link} target="_blank" rel="noreferrer">LeetCode</a>
                    </article>;
                  })}
                </div>}
              </section>;
            })}
          </section>
        )}
      </section>}

      {noteIndex !== null && (
        <div className="modal-backdrop" onMouseDown={() => setNoteIndex(null)}>
          <section className="note-modal" onMouseDown={event => event.stopPropagation()}>
            <div><p>STUDY NOTE</p><h2>{questions[noteIndex]?.name}</h2></div>
            <textarea
              value={noteText}
              onChange={event => setNoteText(event.target.value)}
              placeholder="Capture the approach, pattern, complexity, or a future reminder…"
              autoFocus
            />
            <div className="char-count">{noteText.length}/5000</div>
            <div className="modal-actions">
              <button onClick={() => setNoteIndex(null)}>Cancel</button>
              <button onClick={saveNote}>Save note</button>
            </div>
          </section>
        </div>
      )}
      {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><section className="note-modal account-modal" onMouseDown={event => event.stopPropagation()}>
        <div><p>ACCOUNT</p><h2>Settings & your data</h2></div>
        <label className="settings-field">Daily LeetCode solve goal<select value={dailyGoal} onChange={event => updateDailyGoal(event.target.value)}>{[1,2,3,5,10,15,20].map(goal => <option key={goal} value={goal}>{goal} per day</option>)}</select></label>
        <p className="settings-copy">Your daily count uses accepted submissions LeetCode exposes recently. Older activity may not appear in this goal. Prepflow stores your profile and progress, never your LeetCode password or session.</p>
        <div className="settings-actions"><button onClick={exportAccount}>Download my data</button><button onClick={() => setSettingsOpen(false)}>Close</button></div>
        <div className="delete-account"><strong>Delete account</strong><p>This permanently removes your Prepflow account, notes, and saved progress.</p><input type="password" autoComplete="current-password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} placeholder="Confirm your password"/><button onClick={deleteAccount}>Delete my account</button></div>
        {settingsError && <small className="error" role="alert">{settingsError}</small>}
      </section></div>}
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    const token = localStorage.getItem('prepflow_token');
    if (!token) { setCheckingSession(false); return; }
    api('/api/auth/me').then(({ user }) => { localStorage.removeItem('prepflow_token'); setUser(user); }).catch(() => localStorage.removeItem('prepflow_token')).finally(() => setCheckingSession(false));
  }, []);
  if (checkingSession) return <div className="loading-state full-screen" role="status"><span className="spinner"/> Restoring your session…</div>;
  return user ? <Tracker user={user} onLogout={() => { localStorage.removeItem('prepflow_token'); setUser(null); }} /> : <Auth onAuth={setUser} />;
}
createRoot(document.getElementById('root')).render(<App/>);
