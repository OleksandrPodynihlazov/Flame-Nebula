// Fire confidence (docs/contracts.md [1b], [3]): where the data endpoints read hotspots from, and the
// by_class breakdown of /api/stats.
//
// The view `hotspots_with_confidence` (db/init/views-init.sql) adds confidence_* columns to `hotspots`.
// A DB created before it existed (init scripts run only on an empty volume) has no view: then the API reads
// plain `hotspots`, the new fields are null and nothing is excluded, instead of answering 500.

export const VIEW = "hotspots_with_confidence";
export const PLAIN = { from: "hotspots", confidence: false };
export const WITH_CONFIDENCE = { from: `${VIEW} AS hotspots`, confidence: true };
// Re-checked this often, so applying the view on a running server takes effect without a restart.
const CHECK_MS = 30000;

let cached = null;
let checkedAt = 0;

// { from, confidence }: `from` is the FROM clause, always aliased `hotspots`.
export async function hotspotsSource(db, now = Date.now()) {
  if (cached && now - checkedAt < CHECK_MS) return cached;
  const { rows } = await db.query({ text: "SELECT to_regclass($1) IS NOT NULL AS ok", values: [`public.${VIEW}`] });
  cached = rows[0].ok ? WITH_CONFIDENCE : PLAIN;
  checkedAt = now;
  return cached;
}

export function resetSourceCache() {
  cached = null;
  checkedAt = 0;
}

// SQL condition hiding non-fire points. A point without a score (NULL class) is kept.
export const NOT_NON_FIRE = "(confidence_class IS NULL OR NOT starts_with(confidence_class, 'non_fire'))";

export const isNonFire = (cls) => typeof cls === "string" && cls.startsWith("non_fire");

// by_class for /api/stats from rows of { cls, count }. Counts every matching point, including excluded
// non_fire ones, so the UI can say what was hidden. NULL class = no confidence row = `unscored`.
// non_fire is split by its reason (`non_fire:static` -> non_fire.static); zero counts are left out.
export function byClass(rows) {
  const out = { non_fire: {} };
  for (const { cls, count } of rows) {
    if (!count) continue;
    if (isNonFire(cls)) {
      const reason = cls.slice("non_fire".length + 1) || "other";
      out.non_fire[reason] = (out.non_fire[reason] ?? 0) + count;
    } else {
      const key = cls ?? "unscored";
      out[key] = (out[key] ?? 0) + count;
    }
  }
  return out;
}
