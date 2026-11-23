import pytest

from dashboard.config import Paths


@pytest.fixture
def paths(tmp_path):
    p = Paths(tmp_path)
    p.data.mkdir(parents=True, exist_ok=True)
    return p
