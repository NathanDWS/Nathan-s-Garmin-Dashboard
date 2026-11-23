import pytest

from dashboard import insights
from dashboard.coach import Coach, CoachUnavailable
from dashboard.profiles import ProfileStore
from dashboard.sample import seed_demo


class FakeAgent:
    instances = []

    def __init__(self, settings):
        self.settings = settings
        self.seen = []
        FakeAgent.instances.append(self)

    def chat(self, message, history=None):
        history.append({"role": "user", "content": message})
        history.append({"role": "assistant", "content": "ok"})
        self.seen.append(len(history))
        return f"antwoord voor {self.settings.display_name}"


@pytest.fixture
def store(paths):
    s = ProfileStore(paths)
    s.add("A", "a@x.nl")
    s.add("B", "b@x.nl")
    return s


def test_chat_without_key(paths, store, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    coach = Coach(paths, store, agent_factory=FakeAgent)
    with pytest.raises(CoachUnavailable) as e:
        coach.chat("a", "s1", "hoi")
    assert "ANTHROPIC_API_KEY" in str(e.value)


def test_history_isolated_per_profile(paths, store, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    FakeAgent.instances.clear()
    coach = Coach(paths, store, agent_factory=FakeAgent)
    assert coach.chat("a", "s1", "hoi") == "antwoord voor A"
    coach.chat("a", "s1", "nog een")
    coach.chat("b", "s1", "hoi")
    a, b = FakeAgent.instances
    assert a.seen == [2, 4] and b.seen == [2]
    assert str(a.settings.sqlite_db_path).endswith("garmin.db")
    coach.reset("a", "s1")
    coach.chat("a", "s1", "opnieuw")
    assert a.seen[-1] == 2


def test_copy_prompt_contains_recent_numbers(paths):
    store = ProfileStore(paths)
    seed_demo(paths, store)
    from dashboard.bundle import build_bundle

    last_rhr = [d for d in build_bundle(paths.db("demo"))["daily"] if d["resting_hr"]][-1]["resting_hr"]
    text = Coach(paths, store).copy_prompt("demo")
    assert "Voorbeeld" in text
    assert f"{last_rhr}" in text
    assert "geen medisch advies" in text.lower()


def test_insights_short_history_empty(paths):
    store = ProfileStore(paths)
    store.add("A", "a@x.nl")
    assert insights.today(paths, "a") == []


def test_insights_demo_at_most_three(paths):
    store = ProfileStore(paths)
    seed_demo(paths, store)
    items = insights.today(paths, "demo")
    assert len(items) <= 3
    for it in items:
        assert set(it) >= {"title", "detail", "severity"}
        assert it["severity"] in ("info", "let_op")
