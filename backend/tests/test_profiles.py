from dashboard import envfile
from dashboard.profiles import ProfileStore, slugify


def test_slug():
    assert slugify("Papa IJpma") == "papa_ijpma"
    assert slugify("Zoë") == "zoe"
    assert slugify("  !! ") == "profiel"


def test_add_duplicate_name_gets_suffix(paths):
    store = ProfileStore(paths)
    a = store.add("Nathan", "a@x.nl")
    b = store.add("Nathan", "b@x.nl")
    c = store.add("Nathan", "c@x.nl")
    assert (a.id, b.id, c.id) == ("nathan", "nathan_2", "nathan_3")


def test_colors_assigned_and_hex(paths):
    store = ProfileStore(paths)
    p = store.add("A", "a@x.nl")
    assert p.color.startswith("#") and len(p.color) == 7


def test_profiles_persist_across_instances(paths):
    ProfileStore(paths).add("Papa", "p@x.nl")
    again = ProfileStore(paths)
    assert [p.id for p in again.list()] == ["papa"]
    assert again.get("papa").email == "p@x.nl"


def test_remove_cleans_files_and_env(paths):
    store = ProfileStore(paths)
    p = store.add("Papa", "p@x.nl")
    paths.db(p.id).parent.mkdir(parents=True)
    paths.db(p.id).write_text("x")
    paths.tokens(p.id).mkdir(parents=True)
    envfile.set_var(paths.env_file, store.password_var(p.id), "secret")
    store.remove(p.id)
    assert not paths.db(p.id).parent.exists()
    assert not paths.tokens(p.id).exists()
    assert envfile.get_var(paths.env_file, "GARMIN_PASSWORD_PAPA") is None
    assert store.list() == []


def test_get_unknown_raises(paths):
    import pytest

    with pytest.raises(KeyError):
        ProfileStore(paths).get("nope")
