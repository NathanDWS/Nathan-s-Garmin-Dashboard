from dotenv import dotenv_values

from dashboard import envfile


def test_env_roundtrip_special_chars(tmp_path):
    path = tmp_path / ".env"
    value = 'p#ss = "x" \\'
    envfile.set_var(path, "GARMIN_PASSWORD_A", value)
    assert envfile.get_var(path, "GARMIN_PASSWORD_A") == value
    assert dotenv_values(path)["GARMIN_PASSWORD_A"] == value


def test_set_var_preserves_other_lines(tmp_path):
    path = tmp_path / ".env"
    path.write_text("# comment\nANTHROPIC_API_KEY=abc\nX=1\n", encoding="utf-8")
    envfile.set_var(path, "X", "2")
    text = path.read_text(encoding="utf-8")
    assert "# comment" in text
    assert "ANTHROPIC_API_KEY=abc" in text
    assert text.count("X=") == 1
    assert envfile.get_var(path, "X") == "2"


def test_remove_var(tmp_path):
    path = tmp_path / ".env"
    envfile.set_var(path, "A", "1")
    envfile.set_var(path, "B", "2")
    envfile.remove_var(path, "A")
    assert envfile.get_var(path, "A") is None
    assert envfile.get_var(path, "B") == "2"


def test_get_var_missing_file(tmp_path):
    assert envfile.get_var(tmp_path / "nope.env", "A") is None
