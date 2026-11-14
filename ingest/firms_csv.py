"""Content checks shared by both fetchers: "did we really get correct FIRMS rows?"

A file is only written (atomically) after it passes these checks, so anything on disk under
data/raw/ is a complete, well-formed FIRMS CSV for exactly the requested period.

Expected archive headers were verified on real Italy files, modis 2000-2025 and
viirs-snpp 2012-2025 (research/02-field-reference.md §A): identical in every year.
API/NRT headers have not been seen yet, so for the API only the core columns are required.
"""

import csv
import datetime as dt
import re
from typing import Iterable

ARCHIVE_HEADERS = {
    "modis": ("latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time", "satellite",
              "instrument", "confidence", "version", "bright_t31", "frp", "daynight", "type"),
    "viirs-snpp": ("latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite",
                   "instrument", "confidence", "version", "bright_ti5", "frp", "daynight", "type"),
}
CORE_COLUMNS = ("latitude", "longitude", "acq_date", "acq_time", "frp")
_TIME = re.compile(r"\d{1,4}")


class CsvProblem(ValueError):
    """The content is not a complete, valid FIRMS CSV for the requested period."""


def check_lines(lines: Iterable[str], *, first_day: dt.date, last_day: dt.date,
                expected_header: tuple[str, ...] | None = None) -> tuple[int, dt.date | None, dt.date | None]:
    """Validate a FIRMS CSV; return (row_count, min_acq_date, max_acq_date).

    Empty input is valid (no detections). Raises CsvProblem with a line number otherwise.
    """
    reader = csv.reader(lines)
    header = next(reader, None)
    if header is None or header == []:
        return 0, None, None
    header = [h.strip().lower() for h in header]
    if header[0] != "latitude":
        raise CsvProblem(f"not a FIRMS CSV, first line starts with {','.join(header)[:60]!r}")
    if expected_header is not None and tuple(header) != expected_header:
        missing = [c for c in expected_header if c not in header]
        extra = [c for c in header if c not in expected_header]
        detail = f"missing {missing}, unexpected {extra}" if missing or extra else "same names, different order"
        raise CsvProblem(f"columns differ from the verified FIRMS header: {detail}")
    absent = [c for c in CORE_COLUMNS if c not in header]
    if absent:
        raise CsvProblem(f"required columns missing: {absent}")
    i_lat, i_lon, i_date, i_time = (header.index(c) for c in ("latitude", "longitude", "acq_date", "acq_time"))

    count, lo, hi = 0, None, None
    for line_no, row in enumerate(reader, start=2):
        if not row:
            continue
        if len(row) != len(header):
            raise CsvProblem(f"line {line_no}: {len(row)} fields, header has {len(header)} (truncated or corrupt file?)")
        try:
            day = dt.date.fromisoformat(row[i_date])
            lat, lon = float(row[i_lat]), float(row[i_lon])
        except ValueError:
            raise CsvProblem(f"line {line_no}: unparsable acq_date/latitude/longitude {row[i_date]!r}, {row[i_lat]!r}, {row[i_lon]!r}") from None
        if not first_day <= day <= last_day:
            raise CsvProblem(f"line {line_no}: acq_date {day} outside requested {first_day}..{last_day}")
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise CsvProblem(f"line {line_no}: coordinates out of range ({lat}, {lon})")
        t = row[i_time]
        if not _TIME.fullmatch(t) or int(t) // 100 > 23 or int(t) % 100 > 59:
            raise CsvProblem(f"line {line_no}: acq_time {t!r} is not HHMM")
        count += 1
        lo = day if lo is None or day < lo else lo
        hi = day if hi is None or day > hi else hi
    return count, lo, hi
