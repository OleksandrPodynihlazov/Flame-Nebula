// Region search key. Same rule as ingest/regions_geo.py norm_name(): NFKD, drop marks, lower-case.
export function normName(s) {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}
