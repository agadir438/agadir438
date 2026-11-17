"""Génère le jeu de données d'exemple (streams, étapes, tâches, logs, validations).

Source unique utilisée par :
  - data/sample_data.json            (données brutes)
  - platform/js/sample-data.js       (données chargées par la plateforme web)
  - tools/generate_excel.py          (fichier Excel de suivi)

Usage : python tools/build_sample_data.py
"""
import json
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TODAY = date(2026, 11, 17)
PROJECT_START = date(2026, 9, 7)  # lundi

STEPS = [
    {"n": 1, "name": "Cadrage & inventaire des logs",
     "criteria": "Périmètre applicatif validé, inventaire des sources de logs complet, interlocuteurs identifiés"},
    {"n": 2, "name": "Qualification des sources",
     "criteria": "Format, volumétrie, rétention et criticité renseignés pour chaque log ; index cible défini"},
    {"n": 3, "name": "Configuration de la collecte",
     "criteria": "Universal Forwarder / HEC / Syslog déployés, inputs.conf en place, données reçues dans Splunk"},
    {"n": 4, "name": "Parsing & normalisation (CIM)",
     "criteria": "props.conf / transforms.conf validés, horodatage et champs extraits, conformité CIM vérifiée"},
    {"n": 5, "name": "Dashboards & alertes",
     "criteria": "Tableaux de bord et alertes métier livrés, recherches sauvegardées documentées"},
    {"n": 6, "name": "Recette utilisateur",
     "criteria": "Cas de test exécutés, anomalies bloquantes corrigées, PV de recette signé"},
    {"n": 7, "name": "Mise en production & validation finale",
     "criteria": "Bascule production effectuée, supervision active, validation finale du stream"},
]

LOG_STATUSES = [
    {"name": "À qualifier", "pct": 0.0},
    {"name": "Qualifié", "pct": 0.15},
    {"name": "Collecte configurée", "pct": 0.35},
    {"name": "Parsing OK", "pct": 0.55},
    {"name": "Indexé & normalisé", "pct": 0.7},
    {"name": "Dashboard / Alerte", "pct": 0.85},
    {"name": "Validé", "pct": 1.0},
]
# statut de log maximum atteignable selon l'étape courante du stream
STEP_TO_LOG_STATUS = {1: 0, 2: 1, 3: 2, 4: 3, 5: 5, 6: 5, 7: 6, 8: 6}

USERS = [
    {"id": "u1", "name": "Sarah Benali", "role": "Admin", "title": "Chef de projet / PMO"},
    {"id": "u2", "name": "Karim Idrissi", "role": "Validateur", "title": "Architecte Splunk"},
    {"id": "u3", "name": "Julie Morel", "role": "Validateur", "title": "Responsable sécurité (RSSI)"},
    {"id": "u4", "name": "Youssef Amrani", "role": "Contributeur", "title": "Ingénieur Splunk"},
    {"id": "u5", "name": "Claire Dubois", "role": "Contributeur", "title": "Référente applicative"},
    {"id": "u6", "name": "Mehdi Tazi", "role": "Contributeur", "title": "Ingénieur systèmes"},
]

STREAMS = [
    {"id": "ST01", "name": "Finance & Comptabilité", "owner": "Claire Dubois", "validator": "Karim Idrissi", "color": "#2563eb", "offset": 0},
    {"id": "ST02", "name": "Ressources Humaines", "owner": "Youssef Amrani", "validator": "Karim Idrissi", "color": "#7c3aed", "offset": 7},
    {"id": "ST03", "name": "Supply Chain & Logistique", "owner": "Mehdi Tazi", "validator": "Karim Idrissi", "color": "#0891b2", "offset": 14},
    {"id": "ST04", "name": "CRM & Commercial", "owner": "Claire Dubois", "validator": "Karim Idrissi", "color": "#db2777", "offset": 28},
    {"id": "ST05", "name": "Sécurité & IAM", "owner": "Youssef Amrani", "validator": "Julie Morel", "color": "#dc2626", "offset": 21},
    {"id": "ST06", "name": "Infrastructure & Middleware", "owner": "Mehdi Tazi", "validator": "Julie Morel", "color": "#16a34a", "offset": 42},
]
STEP_DAYS = [10, 10, 17, 17, 12, 10, 6]  # durée calendaire de chaque étape
SLIP = {"ST03": 0.75, "ST05": 1.0}  # ST03 est en retard (avancement réel plus faible)

APPS = {
    "ST01": [("SAP FI/CO", "Applicatif", "/usr/sap/PRD/log/*.log", "Universal Forwarder", "sap:fi", "app_finance", "sapprd01", "Texte multi-lignes", 850, "Haute"),
             ("SAP FI/CO", "Audit", "Security Audit Log SM20", "DB Connect", "sap:audit", "app_finance", "sapprd01", "Table SQL", 120, "Haute"),
             ("Kyriba Trésorerie", "Applicatif", "API REST /audit/events", "HEC", "kyriba:json", "app_finance", "saas", "JSON", 40, "Haute"),
             ("Sage Paie Fournisseurs", "Applicatif", "D:\\Sage\\logs\\*.txt", "Universal Forwarder", "sage:app", "app_finance", "sagesrv02", "Texte", 60, "Moyenne"),
             ("Portail factures", "Accès web", "/var/log/nginx/access.log", "Universal Forwarder", "nginx:access", "web_finance", "webfin01", "Combined log", 1500, "Moyenne")],
    "ST02": [("Workday", "Audit", "API Workday Audit Trail", "Add-on API", "workday:audit", "app_rh", "saas", "JSON", 90, "Haute"),
             ("Portail RH", "Applicatif", "/opt/tomcat/logs/catalina.out", "Universal Forwarder", "tomcat:catalina", "app_rh", "rhweb01", "Log4j", 300, "Moyenne"),
             ("Portail RH", "Accès web", "/var/log/httpd/access_log", "Universal Forwarder", "access_combined", "web_rh", "rhweb01", "Combined log", 700, "Basse"),
             ("Gestion des temps", "Applicatif", "Table T_LOG_EVENTS", "DB Connect", "gta:events", "app_rh", "gtadb01", "Table SQL", 50, "Moyenne"),
             ("Badgeuse", "Système", "Syslog UDP 514", "Syslog (SC4S)", "badge:syslog", "app_rh", "badge-gw", "Syslog RFC5424", 25, "Basse")],
    "ST03": [("SAP EWM", "Applicatif", "/usr/sap/EWM/log/*.trc", "Universal Forwarder", "sap:ewm", "app_supply", "ewmprd01", "Texte multi-lignes", 900, "Haute"),
             ("WMS Manhattan", "Applicatif", "/app/wms/logs/wms*.log", "Universal Forwarder", "wms:app", "app_supply", "wms01", "Log4j", 650, "Haute"),
             ("TMS Transport", "Interface", "API webhook événements", "HEC", "tms:json", "app_supply", "saas", "JSON", 80, "Moyenne"),
             ("EDI Fournisseurs", "Interface", "/data/edi/logs/*.log", "Universal Forwarder", "edi:as2", "app_supply", "edi01", "CSV", 200, "Haute"),
             ("Terminaux RF", "Système", "Syslog TCP 1514", "Syslog (SC4S)", "rf:syslog", "app_supply", "rf-gw", "Syslog RFC3164", 30, "Basse"),
             ("Bus ESB MuleSoft", "Interface", "CloudHub logs API", "Add-on API", "mulesoft:json", "app_supply", "saas", "JSON", 450, "Haute")],
    "ST04": [("Salesforce", "Audit", "Event Monitoring API", "Add-on API", "sfdc:logfile", "app_crm", "saas", "CSV", 300, "Haute"),
             ("Site e-commerce", "Accès web", "/var/log/nginx/*.log", "Universal Forwarder", "nginx:access", "web_crm", "shop01-04", "JSON", 4200, "Haute"),
             ("Site e-commerce", "Applicatif", "Logs conteneurs Kubernetes", "HEC (OTel Collector)", "kube:container", "app_crm", "k8s-prod", "JSON", 2500, "Haute"),
             ("Campagnes marketing", "Applicatif", "API événements", "HEC", "mkt:json", "app_crm", "saas", "JSON", 35, "Basse"),
             ("Centre d'appels", "Applicatif", "C:\\Genesys\\logs\\*.log", "Universal Forwarder", "genesys:app", "app_crm", "genesys01", "Texte", 180, "Moyenne")],
    "ST05": [("Active Directory", "Sécurité", "WinEventLog:Security", "Universal Forwarder", "XmlWinEventLog", "sec_windows", "dc01-dc04", "XML", 3500, "Haute"),
             ("Azure AD / Entra ID", "Sécurité", "Sign-in & Audit logs", "Add-on API", "azure:aad:signin", "sec_cloud", "saas", "JSON", 600, "Haute"),
             ("Bastion PAM", "Audit", "Syslog TLS 6514", "Syslog (SC4S)", "pam:syslog", "sec_pam", "bastion01", "CEF", 40, "Haute"),
             ("Pare-feu Palo Alto", "Réseau", "Syslog UDP 514", "Syslog (SC4S)", "pan:traffic", "sec_network", "fw01-fw02", "CSV", 8000, "Haute"),
             ("EDR", "Sécurité", "API alertes EDR", "Add-on API", "edr:alerts", "sec_endpoint", "saas", "JSON", 150, "Haute"),
             ("Proxy web", "Réseau", "Syslog TCP 1514", "Syslog (SC4S)", "proxy:access", "sec_network", "proxy01", "W3C", 5200, "Moyenne")],
    "ST06": [("Serveurs Linux", "Système", "/var/log/messages, secure", "Universal Forwarder", "linux_secure", "os_linux", "~350 serveurs", "Syslog", 2800, "Moyenne"),
             ("Serveurs Windows", "Système", "WinEventLog:System/Application", "Universal Forwarder", "XmlWinEventLog", "os_windows", "~220 serveurs", "XML", 2100, "Moyenne"),
             ("Oracle Database", "Audit", "Unified Audit Trail", "DB Connect", "oracle:audit", "db_audit", "oraprd01-03", "Table SQL", 400, "Haute"),
             ("VMware vSphere", "Système", "vCenter API / Syslog", "Add-on API", "vmware:events", "infra_vmware", "vcenter01", "Syslog", 900, "Basse"),
             ("Kafka", "Middleware", "/opt/kafka/logs/server.log", "Universal Forwarder", "kafka:server", "infra_mw", "kafka01-03", "Log4j", 350, "Moyenne")],
}
RETENTION = {"Haute": 365, "Moyenne": 180, "Basse": 90}
CIM_BY_STATUS = lambda idx: "Oui" if idx >= 4 else ("Partiel" if idx == 3 else "À vérifier")


def iso(d):
    return d.isoformat() if d else ""


def build():
    rnd = random.Random(42)
    tasks, validations, logs, history = [], [], [], []
    tcount = 0
    for s in STREAMS:
        start = PROJECT_START + timedelta(days=s["offset"])
        slip = SLIP.get(s["id"], 1.0)
        cur = start
        current_step = 8  # 8 = tout validé
        for st, days in zip(STEPS, STEP_DAYS):
            end = cur + timedelta(days=days - 1)
            # avancement théorique au prorata du temps écoulé, corrigé du glissement
            if TODAY > end:
                prog = 1.0
            elif TODAY < cur:
                prog = 0.0
            else:
                prog = (TODAY - cur).days / days
            if slip < 1 and prog > 0:
                prog = round(min(prog, 1.0) * slip, 2) if TODAY <= end + timedelta(days=21) else prog
            prog = round(min(prog, 1.0) / 0.05) * 0.05
            prog = round(prog, 2)
            # Tâches principales + sous-tâche de livraison
            for k, label in enumerate(["Réalisation", "Revue & livrable"]):
                tcount += 1
                t_start = cur if k == 0 else max(cur, end - timedelta(days=2))
                t_prog = prog if k == 0 else (1.0 if prog == 1.0 else (0.0 if prog < 0.8 else 0.5))
                validated = t_prog == 1.0 and end < TODAY - timedelta(days=3)
                tasks.append({
                    "id": f"T{tcount:03d}", "streamId": s["id"], "step": st["n"],
                    "name": f"{st['name']} – {label}",
                    "owner": s["owner"] if k == 0 else s["validator"],
                    "start": iso(t_start), "end": iso(end), "progress": t_prog,
                    "validation": "Validée" if validated else ("Soumise" if t_prog == 1.0 else "Non soumise"),
                    "validatedBy": s["validator"] if validated else "",
                    "validatedOn": iso(end + timedelta(days=2)) if validated else "",
                    "comment": "",
                })
            step_done = prog == 1.0 and end < TODAY - timedelta(days=3)
            if step_done and current_step == 8:
                status, by, on = "Validé", s["validator"], iso(end + timedelta(days=2))
            elif current_step == 8:
                current_step = st["n"]
                status, by, on = ("Soumis" if prog == 1.0 else "En cours"), "", ""
            else:
                status, by, on = "À faire", "", ""
            validations.append({"streamId": s["id"], "step": st["n"], "status": status,
                                "validatedBy": by, "validatedOn": on, "comment": ""})
            if status == "Validé":
                history.append({"date": on + "T10:00:00", "user": by, "type": "Étape stream",
                                "ref": f"{s['id']} / étape {st['n']}", "action": "Validé",
                                "comment": f"{st['name']} validée – passage à l'étape suivante"})
            cur = end + timedelta(days=1)
        s["currentStep"] = current_step

    # Un rejet pour l'exemple
    for v in validations:
        if v["streamId"] == "ST03" and v["status"] in ("En cours", "Soumis"):
            v["comment"] = "Rejet du 05/11 : parsing multi-lignes EWM incomplet, à reprendre"
            history.append({"date": "2026-11-05T15:30:00", "user": "Karim Idrissi", "type": "Étape stream",
                            "ref": f"ST03 / étape {v['step']}", "action": "Rejeté", "comment": v["comment"]})
            break

    lcount = 0
    for s in STREAMS:
        max_idx = STEP_TO_LOG_STATUS[s["currentStep"]]
        stream_tasks = [t for t in tasks if t["streamId"] == s["id"]]
        for app in APPS[s["id"]]:
            lcount += 1
            name, ltype, path, method, stype, index, host, fmt, vol, crit = app
            idx = max(0, max_idx - rnd.choice([0, 0, 0, 1, 1, 2]))
            linked = next((t for t in stream_tasks if t["step"] == min(idx + 2, 7)), stream_tasks[0])
            validated = idx == 6
            logs.append({
                "id": f"LOG{lcount:03d}", "application": name, "streamId": s["id"], "type": ltype,
                "source": path, "method": method, "index": index, "sourcetype": stype, "hosts": host,
                "format": fmt, "volume": vol, "retention": RETENTION[crit], "criticity": crit,
                "cim": CIM_BY_STATUS(idx), "status": LOG_STATUSES[idx]["name"], "owner": s["owner"],
                "taskId": linked["id"],
                "validation": "Validée" if validated else ("Soumise" if idx == 5 else "Non soumise"),
                "validatedBy": s["validator"] if validated else "",
                "validatedOn": "2026-11-10" if validated else "", "comment": "",
            })

    streams_out = [{k: v for k, v in s.items() if k not in ("offset", "currentStep")} for s in STREAMS]
    history.sort(key=lambda h: h["date"], reverse=True)
    return {
        "meta": {"project": "Onboarding des logs applicatifs dans Splunk", "version": 1,
                 "generatedOn": iso(TODAY), "projectStart": iso(PROJECT_START), "projectEnd": "2027-03-26"},
        "steps": STEPS, "logStatuses": LOG_STATUSES, "users": USERS, "streams": streams_out,
        "validations": validations, "tasks": tasks, "logs": logs, "history": history,
    }


def main():
    data = build()
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "sample_data.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    js = "// Fichier généré par tools/build_sample_data.py – ne pas modifier à la main\n"
    js += "window.SAMPLE_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    (ROOT / "platform" / "js" / "sample-data.js").write_text(js, encoding="utf-8")
    print(f"{len(data['streams'])} streams, {len(data['tasks'])} tâches, {len(data['logs'])} logs")


if __name__ == "__main__":
    main()
