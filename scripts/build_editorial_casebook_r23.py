"""R23: trazabilidad por pregunta de los diez modelos CAP restantes 2025-2026.

No reescribe fuente, plantilla, banco ni clave aplicada. La exportacion de
1.000 filas no equivale a 1.000 cotejos visuales individuales.
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
TARGETS = [
    "2025-02-01-mercancias-global",
    "2025-03-29-mercancias-global",
    "2025-07-26-mercancias-a",
    "2025-07-26-mercancias-b",
    "2026-02-07-mercancias-global",
    "2026-03-28-mercancias-global",
    "2026-05-30-mercancias-global",
    "2026-07-25-mercancias-a",
    "2026-07-25-mercancias-b",
    "2026-09-26-mercancias-a",
]
FIELDS = (
    "examId", "date", "category", "model", "questionNumber", "sourcePage",
    "question", "optionA", "optionB", "optionC", "optionD",
    "editorialState", "priority", "caseReason", "caseSource", "caseEvidence",
    "pdfOriginalLetter", "linkedTemplateLetter", "bankLetter", "scoredLetter",
    "scoringEligible", "sourceType", "transcriptionPending", "r21Priority",
    "r21Flags", "verifiedQuestionIndividually", "templateFile",
)

def norm(s):
    txt = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", txt).split())

def main():
    index = json.loads((OUT / "index.json").read_text(encoding="utf-8"))
    triage = json.loads((OUT / "editorial_triage_r21.json").read_text(encoding="utf-8"))
    source = json.loads((SRC / "r23_editorial_cases.json").read_text(encoding="utf-8"))
    assert source["round"] == "R23" and len(source["cases"]) == 17
    by_case = {}
    for item in source["cases"]:
        key = (item["examId"], item["number"])
        assert key not in by_case and item["examId"] in TARGETS
        assert item["changesAnswer"] is False and item["reviewCompleted"] is False
        by_case[key] = dict(item)

    verified = json.loads(
        (SRC / "answer_keys_visually_verified.json").read_text(encoding="utf-8")
    )["exams"]
    # Nine divergences involve a different text-only, explicitly UNVERIFIED
    # public-PDF extraction. They are NOT nine errors in the vetted original.
    weak = json.loads((SRC / "official_template_extraction_unverified_2025_03_29.json").read_text(encoding="utf-8"))
    assert weak["examId"] == "2025-03-29-mercancias-global"
    assert "NO_PUBLICAR" in weak["reviewStatus"]
    candidate = weak["correctAnswersCandidate"]
    definitive = verified[weak["examId"]]["correctAnswers"]
    assert len(candidate) == len(definitive) == 100
    different = {
        number: (candidate[number - 1], definitive[number - 1])
        for number in range(1, 101)
        if candidate[number - 1] != definitive[number - 1]
    }
    assert set(different) == {25, 46, 62, 69, 70, 80, 82, 90, 100}
    for n, (weak_letter, strong_letter) in different.items():
        entry = by_case[(weak["examId"], n)]
        assert entry["status"] == "LECTURA_EXTERNA_NO_VERIFICADA_DISCREPA"
        entry["unverifiedTextExtractionLetter"] = weak_letter
        entry["visuallyVerifiedOriginalSheetLetter"] = strong_letter

    meta_by_id = {e["id"]: e for e in index["exams"]}
    assert len(meta_by_id) == 26
    assert all(meta_by_id[e]["category"] == "mercancias" for e in TARGETS)
    assert sum(meta_by_id[e]["hasOriginalAnswerSheet"] for e in TARGETS) == 9

    all_rows = []
    stats = []
    seen = set()
    original_letters = scoring = unscored = conflicts = 0
    for eid in TARGETS:
        meta = meta_by_id[eid]
        rows = json.loads((OUT / "questions" / f"{eid}.json").read_text(encoding="utf-8"))
        assert len(rows) == 100 and {q["number"] for q in rows} == set(range(1, 101))
        flags = {q["number"]: q for q in triage["questions"][eid]}
        counts = Counter()
        review_items = 0
        for q in rows:
            identity = (eid, q["number"])
            case = by_case.get(identity)
            if case:
                seen.add(identity)
                fragment = norm(case["expectedQuestionFragment"])
                if fragment and fragment not in norm(q["question"]):
                    raise AssertionError(f"R23 texto de fuente no coincide: {eid} q{q['number']} '{fragment}'")
                if case["expectedPrintedAnswer"] is not None:
                    assert q["originalSheetAnswer"] == case["expectedPrintedAnswer"], identity
                if case["status"] == "LECTURA_EXTERNA_NO_VERIFICADA_DISCREPA":
                    assert q["originalSheetAnswer"] == case["visuallyVerifiedOriginalSheetLetter"]
                    assert q["correctAnswer"] == case["visuallyVerifiedOriginalSheetLetter"]
                if case["status"] in {
                    "CONFLICTO_PLANTILLA_BANCO_SIN_PUNTUAR",
                    "CONFLICTO_NORMATIVO_SIN_PUNTUAR",
                    "ENUNCIADO_INCOHERENTE_PDF_SIN_PUNTUAR",
                }:
                    assert q["correctAnswer"] is None and q.get("answerDispute"), identity
                if case["status"] == "OPCION_RECONSTRUIDA_AUN_SIN_IMAGEN":
                    assert q.get("transcriptionReview") is True
                if case["status"] == "MISMA_PREGUNTA_SIN_PLANTILLA_INDEPENDIENTE":
                    assert q["originalSheetAnswer"] is None and eid == "2025-07-26-mercancias-b"
                review_items += 1

            scored = q["correctAnswer"] in "ABCD" if q["correctAnswer"] else False
            printed = q.get("originalSheetAnswer") in "ABCD" if q.get("originalSheetAnswer") else False
            if printed:
                original_letters += 1
            if scored:
                scoring += 1
            else:
                unscored += 1
            if q.get("answerDispute"):
                conflicts += 1
            assert bool(meta["hasOriginalAnswerSheet"]) == printed
            assert q["sourcePage"] in range(meta["sourcePageStart"], meta["sourcePageEnd"] + 1)
            assert all(key in q["options"] and isinstance(q["options"][key], str) and q["options"][key].strip()
                       for key in "ABCD"), identity
            if case:
                state = case["status"]
                priority = case["priority"]
            elif not scored and not meta["hasOriginalAnswerSheet"]:
                state, priority = "SIN_PLANTILLA_Y_SIN_CLAVE", "P3"
            elif not meta["hasOriginalAnswerSheet"]:
                state, priority = "RESPUESTA_BANCO_SIN_PLANTILLA", "P2"
            elif q.get("transcriptionReview"):
                state, priority = "TEXTO_VISUAL_PROVISIONAL_PENDIENTE_COTEJO", "P1"
            else:
                state, priority = "COTEJO_EDITORIAL_INDIVIDUAL_PENDIENTE", "P4"
            counts[state] += 1
            flag_info = flags[q["number"]]
            all_rows.append({
                "examId": eid, "date": meta["date"], "category": meta["category"],
                "model": meta["model"], "questionNumber": q["number"],
                "sourcePage": q["sourcePage"], "question": q["question"],
                "optionA": q["options"]["A"], "optionB": q["options"]["B"],
                "optionC": q["options"]["C"], "optionD": q["options"]["D"],
                "editorialState": state, "priority": priority,
                "caseReason": case["reason"] if case else "",
                "caseSource": case["sourceUrl"] if case else "",
                "caseEvidence": case["evidenceType"] if case else "",
                "pdfOriginalLetter": q.get("originalSheetAnswer") or "",
                "linkedTemplateLetter": q.get("mappedSheetAnswer") or "",
                "bankLetter": q.get("bankAnswer") or "",
                "scoredLetter": q.get("correctAnswer") or "",
                "scoringEligible": "SI" if scored else "NO",
                "sourceType": q.get("sourceMethod") or "",
                "transcriptionPending": "SI" if q.get("transcriptionReview") else "NO",
                "r21Priority": flag_info["priority"],
                "r21Flags": " | ".join(f["code"] for f in flag_info["flags"]),
                "verifiedQuestionIndividually": "NO",
                "templateFile": meta.get("templateFile") or "",
            })
        stats.append({
            "examId": eid, "date": meta["date"], "model": meta["model"],
            "pages": [meta["sourcePageStart"], meta["sourcePageEnd"]],
            "questions": len(rows),
            "scoringEligible": sum(q["correctAnswer"] in "ABCD" if q["correctAnswer"] else False for q in rows),
            "withoutScoring": sum(not (q["correctAnswer"] in "ABCD" if q["correctAnswer"] else False) for q in rows),
            "originalPrintedLetters": sum(q.get("originalSheetAnswer") in "ABCD" if q.get("originalSheetAnswer") else False for q in rows),
            "templateFile": meta.get("templateFile"),
            "caseCount": review_items,
            "transcriptionReviewPending": sum(bool(q.get("transcriptionReview")) for q in rows),
            "r21Alerts": sum(x["priority"] != "P4" for x in flags.values()),
            "caseStatusCounts": dict(counts),
            "visualReviewCompletedAllQuestions": False,
        })

    assert len(seen) == len(by_case) == 17
    assert len(all_rows) == 1000 and len(stats) == 10
    assert original_letters == 900
    assert scoring == 982 and unscored == 18
    assert conflicts == 3
    assert sum(x["withoutScoring"] for x in stats if x["templateFile"] is None) == 15
    assert all(x["questions"] == 100 and not x["visualReviewCompletedAllQuestions"] for x in stats)
    assert sum(x["originalPrintedLetters"] for x in stats) == original_letters

    # Same official 2025-07 A/B question and answer alternatives, but no
    # independent answer sheet for model B. No answer is transferred from A.
    a = next(q for q in all_rows if q["examId"] == "2025-07-26-mercancias-a"
             and q["questionNumber"] == 43)
    b = next(q for q in all_rows if q["examId"] == "2025-07-26-mercancias-b"
             and q["questionNumber"] == 83)
    assert norm(a["question"]) == norm(b["question"])
    assert {norm(a[f"option{k}"]) for k in "ABCD"} == {
        norm(b[f"option{k}"]) for k in "ABCD"}
    assert a["pdfOriginalLetter"] == "A" and not b["pdfOriginalLetter"]
    assert a["scoredLetter"] == ""

    enriched_cases = []
    for case in source["cases"]:
        key = (case["examId"], case["number"])
        entry = next(q for q in all_rows if (q["examId"], q["questionNumber"]) == key)
        enriched = dict(case)
        enriched.update({
            "sourcePage": entry["sourcePage"],
            "originalSheetAnswer": entry["pdfOriginalLetter"] or None,
            "bankAnswer": entry["bankLetter"] or None,
            "appliedAnswer": entry["scoredLetter"] or None,
        })
        enriched_cases.append(enriched)
    report = {
        "schemaVersion": 1, "round": "R23",
        "interpretation": "1.000 filas auditables por convocatoria, NO 1.000 comprobaciones visuales. "
        "Las 17 incidencias tienen evidencia y ninguna altera puntuacion.",
        "totalExamModels": len(stats),
        "totalQuestionRows": len(all_rows),
        "manualEvidenceCases": len(enriched_cases),
        "originalSheetLetters": original_letters,
        "scoringEligibleBeforeAfter": scoring,
        "withoutScoring": unscored,
        "blockedTemplateConflicts": conflicts,
        "manualVisualReviewCompleted": False,
        "sourceKeyChanges": 0,
        "unverifiedMarch2025DifferenceCount": len(different),
        "unverifiedMarch2025Numbers": sorted(different),
        "exams": stats,
        "cases": enriched_cases,
        "stateCounts": dict(Counter(x["editorialState"] for x in all_rows)),
    }
    (OUT / "editorial_casebook_r23.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    with (OUT / "editorial_casebook_r23.csv").open(
        "w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(all_rows)
    print("PASS R23: 10 modelos, 1000 filas, 17 casos, 900 letras, "
          "982 puntuables, 18 sin puntuacion, 3 conflictos, 9 diferencias provisionales, "
          "0 cambios de clave")


if __name__ == "__main__":
    main()
