"""Phase B: Fitted skeleton persistence tests."""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / 'frontend' / '.env')
load_dotenv(Path(__file__).parent.parent / '.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture()
def project(session):
    r = session.post(f"{API}/projects", json={"name": "TEST_PhaseB_Fit"}, timeout=15)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    session.delete(f"{API}/projects/{pid}", timeout=15)


def test_fitted_field_defaults_none_fit_approved_false(session, project):
    g = session.get(f"{API}/projects/{project}", timeout=15).json()
    assert g["fitted"] is None
    assert g["fit_approved"] is False


def test_patch_fitted_and_fit_approved_persists(session, project):
    fitted = {
        "bones": [
            {"name": "root", "parent": None, "globalPos": [0, 0, 0],
             "localPos": [0, 0, 0], "localRot": [0, 0, 0, 1], "localScale": [1, 1, 1],
             "method": "template-root", "status": "pass", "message": "", "manual": False},
            {"name": "pelvis", "parent": "root", "globalPos": [0, 0.95, 0],
             "localPos": [0, 0.95, 0], "localRot": [0, 0, 0, 1], "localScale": [1, 1, 1],
             "method": "landmark", "status": "pass", "message": "", "manual": False},
        ],
        "report": {
            "bone_count": 2, "warn_count": 0, "error_count": 0,
            "missing_landmarks": [], "overall": "pass",
        },
    }
    r = session.patch(f"{API}/projects/{project}",
                      json={"fitted": fitted, "fit_approved": True, "stage": "skeleton"},
                      timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["fit_approved"] is True
    assert data["fitted"]["report"]["bone_count"] == 2
    assert data["fitted"]["bones"][1]["name"] == "pelvis"
    assert data["stage"] == "skeleton"

    # Persistence check
    g = session.get(f"{API}/projects/{project}", timeout=15).json()
    assert g["fit_approved"] is True
    assert g["fitted"]["bones"][0]["method"] == "template-root"
    assert g["fitted"]["bones"][1]["parent"] == "root"
    assert g["fitted"]["report"]["overall"] == "pass"


def test_patch_fit_approval_roundtrip(session, project):
    """REQ 7: PATCH /api/projects with fit_approved + fit_approval persists and round-trips via GET."""
    approval = {
        "approved_at": "2026-01-15T10:20:30.000Z",
        "acknowledged_warnings": 38,
        "acknowledged_by_user": True,
        "comparison_overall": "warning",
        "bone_count": 89,
    }
    r = session.patch(f"{API}/projects/{project}",
                      json={"fit_approved": True, "fit_approval": approval},
                      timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["fit_approved"] is True
    assert data["fit_approval"]["acknowledged_warnings"] == 38
    assert data["fit_approval"]["comparison_overall"] == "warning"

    g = session.get(f"{API}/projects/{project}", timeout=15).json()
    assert g["fit_approved"] is True
    assert g["fit_approval"]["approved_at"] == approval["approved_at"]
    assert g["fit_approval"]["bone_count"] == 89


def test_patch_fitted_null_clears(session, project):
    # first set
    session.patch(f"{API}/projects/{project}",
                  json={"fitted": {"bones": [], "report": {}}, "fit_approved": True},
                  timeout=15)
    # clear
    r = session.patch(f"{API}/projects/{project}", json={"fitted": None, "fit_approved": False}, timeout=15)
    assert r.status_code == 200
    g = session.get(f"{API}/projects/{project}", timeout=15).json()
    assert g["fitted"] is None
    assert g["fit_approved"] is False


# Regression spot-check: templates/validate + list still work
def test_regression_templates_validate(session):
    r = session.post(f"{API}/templates/validate", json={"template_data": {
        "bones": [{"name": "root", "parent": None}]
    }}, timeout=15)
    assert r.status_code == 200
    assert "checks" in r.json()


def test_regression_list_templates(session):
    r = session.get(f"{API}/templates", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
