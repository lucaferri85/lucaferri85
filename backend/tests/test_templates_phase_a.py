"""Phase A: Template validation matrix + Templates CRUD persistence tests."""
import os
import math
import hashlib
import json
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


def _bone(name, parent, pos=(0, 0, 0), rot=(0, 0, 0, 1), scale=(1, 1, 1), gpos=None):
    return {
        "name": name,
        "parent": parent,
        "refLocal": {"pos": list(pos), "rot": list(rot), "scale": list(scale)},
        "refGlobal": list(gpos if gpos is not None else pos),
    }


def _clean_skeleton():
    # global positions chained along Y so height ~ 1.5 m
    return {
        "name": "Clean",
        "version": "1.0",
        "source": "user_authoritative",
        "provenance": {
            "origin_format": "fbx",
            "fbx_version": 7400,
            "origin_filename": "clean.fbx",
            "sha256": "deadbeef" * 8,
        },
        "bones": [
            _bone("root", None, gpos=(0, 0, 0)),
            _bone("pelvis", "root", pos=(0, 0.95, 0), gpos=(0, 0.95, 0)),
            _bone("spine_01", "pelvis", pos=(0, 0.15, 0), gpos=(0, 1.10, 0)),
            _bone("head", "spine_01", pos=(0, 0.45, 0), gpos=(0, 1.55, 0)),
            _bone("clavicle_l", "spine_01", pos=(0.05, 0.1, 0), gpos=(0.05, 1.20, 0)),
            _bone("clavicle_r", "spine_01", pos=(-0.05, 0.1, 0), gpos=(-0.05, 1.20, 0)),
            _bone("hand_l", "clavicle_l", pos=(0.6, 0, 0), gpos=(0.65, 1.20, 0)),
            _bone("hand_r", "clavicle_r", pos=(-0.6, 0, 0), gpos=(-0.65, 1.20, 0)),
            _bone("thigh_l", "pelvis", pos=(0.1, -0.1, 0), gpos=(0.1, 0.85, 0)),
            _bone("thigh_r", "pelvis", pos=(-0.1, -0.1, 0), gpos=(-0.1, 0.85, 0)),
            _bone("foot_l", "thigh_l", pos=(0, -0.8, 0), gpos=(0.1, 0.05, 0)),
            _bone("foot_r", "thigh_r", pos=(0, -0.8, 0), gpos=(-0.1, 0.05, 0)),
        ],
    }


def _post_validate(session, tpl, required=None):
    r = session.post(f"{API}/templates/validate",
                     json={"template_data": tpl, "required_bones": required or []},
                     timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _check(result, cid):
    return next((c for c in result["checks"] if c["id"] == cid), None)


# ---------- Validation matrix ----------

def test_clean_skeleton_not_invalid(session):
    res = _post_validate(session, _clean_skeleton())
    assert res["status"] in ("valid", "warning"), res
    assert res["bones_count"] == 12


def test_duplicate_names_fail(session):
    tpl = _clean_skeleton()
    tpl["bones"].append(_bone("head", "spine_01"))
    res = _post_validate(session, tpl)
    c = _check(res, "names_unique")
    assert c and c["status"] == "fail"
    assert res["status"] == "invalid"


def test_orphan_parent_fail(session):
    tpl = _clean_skeleton()
    tpl["bones"].append(_bone("wing", "nonexistent"))
    res = _post_validate(session, tpl)
    c = _check(res, "parents_resolve")
    assert c and c["status"] == "fail"
    assert res["status"] == "invalid"


def test_two_roots_fail(session):
    tpl = _clean_skeleton()
    tpl["bones"].append(_bone("root2", None))
    res = _post_validate(session, tpl)
    c = _check(res, "single_root")
    assert c and c["status"] == "fail"


def test_missing_bones_fail(session):
    res = _post_validate(session, {"name": "empty"})
    c = _check(res, "bones_present")
    assert c and c["status"] == "fail"
    assert res["status"] == "invalid"


def test_required_bones_missing_landmark_targets_fail(session):
    res = _post_validate(session, _clean_skeleton(), required=["hand_l", "notabone_xyz"])
    c = _check(res, "landmark_targets")
    assert c and c["status"] == "fail"


def test_l_without_r_warn(session):
    tpl = _clean_skeleton()
    tpl["bones"].append(_bone("finger_l", "hand_l"))
    res = _post_validate(session, tpl)
    c = _check(res, "lr_symmetry")
    assert c and c["status"] == "warn"


def test_non_unit_quaternion_warn(session):
    tpl = _clean_skeleton()
    # break quaternion on head
    for b in tpl["bones"]:
        if b["name"] == "head":
            b["refLocal"]["rot"] = [0.5, 0.5, 0.5, 0.5001]  # actually still norm ~1; make clearly off
            b["refLocal"]["rot"] = [0.2, 0.3, 0.4, 0.8]
    res = _post_validate(session, tpl)
    c = _check(res, "quaternions_unit")
    assert c and c["status"] == "warn"


# ---------- Templates CRUD + upsert ----------

@pytest.fixture(scope="module")
def saved_ids():
    ids = []
    yield ids
    # cleanup
    s = requests.Session()
    for tid in ids:
        try:
            s.delete(f"{API}/templates/{tid}", timeout=15)
        except Exception:
            pass


def test_save_template_and_get(session, saved_ids):
    tpl = _clean_skeleton()
    tpl["name"] = "TEST_SavedTpl"
    body = json.dumps(tpl, sort_keys=True).encode()
    tpl["provenance"]["sha256"] = hashlib.sha256(body).hexdigest()
    r = session.post(f"{API}/templates", json={"template_data": tpl, "validation": {"status": "warning"}}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["id"] and data["name"] == "TEST_SavedTpl"
    assert data["bone_count"] == 12
    assert data["source"] == "user_authoritative"
    saved_ids.append(data["id"])
    # GET full
    g = session.get(f"{API}/templates/{data['id']}", timeout=15)
    assert g.status_code == 200
    full = g.json()
    assert "template_data" in full and full["template_data"]["name"] == "TEST_SavedTpl"


def test_save_template_upsert_same_sha(session, saved_ids):
    tpl = _clean_skeleton()
    tpl["name"] = "TEST_Upsert"
    tpl["provenance"]["sha256"] = "a" * 64
    r1 = session.post(f"{API}/templates", json={"template_data": tpl}, timeout=15)
    r2 = session.post(f"{API}/templates", json={"template_data": tpl}, timeout=15)
    assert r1.status_code == 200 and r2.status_code == 200
    id1, id2 = r1.json()["id"], r2.json()["id"]
    assert id1 == id2, "same sha256 must upsert (same id)"
    saved_ids.append(id1)
    lst = session.get(f"{API}/templates", timeout=15).json()
    matches = [t for t in lst if t["id"] == id1]
    assert len(matches) == 1


def test_list_templates_has_no_template_data(session):
    lst = session.get(f"{API}/templates", timeout=15).json()
    assert isinstance(lst, list)
    for item in lst:
        assert "template_data" not in item


def test_delete_template_404(session, saved_ids):
    tpl = _clean_skeleton()
    tpl["name"] = "TEST_DeleteMe"
    tpl["provenance"]["sha256"] = "b" * 64
    r = session.post(f"{API}/templates", json={"template_data": tpl}, timeout=15)
    tid = r.json()["id"]
    d = session.delete(f"{API}/templates/{tid}", timeout=15)
    assert d.status_code == 200
    g = session.get(f"{API}/templates/{tid}", timeout=15)
    assert g.status_code == 404


def test_save_template_empty_bones_400(session):
    r = session.post(f"{API}/templates", json={"template_data": {"name": "empty", "bones": []}}, timeout=15)
    assert r.status_code == 400


# ---------- Projects with template.source persisted ----------

def test_project_patch_persists_template_source(session):
    r = session.post(f"{API}/projects", json={"name": "TEST_PhaseA"}, timeout=15)
    pid = r.json()["id"]
    try:
        tpl_payload = {
            "name": "MyTpl",
            "version": "fbx-7400",
            "source": "user_authoritative",
            "bones_count": 9,
            "saved_template_id": None,
            "template_data": {"bones": [{"name": "root", "parent": None}]},
        }
        p = session.patch(f"{API}/projects/{pid}", json={"template": tpl_payload}, timeout=15)
        assert p.status_code == 200, p.text
        g = session.get(f"{API}/projects/{pid}", timeout=15).json()
        assert g["template"]["source"] == "user_authoritative"
        assert g["template"]["bones_count"] == 9
        assert g["template"]["version"] == "fbx-7400"
        assert g["template"]["template_data"]["bones"][0]["name"] == "root"
    finally:
        session.delete(f"{API}/projects/{pid}", timeout=15)
