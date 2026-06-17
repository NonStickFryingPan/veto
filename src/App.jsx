import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  FileDown,
  ListChecks,
  LogOut,
  Plus,
  Play,
  Save,
  Search,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { exportResultsPdf } from "./pdf.js";
import {
  hasRemoteStore,
  loadRemoteState,
  persistRemoteState,
  subscribeRemoteState,
} from "./remoteStore.js";
import {
  SCORE_LEVELS,
  completeJudge,
  computeResults,
  createBlankCriterion,
  createId,
  createSession,
  findSessionBundle,
  getScoreLabel,
  getUserSessions,
  joinSession,
  readCurrentUser,
  readState,
  startSession,
  updateScore,
  upsertUser,
  writeCurrentUser,
  writeState,
} from "./store.js";

const BLOCKS = ["lime", "lilac", "cream", "mint", "pink", "coral"];

function usePersistentState() {
  const [state, setState] = useState(readState);

  const replaceState = (nextState) => {
    writeState(nextState);
    setState(nextState);
    return nextState;
  };

  const commit = (updater) => {
    setState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      writeState(next);
      if (hasRemoteStore) {
        persistRemoteState(next, current).catch((error) => {
          console.error(error);
        });
      }
      return next;
    });
  };

  useEffect(() => {
    let alive = true;

    if (hasRemoteStore) {
      loadRemoteState()
        .then((remoteState) => {
          if (!alive || !remoteState) return;
          replaceState(remoteState);
        })
        .catch((error) => {
          console.error(error);
        });

      const unsubscribe = subscribeRemoteState((remoteState) => {
        if (!alive || !remoteState) return;
        replaceState(remoteState);
      });

      return () => {
        alive = false;
        unsubscribe();
      };
    }

    const sync = () => setState(readState());
    window.addEventListener("storage", sync);
    return () => {
      alive = false;
      window.removeEventListener("storage", sync);
    };
  }, []);

  const refresh = async () => {
    if (!hasRemoteStore) return readState();
    const remoteState = await loadRemoteState();
    if (!remoteState) return readState();
    return replaceState(remoteState);
  };

  return [state, commit, refresh];
}

function App() {
  const [state, commit, refreshState] = usePersistentState();
  const [currentUser, setCurrentUser] = useState(readCurrentUser);

  useEffect(() => {
    if (!currentUser) return;
    const exists = state.users.some((user) => user.id === currentUser.id);
    if (exists) return;
    commit((current) => ({ ...current, users: [...current.users, currentUser] }));
  }, [currentUser?.id, state.users]);

  function handleLogin(name) {
    const result = upsertUser(state, name);
    commit(result.state);
    writeCurrentUser(result.user);
    setCurrentUser(result.user);
  }

  function handleLogout() {
    writeCurrentUser(null);
    setCurrentUser(null);
  }

  return (
    <Routes>
      <Route path="/" element={<LoginPage onLogin={handleLogin} user={currentUser} />} />
      <Route
        path="/home"
        element={
          <RequireUser user={currentUser}>
            <HomePage
              state={state}
              commit={commit}
              refreshState={refreshState}
              user={currentUser}
              onLogout={handleLogout}
            />
          </RequireUser>
        }
      />
      <Route
        path="/sessions/new"
        element={
          <RequireUser user={currentUser}>
            <NewSessionPage state={state} commit={commit} user={currentUser} />
          </RequireUser>
        }
      />
      <Route
        path="/sessions/:sessionId"
        element={
          <RequireUser user={currentUser}>
            <SessionLobbyPage state={state} commit={commit} user={currentUser} />
          </RequireUser>
        }
      />
      <Route
        path="/sessions/:sessionId/score"
        element={
          <RequireUser user={currentUser}>
            <ScoringFlowPage state={state} commit={commit} user={currentUser} />
          </RequireUser>
        }
      />
      <Route
        path="/sessions/:sessionId/results"
        element={
          <RequireUser user={currentUser}>
            <ResultsPage state={state} user={currentUser} />
          </RequireUser>
        }
      />
      <Route
        path="/templates"
        element={
          <RequireUser user={currentUser}>
            <TemplatesPage state={state} commit={commit} user={currentUser} />
          </RequireUser>
        }
      />
      <Route path="*" element={<Navigate to={currentUser ? "/home" : "/"} replace />} />
    </Routes>
  );
}

function RequireUser({ user, children }) {
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function LoginPage({ onLogin, user }) {
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [error, setError] = useState("");

  if (user) return <Navigate to="/home" replace />;

  function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    onLogin(name);
    navigate("/home");
  }

  return (
    <main className="login-screen">
      <section className="login-panel block-lime">
        <p className="eyebrow">Veto</p>
        <h1>Score one criterion at a time.</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ayesha Khan"
            autoComplete="name"
          />
          {error && <p className="form-error">{error}</p>}
          <button className="button button-primary" type="submit">
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}

function AppShell({ user, title, kicker, children, actions, onLogout, backTo }) {
  const location = useLocation();
  const activeSection = location.pathname.startsWith("/templates") ? "templates" : "home";

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="nav-left">
          {backTo ? (
            <Link className="icon-button" to={backTo} aria-label="Back">
              <ArrowLeft size={18} />
            </Link>
          ) : (
            <Link className="wordmark" to="/home">
              Veto
            </Link>
          )}
          <nav className="nav-links" aria-label="Primary">
            <Link className={activeSection === "home" ? "active" : undefined} to="/home">
              Home
            </Link>
            <Link className={activeSection === "templates" ? "active" : undefined} to="/templates">
              Templates
            </Link>
          </nav>
        </div>
        <div className="nav-actions">
          {actions}
          <span className="user-chip">{user.name}</span>
          {onLogout && (
            <button className="icon-button" type="button" onClick={onLogout} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>
      {(title || kicker) && (
        <section className="page-heading">
          {kicker && <p className="eyebrow">{kicker}</p>}
          {title && <h1>{title}</h1>}
        </section>
      )}
      <main className="page-content">{children}</main>
    </div>
  );
}

function HomePage({ state, commit, refreshState, user, onLogout }) {
  const [tab, setTab] = useState("active");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const navigate = useNavigate();
  const sessions = getUserSessions(state, user.id);
  const activeSessions = sessions.filter((session) => session.status !== "complete");
  const historySessions = sessions.filter((session) => session.status === "complete");
  const visibleSessions = tab === "active" ? activeSessions : historySessions;

  async function handleJoin(event) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    let session = state.sessions.find((item) => item.code === code);

    if (!session && hasRemoteStore) {
      try {
        const refreshedState = await refreshState();
        session = refreshedState.sessions.find((item) => item.code === code);
      } catch (error) {
        console.error(error);
      }
    }

    if (!session) {
      setJoinError("No session found for that code.");
      return;
    }

    if (session.status === "complete") {
      setJoinError("That session is already complete.");
      return;
    }

    commit((current) => joinSession(current, session.id, user.id));
    navigate(`/sessions/${session.id}`);
  }

  return (
    <AppShell
      user={user}
      title="Live scoring sessions"
      kicker="Dashboard"
      onLogout={onLogout}
      actions={
        <Link className="button button-primary nav-cta" to="/sessions/new">
          <Plus size={18} />
          Create
        </Link>
      }
    >
      <section className="dashboard-grid">
        <div className="color-block block-lilac join-block">
          <div>
            <p className="eyebrow">Join code</p>
            <h2>Enter the room.</h2>
          </div>
          <form className="join-form" onSubmit={handleJoin}>
            <input
              value={joinCode}
              onChange={(event) => {
                setJoinCode(event.target.value);
                setJoinError("");
              }}
              placeholder="T3DZ42"
              aria-label="Join code"
            />
            <button className="button button-primary" type="submit">
              <Search size={18} />
              Join
            </button>
          </form>
          {joinError && <p className="form-error">{joinError}</p>}
        </div>

        <div className="session-panel">
          <div className="tabs" role="tablist" aria-label="Session list">
            <button
              className={tab === "active" ? "tab selected" : "tab"}
              type="button"
              onClick={() => setTab("active")}
            >
              Active
            </button>
            <button
              className={tab === "history" ? "tab selected" : "tab"}
              type="button"
              onClick={() => setTab("history")}
            >
              History
            </button>
          </div>
          {visibleSessions.length ? (
            <div className="session-list">
              {visibleSessions.map((session, index) => (
                <SessionCard
                  key={session.id}
                  state={state}
                  session={session}
                  block={BLOCKS[index % BLOCKS.length]}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={tab === "active" ? "No active sessions" : "No completed sessions"}
              action={
                tab === "active" && (
                  <Link className="button button-primary" to="/sessions/new">
                    <Plus size={18} />
                    Create session
                  </Link>
                )
              }
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}

function SessionCard({ state, session, block }) {
  const bundle = findSessionBundle(state, session.id);
  const results = bundle ? computeResults(bundle) : null;
  const href =
    session.status === "complete"
      ? `/sessions/${session.id}/results`
      : session.status === "scoring"
        ? `/sessions/${session.id}/score`
        : `/sessions/${session.id}`;

  return (
    <Link className={`session-card block-${block}`} to={href}>
      <div>
        <p className="eyebrow">{session.status}</p>
        <h3>{session.title}</h3>
        <p>{[session.phase, session.cohort].filter(Boolean).join(" / ") || "No phase"}</p>
      </div>
      <div className="session-meta">
        <span>
          <Users size={16} />
          {bundle?.judges.length || 0}
        </span>
        <span>
          <Check size={16} />
          {results?.completionCount || 0}/{results?.totalJudges || 0}
        </span>
      </div>
    </Link>
  );
}

function NewSessionPage({ state, commit, user }) {
  const navigate = useNavigate();
  const defaultTemplate = state.templates.find((template) => template.isDefault) || state.templates[0];
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState("");
  const [cohort, setCohort] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplate?.id || "scratch");
  const [criteria, setCriteria] = useState(() => templateToDraft(defaultTemplate));
  const [error, setError] = useState("");

  function selectTemplate(templateId) {
    setSelectedTemplateId(templateId);
    const template = state.templates.find((item) => item.id === templateId);
    setCriteria(templateId === "scratch" ? [createBlankCriterion()] : templateToDraft(template));
  }

  function updateCriterion(id, field, value) {
    setCriteria((items) =>
      items.map((criterion) => (criterion.id === id ? { ...criterion, [field]: value } : criterion))
    );
  }

  function addCriterion() {
    setCriteria((items) => [...items, createBlankCriterion(true)]);
  }

  function removeCriterion(id) {
    setCriteria((items) => items.filter((criterion) => criterion.id !== id));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const hasCriteria = criteria.some((criterion) => criterion.name.trim());
    if (!title.trim() || !hasCriteria) {
      setError("Title and at least one criterion are required.");
      return;
    }

    const result = createSession(state, { title, phase, cohort, criteria }, user.id);
    commit(result.state);
    navigate(`/sessions/${result.session.id}`);
  }

  return (
    <AppShell user={user} title="Create session" kicker="Organizer" backTo="/home">
      <form className="split-layout" onSubmit={handleSubmit}>
        <section className="form-panel">
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Team 3 Design Freeze" />
          </label>
          <div className="two-column">
            <label>
              Phase
              <input value={phase} onChange={(event) => setPhase(event.target.value)} placeholder="Phase 3" />
            </label>
            <label>
              Cohort
              <input value={cohort} onChange={(event) => setCohort(event.target.value)} placeholder="Batch 2026" />
            </label>
          </div>
          <div className="button-row">
            <button className="button button-primary" type="submit">
              <Save size={18} />
              Create
            </button>
            <Link className="button button-secondary" to="/home">
              Cancel
            </Link>
          </div>
          {error && <p className="form-error">{error}</p>}
        </section>

        <section className="builder-panel">
          <div className="section-title">
            <p className="eyebrow">Template</p>
            <h2>Rubric criteria</h2>
          </div>
          <div className="template-picker">
            {state.templates.map((template) => (
              <button
                className={selectedTemplateId === template.id ? "template-option selected" : "template-option"}
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template.id)}
              >
                <span>{template.name}</span>
                <small>{template.criteria.length} criteria</small>
              </button>
            ))}
            <button
              className={selectedTemplateId === "scratch" ? "template-option selected" : "template-option"}
              type="button"
              onClick={() => selectTemplate("scratch")}
            >
              <span>Scratch</span>
              <small>Custom build</small>
            </button>
          </div>

          <div className="criteria-editor">
            {criteria.map((criterion, index) => (
              <div className="criterion-editor" key={criterion.id}>
                <div className="criterion-index">{index + 1}</div>
                <div className="criterion-fields">
                  <input
                    value={criterion.name}
                    onChange={(event) => updateCriterion(criterion.id, "name", event.target.value)}
                    placeholder="Criterion name"
                  />
                  <textarea
                    value={criterion.description}
                    onChange={(event) => updateCriterion(criterion.id, "description", event.target.value)}
                    placeholder="One-line descriptor"
                  />
                </div>
                <button className="icon-button soft" type="button" onClick={() => removeCriterion(criterion.id)} aria-label="Remove criterion">
                  ×
                </button>
              </div>
            ))}
          </div>
          <button className="button button-secondary" type="button" onClick={addCriterion}>
            <Plus size={18} />
            Add criterion
          </button>
        </section>
      </form>
    </AppShell>
  );
}

function templateToDraft(template) {
  if (!template) return [createBlankCriterion()];
  return template.criteria.map((criterion) => ({
    id: createId("draft"),
    name: criterion.name,
    description: criterion.description,
    isSessionSpecific: false,
  }));
}

function SessionLobbyPage({ state, commit, user }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const bundle = findSessionBundle(state, sessionId);
  const session = bundle?.session;
  const judges = bundle?.judges || [];
  const isCreator = session?.createdBy === user.id;
  const currentJudge = judges.find((judge) => judge.userId === user.id);

  useEffect(() => {
    if (session?.status === "scoring" && currentJudge) {
      navigate(`/sessions/${session.id}/score`);
    }
  }, [currentJudge, navigate, session?.id, session?.status]);

  if (!bundle) return <Navigate to="/home" replace />;

  function handleJoin() {
    commit((current) => joinSession(current, session.id, user.id));
  }

  function handleStart() {
    commit((current) => startSession(current, session.id));
    navigate(`/sessions/${session.id}/score`);
  }

  return (
    <AppShell user={user} title={session.title} kicker="Lobby" backTo="/home">
      <section className="lobby-layout">
        <div className="color-block block-cream lobby-code">
          <div>
            <p className="eyebrow">Join code</p>
            <div className="join-code">{session.code}</div>
          </div>
          <p className="join-code-note">Share this code with judges to bring them into the session.</p>
        </div>

        <div className="lobby-main">
          <div className="status-strip">
            <span>{session.status}</span>
            <span>
              {judges.length} {judges.length === 1 ? "judge" : "judges"}
            </span>
            <span>{bundle.criteria.length} criteria</span>
          </div>
          <JudgeList judges={judges} />

          {!currentJudge && session.status === "open" && (
            <button className="button button-primary" type="button" onClick={handleJoin}>
              <Plus size={18} />
              Join session
            </button>
          )}

          {session.status === "open" && isCreator && (
            <button className="button button-primary" type="button" onClick={handleStart}>
              <Play size={18} />
              Start scoring
            </button>
          )}

          {session.status === "scoring" && currentJudge && (
            <Link className="button button-primary" to={`/sessions/${session.id}/score`}>
              <ListChecks size={18} />
              Score
            </Link>
          )}

          {session.status === "complete" && (
            <Link className="button button-primary" to={`/sessions/${session.id}/results`}>
              <BarChart3 size={18} />
              Results
            </Link>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function JudgeList({ judges }) {
  return (
    <section className="judge-list">
      <div className="section-title horizontal">
        <p className="eyebrow">Judges</p>
        <Users size={20} />
      </div>
      {judges.length ? (
        judges.map((judge) => (
          <div className="judge-row" key={judge.id}>
            <span>{judge.user?.name || "Unknown judge"}</span>
            <span className={judge.completedAt ? "badge done" : "badge"}>{judge.completedAt ? "Done" : "Joined"}</span>
          </div>
        ))
      ) : (
        <p className="muted">No judges yet.</p>
      )}
    </section>
  );
}

function ScoringFlowPage({ state, commit, user }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const bundle = findSessionBundle(state, sessionId);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!bundle) return;
    const isJoined = bundle.judges.some((judge) => judge.userId === user.id);
    if (!isJoined && bundle.session.status !== "complete") {
      commit((current) => joinSession(current, bundle.session.id, user.id));
    }
  }, [bundle?.session.id, commit, user.id]);

  useEffect(() => {
    if (!bundle) return;
    const scoreMap = new Map(
      bundle.scores
        .filter((score) => score.userId === user.id)
        .map((score) => [score.criterionId, score.score])
    );
    const firstMissing = bundle.criteria.findIndex((criterion) => !scoreMap.has(criterion.id));
    setStep(firstMissing === -1 ? bundle.criteria.length : firstMissing);
  }, [bundle?.session.id]);

  if (!bundle) return <Navigate to="/home" replace />;

  const { session, criteria, scores } = bundle;
  const scoreMap = new Map(
    scores.filter((score) => score.userId === user.id).map((score) => [score.criterionId, score.score])
  );
  const isReview = step >= criteria.length;
  const currentCriterion = criteria[step];
  const selected = currentCriterion ? scoreMap.get(currentCriterion.id) : null;
  const progress = criteria.length ? Math.min(step + 1, criteria.length) / criteria.length : 0;

  function handleScore(score) {
    if (!currentCriterion) return;
    commit((current) => updateScore(current, session.id, currentCriterion.id, user.id, score));
    navigator.vibrate?.(30);
  }

  function handleNext() {
    if (step < criteria.length - 1) {
      setStep(step + 1);
      return;
    }
    setStep(criteria.length);
  }

  function handleSubmit() {
    commit((current) => completeJudge(current, session.id, user.id));
    navigate(`/sessions/${session.id}/results`);
  }

  return (
    <main className="score-screen">
      <div className="score-topbar">
        <Link className="icon-button" to={`/sessions/${session.id}`} aria-label="Back to lobby">
          <ArrowLeft size={18} />
        </Link>
        <div className="score-progress" aria-label="Progress">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="score-count">
          {isReview ? criteria.length : step + 1}/{criteria.length}
        </span>
      </div>

      {!isReview ? (
        <section className="criterion-card">
          <div className="criterion-copy">
            <p className="eyebrow">{session.title}</p>
            <h1>{currentCriterion.name}</h1>
            <p>{currentCriterion.description}</p>
          </div>

          <div className="score-options">
            {SCORE_LEVELS.map((level) => (
              <button
                className={selected === level.value ? "score-option selected" : "score-option"}
                key={level.value}
                type="button"
                onClick={() => handleScore(level.value)}
                aria-pressed={selected === level.value}
              >
                <span className="score-number">{level.value}</span>
                <span>
                  <strong>{level.label}</strong>
                  <small>{level.descriptor}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="score-actions">
            <button className="button button-secondary" type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
              Back
            </button>
            <button className="button button-primary" type="button" onClick={handleNext} disabled={!selected}>
              Next
            </button>
          </div>
        </section>
      ) : (
        <section className="review-panel">
          <p className="eyebrow">Review</p>
          <h1>Submit scores</h1>
          <div className="review-list">
            {criteria.map((criterion, index) => (
              <button className="review-row" type="button" key={criterion.id} onClick={() => setStep(index)}>
                <span>{criterion.name}</span>
                <strong>{getScoreLabel(scoreMap.get(criterion.id))}</strong>
              </button>
            ))}
          </div>
          <button className="button button-primary" type="button" onClick={handleSubmit}>
            <Check size={18} />
            Submit
          </button>
        </section>
      )}
    </main>
  );
}

function ResultsPage({ state, user }) {
  const { sessionId } = useParams();
  const bundle = findSessionBundle(state, sessionId);
  const [exporting, setExporting] = useState(false);

  if (!bundle) return <Navigate to="/home" replace />;

  const { session, criteria, judges, scores } = bundle;
  const results = computeResults(bundle);
  const scoreLookup = new Map(
    scores.map((score) => [`${score.userId}:${score.criterionId}`, score.score])
  );

  async function handleExport() {
    setExporting(true);
    await exportResultsPdf("results-capture", session.title);
    setExporting(false);
  }

  return (
    <AppShell
      user={user}
      title={session.title}
      kicker="Results"
      backTo="/home"
      actions={
        <button className="button button-primary nav-cta" type="button" onClick={handleExport} disabled={exporting}>
          <FileDown size={18} />
          {exporting ? "Exporting" : "PDF"}
        </button>
      }
    >
      <section className="results-stack" id="results-capture">
        <div className="grade-banner block-navy">
          <div>
            <p className="eyebrow">Grade band</p>
            <h2>{results.band}</h2>
          </div>
          <div className="average-score">
            {results.overallAverage ? results.overallAverage.toFixed(2) : "-"}
          </div>
        </div>

        <div className="metric-grid">
          <Metric icon={<Trophy size={20} />} label="Average" value={results.overallAverage ? results.overallAverage.toFixed(2) : "-"} />
          <Metric icon={<Users size={20} />} label="Completion" value={`${results.completionCount}/${results.totalJudges}`} />
          <Metric icon={<ListChecks size={20} />} label="Criteria" value={criteria.length} />
        </div>

        <section className="chart-panel">
          <div className="section-title horizontal">
            <div>
              <p className="eyebrow">Distribution</p>
              <h2>Score spread</h2>
            </div>
            <BarChart3 size={22} />
          </div>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={results.criterionRows} margin={{ top: 8, right: 8, bottom: 24, left: -20 }}>
                <CartesianGrid vertical={false} stroke="#e6e6e6" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-12} textAnchor="end" height={72} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="score1" stackId="scores" fill="#efd4d4" name="1" />
                <Bar dataKey="score2" stackId="scores" fill="#f3c9b6" name="2" />
                <Bar dataKey="score3" stackId="scores" fill="#dceeb1" name="3" />
                <Bar dataKey="score4" stackId="scores" fill="#c5b0f4" name="4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="table-panel">
          <div className="section-title">
            <p className="eyebrow">Breakdown</p>
            <h2>Judge scores</h2>
          </div>
          <div className="score-table-wrap">
            <table className="score-table">
              <thead>
                <tr>
                  <th>Judge</th>
                  {criteria.map((criterion) => (
                    <th key={criterion.id}>{criterion.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {judges.map((judge) => (
                  <tr key={judge.id}>
                    <td>{judge.user?.name || "Unknown judge"}</td>
                    {criteria.map((criterion) => {
                      const value = scoreLookup.get(`${judge.userId}:${criterion.id}`);
                      return (
                        <td key={criterion.id}>
                          <span className={`score-pill score-${value || "empty"}`}>{value || "-"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function TemplatesPage({ state, commit, user }) {
  const firstTemplate = state.templates[0];
  const [selectedId, setSelectedId] = useState(firstTemplate?.id);
  const selectedTemplate = state.templates.find((template) => template.id === selectedId) || firstTemplate;
  const [draft, setDraft] = useState(selectedTemplate);

  useEffect(() => {
    setDraft(selectedTemplate);
  }, [selectedTemplate?.id]);

  if (!draft) {
    return (
      <AppShell user={user} title="Templates" kicker="Rubrics" backTo="/home">
        <EmptyState title="No templates" action={<button className="button button-primary">Create</button>} />
      </AppShell>
    );
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateCriterion(id, field, value) {
    setDraft((current) => ({
      ...current,
      criteria: current.criteria.map((criterion) =>
        criterion.id === id ? { ...criterion, [field]: value } : criterion
      ),
    }));
  }

  function addCriterion() {
    setDraft((current) => ({
      ...current,
      criteria: [...current.criteria, { ...createBlankCriterion(), id: createId("template-criterion") }],
    }));
  }

  function moveCriterion(id, direction) {
    setDraft((current) => {
      const index = current.criteria.findIndex((criterion) => criterion.id === id);
      const target = index + direction;
      if (target < 0 || target >= current.criteria.length) return current;
      const next = [...current.criteria];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, criteria: next };
    });
  }

  function saveTemplate() {
    commit((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === draft.id ? draft : { ...template, isDefault: draft.isDefault ? false : template.isDefault }
      ),
    }));
  }

  function createTemplate() {
    const template = {
      id: createId("template"),
      name: "New template",
      isDefault: false,
      createdAt: new Date().toISOString(),
      criteria: [createBlankCriterion()],
    };
    commit((current) => ({ ...current, templates: [...current.templates, template] }));
    setSelectedId(template.id);
  }

  function duplicateTemplate() {
    const template = {
      ...draft,
      id: createId("template"),
      name: `${draft.name} Copy`,
      isDefault: false,
      criteria: draft.criteria.map((criterion) => ({ ...criterion, id: createId("template-criterion") })),
    };
    commit((current) => ({ ...current, templates: [...current.templates, template] }));
    setSelectedId(template.id);
  }

  function deleteTemplate() {
    if (state.templates.length === 1) return;
    const remaining = state.templates.filter((template) => template.id !== draft.id);
    commit((current) => ({ ...current, templates: remaining }));
    setSelectedId(remaining[0]?.id);
  }

  return (
    <AppShell user={user} title="Templates" kicker="Rubrics" backTo="/home">
      <section className="templates-layout">
        <aside className="template-sidebar">
          <button className="button button-primary full" type="button" onClick={createTemplate}>
            <Plus size={18} />
            New
          </button>
          {state.templates.map((template) => (
            <button
              key={template.id}
              className={template.id === draft.id ? "template-list-item selected" : "template-list-item"}
              type="button"
              onClick={() => setSelectedId(template.id)}
            >
              <span>{template.name}</span>
              {template.isDefault && <small>Default</small>}
            </button>
          ))}
        </aside>

        <section className="template-workspace">
          <div className="form-panel">
            <label>
              Template name
              <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(draft.isDefault)}
                onChange={(event) => updateDraft("isDefault", event.target.checked)}
              />
              Default template
            </label>
            <div className="button-row">
              <button className="button button-primary" type="button" onClick={saveTemplate}>
                <Save size={18} />
                Save
              </button>
              <button className="button button-secondary" type="button" onClick={duplicateTemplate}>
                Duplicate
              </button>
              <button className="button button-secondary" type="button" onClick={deleteTemplate}>
                Delete
              </button>
            </div>
          </div>

          <div className="criteria-editor">
            {draft.criteria.map((criterion) => (
              <div className="criterion-editor" key={criterion.id}>
                <div className="criterion-move">
                  <button className="icon-button soft" type="button" onClick={() => moveCriterion(criterion.id, -1)} aria-label="Move up">
                    <ChevronUp size={16} />
                  </button>
                  <button className="icon-button soft" type="button" onClick={() => moveCriterion(criterion.id, 1)} aria-label="Move down">
                    <ChevronDown size={16} />
                  </button>
                </div>
                <div className="criterion-fields">
                  <input
                    value={criterion.name}
                    onChange={(event) => updateCriterion(criterion.id, "name", event.target.value)}
                    placeholder="Criterion name"
                  />
                  <textarea
                    value={criterion.description}
                    onChange={(event) => updateCriterion(criterion.id, "description", event.target.value)}
                    placeholder="Descriptor"
                  />
                </div>
              </div>
            ))}
          </div>
          <button className="button button-secondary" type="button" onClick={addCriterion}>
            <Plus size={18} />
            Add criterion
          </button>
        </section>
      </section>
    </AppShell>
  );
}

function EmptyState({ title, action }) {
  return (
    <div className="empty-state">
      <Sparkles size={22} />
      <h3>{title}</h3>
      {action}
    </div>
  );
}

export default App;
