"""Génère le classeur Excel de suivi « Suivi_Logs_Splunk.xlsx ».

Usage :
  python tools/generate_excel.py                       # depuis data/sample_data.json
  python tools/generate_excel.py export_plateforme.json  # depuis une sauvegarde JSON de la plateforme
  python tools/generate_excel.py in.json -o sortie.xlsx
"""
import argparse
import json
from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
FONT = "Arial"
NAVY, BLUE, LIGHT, GREY = "1F2A44", "2563EB", "EEF2FF", "F3F4F6"
MAXR = {"tasks": 400, "logs": 600, "valid": 300, "hist": 1000}
THIN = Side(style="thin", color="D1D5DB")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
F_IN = Font(name=FONT, size=10, color="0000FF")          # saisie
F_CALC = Font(name=FONT, size=10, color="000000")        # formule
F_LINK = Font(name=FONT, size=10, color="008000")        # lien inter-feuilles
F_HEAD = Font(name=FONT, size=10, bold=True, color="FFFFFF")
FILL_HEAD = PatternFill("solid", fgColor=NAVY)
FILL_IN = PatternFill("solid", fgColor="FFFBEB")
FILL_CALC = PatternFill("solid", fgColor=GREY)

TASK_VALID = ["Non soumise", "Soumise", "Validée", "Rejetée"]
STEP_VALID = ["À faire", "En cours", "Soumis", "Validé", "Rejeté"]
CRIT = ["Haute", "Moyenne", "Basse"]
METHODS = ["Universal Forwarder", "HEC", "HEC (OTel Collector)", "Syslog (SC4S)", "DB Connect", "Add-on API", "Fichier batch"]
CIM = ["Oui", "Partiel", "Non", "À vérifier"]
LOG_TYPES = ["Applicatif", "Audit", "Accès web", "Sécurité", "Système", "Réseau", "Interface", "Middleware"]


def d(s):
    return date.fromisoformat(s) if s else None


def title(ws, text, sub, width_cols):
    ws["A1"] = text
    ws["A1"].font = Font(name=FONT, size=16, bold=True, color=NAVY)
    ws["A2"] = sub
    ws["A2"].font = Font(name=FONT, size=10, italic=True, color="6B7280")
    ws.sheet_view.showGridLines = False


def header(ws, row, cols, widths=None):
    for i, c in enumerate(cols, 1):
        cell = ws.cell(row=row, column=i, value=c)
        cell.font, cell.fill, cell.border = F_HEAD, FILL_HEAD, BORDER
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[row].height = 32
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[L(i)].width = w


def style(cell, kind, fmt=None):
    cell.font = {"in": F_IN, "calc": F_CALC, "link": F_LINK}[kind]
    cell.border = BORDER
    cell.alignment = Alignment(vertical="center")
    if kind == "in":
        cell.fill = FILL_IN
    elif kind in ("calc", "link"):
        cell.fill = FILL_CALC
    if fmt:
        cell.number_format = fmt


def dv_list(ws, ref, rng, allow_blank=True):
    dv = DataValidation(type="list", formula1=ref, allow_blank=allow_blank, showErrorMessage=True,
                        errorTitle="Valeur non autorisée", error="Choisissez une valeur de la liste.")
    ws.add_data_validation(dv)
    dv.add(rng)


def gantt_weeks(start, end):
    w = start - timedelta(days=start.weekday())
    out = []
    while w <= end:
        out.append(w)
        w += timedelta(days=7)
    return out


def build(data, out_path):
    wb = Workbook()
    steps, statuses = data["steps"], data["logStatuses"]
    nsteps = len(steps)
    streams = data["streams"]
    p_start = d(data["meta"].get("projectStart")) or min(d(t["start"]) for t in data["tasks"])
    p_end = d(data["meta"].get("projectEnd")) or max(d(t["end"]) for t in data["tasks"])
    p_end = max([p_end] + [d(t["end"]) for t in data["tasks"] if t.get("end")])
    weeks = gantt_weeks(p_start, p_end)

    # ------------------------------------------------------------------ Listes
    li = wb.active
    li.title = "Listes"
    li.sheet_properties.tabColor = "9CA3AF"
    title(li, "Listes de référence", "Valeurs utilisées par les listes déroulantes et les formules – modifiables (texte bleu)", 0)
    blocks = [
        ("A", ["N° étape", "Étape du workflow", "Critères de passage"], [[s["n"], s["name"], s["criteria"]] for s in steps], [9, 36, 70]),
        ("E", ["Statut onboarding log", "% associé"], [[s["name"], s["pct"]] for s in statuses], [24, 10]),
        ("H", ["Statut étape stream"], [[x] for x in STEP_VALID], [20]),
        ("J", ["Statut validation tâche/log"], [[x] for x in TASK_VALID], [24]),
        ("L", ["Criticité"], [[x] for x in CRIT], [12]),
        ("N", ["Méthode de collecte"], [[x] for x in METHODS], [24]),
        ("P", ["Conformité CIM"], [[x] for x in CIM], [16]),
        ("R", ["Type de log"], [[x] for x in LOG_TYPES], [14]),
        ("T", ["Utilisateur", "Rôle", "Fonction"], [[u["name"], u["role"], u.get("title", "")] for u in data["users"]], [20, 14, 28]),
    ]
    from openpyxl.utils import column_index_from_string as CI
    for col, heads, rows, widths in blocks:
        c0 = CI(col)
        for j, h in enumerate(heads):
            cell = li.cell(row=4, column=c0 + j, value=h)
            cell.font, cell.fill, cell.border = F_HEAD, FILL_HEAD, BORDER
            cell.alignment = Alignment(wrap_text=True, vertical="center")
            li.column_dimensions[L(c0 + j)].width = widths[j]
        for i, r in enumerate(rows):
            for j, v in enumerate(r):
                cell = li.cell(row=5 + i, column=c0 + j, value=v)
                style(cell, "in", "0%" if heads[j] == "% associé" else None)
                cell.alignment = Alignment(wrap_text=True, vertical="center")
    last_step = 4 + nsteps
    last_stat = 4 + len(statuses)
    REF = {
        "steps_n": f"Listes!$A$5:$A${last_step}", "steps_name": f"Listes!$B$5:$B${last_step}",
        "steps_crit": f"Listes!$C$5:$C${last_step}",
        "stat": f"Listes!$E$5:$E${last_stat}", "stat_tab": f"Listes!$E$5:$F${last_stat}",
        "stepv": f"Listes!$H$5:$H${4 + len(STEP_VALID)}", "tv": f"Listes!$J$5:$J${4 + len(TASK_VALID)}",
        "crit": f"Listes!$L$5:$L${4 + len(CRIT)}", "meth": f"Listes!$N$5:$N${4 + len(METHODS)}",
        "cim": f"Listes!$P$5:$P${4 + len(CIM)}", "type": f"Listes!$R$5:$R${4 + len(LOG_TYPES)}",
        "users": f"Listes!$T$5:$T${4 + len(data['users']) + 10}",
        "streams_id": f"Streams!$A$6:$A${5 + len(streams) + 20}",
    }
    li.freeze_panes = "A5"

    # ----------------------------------------------------------------- Streams
    ss = wb.create_sheet("Streams", 0)
    ss.sheet_properties.tabColor = BLUE
    title(ss, "Streams – synthèse et planning", "Une ligne par stream. Colonnes grises = calculées automatiquement à partir des feuilles Tâches, Validations et Logs.", 0)
    s_cols = ["ID stream", "Stream", "Responsable", "Validateur", "Début (calc.)", "Fin (calc.)",
              "Étapes validées", "% workflow", "Étape courante", "Avancement tâches", "Nb logs",
              "Logs validés", "% logs (pondéré)", "Tâches en retard", "Statut stream", "Couleur"]
    header(ss, 5, s_cols, [10, 28, 18, 18, 12, 12, 10, 10, 34, 11, 8, 9, 11, 10, 20, 9])
    srow_end = 5 + len(streams) + 20
    for i in range(len(streams) + 20):
        r = 6 + i
        s = streams[i] if i < len(streams) else None
        for c, v in zip("ABCD", [s and s["id"], s and s["name"], s and s["owner"], s and s["validator"]]):
            style(ss[f"{c}{r}"], "in")
            ss[f"{c}{r}"] = v
        f = {
            "E": (f'=IF($A{r}="","",_xlfn.MINIFS(Tâches!$G:$G,Tâches!$B:$B,$A{r}))', "dd/mm/yyyy"),
            "F": (f'=IF($A{r}="","",_xlfn.MAXIFS(Tâches!$H:$H,Tâches!$B:$B,$A{r}))', "dd/mm/yyyy"),
            "G": (f'=IF($A{r}="","",COUNTIFS(Validations!$A:$A,$A{r},Validations!$F:$F,"Validé"))', "0"),
            "H": (f'=IF($A{r}="","",G{r}/COUNTA({REF["steps_n"]}))', "0%"),
            "I": (f'=IF($A{r}="","",IF(G{r}>=COUNTA({REF["steps_n"]}),"✔ Stream validé",G{r}+1&" – "&INDEX({REF["steps_name"]},G{r}+1)))', None),
            "J": (f'=IF($A{r}="","",IFERROR(AVERAGEIF(Tâches!$B:$B,$A{r},Tâches!$J:$J),0))', "0%"),
            "K": (f'=IF($A{r}="","",COUNTIF(Logs!$C:$C,$A{r}))', "0"),
            "L": (f'=IF($A{r}="","",COUNTIFS(Logs!$C:$C,$A{r},Logs!$T:$T,"Validée"))', "0"),
            "M": (f'=IF($A{r}="","",IFERROR(AVERAGEIF(Logs!$C:$C,$A{r},Logs!$Q:$Q),0))', "0%"),
            "N": (f'=IF($A{r}="","",COUNTIFS(Tâches!$B:$B,$A{r},Tâches!$K:$K,"En retard"))', "0"),
            "O": (f'=IF($A{r}="","",IF(G{r}>=COUNTA({REF["steps_n"]}),"Validé",IF(N{r}>0,"À risque (retard)",IF(COUNTIFS(Validations!$A:$A,$A{r},Validations!$F:$F,"Rejeté")>0,"Rejet à traiter",IF(J{r}=0,"Non démarré","En cours")))))', None),
        }
        for c, (formula, fmt) in f.items():
            ss[f"{c}{r}"] = formula
            style(ss[f"{c}{r}"], "calc", fmt)
        ss[f"P{r}"] = s and s.get("color", "")
        style(ss[f"P{r}"], "in")
    ss.conditional_formatting.add(f"O6:O{srow_end}", FormulaRule(formula=['O6="Validé"'], fill=PatternFill("solid", fgColor="DCFCE7"), font=Font(name=FONT, color="166534", bold=True)))
    ss.conditional_formatting.add(f"O6:O{srow_end}", FormulaRule(formula=['LEFT(O6,1)="À"'], fill=PatternFill("solid", fgColor="FEE2E2"), font=Font(name=FONT, color="991B1B", bold=True)))
    ss.conditional_formatting.add(f"O6:O{srow_end}", FormulaRule(formula=['O6="Rejet à traiter"'], fill=PatternFill("solid", fgColor="FFEDD5"), font=Font(name=FONT, color="9A3412", bold=True)))
    ss.conditional_formatting.add(f"O6:O{srow_end}", FormulaRule(formula=['O6="En cours"'], fill=PatternFill("solid", fgColor="DBEAFE"), font=Font(name=FONT, color="1E40AF")))
    from openpyxl.formatting.rule import DataBarRule
    for col in ("H", "J", "M"):
        ss.conditional_formatting.add(f"{col}6:{col}{srow_end}", DataBarRule(start_type="num", start_value=0, end_type="num", end_value=1, color="60A5FA"))
    dv_list(ss, REF["users"], f"C6:D{srow_end}")
    # Gantt streams
    g0 = len(s_cols) + 2
    ss.cell(row=4, column=g0, value="Planning par stream (semaines – début lundi)").font = Font(name=FONT, bold=True, color=NAVY)
    for j, w in enumerate(weeks):
        c = ss.cell(row=5, column=g0 + j, value=w)
        c.number_format = "dd/mm"
        c.font, c.fill = Font(name=FONT, size=8, bold=True, color="FFFFFF"), FILL_HEAD
        c.alignment = Alignment(text_rotation=90, horizontal="center")
        ss.column_dimensions[L(g0 + j)].width = 3.2
    gr = f"{L(g0)}6:{L(g0 + len(weeks) - 1)}{srow_end}"
    gc = L(g0)
    ss.conditional_formatting.add(gr, FormulaRule(formula=[f'AND($A6<>"",{gc}$5<=TODAY(),{gc}$5+6>=TODAY())'], fill=PatternFill("solid", fgColor="FCA5A5")))
    ss.conditional_formatting.add(gr, FormulaRule(formula=[f'AND($A6<>"",{gc}$5+6>=$E6,{gc}$5<=$E6+($F6-$E6)*$J6)'], fill=PatternFill("solid", fgColor="1D4ED8")))
    ss.conditional_formatting.add(gr, FormulaRule(formula=[f'AND($A6<>"",{gc}$5+6>=$E6,{gc}$5<=$F6)'], fill=PatternFill("solid", fgColor="BFDBFE")))
    ss.freeze_panes = "C6"

    # ------------------------------------------------------------- Validations
    vs = wb.create_sheet("Validations", 1)
    vs.sheet_properties.tabColor = "16A34A"
    title(vs, "Workflow de validation par stream", "Une ligne par stream × étape, triée par stream puis n° d'étape. Une étape ne peut être validée que si la précédente l'est (colonne « Contrôle »).", 0)
    v_cols = ["ID stream", "Stream", "N° étape", "Étape", "Critères de passage", "Statut", "Validé par",
              "Date validation", "Commentaire / motif de rejet", "Avancement tâches de l'étape", "Contrôle séquence", "Prochaine action"]
    header(vs, 5, v_cols, [10, 26, 8, 32, 50, 12, 18, 13, 40, 13, 30, 34])
    vals = sorted(data["validations"], key=lambda v: (v["streamId"], v["step"]))
    vend = 5 + MAXR["valid"]
    for i in range(MAXR["valid"]):
        r = 6 + i
        v = vals[i] if i < len(vals) else None
        for c, val in zip("ACFGHI", [v and v["streamId"], v and v["step"], v and v["status"], v and v.get("validatedBy"), v and d(v.get("validatedOn")), v and v.get("comment")]):
            vs[f"{c}{r}"] = val or None
            style(vs[f"{c}{r}"], "in", "dd/mm/yyyy" if c == "H" else None)
        vs[f"I{r}"].alignment = Alignment(wrap_text=True, vertical="center")
        vs[f"B{r}"] = f'=IF($A{r}="","",IFERROR(INDEX(Streams!$B:$B,MATCH($A{r},Streams!$A:$A,0)),"?"))'
        style(vs[f"B{r}"], "link")
        vs[f"D{r}"] = f'=IF($C{r}="","",IFERROR(INDEX({REF["steps_name"]},MATCH($C{r},{REF["steps_n"]},0)),"?"))'
        style(vs[f"D{r}"], "link")
        vs[f"E{r}"] = f'=IF($C{r}="","",IFERROR(INDEX({REF["steps_crit"]},MATCH($C{r},{REF["steps_n"]},0)),""))'
        style(vs[f"E{r}"], "link")
        vs[f"E{r}"].alignment = Alignment(wrap_text=True, vertical="center")
        vs[f"J{r}"] = f'=IF($A{r}="","",IFERROR(AVERAGEIFS(Tâches!$J:$J,Tâches!$B:$B,$A{r},Tâches!$E:$E,$C{r}),0))'
        style(vs[f"J{r}"], "calc", "0%")
        prev = f"F{r - 1}" if r > 6 else '""'
        vs[f"K{r}"] = (f'=IF($A{r}="","",IF(AND($F{r}="Validé",$C{r}>1,{prev}<>"Validé"),"⚠ Étape précédente non validée",'
                       f'IF(AND($F{r}="Validé",$J{r}<1),"⚠ Tâches non terminées à 100%",'
                       f'IF($F{r}="Validé","✔ Validée",IF(OR($C{r}=1,{prev}="Validé"),"▶ Étape active","🔒 Verrouillée")))))')
        style(vs[f"K{r}"], "calc")
        vs[f"L{r}"] = (f'=IF($A{r}="","",IF($F{r}="Validé","—",IF(LEFT($K{r},1)="🔒","Attendre la validation de l\'étape "&($C{r}-1),'
                       f'IF($F{r}="Soumis","Validateur : valider ou rejeter",IF($F{r}="Rejeté","Corriger puis resoumettre",'
                       f'IF($J{r}>=1,"Soumettre pour validation","Terminer les tâches ("&TEXT($J{r},"0%")&")"))))))')
        style(vs[f"L{r}"], "calc")
    dv_list(vs, REF["stepv"], f"F6:F{vend}")
    dv_list(vs, REF["users"], f"G6:G{vend}")
    dv_list(vs, REF["streams_id"], f"A6:A{vend}")
    for txt, bg, fg in [("Validé", "DCFCE7", "166534"), ("Soumis", "FEF3C7", "92400E"), ("En cours", "DBEAFE", "1E40AF"), ("Rejeté", "FEE2E2", "991B1B")]:
        vs.conditional_formatting.add(f"F6:F{vend}", CellIsRule(operator="equal", formula=[f'"{txt}"'], fill=PatternFill("solid", fgColor=bg), font=Font(name=FONT, color=fg, bold=True)))
    vs.conditional_formatting.add(f"K6:K{vend}", FormulaRule(formula=['LEFT(K6,1)="⚠"'], fill=PatternFill("solid", fgColor="FEE2E2"), font=Font(name=FONT, color="991B1B", bold=True)))
    vs.conditional_formatting.add(f"K6:K{vend}", FormulaRule(formula=['LEFT(K6,1)="▶"'], fill=PatternFill("solid", fgColor="DBEAFE"), font=Font(name=FONT, color="1E40AF", bold=True)))
    vs.conditional_formatting.add(f"J6:J{vend}", DataBarRule(start_type="num", start_value=0, end_type="num", end_value=1, color="34D399"))
    vs.freeze_panes = "E6"
    vs.auto_filter.ref = f"A5:L{vend}"

    # ------------------------------------------------------------------ Tâches
    ts = wb.create_sheet("Tâches", 2)
    ts.sheet_properties.tabColor = "F59E0B"
    title(ts, "Tâches & planning Gantt par stream", "Saisir les tâches (texte bleu). % avancement : 0 à 100 %. Le Gantt se met à jour seul : bleu foncé = réalisé, bleu clair = restant, rouge = semaine en cours.", 0)
    t_cols = ["ID tâche", "ID stream", "Stream", "Tâche", "N° étape", "Responsable", "Début", "Fin",
              "Durée (j ouvrés)", "% avancement", "Statut", "Validation", "Validé par", "Date validation",
              "Commentaire", "Contrôle"]
    header(ts, 5, t_cols, [9, 9, 22, 44, 7, 17, 11, 11, 9, 10, 12, 12, 16, 12, 28, 22])
    tasks = sorted(data["tasks"], key=lambda t: (t["streamId"], t["step"], t["start"], t["id"]))
    tend = 5 + MAXR["tasks"]
    for i in range(MAXR["tasks"]):
        r = 6 + i
        t = tasks[i] if i < len(tasks) else None
        vals_in = {"A": t and t["id"], "B": t and t["streamId"], "D": t and t["name"], "E": t and t["step"],
                   "F": t and t["owner"], "G": t and d(t["start"]), "H": t and d(t["end"]),
                   "J": t["progress"] if t else None, "L": t and t.get("validation"),
                   "M": t and t.get("validatedBy"), "N": t and d(t.get("validatedOn")), "O": t and t.get("comment")}
        for c, val in vals_in.items():
            ts[f"{c}{r}"] = val if val not in ("",) else None
            style(ts[f"{c}{r}"], "in", {"G": "dd/mm/yyyy", "H": "dd/mm/yyyy", "N": "dd/mm/yyyy", "J": "0%"}.get(c))
        ts[f"C{r}"] = f'=IF($B{r}="","",IFERROR(INDEX(Streams!$B:$B,MATCH($B{r},Streams!$A:$A,0)),"?"))'
        style(ts[f"C{r}"], "link")
        ts[f"I{r}"] = f'=IF(OR($G{r}="",$H{r}=""),"",NETWORKDAYS($G{r},$H{r}))'
        style(ts[f"I{r}"], "calc", "0")
        ts[f"K{r}"] = (f'=IF($D{r}="","",IF($J{r}>=1,"Terminée",IF(AND($H{r}<TODAY(),$J{r}<1),"En retard",'
                       f'IF($J{r}>0,"En cours",IF($G{r}<=TODAY(),"À démarrer","Planifiée")))))')
        style(ts[f"K{r}"], "calc")
        ts[f"P{r}"] = (f'=IF($D{r}="","",IF(AND($L{r}="Validée",$J{r}<1),"⚠ Validée sans être à 100%",'
                       f'IF(AND($J{r}>=1,OR($L{r}="Non soumise",$L{r}="")),"→ À soumettre",IF($L{r}="Soumise","→ En attente validateur",IF($L{r}="Rejetée","→ À reprendre","")))))')
        style(ts[f"P{r}"], "calc")
    dv_list(ts, REF["tv"], f"L6:L{tend}")
    dv_list(ts, REF["users"], f"F6:F{tend}")
    dv_list(ts, REF["users"], f"M6:M{tend}")
    dv_list(ts, REF["streams_id"], f"B6:B{tend}")
    dvp = DataValidation(type="decimal", operator="between", formula1="0", formula2="1", showErrorMessage=True,
                         error="Saisir un pourcentage entre 0 % et 100 %.")
    ts.add_data_validation(dvp)
    dvp.add(f"J6:J{tend}")
    for txt, bg, fg in [("Terminée", "DCFCE7", "166534"), ("En retard", "FEE2E2", "991B1B"), ("En cours", "DBEAFE", "1E40AF")]:
        ts.conditional_formatting.add(f"K6:K{tend}", CellIsRule(operator="equal", formula=[f'"{txt}"'], fill=PatternFill("solid", fgColor=bg), font=Font(name=FONT, color=fg, bold=True)))
    for txt, bg, fg in [("Validée", "DCFCE7", "166534"), ("Soumise", "FEF3C7", "92400E"), ("Rejetée", "FEE2E2", "991B1B")]:
        ts.conditional_formatting.add(f"L6:L{tend}", CellIsRule(operator="equal", formula=[f'"{txt}"'], fill=PatternFill("solid", fgColor=bg), font=Font(name=FONT, color=fg, bold=True)))
    ts.conditional_formatting.add(f"P6:P{tend}", FormulaRule(formula=['LEFT(P6,1)="⚠"'], font=Font(name=FONT, color="DC2626", bold=True)))
    ts.conditional_formatting.add(f"J6:J{tend}", DataBarRule(start_type="num", start_value=0, end_type="num", end_value=1, color="60A5FA"))
    g0 = len(t_cols) + 2
    ts.cell(row=4, column=g0, value="Gantt hebdomadaire").font = Font(name=FONT, bold=True, color=NAVY)
    for j, w in enumerate(weeks):
        c = ts.cell(row=5, column=g0 + j, value=w)
        c.number_format = "dd/mm"
        c.font, c.fill = Font(name=FONT, size=8, bold=True, color="FFFFFF"), FILL_HEAD
        c.alignment = Alignment(text_rotation=90, horizontal="center")
        ts.column_dimensions[L(g0 + j)].width = 3.2
    gc = L(g0)
    gr = f"{gc}6:{L(g0 + len(weeks) - 1)}{tend}"
    ts.conditional_formatting.add(gr, FormulaRule(formula=[f'AND($G6<>"",{gc}$5<=TODAY(),{gc}$5+6>=TODAY())'], fill=PatternFill("solid", fgColor="FCA5A5")))
    ts.conditional_formatting.add(gr, FormulaRule(formula=[f'AND($G6<>"",$K6="En retard",{gc}$5+6>=$G6,{gc}$5<=$H6)'], fill=PatternFill("solid", fgColor="F87171")))
    ts.conditional_formatting.add(gr, FormulaRule(formula=[f'AND($G6<>"",$J6>0,{gc}$5+6>=$G6,{gc}$5<=$G6+($H6-$G6)*$J6)'], fill=PatternFill("solid", fgColor="1D4ED8")))
    ts.conditional_formatting.add(gr, FormulaRule(formula=[f'AND($G6<>"",{gc}$5+6>=$G6,{gc}$5<=$H6)'], fill=PatternFill("solid", fgColor="BFDBFE")))
    ts.freeze_panes = "E6"
    ts.auto_filter.ref = f"A5:P{tend}"

    # -------------------------------------------------------------------- Logs
    ls = wb.create_sheet("Logs", 3)
    ls.sheet_properties.tabColor = "DB2777"
    title(ls, "Inventaire des logs applicatifs à intégrer dans Splunk", "Une ligne par source de log. Faire progresser le « Statut onboarding » étape par étape ; la validation finale est faite par le validateur du stream.", 0)
    l_cols = ["ID log", "Application", "ID stream", "Stream", "Type de log", "Source / chemin", "Méthode de collecte",
              "Index Splunk", "Sourcetype", "Hôte(s)", "Format", "Volume (Mo/j)", "Rétention (j)", "Criticité",
              "Conformité CIM", "Statut onboarding", "% avancement", "Responsable", "Tâche liée", "Validation",
              "Validé par", "Date validation", "Commentaire", "Requête SPL de contrôle"]
    header(ls, 5, l_cols, [9, 22, 9, 22, 12, 32, 20, 14, 18, 15, 16, 10, 9, 10, 11, 20, 10, 16, 9, 12, 16, 12, 28, 52])
    logs = data["logs"]
    lend = 5 + MAXR["logs"]
    keys = {"A": "id", "B": "application", "C": "streamId", "E": "type", "F": "source", "G": "method", "H": "index",
            "I": "sourcetype", "J": "hosts", "K": "format", "L": "volume", "M": "retention", "N": "criticity",
            "O": "cim", "P": "status", "R": "owner", "S": "taskId", "T": "validation", "U": "validatedBy",
            "V": "validatedOn", "W": "comment"}
    for i in range(MAXR["logs"]):
        r = 6 + i
        lg = logs[i] if i < len(logs) else None
        for c, k in keys.items():
            val = lg.get(k) if lg else None
            if c == "V":
                val = d(val) if val else None
            ls[f"{c}{r}"] = val if val != "" else None
            style(ls[f"{c}{r}"], "in", {"V": "dd/mm/yyyy", "L": "#,##0"}.get(c))
        ls[f"D{r}"] = f'=IF($C{r}="","",IFERROR(INDEX(Streams!$B:$B,MATCH($C{r},Streams!$A:$A,0)),"?"))'
        style(ls[f"D{r}"], "link")
        ls[f"Q{r}"] = f'=IF($P{r}="","",IFERROR(VLOOKUP($P{r},{REF["stat_tab"]},2,FALSE),0))'
        style(ls[f"Q{r}"], "link", "0%")
        ls[f"X{r}"] = f'=IF($H{r}="","","index="&$H{r}&" sourcetype="&$I{r}&" earliest=-24h | stats count, latest(_time) as dernier by host")'
        style(ls[f"X{r}"], "calc")
        ls[f"X{r}"].font = Font(name="Consolas", size=9)
    dv_list(ls, REF["stat"], f"P6:P{lend}")
    dv_list(ls, REF["tv"], f"T6:T{lend}")
    dv_list(ls, REF["crit"], f"N6:N{lend}")
    dv_list(ls, REF["meth"], f"G6:G{lend}")
    dv_list(ls, REF["cim"], f"O6:O{lend}")
    dv_list(ls, REF["type"], f"E6:E{lend}")
    dv_list(ls, REF["users"], f"R6:R{lend}")
    dv_list(ls, REF["users"], f"U6:U{lend}")
    dv_list(ls, REF["streams_id"], f"C6:C{lend}")
    ls.conditional_formatting.add(f"Q6:Q{lend}", DataBarRule(start_type="num", start_value=0, end_type="num", end_value=1, color="F472B6"))
    for txt, bg, fg in [("Validée", "DCFCE7", "166534"), ("Soumise", "FEF3C7", "92400E"), ("Rejetée", "FEE2E2", "991B1B")]:
        ls.conditional_formatting.add(f"T6:T{lend}", CellIsRule(operator="equal", formula=[f'"{txt}"'], fill=PatternFill("solid", fgColor=bg), font=Font(name=FONT, color=fg, bold=True)))
    ls.conditional_formatting.add(f"N6:N{lend}", CellIsRule(operator="equal", formula=['"Haute"'], font=Font(name=FONT, color="DC2626", bold=True)))
    ls.freeze_panes = "C6"
    ls.auto_filter.ref = f"A5:X{lend}"

    # -------------------------------------------------------------- Historique
    hs = wb.create_sheet("Historique", 4)
    hs.sheet_properties.tabColor = "6B7280"
    title(hs, "Journal des validations et changements", "Tracer ici chaque validation / rejet (qui, quand, quoi). La plateforme web alimente ce journal automatiquement.", 0)
    header(hs, 5, ["Date / heure", "Utilisateur", "Objet", "Référence", "Action", "Commentaire"], [18, 18, 16, 22, 14, 70])
    for i, h in enumerate(data.get("history", [])[:MAXR["hist"]]):
        r = 6 + i
        dt = h["date"].replace("T", " ")[:16]
        for c, val in zip("ABCDEF", [dt, h["user"], h["type"], h["ref"], h["action"], h.get("comment", "")]):
            hs[f"{c}{r}"] = val
            style(hs[f"{c}{r}"], "in")
    hs.freeze_panes = "A6"

    # ---------------------------------------------------------- Tableau de bord
    db = wb.create_sheet("Tableau de bord", 0)
    db.sheet_properties.tabColor = NAVY
    title(db, data["meta"].get("project", "Suivi onboarding Splunk") + " – Tableau de bord",
          "Toutes les valeurs sont calculées par formules à partir des feuilles de saisie. Date du jour : voir C3.", 0)
    db["B3"] = "Date du jour"
    db["C3"] = "=TODAY()"
    style(db["C3"], "calc", "dd/mm/yyyy")
    db["B3"].font = Font(name=FONT, bold=True)
    for col, w in zip("ABCDEFGHIJKLM", [2, 30, 14, 14, 14, 14, 14, 14, 14, 30, 14, 2, 2]):
        db.column_dimensions[col].width = w
    kpis = [
        ("Streams", f'=COUNTA(Streams!A6:A{srow_end})', "0"),
        ("Streams validés", f'=COUNTIF(Streams!O6:O{srow_end},"Validé")', "0"),
        ("Avancement global tâches", f'=IFERROR(AVERAGE(Tâches!J6:J{tend}),0)', "0%"),
        ("Avancement workflow validation", f'=IFERROR(COUNTIF(Validations!F6:F{vend},"Validé")/COUNTA(Validations!A6:A{vend}),0)', "0%"),
        ("Tâches", f'=COUNTA(Tâches!A6:A{tend})', "0"),
        ("Tâches terminées", f'=COUNTIF(Tâches!K6:K{tend},"Terminée")', "0"),
        ("Tâches en retard", f'=COUNTIF(Tâches!K6:K{tend},"En retard")', "0"),
        ("Validations en attente", f'=COUNTIF(Tâches!L6:L{tend},"Soumise")+COUNTIF(Logs!T6:T{lend},"Soumise")+COUNTIF(Validations!F6:F{vend},"Soumis")', "0"),
        ("Logs inventoriés", f'=COUNTA(Logs!A6:A{lend})', "0"),
        ("Logs validés", f'=COUNTIF(Logs!T6:T{lend},"Validée")', "0"),
        ("Avancement onboarding logs", f'=IFERROR(AVERAGE(Logs!Q6:Q{lend}),0)', "0%"),
        ("Volume total (Go/j)", f'=SUM(Logs!L6:L{lend})/1024', "0.0"),
    ]
    for i, (lab, frm, fmt) in enumerate(kpis):
        row = 6 + (i // 4) * 3
        col = 2 + (i % 4) * 2 if i % 4 else 2
        col = [2, 4, 6, 8][i % 4]
        lc = db.cell(row=row, column=col, value=lab)
        lc.font = Font(name=FONT, size=9, color="6B7280", bold=True)
        db.merge_cells(start_row=row, start_column=col, end_row=row, end_column=col + 1)
        vc = db.cell(row=row + 1, column=col, value=frm)
        vc.font = Font(name=FONT, size=18, bold=True, color=NAVY)
        vc.number_format = fmt
        vc.alignment = Alignment(horizontal="left")
        db.merge_cells(start_row=row + 1, start_column=col, end_row=row + 1, end_column=col + 1)
        for rr in (row, row + 1):
            for cc in (col, col + 1):
                db.cell(row=rr, column=cc).fill = PatternFill("solid", fgColor=LIGHT)
    db.column_dimensions["B"].width = 30
    # tableau par stream
    r0 = 16
    db.cell(row=r0 - 1, column=2, value="Avancement par stream").font = Font(name=FONT, size=12, bold=True, color=NAVY)
    hd = ["Stream", "Étapes validées", "% workflow", "Avancement tâches", "Nb logs", "% logs", "Tâches en retard", "Statut", "Étape courante"]
    for j, h in enumerate(hd):
        c = db.cell(row=r0, column=2 + j, value=h)
        c.font, c.fill, c.border = F_HEAD, FILL_HEAD, BORDER
        c.alignment = Alignment(wrap_text=True, horizontal="center", vertical="center")
    db.row_dimensions[r0].height = 30
    src = ["B", "G", "H", "J", "K", "M", "N", "O", "I"]
    fm = [None, "0", "0%", "0%", "0", "0%", "0", None, None]
    nst = len(streams)
    for i in range(nst):
        r = r0 + 1 + i
        for j, (s_col, f_) in enumerate(zip(src, fm)):
            c = db.cell(row=r, column=2 + j, value=f"=Streams!{s_col}{6 + i}")
            style(c, "link", f_)
    last_r = r0 + nst
    for col in ("D", "E", "G"):
        db.conditional_formatting.add(f"{col}{r0 + 1}:{col}{last_r}", DataBarRule(start_type="num", start_value=0, end_type="num", end_value=1, color="60A5FA"))
    db.conditional_formatting.add(f"I{r0 + 1}:I{last_r}", FormulaRule(formula=[f'LEFT(I{r0 + 1},1)="À"'], font=Font(name=FONT, color="DC2626", bold=True)))
    db.conditional_formatting.add(f"I{r0 + 1}:I{last_r}", FormulaRule(formula=[f'I{r0 + 1}="Validé"'], font=Font(name=FONT, color="16A34A", bold=True)))
    # logs par statut
    r1 = last_r + 3
    db.cell(row=r1 - 1, column=2, value="Logs par statut d'onboarding").font = Font(name=FONT, size=12, bold=True, color=NAVY)
    for j, h in enumerate(["Statut", "Nb logs", "% du total"]):
        c = db.cell(row=r1, column=2 + j, value=h)
        c.font, c.fill, c.border = F_HEAD, FILL_HEAD, BORDER
    for i in range(len(statuses)):
        r = r1 + 1 + i
        c = db.cell(row=r, column=2, value=f"=Listes!E{5 + i}")
        style(c, "link")
        c = db.cell(row=r, column=3, value=f'=COUNTIF(Logs!$P$6:$P${lend},B{r})')
        style(c, "calc", "0")
        c = db.cell(row=r, column=4, value=f'=IFERROR(C{r}/SUM($C${r1 + 1}:$C${r1 + len(statuses)}),0)')
        style(c, "calc", "0%")
    # tâches par statut
    tstat = ["Planifiée", "À démarrer", "En cours", "En retard", "Terminée"]
    db.cell(row=r1 - 1, column=6, value="Tâches par statut").font = Font(name=FONT, size=12, bold=True, color=NAVY)
    for j, h in enumerate(["Statut", "Nb tâches"]):
        c = db.cell(row=r1, column=6 + j, value=h)
        c.font, c.fill, c.border = F_HEAD, FILL_HEAD, BORDER
    for i, s in enumerate(tstat):
        r = r1 + 1 + i
        c = db.cell(row=r, column=6, value=s)
        style(c, "in")
        c = db.cell(row=r, column=7, value=f'=COUNTIF(Tâches!$K$6:$K${tend},F{r})')
        style(c, "calc", "0")
    # avancement par étape
    db.cell(row=r1 - 1, column=9, value="Streams ayant validé l'étape").font = Font(name=FONT, size=12, bold=True, color=NAVY)
    for j, h in enumerate(["Étape", "Nb streams"]):
        c = db.cell(row=r1, column=9 + j, value=h)
        c.font, c.fill, c.border = F_HEAD, FILL_HEAD, BORDER
    for i in range(nsteps):
        r = r1 + 1 + i
        c = db.cell(row=r, column=9, value=f'=Listes!A{5 + i}&". "&Listes!B{5 + i}')
        style(c, "link")
        c = db.cell(row=r, column=10, value=f'=COUNTIFS(Validations!$C$6:$C${vend},Listes!A{5 + i},Validations!$F$6:$F${vend},"Validé")')
        style(c, "calc", "0")
    db.column_dimensions["I"].width = 38
    # graphiques
    ch = BarChart()
    ch.type = "bar"
    ch.title = "Avancement par stream"
    ch.y_axis.title = None
    ch.add_data(Reference(db, min_col=4, max_col=5, min_row=r0, max_row=last_r), titles_from_data=True)
    ch.set_categories(Reference(db, min_col=2, min_row=r0 + 1, max_row=last_r))
    ch.y_axis.scaling.min, ch.y_axis.scaling.max = 0, 1
    ch.y_axis.number_format = "0%"
    ch.height, ch.width = 8, 16
    ch2 = BarChart()
    ch2.title = "Logs par statut d'onboarding"
    ch2.add_data(Reference(db, min_col=3, min_row=r1, max_row=r1 + len(statuses)), titles_from_data=True)
    ch2.set_categories(Reference(db, min_col=2, min_row=r1 + 1, max_row=r1 + len(statuses)))
    ch2.height, ch2.width = 8, 16
    ch2.legend = None
    for c in (ch, ch2):
        c.roundedCorners = False
        c.x_axis.delete = False
        c.y_axis.delete = False
        if c.legend is not None:
            c.legend.overlay = False
            c.legend.position = "b"
    db.add_chart(ch, f"B{r1 + max(len(statuses), nsteps) + 3}")
    db.add_chart(ch2, f"G{r1 + max(len(statuses), nsteps) + 3}")

    # ------------------------------------------------------------------- Guide
    gd = wb.create_sheet("Guide", 0)
    gd.sheet_properties.tabColor = "111827"
    title(gd, "Guide d'utilisation – Suivi des logs applicatifs Splunk", "Classeur compagnon de la plateforme web (mêmes données, même workflow)", 0)
    gd.column_dimensions["A"].width = 3
    gd.column_dimensions["B"].width = 26
    gd.column_dimensions["C"].width = 100
    rows = [
        ("Feuille", "Rôle"),
        ("Tableau de bord", "Indicateurs globaux, avancement par stream, logs par statut, tâches par statut, graphiques. Rien à saisir."),
        ("Streams", "Liste des streams (responsable, validateur) + synthèse calculée (étape courante, %, retard, statut) + planning Gantt par stream."),
        ("Validations", "Workflow de validation : 7 étapes par stream. Valider une étape = Statut « Validé » + Validé par + Date. La colonne « Contrôle séquence » signale toute validation hors ordre ; « Prochaine action » indique quoi faire pour passer au point suivant."),
        ("Tâches", "Planning détaillé par stream et par étape, % avancement, statut automatique (Planifiée / En cours / En retard / Terminée), validation de chaque tâche, Gantt hebdomadaire."),
        ("Logs", "Inventaire des logs applicatifs (source, collecte, index, sourcetype, volumétrie, criticité, CIM). Le statut d'onboarding progresse étape par étape ; le % est déduit du statut ; une requête SPL de contrôle est générée."),
        ("Historique", "Journal de toutes les validations / rejets (qui, quand, quoi, commentaire)."),
        ("Listes", "Référentiels des listes déroulantes : étapes et critères, statuts, % par statut, utilisateurs. Modifiables."),
        ("", ""),
        ("Code couleur", ""),
        ("Texte bleu sur fond crème", "Cellule de saisie – à remplir / modifier."),
        ("Texte vert sur fond gris", "Valeur reprise d'une autre feuille (formule) – ne pas modifier."),
        ("Texte noir sur fond gris", "Valeur calculée (formule) – ne pas modifier."),
        ("", ""),
        ("Processus de validation", ""),
        ("1. Réaliser", "Le contributeur fait avancer ses tâches (% avancement) et le statut des logs du stream."),
        ("2. Soumettre", "Quand toutes les tâches de l'étape sont à 100 %, il passe l'étape à « Soumis » (feuille Validations) et ses tâches à « Soumise »."),
        ("3. Valider / rejeter", "Le validateur du stream contrôle les critères de passage, puis met « Validé » (+ nom + date) ou « Rejeté » (+ motif en commentaire)."),
        ("4. Passer au point suivant", "L'étape suivante devient « ▶ Étape active » automatiquement : la mettre à « En cours ». Une étape ne peut être validée que si la précédente l'est."),
        ("5. Tracer", "Ajouter une ligne dans Historique (fait automatiquement par la plateforme web)."),
        ("", ""),
        ("Ajouter des lignes", f"Les formules sont pré-remplies : jusqu'à {MAXR['tasks']} tâches, {MAXR['logs']} logs, {MAXR['valid']} lignes de validation et {len(streams) + 20} streams. Saisir simplement dans la première ligne vide."),
        ("Lien plateforme", "La plateforme web importe et exporte ce classeur (menu « Import / Export »). Le script tools/generate_excel.py régénère ce classeur mis en forme à partir d'une sauvegarde JSON de la plateforme."),
        ("Exemple", "Les données présentes sont un jeu d'exemple réaliste (6 streams, 32 logs) à remplacer par vos données."),
    ]
    for i, (a, b) in enumerate(rows):
        r = 4 + i
        gd[f"B{r}"], gd[f"C{r}"] = a, b
        gd[f"C{r}"].alignment = Alignment(wrap_text=True, vertical="top")
        gd[f"B{r}"].alignment = Alignment(vertical="top")
        bold = i == 0 or b == ""
        gd[f"B{r}"].font = Font(name=FONT, bold=True, color="FFFFFF" if i == 0 else NAVY)
        gd[f"C{r}"].font = Font(name=FONT, bold=i == 0, color="FFFFFF" if i == 0 else "111827")
        if i == 0:
            gd[f"B{r}"].fill = gd[f"C{r}"].fill = FILL_HEAD
    gd["B14"].font = F_IN
    gd["B14"].fill = FILL_IN
    gd["B15"].font = F_LINK
    gd["B15"].fill = FILL_CALC
    gd["B16"].font = F_CALC
    gd["B16"].fill = FILL_CALC

    # police par défaut
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if c.font and c.font.name != FONT and c.font.name != "Consolas":
                    f = c.font
                    c.font = Font(name=FONT, size=f.size, bold=f.bold, italic=f.italic, color=f.color)
    wb.active = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("json", nargs="?", default=str(ROOT / "data" / "sample_data.json"))
    ap.add_argument("-o", "--output", default=str(ROOT / "excel" / "Suivi_Logs_Splunk.xlsx"))
    a = ap.parse_args()
    data = json.loads(Path(a.json).read_text(encoding="utf-8"))
    print("Classeur généré :", build(data, Path(a.output)))


if __name__ == "__main__":
    main()
