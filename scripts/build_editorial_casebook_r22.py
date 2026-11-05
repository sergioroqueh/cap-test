"""R22: compile 300 exam-by-exam reviews + 6 reconstructed-option cases.

The edited text is displayed alongside immutable original PDF letter evidence.
No answer/status/score is assigned or changed by this module.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import csv
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data-src" / "cap-exams"
OUT = ROOT / "public" / "data" / "exams"
TARGETS = {
    "2025-09-27-mercancias-global",
    "2022-11-26-mercancias-global",
    "2023-07-29-mercancias-a",
}
FIELDS = (
    "examId", "date", "category", "model", "number", "sourcePage",
    "editorialStatus", "caseId", "sourceEvidence",
    "reviewNote", "question", "optionA", "optionB", "optionC", "optionD",
    "sheetOriginal", "sheetMapped", "bankAnswer", "appliedAnswer",
    "scoringEligible", "originalTextRetained", "mechanicalTextFix",
    "r21Priority", "r21Flags",
)


def norm(value):
    s = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def main():
    index = json.loads((OUT / "index.json").read_text(encoding="utf-8"))
    triage = json.loads((OUT / "editorial_triage_r21.json").read_text(encoding="utf-8"))
    cases = json.loads((SRC / "r22_editorial_casebook.json").read_text(encoding="utf-8"))
    assert len(cases["cases"]) == 33 and cases["schemaVersion"] == 1
    by_case = {}
    for case in cases["cases"]:
        identity = (case["examId"], case["number"])
        if identity in by_case:
            raise AssertionError("Caso editorial duplicado: " + str(identity))
        by_case[identity] = case
    extras = {e for e, n in by_case if e not in TARGETS}
    assert extras == {
        "2023-02-04-mercancias-global",
        "2025-02-01-mercancias-global",
        "2023-06-03-mercancias-global",
    }
    table, by_exam, seen = [], [], set()
    ready_before_after = 0
    for meta in index["exams"]:
        eid = meta["id"]
        rows = json.loads((OUT / "questions" / f"{eid}.json").read_text(encoding="utf-8"))
        assert len(rows) == 100
        count = Counter()
        source_flags = {r["number"]: r for r in triage["questions"][eid]}
        for row in rows:
            key = (eid, row["number"])
            if eid not in TARGETS and key not in by_case:
                continue
            manual = by_case.get(key)
            if manual:
                seen.add(key)
                expected = norm(manual["expectedQuestionFragment"])
                if expected not in norm(row["question"]):
                    raise AssertionError(f"R22 enunciado alterado: {eid} q{row['number']}: {expected}")
                answer = manual["expectedAppliedAnswer"]
                if answer and answer != row["correctAnswer"]:
                    raise AssertionError(f"R22 cambia respuesta o fuente: {eid} q{row['number']}")
                if manual["status"] == "TEXTO_CONTRASTADO_FUENTE_PUBLICA":
                    if (eid != "2025-09-27-mercancias-global" or
                            not row.get("textCorrection") or
                            "castillalamancha.es" not in manual["source"]):
                        raise AssertionError(f"R22 fuente publica no contrastada: {eid} q{row['number']}")
                if manual["status"] == "DESFASE_DE_HOJA_REVISADO_SIN_FE_DE_ERRATAS":
                    if not (eid == "2023-07-29-mercancias-a"
                            and 44 <= row["number"] <= 99
                            and row["mappedSheetQuestionNumber"] == row["number"] + 1
                            and row["mappedSheetAnswer"] == row["correctAnswer"]):
                        raise AssertionError(f"R22 falsa alineacion: {eid} q{row['number']}")
                if manual["status"] == "SIN_CASILLA_OFICIAL_VINCULABLE":
                    if not (eid == "2023-07-29-mercancias-a" and row["number"] == 100
                            and row["mappedSheetQuestionNumber"] is None):
                        raise AssertionError("R22 no preservar caso q100")
                if manual["status"] == "ALTERNATIVA_RECONSTRUIDA_PENDIENTE_IMAGEN":
                    if not row.get("transcriptionReview"):
                        raise AssertionError(f"R22 alternativa no marcada: {eid} q{row['number']}")
            status = manual["status"] if manual else "REVISION_INDIVIDUAL_PENDIENTE"
            count[status] += 1
            original_letters = row.get("originalSheetAnswer")
            applied = row.get("correctAnswer")
            ready_before_after += int(applied in "ABCD" if applied else False)
            info = source_flags[row["number"]]
            export = {
                "examId": eid, "date": meta["date"], "category": meta["category"],
                "model": meta["model"], "number": row["number"], "sourcePage": row["sourcePage"],
                "editorialStatus": status, "caseId": f"{eid}:{row['number']}" if manual else "",
                "sourceEvidence": manual["source"] if manual else "",
                "reviewNote": manual["explanation"] if manual else
                    "Cribada por reglas R21; cotejo editorial individual con imagen de examen aun pendiente.",
                "question": row["question"], "optionA": row["options"]["A"],
                "optionB": row["options"]["B"], "optionC": row["options"]["C"],
                "optionD": row["options"]["D"],
                "sheetOriginal": original_letters or "",
                "sheetMapped": row.get("mappedSheetAnswer") or "",
                "bankAnswer": row.get("bankAnswer") or "",
                "appliedAnswer": applied or "",
                "scoringEligible": "SI" if applied else "NO",
                "originalTextRetained": "SI" if row.get("textCorrection") else "NO",
                "mechanicalTextFix": row.get("textCorrection", {}).get("method", ""),
                "r21Priority": info["priority"],
                "r21Flags": " | ".join(f["code"] for f in info["flags"]),
            }
            table.append(export)
        if eid in TARGETS:
            by_exam.append({"examId": eid, "date": meta["date"], "model": meta["model"],
                            "reviewedRows": sum(r["examId"] == eid for r in table),
                            "caseCount": sum((eid, n) in by_case for n in range(1, 101)),
                            "casesByStatus": dict(count),
                            "printedLetters": sum(r.get("originalSheetAnswer") in "ABCD"
                                                  for r in rows),
                            "scoredAnswers": meta["readyCount"],
                            "textFixes": sum(bool(r.get("textCorrection")) for r in rows),
                            "editoriallyComplete": False})
    assert len(table) == 306 and len(seen) == 33
    assert len(by_exam) == 3 and all(e["reviewedRows"] == 100 for e in by_exam)
    assert sum(e["caseCount"] for e in by_exam) == 27
    assert sum(e["textFixes"] for e in by_exam) == 99
    assert sum(e["printedLetters"] for e in by_exam) == 300
    assert all(e["editoriallyComplete"] is False for e in by_exam)
    assert sum(1 for r in table if r["editorialStatus"] == "ALTERNATIVA_RECONSTRUIDA_PENDIENTE_IMAGEN") == 6
    assert sum(1 for r in table if r["editorialStatus"] == "SIN_CASILLA_OFICIAL_VINCULABLE") == 1

    payload = {
        "schemaVersion": 1,
        "round": "R22",
        "note": "No confundir cribado automatizado (300) con 100 revisiones visuales. "
                "33 casos con observaciones puntuales; ninguna respuesta cambiada.",
        "totalRows": len(table),
        "manualCaseCount": len(seen),
        "preservedSourceLetters": 300,
        "correctAnswerChangeCount": 0,
        "sourceAnswerSheetChangeCount": 0,
        "targetExams": by_exam,
        "statusCounts": dict(Counter(r["editorialStatus"] for r in table)),
        "cases": [{
            "examId": x["examId"], "number": x["number"],
            "status": x["editorialStatus"], "explanation": x["reviewNote"],
            "source": x["sourceEvidence"],
        } for x in table if x["caseId"]],
    }
    (OUT / "editorial_casebook_r22.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    with (OUT / "editorial_casebook_r22.csv").open(
            "w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(table)
    print("PASS R22 editorial:", len(table), "filas,", len(seen),
          "casos anotados, 99 textos corregidos en los 3 modelos, "
          "300 letras preservadas; 0 claves alteradas")


if __name__ == "__main__":
    main()
