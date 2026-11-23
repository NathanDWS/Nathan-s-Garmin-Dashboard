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


def test_insight_detail_uses_dutch_date():
    card = insights._card({"metric": "restingHeartRate", "date": "2026-11-22", "value": 58, "baseline_mean": 52,
                           "baseline_std": 2, "z_score": 3, "direction": "above"})
    assert "22 nov" in card["detail"] and "2026-11-22" not in card["detail"]
    assert card["severity"] == "let_op"


class ToolAgent(FakeAgent):
    """Each turn: user text, assistant tool_use, user tool_result, assistant text (like HealthAgent)."""

    turns = 0

    def chat(self, message, history=None):
        history.append({"role": "user", "content": message})
        ToolAgent.turns += 1
        for _ in range((1, 2, 1, 1, 3)[ToolAgent.turns % 5]):  # irregular tool round trips per turn
            history.append({"role": "assistant", "content": [{"type": "tool_use", "id": "t"}]})
            history.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t"}]})
        history.append({"role": "assistant", "content": "ok"})
        return "ok"


def test_trimmed_history_starts_with_a_real_user_message(paths, store, monkeypatch):
    from dashboard.coach import MAX_HISTORY_MESSAGES

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    coach = Coach(paths, store, agent_factory=ToolAgent)
    for i in range(MAX_HISTORY_MESSAGES):
        coach.chat("a", "s1", f"vraag {i}")
        h = coach._histories[("a", "s1")]
        assert len(h) <= MAX_HISTORY_MESSAGES
        assert h[0]["role"] == "user" and isinstance(h[0]["content"], str), h[0]
