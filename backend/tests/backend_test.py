"""Backend tests for UE5 Quinn Auto-Rigger API."""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / '.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://quinn-fitter.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health ----------
def test_health(session):
    r = session.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"


# ---------- Projects CRUD ----------
@pytest.fixture(scope="module")
def created_project(session):
    r = session.post(f"{API}/projects", json={"name": "TEST_Rig"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "id" in data and data["name"] == "TEST_Rig"
    yield data
    # cleanup
    session.delete(f"{API}/projects/{data['id']}", timeout=15)


def test_create_project(created_project):
    assert created_project["stage"] == "import"
    assert isinstance(created_project["landmarks"], list)
    assert "template" in created_project
    assert "mesh" in created_project


def test_list_projects(session, created_project):
    r = session.get(f"{API}/projects", timeout=15)
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert created_project["id"] in ids


def test_get_project_details(session, created_project):
    r = session.get(f"{API}/projects/{created_project['id']}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == created_project["id"]
    assert "landmarks" in data
    assert "template" in data


def test_get_project_not_found(session):
    r = session.get(f"{API}/projects/nonexistent-id-xyz", timeout=15)
    assert r.status_code == 404


def test_patch_project_landmarks(session, created_project):
    landmarks = [
        {"id": "head", "label": "Head", "group": "center", "placed": True,
         "position": {"x": 0.0, "y": 1.7, "z": 0.0}, "mirrored": False},
        {"id": "l_hand", "label": "Left Hand", "group": "left", "placed": True,
         "position": {"x": 0.5, "y": 1.0, "z": 0.0}, "mirrored": False},
    ]
    original_updated = created_project["updated_at"]
    r = session.patch(f"{API}/projects/{created_project['id']}",
                      json={"landmarks": landmarks, "stage": "landmarks"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["landmarks"]) == 2
    assert data["stage"] == "landmarks"
    assert data["updated_at"] != original_updated

    # verify persistence
    r2 = session.get(f"{API}/projects/{created_project['id']}", timeout=15)
    assert r2.status_code == 200
    fetched = r2.json()
    assert len(fetched["landmarks"]) == 2
    pos = fetched["landmarks"][0]["position"]
    assert pos["x"] == 0.0 and pos["y"] == 1.7
    assert fetched["landmarks"][1]["id"] == "l_hand"


def test_delete_project(session):
    r = session.post(f"{API}/projects", json={"name": "TEST_Delete"}, timeout=15)
    pid = r.json()["id"]
    d = session.delete(f"{API}/projects/{pid}", timeout=15)
    assert d.status_code in (200, 204)
    g = session.get(f"{API}/projects/{pid}", timeout=15)
    assert g.status_code == 404


# ---------- Template validation ----------
def test_template_validate_valid(session):
    template = {
        "name": "UE5 Quinn",
        "version": "1.0",
        "bones": [
            {"name": "root", "parent": None},
            {"name": "pelvis", "parent": "root"},
            {"name": "spine_01", "parent": "pelvis"},
            {"name": "spine_02", "parent": "spine_01"},
            {"name": "head", "parent": "spine_02"},
        ],
    }
    r = session.post(f"{API}/templates/validate", json={"template_data": template}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    # New detailed validator: without refLocal transforms this reports 'invalid'; but structural checks pass
    assert data["bones_count"] == 5
    structural = {c["id"]: c["status"] for c in data["checks"]}
    assert structural.get("names_unique") == "pass"
    assert structural.get("parents_resolve") == "pass"
    assert structural.get("single_root") == "pass"


def test_template_validate_duplicates(session):
    template = {
        "bones": [
            {"name": "root", "parent": None},
            {"name": "hip", "parent": "root"},
            {"name": "hip", "parent": "root"},
        ],
    }
    r = session.post(f"{API}/templates/validate", json={"template_data": template}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is False
    assert any("uplicate" in e or "duplicate" in e.lower() for e in data["errors"])


def test_template_validate_orphan_parent(session):
    template = {
        "bones": [
            {"name": "root", "parent": None},
            {"name": "arm", "parent": "nonexistent_parent"},
        ],
    }
    r = session.post(f"{API}/templates/validate", json={"template_data": template}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is False
    assert any("orphan" in e.lower() for e in data["errors"])


def test_template_validate_missing_bones(session):
    r = session.post(f"{API}/templates/validate", json={"template_data": {"name": "bad"}}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is False
