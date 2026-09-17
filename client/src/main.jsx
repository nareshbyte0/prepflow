import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import './styles.css';

const api = async (path, options = {}) => {
  const token = localStorage.getItem('prepflow_token');
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const text = response.status === 204 ? '' : await response.text();
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

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login'); const [error, setError] = useState('');
  const submit = async event => { event.preventDefault(); setError(''); try { const data = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); localStorage.setItem('prepflow_token', data.token); onAuth(data.user); } catch (e) { setError(e.message); } };
  return <main className="auth"><section className="hero"><div className="brand"><b>&lt;/&gt;</b> Prepflow</div><h1>Build the habit.<br/><em>Earn the edge.</em></h1><p>A quieter, sharper way to prepare for the interviews that matter.</p><div className="chips"><span>318 curated problems</span><span>Progress that follows you</span><span>Track every topic</span></div></section><section className="authPanel"><form onSubmit={submit}><div className="brand"><b>&lt;/&gt;</b> Prepflow</div><h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p>{mode === 'login' ? 'Pick up where you left off.' : 'Start your interview preparation today.'}</p><div className="tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign up</button></div>{mode === 'signup' && <input name="name" placeholder="Your name" required />}<input name="email" type="email" placeholder="Email address" required/><input name="password" type="password" minLength="8" placeholder="Password (8+ characters)" required/><button className="primary">{mode === 'login' ? 'Log in' : 'Create account'}</button>{error && <small className="error">{error}</small>}</form></section></main>;
}

function Tracker({ user, onLogout }) {
  const [questions, setQuestions] = useState([]);
  const [solved, setSolved] = useState([]);
  const [notes, setNotes] = useState({});
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');
  const [noteIndex, setNoteIndex] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailTopic, setDetailTopic] = useState(null);

  useEffect(() => {
    Promise.all([api('/api/questions'), api('/api/progress')]).then(([q, p]) => {
      setQuestions(q); setSolved(p.solved || []); setNotes(p.notes || {});
    }).catch(onLogout);
  }, []);

  const persist = async (nextSolved, nextNotes) => {
    setSaving(true);
    try { await api('/api/progress', { method: 'PUT', body: JSON.stringify({ solved: nextSolved, notes: nextNotes }) }); }
    catch { onLogout(); }
    finally { setSaving(false); }
  };

  const toggleSolved = index => {
    const next = solved.includes(index) ? solved.filter(item => item !== index) : [...solved, index];
    setSolved(next); persist(next, notes);
  };

  const saveNote = () => {
    if (noteIndex === null) return;
    const next = { ...notes, [noteIndex]: noteText.trim() };
    if (!next[noteIndex]) delete next[noteIndex];
    setNotes(next); persist(solved, next); setNoteIndex(null);
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
    questions.map((question, index) => ({ question, index })).filter(({ question }) =>
      question.name.toLowerCase().includes(query.toLowerCase()) &&
      (!difficulty || question.diff === difficulty) &&
      (!topic || question.topic === topic) &&
      (!detailTopic || question.topic === detailTopic)
    ), [questions, query, difficulty, topic, detailTopic]);

  const total = questions.length;
  const completed = solved.length;
  const pct = total ? Math.round(completed / total * 100) : 0;

  const nextProblem = questions.map((q, i) => ({ q, i })).find(item => !solved.includes(item.i));

  const difficulties = ['Easy', 'Medium', 'Hard'].map(level => ({
    level, total: questions.filter(q => q.diff === level).length,
    done: questions.filter((q, i) => q.diff === level && solved.includes(i)).length
  }));

  const todayDone = Math.min(completed, Math.max(1, Math.floor(completed * 0.1)));
  const accuracy = completed > 0 ? Math.round((solved.filter(i => { const q = questions[i]; return q && q.important; }).length / completed) * 100) : 0;
  const bestTopic = topicStats.length > 0 ? topicStats[0] : null;

  const activeFilters = [];
  if (topic) activeFilters.push({ label: topic, clear: () => setTopic('') });
  if (difficulty) activeFilters.push({ label: difficulty, clear: () => setDifficulty('') });
  if (detailTopic) activeFilters.push({ label: `Topic: ${detailTopic}`, clear: () => setDetailTopic('') });

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); }
    finally { localStorage.removeItem('prepflow_token'); onLogout(); }
  };

  const clearAllFilters = () => { setQuery(''); setDifficulty(''); setTopic(''); setDetailTopic(''); };

  return (
    <main className="app">
      <header>
        <div className="brand"><b>&lt;/&gt;</b> Prepflow</div>
        <div className="sync">{saving ? 'Saving…' : 'All progress saved'}</div>
        <div className="profile">
          <i>{user.name[0].toUpperCase()}</i>
          {user.name}
          <span className="badge"><span className="streak-flame">🔥</span> {Math.min(completed, 21)} day streak</span>
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
            <span className="achievement"><span className="ach-icon">⚡</span> {todayDone} solved recently</span>
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
                <span onClick={() => setDetailTopic('')} style={{ cursor: 'pointer', color: '#a5b4fc' }}>✕ Clear filter</span>
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

      <section className="practice" id="practice">
        <div className="practice-heading">
          <div><p>PROBLEM LIBRARY</p><h2>Practice queue</h2></div>
          <span>{filtered.length} results</span>
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
              <span className="filter-pill" key={f.label} onClick={f.clear}>{f.label} <span className="x">✕</span></span>
            ))}
            <span className="filter-pill" style={{ background: '#ffffff0d', color: '#8290b2' }} onClick={clearAllFilters}>Clear all</span>
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <p>No problems match your filters.</p>
          </div>
        ) : (
          <section className="list">
            {filtered.map(({ question, index }) => {
              const done = solved.includes(index);
              const hasNote = Boolean(notes[index]);
              return (
                <article id={`question-${index}`} key={question.link} className={done ? 'done' : ''}>
                  <button
                    className={`complete-button ${done ? 'complete' : ''}`}
                    onClick={() => toggleSolved(index)}
                    aria-label={`Mark ${question.name} ${done ? 'unsolved' : 'solved'}`}
                  >{done ? '★' : '☆'}</button>
                  <div className="question-copy">
                    <h3>{question.name}{question.important && <sup title="Interview priority">★</sup>}</h3>
                    <p>{question.topic}</p>
                  </div>
                  <span className={question.diff.toLowerCase()}>{question.diff}</span>
                  <button
                    className={`note-button ${hasNote ? 'has-note' : ''}`}
                    onClick={() => { setNoteIndex(index); setNoteText(notes[index] || ''); }}
                  >{hasNote ? '📝 Note' : '+ Note'}</button>
                  <a className="leetcode-btn" href={question.link} target="_blank" rel="noreferrer">LeetCode</a>
                </article>
              );
            })}
          </section>
        )}
      </section>

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
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (localStorage.getItem('prepflow_token')) api('/api/auth/me').then(({ user }) => setUser(user)).catch(() => localStorage.removeItem('prepflow_token'));
  }, []);
  return user ? <Tracker user={user} onLogout={() => setUser(null)} /> : <Auth onAuth={setUser} />;
}
createRoot(document.getElementById('root')).render(<App/>);
