export const SCORE_LEVELS = [
  {
    value: 1,
    label: "Needs development",
    shortLabel: "Needs",
    descriptor: "Important gaps remain before this is ready.",
  },
  {
    value: 2,
    label: "Developing",
    shortLabel: "Developing",
    descriptor: "Promising direction with uneven execution.",
  },
  {
    value: 3,
    label: "Proficient",
    shortLabel: "Proficient",
    descriptor: "Meets the bar with clear supporting evidence.",
  },
  {
    value: 4,
    label: "Exemplary",
    shortLabel: "Exemplary",
    descriptor: "Strong, polished, and ready to stand behind.",
  },
];

const STORAGE_KEY = "veto-state-v2";
const USER_KEY = "veto-user-v2";

export const starterTemplates = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Standard Phase Gate",
    isDefault: true,
    createdAt: new Date().toISOString(),
    criteria: [
      {
        id: "11111111-1111-4111-8111-111111111112",
        name: "Execution quality",
        description: "Craft, completeness, and care in the finished work.",
      },
      {
        id: "11111111-1111-4111-8111-111111111113",
        name: "Evidence and insight",
        description: "Decision-making is grounded in research, testing, or data.",
      },
      {
        id: "11111111-1111-4111-8111-111111111114",
        name: "Strategic clarity",
        description: "The work connects clearly to the brief and next milestone.",
      },
      {
        id: "11111111-1111-4111-8111-111111111115",
        name: "Collaboration",
        description: "The team shows alignment, ownership, and responsive iteration.",
      },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Design Review",
    isDefault: false,
    createdAt: new Date().toISOString(),
    criteria: [
      {
        id: "22222222-2222-4222-8222-222222222223",
        name: "Problem fit",
        description: "The proposed solution addresses a meaningful user need.",
      },
      {
        id: "22222222-2222-4222-8222-222222222224",
        name: "Prototype quality",
        description: "The prototype is legible, testable, and realistic enough to judge.",
      },
      {
        id: "22222222-2222-4222-8222-222222222225",
        name: "User feedback",
        description: "The team learned from users and reflected that learning in the work.",
      },
      {
        id: "22222222-2222-4222-8222-222222222226",
        name: "Systems thinking",
        description: "The work considers edge cases, reuse, and longer-term maintainability.",
      },
    ],
  },
];

const emptyState = {
  users: [],
  templates: starterTemplates,
  sessions: [],
  criteria: [],
  judges: [],
  scores: [],
};

export function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (
      Number(char) ^
      (Math.random() * 16) >>
        (Number(char) / 4)
    ).toString(16)
  );
}

export function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      writeState(emptyState);
      return structuredClone(emptyState);
    }

    const parsed = JSON.parse(raw);
    return {
      ...emptyState,
      ...parsed,
      templates: parsed.templates?.length ? parsed.templates : starterTemplates,
    };
  } catch {
    writeState(emptyState);
    return structuredClone(emptyState);
  }
}

export function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function readCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export function writeCurrentUser(user) {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function upsertUser(state, name) {
  const cleanName = name.trim().replace(/\s+/g, " ");
  const existing = state.users.find(
    (user) => user.name.toLowerCase() === cleanName.toLowerCase()
  );

  if (existing) {
    return { state, user: existing };
  }

  const user = {
    id: createId("user"),
    name: cleanName,
    createdAt: new Date().toISOString(),
  };

  return {
    state: { ...state, users: [...state.users, user] },
    user,
  };
}

export function generateJoinCode(title, phase, existingCodes = []) {
  const words = `${title} ${phase}`
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const base = (words.map((word) => word[0]).join("") || "SESSION").slice(0, 4);

  let code = "";
  do {
    code = `${base}${Math.floor(10 + Math.random() * 90)}`;
  } while (existingCodes.includes(code));

  return code;
}

export function deleteSession(state, sessionId) {
  return {
    ...state,
    sessions: state.sessions.filter((session) => session.id !== sessionId),
    criteria: (state.criteria || []).filter((criterion) => criterion.sessionId !== sessionId),
    judges: state.judges.filter((judge) => judge.sessionId !== sessionId),
    scores: state.scores.filter((score) => score.sessionId !== sessionId),
  };
}

export function createSession(state, payload, userId) {
  const now = new Date().toISOString();
  const sessionId = createId("session");
  const code = generateJoinCode(
    payload.title,
    payload.phase,
    [...state.sessions.map((session) => session.code), ...(payload.reservedCodes || [])]
  );
  const session = {
    id: sessionId,
    code,
    title: payload.title.trim(),
    phase: payload.phase.trim(),
    cohort: payload.cohort.trim(),
    status: "open",
    createdBy: userId,
    createdAt: now,
  };
  const criteria = payload.criteria
    .filter((criterion) => criterion.name.trim())
    .map((criterion, index) => ({
      id: createId("criterion"),
      sessionId,
      name: criterion.name.trim(),
      description: criterion.description.trim(),
      isSessionSpecific: Boolean(criterion.isSessionSpecific),
      sortOrder: index,
    }));
  const judge = {
    id: createId("judge"),
    sessionId,
    userId,
    joinedAt: now,
    completedAt: null,
  };

  return {
    state: {
      ...state,
      sessions: [...state.sessions, session],
      criteria: [...(state.criteria || []), ...criteria],
      judges: [...state.judges, judge],
    },
    session,
  };
}

export function joinSession(state, sessionId, userId) {
  const existing = state.judges.find(
    (judge) => judge.sessionId === sessionId && judge.userId === userId
  );
  if (existing) return state;

  return {
    ...state,
    judges: [
      ...state.judges,
      {
        id: createId("judge"),
        sessionId,
        userId,
        joinedAt: new Date().toISOString(),
        completedAt: null,
      },
    ],
  };
}

export function startSession(state, sessionId) {
  return {
    ...state,
    sessions: state.sessions.map((session) =>
      session.id === sessionId ? { ...session, status: "scoring" } : session
    ),
  };
}

export function updateScore(state, sessionId, criterionId, userId, score) {
  const existing = state.scores.find(
    (item) =>
      item.sessionId === sessionId &&
      item.criterionId === criterionId &&
      item.userId === userId
  );

  if (existing) {
    return {
      ...state,
      scores: state.scores.map((item) =>
        item.id === existing.id
          ? { ...item, score, updatedAt: new Date().toISOString() }
          : item
      ),
    };
  }

  return {
    ...state,
    scores: [
      ...state.scores,
      {
        id: createId("score"),
        sessionId,
        criterionId,
        userId,
        score,
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}

export function completeJudge(state, sessionId, userId) {
  const judges = state.judges.map((judge) =>
    judge.sessionId === sessionId && judge.userId === userId
      ? { ...judge, completedAt: new Date().toISOString() }
      : judge
  );
  const sessionJudges = judges.filter((judge) => judge.sessionId === sessionId);
  const allComplete =
    sessionJudges.length > 0 && sessionJudges.every((judge) => judge.completedAt);

  return {
    ...state,
    judges,
    sessions: state.sessions.map((session) =>
      session.id === sessionId && allComplete
        ? { ...session, status: "complete" }
        : session
    ),
  };
}

export function findSessionBundle(state, sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return null;

  const criteria = (state.criteria || [])
    .filter((criterion) => criterion.sessionId === sessionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const judges = state.judges
    .filter((judge) => judge.sessionId === sessionId)
    .map((judge) => ({
      ...judge,
      user: state.users.find((user) => user.id === judge.userId),
    }));
  const scores = state.scores.filter((score) => score.sessionId === sessionId);

  return { session, criteria, judges, scores };
}

export function getUserSessions(state, userId) {
  const joinedSessionIds = new Set(
    state.judges.filter((judge) => judge.userId === userId).map((judge) => judge.sessionId)
  );

  return state.sessions
    .filter((session) => session.createdBy === userId || joinedSessionIds.has(session.id))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getScoreLabel(score) {
  return SCORE_LEVELS.find((level) => level.value === score)?.label || "Unscored";
}

export function gradeBand(average) {
  if (!average) return "Waiting for scores";
  if (average >= 3.5) return "Exemplary";
  if (average >= 2.75) return "Proficient";
  if (average >= 2) return "Developing";
  return "Needs development";
}

export function computeResults(bundle) {
  const { criteria, judges, scores } = bundle;
  const scoredValues = scores.map((score) => score.score);
  const overallAverage = scoredValues.length
    ? scoredValues.reduce((sum, score) => sum + score, 0) / scoredValues.length
    : 0;

  const criterionRows = criteria.map((criterion) => {
    const criterionScores = scores.filter((score) => score.criterionId === criterion.id);
    const average = criterionScores.length
      ? criterionScores.reduce((sum, score) => sum + score.score, 0) / criterionScores.length
      : 0;
    const distribution = SCORE_LEVELS.reduce(
      (acc, level) => ({
        ...acc,
        [`score${level.value}`]: criterionScores.filter(
          (score) => score.score === level.value
        ).length,
      }),
      {}
    );

    return {
      ...criterion,
      average,
      scoredCount: criterionScores.length,
      ...distribution,
    };
  });

  const completionCount = judges.filter((judge) => judge.completedAt).length;

  return {
    overallAverage,
    band: gradeBand(overallAverage),
    criterionRows,
    completionCount,
    totalJudges: judges.length,
  };
}

export function createBlankCriterion(isSessionSpecific = false) {
  return {
    id: createId("draft"),
    name: "",
    description: "",
    isSessionSpecific,
  };
}
