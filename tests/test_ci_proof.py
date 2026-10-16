import pytest

from scripts.public_ci import PUBLIC, validate_run


def test_only_completed_exact_sha_run_can_be_proven():
    result = {"status": "completed", "conclusion": "success", "head_sha": "a"*40,
              "event": "workflow_dispatch", "name": "Verify exact SV Itineris SHA",
              "path": ".github/workflows/verify.yml", "repository": {"full_name": PUBLIC}}
    validate_run(result, "a"*40)
    for field, value in [("head_sha", "b"*40), ("conclusion", "skipped"), ("status", "in_progress"),
                         ("event", "pull_request"), ("path", ".github/workflows/other.yml")]:
        bad = dict(result, **{field: value})
        with pytest.raises(ValueError):
            validate_run(bad, "a"*40)
