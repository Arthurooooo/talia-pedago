// Client Bubble Data API — appels directs depuis le navigateur (CORS *).
// PIÈGE serde-style : les CONTRAINTES utilisent les IDs internes (snake_case),
// les RÉPONSES JSON utilisent les display names (camelCase).
//
// Toutes les méthodes publiques passent par le cache (cache.ts).
//   - listActiveClasses        : 15 min, persisté
//   - classMembersFor          : 10 min, persisté
//   - getClass / getUser       : 60 min, in-memory uniquement (volume)
//   - scheduledClassesForClass : 5 min, in-memory uniquement

import type { BubbleClass, BubbleUser, ClassMember, ScheduledClass, Evaluation, Attendance, Contract } from './types';
import { fullName } from './types';
import { cached, cachedAt, invalidate } from './cache';

// Cherche un champ "date de naissance" dans l'objet brut (le nom exact varie selon Bubble).
function findBirthDate(u: Record<string, any>): string | undefined {
  for (const k of Object.keys(u)) {
    if (/birth|naissance|\bdob\b|dateofbirth/i.test(k)) {
      const v = u[k];
      if (typeof v === 'string' && /\d{4}/.test(v)) return v;
    }
  }
  return undefined;
}

const BASE = 'https://eleve.talia.fr/api/1.1/obj';

function authHeader(token: string) { return { Authorization: `Bearer ${token}` }; }

interface BubbleResponse<T> { response: { results: T[]; cursor?: number; remaining?: number; count?: number } }
interface BubbleSingle<T> { response: T }

async function getList<T>(token: string, obj: string, params: URLSearchParams): Promise<T[]> {
  const res = await fetch(`${BASE}/${obj}?${params.toString()}`, { headers: authHeader(token) });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as BubbleResponse<T>;
  return j.response.results;
}

async function getOne<T>(token: string, obj: string, id: string): Promise<T | null> {
  const res = await fetch(`${BASE}/${obj}/${id}`, { headers: authHeader(token) });
  if (!res.ok) return null;
  const j = (await res.json()) as BubbleSingle<T>;
  return j.response;
}

async function getAll<T>(token: string, obj: string, base: URLSearchParams): Promise<T[]> {
  const out: T[] = [];
  let cursor = 0;
  while (true) {
    const params = new URLSearchParams(base);
    params.set('cursor', String(cursor));
    params.set('limit', '100');
    const res = await fetch(`${BASE}/${obj}?${params.toString()}`, { headers: authHeader(token) });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as BubbleResponse<T>;
    out.push(...j.response.results);
    const remaining = j.response.remaining ?? 0;
    if (remaining <= 0) break;
    cursor += j.response.results.length;
    if (cursor > 5000) break;
  }
  return out;
}

// ---------- Classes ----------

export function listActiveClasses(token: string): Promise<BubbleClass[]> {
  return cached('classes:active', { ttl: 15 * 60_000, persist: true }, async () => {
    const now = new Date().toISOString();
    const constraints = JSON.stringify([
      { key: 'enddate_date', constraint_type: 'greater than', value: now }
    ]);
    const params = new URLSearchParams({
      constraints,
      sort_field: 'startdate_date',
      descending: 'true',
    });
    const arr = await getAll<any>(token, 'class', params);
    return arr.map((c) => ({
      id: c._id,
      name: c.name,
      illustration: c.illustration,
      startDate: c.startDate,
      endDate: c.endDate,
      schoolDay: c.schoolDay,
      teacherIds: c.teachers,
      classManagerId: c.classManager,
      examDate: c.examDate,
    }));
  });
}

export function getClass(token: string, id: string): Promise<BubbleClass | null> {
  return cached(`class:${id}`, { ttl: 60 * 60_000, persist: true }, async () => {
    const c = await getOne<any>(token, 'class', id);
    if (!c) return null;
    return {
      id: c._id,
      name: c.name,
      illustration: c.illustration,
      startDate: c.startDate,
      endDate: c.endDate,
      schoolDay: c.schoolDay,
      teacherIds: c.teachers,
      classManagerId: c.classManager,
      examDate: c.examDate,
    };
  });
}

// ---------- Members ----------

export function classMembersFor(token: string, classId: string): Promise<ClassMember[]> {
  return cached(`members:${classId}`, { ttl: 10 * 60_000, persist: true }, async () => {
    const constraints = JSON.stringify([
      { key: 'class_custom_class2', constraint_type: 'equals', value: classId }
    ]);
    const params = new URLSearchParams({ constraints });
    const arr = await getAll<any>(token, 'classmember', params);
    return arr.map((m) => ({
      id: m._id,
      classId: m.class,
      studentId: m.student,
      enrollmentDate: m.enrollmentDate,
      trainingId: m.training,
      specializationId: m.specialization,
    }));
  });
}

// ---------- Users ----------

export function getUser(token: string, id: string): Promise<BubbleUser | null> {
  // Pas persisté : volume potentiel élevé (centaines/milliers d'élèves) qui
  // saturerait localStorage. In-memory uniquement.
  return cached(`user:${id}`, { ttl: 60 * 60_000, persist: false }, async () => {
    const u = await getOne<any>(token, 'user', id);
    if (!u) return null;
    return {
      id: u._id,
      firstName: u.firstName,
      lastName: u.lastName,
      apiFullName: u.fullName,
      email: u.email ?? u.authentication?.email?.email,
      phoneNumber: u.phoneNumber,
      profilePicture: u.profilePicture,
      studentStatus: u.studentStatus,
      leadStatus: u.status,
      role: u.role,
      birthDate: findBirthDate(u),
      createdDate: u['Created Date'],
      raw: u,                     // objet brut complet (mode découverte de la sidebar)
    };
  });
}

// Quand un fetch a-t-il été fait pour cet élève (ms epoch) ? Pour l'indicateur de fraîcheur.
export function userCachedAt(id: string): number | null {
  return cachedAt(`user:${id}`);
}

// Refresh d'un seul élève : on vide TOUTES ses données (profil + notes/assiduité/contrat) puis refetch.
export function refreshUser(token: string, id: string): Promise<BubbleUser | null> {
  for (const k of [`user:${id}`, `evals:${id}`, `attendance:${id}`, `contracts:${id}`]) invalidate(k);
  return getUser(token, id);
}

// ---------- Données pédagogiques (notes / assiduité / contrat) ----------

export function getEvaluations(token: string, studentId: string): Promise<Evaluation[]> {
  return cached(`evals:${studentId}`, { ttl: 10 * 60_000, persist: false }, async () => {
    const constraints = JSON.stringify([{ key: 'student', constraint_type: 'equals', value: studentId }]);
    const params = new URLSearchParams({ constraints, sort_field: 'Created Date', descending: 'true' });
    const arr = await getAll<any>(token, 'evaluation', params);
    return arr.map((e) => ({
      id: e._id,
      grade: e.grade,
      maxGrade: e.maxPossibleGrade,
      percentage: e.gradePercentage,
      status: e.status,
      isGradable: e.isGradable,
      type: e.assignmentType,
      comment: e.comment,
      date: e.submissionDate,
      trimester: e.trimester,
    }));
  });
}

export function getAttendance(token: string, studentId: string): Promise<Attendance[]> {
  return cached(`attendance:${studentId}`, { ttl: 10 * 60_000, persist: false }, async () => {
    const constraints = JSON.stringify([{ key: 'user', constraint_type: 'equals', value: studentId }]);
    const params = new URLSearchParams({ constraints, sort_field: 'attendanceDate', descending: 'true' });
    const arr = await getAll<any>(token, 'attendance', params);
    return arr.map((a) => ({ id: a._id, status: a.status, date: a.attendanceDate, validated: a.isValidated }));
  });
}

export function getContracts(token: string, studentId: string): Promise<Contract[]> {
  return cached(`contracts:${studentId}`, { ttl: 30 * 60_000, persist: false }, async () => {
    const constraints = JSON.stringify([{ key: 'student', constraint_type: 'equals', value: studentId }]);
    const params = new URLSearchParams({ constraints, sort_field: 'startDate', descending: 'true' });
    const arr = await getList<any>(token, 'contract', params);
    const out: Contract[] = arr.map((c) => ({
      id: c._id, companyId: c.company, startDate: c.startDate, endDate: c.endDate, status: c.status,
    }));
    // résolution du nom d'entreprise (best-effort)
    await Promise.all(out.map(async (c) => { if (c.companyId) c.companyName = (await getCompany(token, c.companyId)) ?? undefined; }));
    return out;
  });
}

export function getCompany(token: string, id: string): Promise<string | null> {
  return cached(`company:${id}`, { ttl: 60 * 60_000, persist: true }, async () => {
    const c = await getOne<any>(token, 'company', id);
    return c?.name ?? c?.companyName ?? null;
  });
}

// Aperçu d'une classe pour la page d'accueil (effectif + 6 premiers noms),
// PERSISTÉ → revenir à l'accueil est instantané (plus de rechargement visible).
export function getClassPreview(token: string, classId: string): Promise<{ count: number; names: string[] }> {
  return cached(`preview:${classId}`, { ttl: 15 * 60_000, persist: true }, async () => {
    const ms = await classMembersFor(token, classId);
    const ids = ms.slice(0, 6).map((m) => m.studentId).filter(Boolean) as string[];
    const us = await getUsers(token, ids);
    const names = ids.map((id) => fullName(us.get(id)) || 'élève');
    return { count: ms.length, names };
  });
}

export async function getUsers(token: string, ids: string[]): Promise<Map<string, BubbleUser>> {
  const out = new Map<string, BubbleUser>();
  const POOL = 8;
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const id = ids[idx];
      try {
        const u = await getUser(token, id);
        if (u) out.set(id, u);
      } catch { /* on continue, échec silencieux par user */ }
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));
  return out;
}

// ---------- Scheduled classes (séances) ----------

export function scheduledClassesForClass(token: string, classId: string, fromDate?: string): Promise<ScheduledClass[]> {
  const cacheKey = `scheduled:${classId}:${fromDate ?? 'all'}`;
  return cached(cacheKey, { ttl: 5 * 60_000, persist: false }, async () => {
    const constraints: any[] = [
      { key: 'class_custom_class2', constraint_type: 'equals', value: classId }
    ];
    if (fromDate) {
      constraints.push({ key: 'start_time_date', constraint_type: 'greater than', value: fromDate });
    }
    const params = new URLSearchParams({
      constraints: JSON.stringify(constraints),
      sort_field: 'start_time_date',
      descending: 'false',
      limit: '100',
    });
    const arr = await getList<any>(token, 'scheduledclass', params);
    return arr.map((s) => ({
      id: s._id,
      classId: s.class,
      teacherId: s.teacher,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      isOneToOne: s.isOneToOne,
      isPracticalWork: s.isPracticalWork,
      participantsCount: s.participantsCount,
      url: s.url,
    }));
  });
}
