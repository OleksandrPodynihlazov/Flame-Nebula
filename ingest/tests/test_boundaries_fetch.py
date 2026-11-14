"""boundaries_fetch.py: resume logic and skipping complete files. No network.

    python3 -m unittest ingest/tests/test_boundaries_fetch.py -v
"""

import io
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import boundaries_fetch as bf  # noqa: E402


class ResumeOffset(unittest.TestCase):
    def test_resume_offset(self):
        self.assertEqual(bf.resume_offset(None, 100), 0)      # missing -> from the start
        self.assertEqual(bf.resume_offset(40, 100), 40)       # partial -> resume
        self.assertIsNone(bf.resume_offset(100, 100))         # complete -> skip
        self.assertEqual(bf.resume_offset(120, 100), 0)       # bigger than remote -> start over


class Main(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_complete_files_are_skipped(self):
        for name in bf.FILES:
            (self.tmp / name).write_bytes(b"12345")

        def no_download(*a, **k):
            raise AssertionError("must not download complete files")

        out = io.StringIO()
        with redirect_stdout(out):
            code = bf.main(["--out", str(self.tmp)], remote_size=lambda url: 5, download=no_download)
        self.assertEqual(code, 0)
        self.assertEqual(out.getvalue().count("complete, skipped"), 3)

    def test_partial_file_resumes_from_its_size(self):
        calls = []
        for name in bf.FILES:
            (self.tmp / name).write_bytes(b"12345")
        (self.tmp / bf.FILES[2]).write_bytes(b"12")

        def download(url, dest, offset):
            calls.append((Path(dest).name, offset))
            with open(dest, "ab") as fh:
                fh.write(b"345"[offset - 2:])

        with redirect_stdout(io.StringIO()):
            code = bf.main(["--out", str(self.tmp)], remote_size=lambda url: 5, download=download)
        self.assertEqual(code, 0)
        self.assertEqual(calls, [(bf.FILES[2], 2)])


if __name__ == "__main__":
    unittest.main()
