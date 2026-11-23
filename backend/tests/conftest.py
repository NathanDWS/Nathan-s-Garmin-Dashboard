import os
import tempfile

# garmin_fetch opens SQLITE_DB_PATH at import time; keep it out of the repo.
os.environ.setdefault("SQLITE_DB_PATH", os.path.join(tempfile.mkdtemp(), "import.db"))

import pytest

from dashboard.config import Paths


@pytest.fixture
def paths(tmp_path):
    p = Paths(tmp_path)
    p.data.mkdir(parents=True, exist_ok=True)
    return p
