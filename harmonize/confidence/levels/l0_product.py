"""L0: the product's own detection confidence (weak evidence, both ways)."""

NAME = "L0"
SIGNAL = {"high": 1, "nominal": 0, "low": -1}


def run(ctx):
    return {h.key: (SIGNAL[h.conf_level], f"conf:{h.conf_level}") for h in ctx.hotspots}
