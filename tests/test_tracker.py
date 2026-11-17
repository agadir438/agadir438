"""Tests du jeu de données et du classeur Excel de suivi."""
import json
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import build_sample_data  # noqa: E402
import generate_excel  # noqa: E402


@pytest.fixture(scope="module")
def data():
    return build_sample_data.build()


def test_validations_are_sequential(data):
    """Aucune étape validée après une étape non validée (workflow séquentiel)."""
    for s in data["streams"]:
        statuses = [v["status"] for v in sorted(data["validations"], key=lambda v: v["step"]) if v["streamId"] == s["id"]]
        assert len(statuses) == len(data["steps"])
        first_open = next((i for i, st in enumerate(statuses) if st != "Validé"), len(statuses))
        assert all(st != "Validé" for st in statuses[first_open:])
        active = [st for st in statuses if st in ("En cours", "Soumis", "Rejeté")]
        assert len(active) <= 1


def test_references_are_consistent(data):
    stream_ids = {s["id"] for s in data["streams"]}
    task_ids = {t["id"] for t in data["tasks"]}
    statuses = {s["name"] for s in data["logStatuses"]}
    assert all(t["streamId"] in stream_ids and t["start"] <= t["end"] and 0 <= t["progress"] <= 1 for t in data["tasks"])
    assert all(l["streamId"] in stream_ids and l["taskId"] in task_ids and l["status"] in statuses for l in data["logs"])
    assert len({l["id"] for l in data["logs"]}) == len(data["logs"])


def test_excel_structure(data, tmp_path):
    out = generate_excel.build(data, tmp_path / "suivi.xlsx")
    wb = load_workbook(out)
    assert wb.sheetnames == ["Guide", "Tableau de bord", "Streams", "Validations", "Tâches", "Logs", "Historique", "Listes"]
    ts, ls, vs = wb["Tâches"], wb["Logs"], wb["Validations"]
    assert ts["D5"].value == "Tâche" and ts["J5"].value == "% avancement"
    assert ts["K6"].value.startswith("=IF(") and "En retard" in ts["K6"].value
    assert ls["Q6"].value.startswith("=IF(") and "VLOOKUP" in ls["Q6"].value
    assert "Étape précédente non validée" in vs["K7"].value
    # toutes les lignes de données sont reportées
    assert sum(1 for r in range(6, 6 + 400) if ts[f"A{r}"].value) == len(data["tasks"])
    assert sum(1 for r in range(6, 6 + 600) if ls[f"A{r}"].value) == len(data["logs"])


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_server_api(tmp_path):
    node = subprocess.run(["which", "node"], capture_output=True, text=True).stdout.strip()
    if not node:
        pytest.skip("node non disponible")
    port = _free_port()
    proc = subprocess.Popen([node, str(ROOT / "server" / "server.js")], env={"PORT": str(port), "HOST": "127.0.0.1", "DATA_FILE": str(tmp_path / "db.json"), "PATH": "/usr/bin:/bin"})
    try:
        base = f"http://127.0.0.1:{port}"
        for _ in range(50):
            try:
                v = json.load(urllib.request.urlopen(base + "/api/version"))
                break
            except OSError:
                time.sleep(0.1)
        st = json.load(urllib.request.urlopen(base + "/api/state"))
        put = lambda base_v: urllib.request.Request(base + "/api/state", method="PUT", headers={"Content-Type": "application/json"},
                                                    data=json.dumps({"baseVersion": base_v, "user": "test", "state": st["state"]}).encode())
        r = json.load(urllib.request.urlopen(put(v["version"])))
        assert r["version"] == v["version"] + 1
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(put(v["version"]))  # version obsolète -> conflit
        assert e.value.code == 409
        assert urllib.request.urlopen(base + "/").status == 200
        assert (tmp_path / "db.json").exists()
    finally:
        proc.terminate()
