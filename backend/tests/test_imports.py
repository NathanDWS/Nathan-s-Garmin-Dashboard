def test_vendored_packages_import():
    import garmin_grafana.garmin_fetch  # noqa: F401
    import garmin_grafana.sqlite_manager  # noqa: F401
    from garmin_insights.agent import HealthAgent
    from garmin_insights.insights.proactive import InsightScanner

    assert HealthAgent and InsightScanner
