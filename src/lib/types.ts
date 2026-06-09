// Miroir des display names exposés par l'API Bubble (camelCase).

export interface BubbleUser {
  id: string;
  firstName?: string;
  lastName?: string;
  apiFullName?: string;
  email?: string;
  phoneNumber?: string;
  profilePicture?: string;
  studentStatus?: string;
  leadStatus?: string;
  role?: string;
  birthDate?: string;
  createdDate?: string;
  raw?: Record<string, any>;   // objet Bubble brut (mode découverte de la sidebar)
}

// Âge (en années) à partir d'une date ISO, ou null si invalide.
export function ageFrom(birthDate?: string): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

// "il y a 3 min", "à l'instant"… pour l'indicateur de fraîcheur du cache.
export function relativeTime(ts?: number | null): string {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 30) return "à l'instant";
  if (s < 90) return 'il y a 1 min';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 7200) return 'il y a 1 h';
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

// Champs bruts à masquer dans le mode découverte (techniques / déjà affichés).
const RAW_HIDE = /^(_id|_type|Created By|authentication|user_signed_up|Modified Date)$/i;
export function discoverableFields(raw?: Record<string, any>): [string, string][] {
  if (!raw) return [];
  const out: [string, string][] = [];
  for (const k of Object.keys(raw).sort()) {
    if (RAW_HIDE.test(k)) continue;
    const v = raw[k];
    if (v == null || v === '') continue;
    let s: string;
    if (Array.isArray(v)) s = v.length + ' élément(s)';
    else if (typeof v === 'object') s = JSON.stringify(v).slice(0, 80);
    else s = String(v);
    out.push([k, s]);
  }
  return out;
}

export interface BubbleClass {
  id: string;
  name?: string;
  illustration?: string;
  startDate?: string;
  endDate?: string;
  schoolDay?: string;
  teacherIds?: string[];
  classManagerId?: string;
  examDate?: string;
}

export interface ClassMember {
  id: string;
  classId?: string;
  studentId?: string;
  enrollmentDate?: string;
  trainingId?: string;
  specializationId?: string;
}

export interface ScheduledClass {
  id: string;
  classId?: string;
  teacherId?: string;
  name?: string;
  startTime?: string;
  endTime?: string;
  status?: string;          // 'À venir' | 'Validé' | 'Annulé' | 'No show' (posé APRÈS la séance)
  isOneToOne?: boolean;
  isPracticalWork?: boolean;
  participantsCount?: number;
  url?: string;             // lien direct vers la salle (eleve.talia.fr/room/…)
}

// Un créneau = un horaire donné, avec 1..N séances en parallèle (spécialités).
export interface ClassSlot {
  key: string;
  startTime?: string;
  endTime?: string;
  sessions: ScheduledClass[];   // spécialités parallèles sur ce créneau (prof/bloc/effectif différents)
  participants: number;         // total inscrits sur le créneau
}

// État "live" du planning d'une classe pour un instant donné.
export interface LiveSchedule {
  ongoing: ClassSlot | null;   // créneau en cours MAINTENANT (par horaire, hors Annulé)
  next: ClassSlot | null;      // prochain créneau à venir aujourd'hui
  today: ClassSlot[];          // tous les créneaux du jour, triés par heure
}

const ts = (s?: string): number => (s ? new Date(s).getTime() : NaN);

// IMPORTANT : le statut Bubble ('Validé'…) est posé après coup, jamais 'En cours'.
// Un cours "en cours" se détecte donc UNIQUEMENT par l'horaire : start ≤ now ≤ end.
// Les spécialités parallèles (même start+end) sont regroupées en un seul créneau.
export function computeLive(list: ScheduledClass[], now: number = Date.now()): LiveSchedule {
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = startOfDay.getTime() + 86_400_000;
  const bySlot = new Map<string, ClassSlot>();
  for (const s of list) {
    const st = ts(s.startTime);
    if (!(st >= startOfDay.getTime() && st < endOfDay)) continue;
    const key = `${s.startTime}|${s.endTime}`;
    let slot = bySlot.get(key);
    if (!slot) { slot = { key, startTime: s.startTime, endTime: s.endTime, sessions: [], participants: 0 }; bySlot.set(key, slot); }
    slot.sessions.push(s);
    slot.participants += s.participantsCount ?? 0;
  }
  const today = [...bySlot.values()].sort((a, b) => ts(a.startTime) - ts(b.startTime));
  for (const slot of today) slot.sessions.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const active = (slot: ClassSlot) => slot.sessions.some((s) => s.status !== 'Annulé');
  const ongoing = today.find((slot) => active(slot) && ts(slot.startTime) <= now && now <= ts(slot.endTime)) ?? null;
  const next = today.find((slot) => active(slot) && ts(slot.startTime) > now) ?? null;
  return { ongoing, next, today };
}

// Plus long préfixe commun (pour raccourcir des intitulés de spécialités qui partagent une racine).
export function commonPrefix(strs: string[]): string {
  if (strs.length < 2) return '';
  let p = strs[0] ?? '';
  for (const s of strs.slice(1)) { while (p && !s.startsWith(p)) p = p.slice(0, -1); if (!p) return ''; }
  return p;
}

// "14:30" depuis une date ISO.
export function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Compte à rebours lisible : "2 h 05", "12 min", "<1 min".
export function humanCountdown(ms: number): string {
  if (ms <= 0) return '0 min';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h} h${m ? ' ' + String(m).padStart(2, '0') : ''}`;
}

// Couleur d'accent selon le statut d'une séance passée.
export function statusTone(status?: string): 'ok' | 'bad' | 'soft' {
  if (status === 'Validé') return 'ok';
  if (status === 'Annulé' || status === 'No show') return 'bad';
  return 'soft';
}

// --- Données pédagogiques liées à l'élève (types Bubble: evaluation / attendance / contract) ---
export interface Evaluation {
  id: string;
  grade?: number;          // note brute
  maxGrade?: number;       // barème
  percentage?: number;     // 0..1
  status?: string;         // 'corrigé' | 'rendu' | 'à faire'
  isGradable?: boolean;    // l'éval donne-t-elle vraiment une note chiffrée ?
  type?: string;           // type d'évaluation
  comment?: string;
  date?: string;           // submissionDate
  trimester?: string;
}

// Une "vraie note" : notée sur un barème > 0, en EXCLUANT les quiz jamais passés.
// Dans Bubble, un quiz non passé stocke grade=0 sur une éval non notable (isGradable=false)
// → ce n'est PAS un 0/20 réel (pas de copie, pas de commentaire). Un vrai 0 a isGradable=true ;
// un devoir noté garde sa note quelle que soit la valeur d'isGradable.
export function isRealNote(e: Evaluation): boolean {
  if (e.grade == null || !e.maxGrade || e.maxGrade <= 0) return false;
  if (e.grade === 0 && e.isGradable === false) return false;
  return true;
}

export interface Attendance {
  id: string;
  status?: string;
  date?: string;
  validated?: boolean;
}

export interface Contract {
  id: string;
  companyId?: string;
  companyName?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

// Moyenne (sur 20) à partir d'évaluations notées, + nombre pris en compte.
export function gradeAverage(evals: Evaluation[]): { over20: number; pct: number; n: number } | null {
  const rated = evals.filter(isRealNote);
  if (!rated.length) return null;
  const meanPct = rated.reduce((s, e) => s + e.grade! / e.maxGrade!, 0) / rated.length;
  return { over20: Math.round(meanPct * 20 * 10) / 10, pct: Math.round(meanPct * 100), n: rated.length };
}

// --- Petite couche "gamifiée" pour le dossier élève ---

// Mention + emoji + ton à partir d'une moyenne /20.
export function mentionFor(over20: number): { label: string; emoji: string; tone: 'gold' | 'green' | 'blue' | 'amber' | 'red' } {
  if (over20 >= 16) return { label: 'Excellent', emoji: '🏆', tone: 'gold' };
  if (over20 >= 14) return { label: 'Très bien', emoji: '🥇', tone: 'green' };
  if (over20 >= 12) return { label: 'Bien', emoji: '✨', tone: 'blue' };
  if (over20 >= 10) return { label: 'Assez bien', emoji: '🙂', tone: 'amber' };
  return { label: 'À consolider', emoji: '💪', tone: 'red' };
}

// Couleur d'une note individuelle selon le ratio (0..1).
export function gradeBucket(ratio: number): 'ok' | 'mid' | 'bad' {
  return ratio >= 0.7 ? 'ok' : ratio >= 0.5 ? 'mid' : 'bad';
}

export interface AttendanceStats {
  total: number; recorded: number; unrecorded: number;
  present: number; late: number; absent: number;
  rate: number;          // présents / renseignées (0..1)
  emoji: string;
  tone: 'green' | 'amber' | 'red';
}

// Stats d'assiduité : on ne compte le taux QUE sur les séances renseignées
// (beaucoup ont un statut vide → les inclure fausserait le taux).
export function attendanceStats(att: { status?: string }[]): AttendanceStats {
  let present = 0, late = 0, absent = 0, recorded = 0, unrecorded = 0;
  for (const a of att) {
    const s = (a.status ?? '').toLowerCase().trim();
    if (!s || s === '—') { unrecorded++; continue; }
    recorded++;
    if (/présent|present/.test(s)) present++;
    else if (/retard|late/.test(s)) late++;
    else absent++;   // 'Absent', 'No show', etc.
  }
  const rate = recorded ? present / recorded : 0;
  const tone: AttendanceStats['tone'] = !recorded ? 'amber' : rate >= 0.85 ? 'green' : rate >= 0.7 ? 'amber' : 'red';
  const emoji = !recorded ? '🗓️' : rate >= 0.95 ? '🔥' : rate >= 0.85 ? '😎' : rate >= 0.7 ? '🙂' : '⚠️';
  return { total: att.length, recorded, unrecorded, present, late, absent, rate, emoji, tone };
}

// --- Statut d'une classe selon les dates (pour filtrer la grille) ---
export function classStatus(k: { startDate?: string; endDate?: string }, now: number = Date.now()): 'active' | 'upcoming' | 'ended' {
  const s = k.startDate ? new Date(k.startDate).getTime() : NaN;
  const e = k.endDate ? new Date(k.endDate).getTime() : NaN;
  if (!isNaN(e) && e < now) return 'ended';
  if (!isNaN(s) && s > now) return 'upcoming';
  return 'active';
}

// --- Devinette de genre à partir du prénom (best-effort, FR + courants) ---
// Renvoie 'm' | 'f' | undefined (undefined = on ne sait pas → on garde le sprite du pool).
const M_NAMES = new Set<string>(('alain alexandre alexis alfred ali amine anthony antoine arnaud arthur aurelien axel ayoub baptiste bastien benjamin benoit bernard bilal brahim bruno cedric charles christian christophe clement corentin cyril damien daniel david denis didier dimitri dorian dylan edouard eliott emile emmanuel enzo eric ethan etienne evan fabien fabrice farid florent florian francois frederic gabriel gaetan georges gerard gilles greg gregory guillaume gustave hamza henri herve hugo ibrahim ismael jacques jean jeremie jeremy jerome jimmy joel johan jonathan jordan jose joseph jules julien karim kevin kylian lance laurent lazare leo leon lionel logan loic louis luc luca lucas ludovic maxence maxime mathis mathieu mathys matheo matteo mehdi michel mickael mohamed morgan nathan nicolas noah noe noah olivier oscar pascal patrice patrick paul philippe pierre quentin raphael remi remy rayan robert roger romain ryan sacha samuel sebastien serge simon stephane sylvain teddy theo thibault thibaut thierry thomas timeo tom tristan valentin victor vincent walid william xavier yanis yann yannick yoann youssef yves zacharie').split(' '));
const F_NAMES = new Set<string>(('adele agathe alice alicia aline amandine amelie ambre anais andrea angele angelique anissa anna anne annie ariane aurelie aurore axelle barbara beatrice brigitte camille capucine carine carla carole caroline catherine cecile cecilia celia celine chantal charlene charlotte chloe christelle christiane christine claire clara clemence clementine colette coralie cyrielle daniele delphine diane dominique dorothee elisa elise eliane elodie eloise elsa emeline emilie emma emmanuelle estelle eva fanny fatima fatou faustine flavie fleur florence france francoise gabrielle gaelle genevieve hawa helene ines ingrid isabelle ines jade jacqueline jeanne jennifer jessica joelle josephine julie juliette justine karen karine katia laetitia laura laure laurence laurene lea leila lena leonie lina lise lisa louise lucie lucile ludivine lydie maelys magali maeva manon margaux margot maria marie marina marine marion marlene marthe maryline mathilde maud melanie melissa michele mireille mona monique morgane muriel myriam nadege nadia nadine nathalie nawel nelly nina ninon nora noemie oceane odile ophelie pascale patricia paule pauline perrine prune rachel raphaelle rebecca romane rosa rose roxane sabrina salome samantha sandra sandrine sara sarah severine sofia solene sonia sophie stephanie suzanne sylvie tania tatiana valentine valerie vanessa veronique victoire violette virginie viviane yasmine yolande zoe').split(' '));

function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z-]/g, '');
}

export function guessGender(firstName?: string): 'm' | 'f' | undefined {
  if (!firstName) return undefined;
  const full = normName(firstName.trim().split(/\s+/)[0] || firstName);
  const first = full.split('-')[0];   // "jean-maxime" → "jean"
  for (const cand of [full, first]) {
    if (!cand) continue;
    if (M_NAMES.has(cand)) return 'm';
    if (F_NAMES.has(cand)) return 'f';
  }
  // Suffixes féminins très marqués (faible confiance) — sinon on renonce.
  if (/(?:ette|ine|elle|enne|euse|rice)$/.test(first)) return 'f';
  return undefined;
}

export function fullName(u?: BubbleUser): string {
  if (!u) return '';
  const parts = [u.firstName, u.lastName].filter((s) => s && s.trim());
  if (parts.length) return parts.join(' ');
  if (u.apiFullName) return u.apiFullName;
  return '(sans nom)';
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const f = parts[0]?.charAt(0) ?? '';
  const l = parts.slice(1).pop()?.charAt(0) ?? '';
  return (f + l).toUpperCase() || '?';
}
