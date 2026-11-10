/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import type { Config } from "./config.js";
import { HttpError, isUniqueError } from "./errors.js";
import { getUser, withTx, type DB, type User } from "./db.js";
import { displayOf } from "./users.js";

export const INTERESTS = [
  "passeggiate",
  "cucina",
  "musica",
  "giochi retrò",
  "lettura",
  "fotografia",
  "animali",
  "cinema",
  "natura",
  "cucito",
] as const;

const REPORT_REASONS = new Set(["profilo", "molestie", "spam", "minore", "altro"]);

const BLOCKED_WORDS = [
  "nudo",
  "nuda",
  "nudi",
  "sesso",
  "sessuale",
  "porno",
  "porn",
  "escort",
  "onlyfans",
  "hot",
  "nsfw",
  "xxx",
  "pene",
  "vagina",
  "scopare",
  "minore",
  "minorenne",
];
const BLOCKED_PREFIXES = ["bambin"];

export function textAllowed(value: string): boolean {
  const lower = value.toLowerCase();
  if (/https?:\/\/|www\.|@|t\.me\//i.test(value)) return false;
  const wordHit = BLOCKED_WORDS.some((word) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${word}([^\\p{L}\\p{N}]|$)`, "u").test(lower),
  );
  const prefixHit = BLOCKED_PREFIXES.some((word) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${word}`, "u").test(lower),
  );
  return !wordHit && !prefixHit;
}

export function datingState(user: User, termsVersion: string) {
  return {
    beta: true,
    selfDeclaration: true,
    ageGate: user.age_gate,
    termsAccepted: user.terms_version === termsVersion && user.age_gate === "declared",
    optedIn: user.dating_opt_in === 1,
    underLock: user.age_gate === "under",
    note: "L'ingresso è un'autodichiarazione, non una verifica dell'età o del documento. Gli incontri non assegnano gettoni e non accettano pagamenti.",
  };
}

export function declareAge(
  db: DB,
  user: User,
  input: { years: number; acceptTerms: boolean; confirmSelfDeclaration: boolean },
  config: Config,
  nowIso: string,
): void {
  if (user.age_gate === "under") {
    throw new HttpError(403, "minorenne", "Questo profilo ha dichiarato meno di 18 anni. Gli incontri restano chiusi.");
  }
  if (input.confirmSelfDeclaration !== true || input.acceptTerms !== true) {
    throw new HttpError(400, "termini", "Servono l'autodichiarazione e l'accettazione dei termini.");
  }
  if (!Number.isInteger(input.years) || input.years < 1 || input.years > 120) {
    throw new HttpError(400, "eta", "Età non valida.");
  }
  if (input.years < 18) {
    db.prepare("UPDATE users SET age_gate = 'under', dating_opt_in = 0, terms_version = NULL WHERE id = ?").run(user.id);
    throw new HttpError(
      403,
      "minorenne",
      "Gli incontri sono solo per chi dichiara almeno 18 anni. Non controlliamo documenti: è un'autodichiarazione.",
    );
  }
  db.prepare(
    "UPDATE users SET age_gate = 'declared', terms_version = ?, terms_accepted_at = ? WHERE id = ?",
  ).run(config.termsVersion, nowIso, user.id);
}

export function setOptIn(db: DB, user: User, optIn: boolean, termsVersion: string): void {
  assertDeclared(user, termsVersion);
  if (!optIn) {
    db.prepare("UPDATE users SET dating_opt_in = 0 WHERE id = ?").run(user.id);
    db.prepare("UPDATE dating_profiles SET visible = 0 WHERE user_id = ?").run(user.id);
    return;
  }
  db.prepare("UPDATE users SET dating_opt_in = 1 WHERE id = ?").run(user.id);
}

function assertDeclared(user: User, termsVersion: string): void {
  if (user.age_gate === "under") {
    throw new HttpError(403, "minorenne", "Gli incontri sono chiusi su questo profilo.");
  }
  if (user.age_gate !== "declared" || user.terms_version !== termsVersion) {
    throw new HttpError(403, "gate", "Prima serve l'autodichiarazione dei 18 anni e l'accettazione dei termini.");
  }
}

function assertOpted(user: User, termsVersion: string): void {
  assertDeclared(user, termsVersion);
  if (user.dating_opt_in !== 1) {
    throw new HttpError(403, "optin", "Il profilo incontri è facoltativo: attiva la partecipazione.");
  }
}

export function saveProfile(
  db: DB,
  user: User,
  input: { bio: string; interests: string[]; city?: string; shareUsername?: boolean },
  termsVersion: string,
  nowIso: string,
): void {
  assertOpted(user, termsVersion);
  const bio = input.bio.trim();
  if (bio.length < 20 || bio.length > 180) {
    throw new HttpError(400, "bio", "La bio sta tra 20 e 180 caratteri.");
  }
  if (!textAllowed(bio)) {
    throw new HttpError(400, "testo", "Testo non accettato. Niente contenuti espliciti, link o contatti.");
  }
  const city = (input.city ?? "").trim();
  if (city.length > 32 || (city && !textAllowed(city))) {
    throw new HttpError(400, "citta", "Città non accettata.");
  }
  if (!Array.isArray(input.interests) || input.interests.length < 1 || input.interests.length > 5) {
    throw new HttpError(400, "interessi", "Scegli da uno a cinque interessi della lista.");
  }
  const unique = [...new Set(input.interests)];
  if (unique.some((item) => !INTERESTS.includes(item as (typeof INTERESTS)[number]))) {
    throw new HttpError(400, "interessi", "Interesse fuori lista.");
  }
  db.prepare("UPDATE users SET share_username = ? WHERE id = ?").run(input.shareUsername ? 1 : 0, user.id);
  db.prepare(
    `INSERT INTO dating_profiles (user_id, bio, interests, city, visible, updated_at)
     VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       bio = excluded.bio, interests = excluded.interests, city = excluded.city,
       visible = 1, updated_at = excluded.updated_at`,
  ).run(user.id, bio, JSON.stringify(unique), city || null, nowIso);
}

export function ownProfile(db: DB, userId: number) {
  const row = db.prepare("SELECT * FROM dating_profiles WHERE user_id = ?").get(userId) as
    | { bio: string; interests: string; city: string | null; visible: number }
    | undefined;
  if (!row) return null;
  return { bio: row.bio, interests: JSON.parse(row.interests) as string[], city: row.city, visible: row.visible === 1 };
}

function blockedEither(db: DB, a: number, b: number): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM blocks
       WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
    )
    .get(a, b, b, a);
  return Boolean(row);
}

export function discover(db: DB, user: User, termsVersion: string) {
  assertOpted(user, termsVersion);
  const row = db
    .prepare(
      `SELECT p.user_id AS userId, p.bio, p.interests, p.city, u.display_name AS displayName
       FROM dating_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.visible = 1
         AND u.dating_opt_in = 1
         AND u.age_gate = 'declared'
         AND u.banned = 0
         AND p.user_id != ?
         AND NOT EXISTS (SELECT 1 FROM dating_actions a WHERE a.from_id = ? AND a.to_id = p.user_id)
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id)
              OR (b.blocker_id = p.user_id AND b.blocked_id = ?)
         )
       ORDER BY p.user_id
       LIMIT 1`,
    )
    .get(user.id, user.id, user.id, user.id) as
    | { userId: number; bio: string; interests: string; city: string | null; displayName: string | null }
    | undefined;
  if (!row) return null;
  return {
    userId: row.userId,
    displayName: row.displayName || `socio-${row.userId}`,
    bio: row.bio,
    interests: JSON.parse(row.interests) as string[],
    city: row.city,
  };
}

export function reactTo(
  db: DB,
  user: User,
  targetId: number,
  kind: "like" | "pass",
  termsVersion: string,
  nowIso: string,
): { matched: boolean } {
  assertOpted(user, termsVersion);
  if (targetId === user.id) throw new HttpError(400, "profilo", "Non puoi scegliere te stesso.");
  if (blockedEither(db, user.id, targetId)) throw new HttpError(404, "profilo", "Profilo non disponibile.");
  const target = getUser(db, targetId);
  const profile = target ? ownProfile(db, target.id) : null;
  if (!target || target.banned || target.dating_opt_in !== 1 || target.age_gate !== "declared" || !profile?.visible) {
    throw new HttpError(404, "profilo", "Profilo non disponibile.");
  }
  try {
    db.prepare("INSERT INTO dating_actions (from_id, to_id, kind, created_at) VALUES (?, ?, ?, ?)").run(
      user.id,
      targetId,
      kind,
      nowIso,
    );
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "gia", "Hai già risposto a questo profilo.");
    throw error;
  }
  if (kind !== "like") return { matched: false };
  const back = db
    .prepare("SELECT kind FROM dating_actions WHERE from_id = ? AND to_id = ?")
    .get(targetId, user.id) as { kind: string } | undefined;
  if (back?.kind !== "like") return { matched: false };
  const [a, b] = user.id < targetId ? [user.id, targetId] : [targetId, user.id];
  db.prepare("INSERT INTO matches (user_a, user_b, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(
    a,
    b,
    nowIso,
  );
  return { matched: true };
}

export function blockUser(db: DB, user: User, targetId: number, termsVersion: string, nowIso: string): void {
  assertDeclared(user, termsVersion);
  if (targetId === user.id) throw new HttpError(400, "blocco", "Non puoi bloccare te stesso.");
  const [a, b] = user.id < targetId ? [user.id, targetId] : [targetId, user.id];
  withTx(db, () => {
    db.prepare(
      "INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    ).run(user.id, targetId, nowIso);
    db.prepare("DELETE FROM matches WHERE user_a = ? AND user_b = ?").run(a, b);
  });
}

export function reportUser(
  db: DB,
  user: User,
  targetId: number,
  reason: string,
  termsVersion: string,
  nowIso: string,
): void {
  assertDeclared(user, termsVersion);
  if (!REPORT_REASONS.has(reason)) throw new HttpError(400, "motivo", "Motivo non valido.");
  if (targetId === user.id) throw new HttpError(400, "segnalazione", "Non puoi segnalare te stesso.");
  db.prepare(
    "INSERT INTO reports (reporter_id, target_id, reason, status, created_at) VALUES (?, ?, ?, 'open', ?)",
  ).run(user.id, targetId, reason, nowIso);
}

export function listMatches(db: DB, user: User, termsVersion: string) {
  assertOpted(user, termsVersion);
  const rows = db
    .prepare(
      `SELECT m.created_at AS createdAt,
              CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END AS otherId
       FROM matches m
       WHERE m.user_a = ? OR m.user_b = ?
       ORDER BY m.id DESC`,
    )
    .all(user.id, user.id, user.id) as Array<{ createdAt: string; otherId: number }>;
  return rows
    .filter((row) => !blockedEither(db, user.id, row.otherId))
    .map((row) => {
      const other = getUser(db, row.otherId);
      const profile = other ? ownProfile(db, other.id) : null;
      const share =
        other &&
        user.share_username === 1 &&
        other.share_username === 1 &&
        other.username &&
        !other.username.startsWith("deleted:");
      return {
        userId: row.otherId,
        displayName: other ? displayOf(other) : "rimosso",
        bio: profile?.bio ?? "",
        city: profile?.city ?? null,
        createdAt: row.createdAt,
        username: share ? other!.username : null,
      };
    });
}

export function claimsCount(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number }).n;
}
