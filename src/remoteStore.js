import { supabase } from "./supabaseClient.js";
import { starterTemplates } from "./store.js";

export const hasRemoteStore = Boolean(supabase);

function assertOk(response, label) {
  if (response.error) {
    throw new Error(`${label}: ${response.error.message}`);
  }
  return response.data || [];
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

function mapTemplate(row, criteria) {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    createdAt: row.created_at,
    criteria: criteria
      .filter((criterion) => criterion.template_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((criterion) => ({
        id: criterion.id,
        name: criterion.name,
        description: criterion.description || "",
      })),
  };
}

function mapSession(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    cohort: row.cohort || "",
    phase: row.phase || "",
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapSessionCriterion(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    description: row.description || "",
    isSessionSpecific: row.is_session_specific,
    sortOrder: row.sort_order,
  };
}

function mapJudge(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    joinedAt: row.joined_at,
    completedAt: row.completed_at,
  };
}

function mapScore(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    criterionId: row.criterion_id,
    userId: row.judge_id,
    score: row.score,
    updatedAt: row.updated_at,
  };
}

function sameItem(previous, next) {
  return JSON.stringify(previous) === JSON.stringify(next);
}

function changedItems(previousItems = [], nextItems = []) {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  return nextItems.filter((item) => !sameItem(previousById.get(item.id), item));
}

export async function loadRemoteState() {
  if (!supabase) return null;

  const [
    usersResponse,
    templatesResponse,
    templateCriteriaResponse,
    sessionsResponse,
    criteriaResponse,
    judgesResponse,
    scoresResponse,
  ] = await Promise.all([
    supabase.from("users").select("*").order("created_at"),
    supabase.from("templates").select("*").order("created_at"),
    supabase.from("template_criteria").select("*").order("sort_order"),
    supabase.from("sessions").select("*").order("created_at", { ascending: false }),
    supabase.from("session_criteria").select("*").order("sort_order"),
    supabase.from("session_judges").select("*").order("joined_at"),
    supabase.from("scores").select("*").order("updated_at"),
  ]);

  const users = assertOk(usersResponse, "Load users").map(mapUser);
  const remoteTemplates = assertOk(templatesResponse, "Load templates");
  const templateCriteria = assertOk(
    templateCriteriaResponse,
    "Load template criteria"
  );
  const templates = remoteTemplates.length
    ? remoteTemplates.map((template) => mapTemplate(template, templateCriteria))
    : starterTemplates;

  return {
    users,
    templates,
    sessions: assertOk(sessionsResponse, "Load sessions").map(mapSession),
    criteria: assertOk(criteriaResponse, "Load session criteria").map(
      mapSessionCriterion
    ),
    judges: assertOk(judgesResponse, "Load judges").map(mapJudge),
    scores: assertOk(scoresResponse, "Load scores").map(mapScore),
  };
}

function removedIds(previousItems = [], nextItems = []) {
  const nextIds = new Set(nextItems.map((item) => item.id));
  return previousItems.filter((item) => !nextIds.has(item.id)).map((item) => item.id);
}

async function deleteRemoved(table, previousItems, nextItems) {
  const ids = removedIds(previousItems, nextItems);
  if (!ids.length) return;
  const response = await supabase.from(table).delete().in("id", ids);
  assertOk(response, `Delete ${table}`);
}

async function upsertRows(table, rows) {
  if (!rows.length) return;
  const response = await supabase.from(table).upsert(rows);
  assertOk(response, `Upsert ${table}`);
}

export async function persistRemoteState(nextState, previousState) {
  if (!supabase) return;

  const nextTemplateCriteria = nextState.templates.flatMap((template) =>
    template.criteria.map((criterion, index) => ({
      id: criterion.id,
      template_id: template.id,
      name: criterion.name,
      description: criterion.description || "",
      sort_order: index,
    }))
  );
  const previousTemplateCriteria = previousState.templates.flatMap((template) =>
    template.criteria.map((criterion) => ({ id: criterion.id }))
  );

  await Promise.all([
    deleteRemoved("template_criteria", previousTemplateCriteria, nextTemplateCriteria),
    deleteRemoved("templates", previousState.templates, nextState.templates),
  ]);

  const changedUsers = changedItems(previousState.users, nextState.users);
  const changedTemplates = changedItems(previousState.templates, nextState.templates);
  const changedTemplateIds = new Set(changedTemplates.map((template) => template.id));
  const changedSessions = changedItems(previousState.sessions, nextState.sessions);
  const changedCriteria = changedItems(previousState.criteria, nextState.criteria);
  const changedJudges = changedItems(previousState.judges, nextState.judges);
  const changedScores = changedItems(previousState.scores, nextState.scores);
  const previousTemplateCriteriaById = new Map(
    previousTemplateCriteria.map((criterion) => [criterion.id, criterion])
  );
  const changedTemplateCriteria = nextTemplateCriteria.filter(
    (criterion) =>
      changedTemplateIds.has(criterion.template_id) ||
      !sameItem(previousTemplateCriteriaById.get(criterion.id), criterion)
  );

  await upsertRows(
    "users",
    changedUsers.map((user) => ({
      id: user.id,
      name: user.name,
      created_at: user.createdAt,
    }))
  );
  await upsertRows(
    "templates",
    changedTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      is_default: template.isDefault,
      created_at: template.createdAt,
    }))
  );
  await upsertRows("template_criteria", changedTemplateCriteria);
  await upsertRows(
    "sessions",
    changedSessions.map((session) => ({
      id: session.id,
      code: session.code,
      title: session.title,
      cohort: session.cohort || null,
      phase: session.phase || null,
      status: session.status,
      created_by: session.createdBy,
      created_at: session.createdAt,
    }))
  );
  await upsertRows(
    "session_criteria",
    changedCriteria.map((criterion) => ({
      id: criterion.id,
      session_id: criterion.sessionId,
      name: criterion.name,
      description: criterion.description || "",
      is_session_specific: criterion.isSessionSpecific,
      sort_order: criterion.sortOrder,
    }))
  );
  await upsertRows(
    "session_judges",
    changedJudges.map((judge) => ({
      id: judge.id,
      session_id: judge.sessionId,
      user_id: judge.userId,
      joined_at: judge.joinedAt,
      completed_at: judge.completedAt,
    }))
  );
  await upsertRows(
    "scores",
    changedScores.map((score) => ({
      id: score.id,
      session_id: score.sessionId,
      criterion_id: score.criterionId,
      judge_id: score.userId,
      score: score.score,
      updated_at: score.updatedAt,
    }))
  );
}

export function subscribeRemoteState(onChange) {
  if (!supabase) return () => {};
  let reloadTimer = null;

  const load = async () => {
    try {
      const remoteState = await loadRemoteState();
      onChange(remoteState);
    } catch (error) {
      console.error(error);
    }
  };
  const reload = () => {
    window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(load, 120);
  };

  const channel = supabase
    .channel("veto-state")
    .on("postgres_changes", { event: "*", schema: "public", table: "users" }, reload)
    .on("postgres_changes", { event: "*", schema: "public", table: "templates" }, reload)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "template_criteria" },
      reload
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, reload)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "session_criteria" },
      reload
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "session_judges" },
      reload
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, reload)
    .subscribe();

  return () => {
    window.clearTimeout(reloadTimer);
    supabase.removeChannel(channel);
  };
}
