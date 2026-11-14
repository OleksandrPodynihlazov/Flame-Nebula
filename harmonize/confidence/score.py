"""Combine level signals into score, class and reasons (spec §5)."""

from dataclasses import dataclass

from confidence import config

SUPPORT_LEVELS = ("L3", "L5", "L6", "L8")   # independent support that vetoes an L4 water override
# Urban land cover is always excluded: fires in cities are outside the research scope (user decision 2026-11-14),
# even when independent evidence confirms that something burned there.


@dataclass
class Result:
    score: int
    cls: str
    reasons: str
    signals: dict


def _weight(level, signal):
    w = config.WEIGHTS[level]
    if isinstance(w, dict):
        return w["support"] if signal > 0 else w["refute"]
    return w


def _class(score, sig, rsn):
    if sig["L1"] < 0:
        r = rsn["L1"]
        if r.startswith("volcano"):
            return "non_fire:volcano"
        return "non_fire:offshore" if r == "offshore" else "non_fire:static"
    if sig["L4"] < 0 and rsn["L4"] == "urban":
        return "non_fire:urban"
    if sig["L4"] < 0 and rsn["L4"] == "water" and not any(sig[l] > 0 for l in SUPPORT_LEVELS):
        return "non_fire:offshore"
    for name, threshold in config.CLASS_THRESHOLDS:
        if score >= threshold:
            return name
    return "doubtful"


def combine(signals, weights=None):
    """signals: {level: {key: (signal, reason)}} -> {key: Result}. Missing levels count as 0."""
    keys = set()
    for per_level in signals.values():
        keys.update(per_level)
    out = {}
    for k in keys:
        sig, rsn = {}, {}
        for level in config.LEVEL_ORDER:
            s, r = signals.get(level, {}).get(k, (0, ""))
            sig[level], rsn[level] = s, r
        total = config.BASE_SCORE + sum(_weight(l, s) * s for l, s in sig.items() if s)
        value = max(0, min(100, total))
        reasons = ";".join(f"{l}:{rsn[l]}" for l in config.LEVEL_ORDER if rsn[l])
        out[k] = Result(score=value, cls=_class(value, sig, rsn), reasons=reasons, signals=sig)
    return out
