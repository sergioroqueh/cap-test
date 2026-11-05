"""CAP R24: diez modelos Mercancias 2022-24 con plantilla, exclusivamente.

Genera expediente 1000 filas + panorama de 26 convocatorias. Los tres
modelos sin plantilla de 2022/2023/Viajeros 2024 se aplazan para el final.
La sola presencia en el CSV NO supone revisión visual individual.
"""
from __future__ import annotations

from collections import Counter
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data-src" / "cap-exams"
OUT = ROOT / "public" / "data" / "exams"
TARGETS = [
    "2024-04-06-mercancias-global",
    "2024-07-20-mercancias-a",
    "2023-07-29-mercancias-b",
    "2024-07-20-mercancias-b",
    "2023-02-04-mercancias-global",
    "2023-06-03-mercancias-global",
    "2023-03-25-mercancias-global",
    "2024-05-25-mercancias-global",
    "2022-10-01-mercancias-global",
    "2023-09-23-mercancias-global",
]
DEFERRED = [
    "2022-05-21-mercancias-global",
    "2023-12-02-mercancias-global",
    "2024-04-06-viajeros-global",
]
R22 = {
    "2025-09-27-mercancias-global",
    "2022-11-26-mercancias-global",
    "2023-07-29-mercancias-a",
}
R23 = {
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
}
FIELDS = (
    "examId", "date", "category", "model", "number", "sourcePage",
    "question", "optionA", "optionB", "optionC", "optionD",
    "editorialState", "priority", "caseReason", "caseSource", "caseEvidence",
    "pdfOriginalLetter", "linkedTemplateLetter", "bankLetter",
    "scoredLetter", "scoringEligible", "sourceType",
    "transcriptionPending", "r21Priority", "r21Flags",
    "verifiedQuestionIndividually", "textOriginalPreserved", "templateFile",
)

def norm(value):
    s = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def main():
    index = json.loads((OUT / "index.json").read_text(encoding="utf-8"))
    triage = json.loads((OUT / "editorial_triage_r21.json").read_text(encoding="utf-8"))
    source = json.loads((SRC / "r24_editorial_cases.json").read_text(encoding="utf-8"))
    official = json.loads(
        (SRC / "official_public_evidence_2026_11_05.json").read_text(encoding="utf-8")
    )["cases"]
    assert source["schemaVersion"] == 1 and source["noTemplateOrViajerosExcluded"] is True
    assert len(source["cases"]) == 18
    keyed = {}
    for case in source["cases"]:
        identity = (case["examId"], case["number"])
        assert identity not in keyed and case["examId"] in TARGETS
        assert case["changesAnswer"] is False
        assert case["manualVisualReviewComplete"] is False
        keyed[identity] = case

    all_ids = {m["id"] for m in index["exams"]}
    assert len(all_ids) == 26
    assert len(TARGETS) == 10 and len(R22) == 3 and len(R23) == 10
    assert len(DEFERRED) == 3
    assert (set(TARGETS) | R22 | R23 | set(DEFERRED)) == all_ids
    assert not (set(TARGETS) & (R22 | R23 | set(DEFERRED)))
    assert not (R22 & (R23 | set(DEFERRED)))
    assert not (R23 & set(DEFERRED))
    metas = {m["id"]: m for m in index["exams"]}
    assert all(metas[eid]["hasOriginalAnswerSheet"] and
               metas[eid]["category"] == "mercancias" for eid in TARGETS)
    assert all(not metas[eid]["hasOriginalAnswerSheet"] for eid in DEFERRED)
    assert metas["2024-04-06-viajeros-global"]["category"] == "viajeros"
    assert metas["2025-07-26-mercancias-b"]["hasOriginalAnswerSheet"] is False

    source_r24 = {
        key: value for key, value in official.items()
        if value["examId"] in TARGETS
    }
    assert set(source_r24) == {
        "2024-04-06-mercancias-global:71",
        "2023-07-29-mercancias-b:33",
        "2024-05-25-mercancias-global:32",
        "2023-03-25-mercancias-global:50",
        "2024-07-20-mercancias-b:84",
    }

    export = []
    exams = []
    visited_cases = set()
    corrected = []
    total_scored = total_original = total_disputed = 0
    for eid in TARGETS:
        meta = metas[eid]
        questions = json.loads(
            (OUT / "questions" / f"{eid}.json").read_text(encoding="utf-8"))
        assert len(questions) == 100
        assert {q["number"] for q in questions} == set(range(1, 101))
        audit = {v["number"]: v for v in triage["questions"][eid]}
        assert len(audit) == 100
        categories = Counter()
        manual = 0
        exam_corrected = 0
        for row in questions:
            key = (eid, row["number"])
            case = keyed.get(key)
            if case:
                visited_cases.add(key)
                wanted_fragment = norm(case["expectedQuestionFragment"])
                if wanted_fragment and wanted_fragment not in norm(row["question"]):
                    raise AssertionError(
                        f"R24 enunciado no corresponde a fuente: {eid} q{row['number']} "
                        f"{case['expectedQuestionFragment']}")
                if case["expectedSheetAnswer"] is not None:
                    assert row["originalSheetAnswer"] == case["expectedSheetAnswer"], key
                if case["status"] in ("GRAFIA_RESTAURADA_REVERSIBLE",
                                      "NORMA_BOE_Y_GRAFIA_CORREGIDA"):
                    proof = row.get("textCorrection")
                    assert proof and proof["round"] == "R24", key
                    assert proof["answerKeysChanged"] is False
                    assert proof["originalQuestion"] or proof["originalOptions"]
                    assert proof["sourceOriginalExam"] == "Examenes TOTALES.pdf"
                if case["status"] == "RECONSTRUCCION_ALTERNATIVA_PENDIENTE_IMAGEN":
                    assert row.get("transcriptionReview") is True, key
                if case["status"] == "NUMERACION_INTERNA_12000_KG_PROTEGIDA":
                    assert "12.000 kg" in row["options"]["C"], key
                    assert "exento del uso de tacógrafo" in row["options"]["D"], key
                if case["status"] == "TEXTO_VISUAL_PENDIENTE_COTEJO":
                    assert row.get("transcriptionReview") is True
                manual += 1
            official_key = f"{eid}:{row['number']}"
            if official_key in source_r24:
                entry = source_r24[official_key]
                assert case is not None, official_key
                assert norm(entry["expectedQuestion"]) == norm(row["question"])
                matches = [
                    letter for letter, text in row["options"].items()
                    if norm(text) == norm(entry["correctAnswerText"])
                ]
                assert len(matches) == 1 and matches[0] == row["originalSheetAnswer"], official_key
                assert entry["editorialReviewRequired"] is True
            original = row["originalSheetAnswer"]
            applied = row["correctAnswer"]
            assert original in "ABCD" and applied in "ABCD", key
            assert original == applied, f"R24 cambio inesperado de letra: {key}"
            assert row.get("answerDispute") is None, key
            assert all(key2 in row["options"] and row["options"][key2].strip()
                       for key2 in "ABCD")
            assert meta["sourcePageStart"] <= row["sourcePage"] <= meta["sourcePageEnd"]
            total_original += 1
            total_scored += 1
            if row.get("textCorrection", {}).get("round") == "R24":
                corrected.append(key)
                exam_corrected += 1
            flag = audit[row["number"]]
            if case:
                state, priority = case["status"], case["priority"]
            elif row.get("transcriptionReview"):
                state, priority = "TEXTO_VISUAL_PROVISIONAL_PENDIENTE_COTEJO", "P1"
            else:
                state, priority = "COTEJO_EDITORIAL_INDIVIDUAL_PENDIENTE", flag["priority"]
            categories[state] += 1
            export.append({
                "examId": eid, "date": meta["date"],
                "category": meta["category"], "model": meta["model"],
                "number": row["number"], "sourcePage": row["sourcePage"],
                "question": row["question"],
                "optionA": row["options"]["A"], "optionB": row["options"]["B"],
                "optionC": row["options"]["C"], "optionD": row["options"]["D"],
                "editorialState": state, "priority": priority,
                "caseReason": case["reason"] if case else "",
                "caseSource": case["sourceUrl"] if case else "",
                "caseEvidence": case["evidenceType"] if case else "",
                "pdfOriginalLetter": original,
                "linkedTemplateLetter": row.get("mappedSheetAnswer") or "",
                "bankLetter": row.get("bankAnswer") or "",
                "scoredLetter": applied,
                "scoringEligible": "SI",
                "sourceType": row.get("sourceMethod") or "",
                "transcriptionPending": "SI" if row.get("transcriptionReview") else "NO",
                "r21Priority": flag["priority"],
                "r21Flags": " | ".join(f["code"] for f in flag["flags"]),
                "verifiedQuestionIndividually": "NO",
                "textOriginalPreserved": "SI" if row.get("textCorrection") else "NO",
                "templateFile": meta["templateFile"],
            })
        exams.append({
            "examId": eid, "date": meta["date"], "model": meta["model"],
            "pages": [meta["sourcePageStart"], meta["sourcePageEnd"]],
            "templateFile": meta["templateFile"],
            "questions": len(questions), "printedAnswers": 100, "scoredAnswers": 100,
            "unscoredAnswers": 0, "casesWithEvidence": manual,
            "textCorrectionsReversible": exam_corrected,
            "pendingVisualTranscription": sum(bool(x.get("transcriptionReview"))
                                             for x in questions),
            "r21Alerts": sum(x["priority"] != "P4" for x in audit.values()),
            "statusCounts": dict(categories),
            "visualAuditAll100Completed": False,
        })
    assert len(export) == 1000 and len(exams) == 10
    assert len(visited_cases) == len(keyed) == 18
    assert total_scored == total_original == 1000 and total_disputed == 0
    assert len(corrected) == 7

    # Global, mutually exclusive editorial accounting.
    r22 = json.loads((OUT / "editorial_casebook_r22.json").read_text(encoding="utf-8"))
    r23 = json.loads((OUT / "editorial_casebook_r23.json").read_text(encoding="utf-8"))
    assert {m["examId"] for m in r22["targetExams"]} == R22
    assert {m["examId"] for m in r23["exams"]} == R23
    assert r22["totalRows"] == 306 and r23["totalQuestionRows"] == 1000
    assert r22["preservedSourceLetters"] == 300
    assert r23["originalSheetLetters"] == 900
    assert r23["scoringEligibleBeforeAfter"] == 982
    assert r23["withoutScoring"] == 18 and r23["blockedTemplateConflicts"] == 3

    deferred = []
    for eid in DEFERRED:
        m = metas[eid]
        rows = json.loads((OUT / "questions" / f"{eid}.json").read_text(encoding="utf-8"))
        assert len(rows) == 100
        assert all(not q.get("originalSheetAnswer") for q in rows)
        deferred.append({
            "examId": eid, "category": m["category"], "date": m["date"],
            "questionsNotAuditedThisRound": 100,
            "scoringEligibleFromBank": sum(q.get("correctAnswer") in "ABCD"
                                           for q in rows if q.get("correctAnswer")),
            "unscoredDueToNoSheet": sum(q.get("correctAnswer") is None for q in rows),
            "whyDeferred": "Fase final: plantilla original no disponible o Viajeros",
        })
    assert sum(x["unscoredDueToNoSheet"] for x in deferred) == 165
    assert sum(x["scoringEligibleFromBank"] for x in deferred) == 135
    remaining_2025b = metas["2025-07-26-mercancias-b"]
    assert remaining_2025b["hasOriginalAnswerSheet"] is False
    assert remaining_2025b["count"] - remaining_2025b["readyCount"] == 15

    full_scored = (sum(x["scoringEligible"] for x in r23["exams"]) +
                   sum(x["scoredAnswers"] for x in r22["targetExams"]) +
                   total_scored + sum(x["scoringEligibleFromBank"] for x in deferred))
    full_original = (r22["preservedSourceLetters"] +
                     r23["originalSheetLetters"] + total_original)
    assert full_scored == 2417 and full_original == 2200
    assert 23 * 100 + len(DEFERRED) * 100 == 2600
    assert 18 + 165 == 183  # 3 conflictos and 180 missing-template questions
    assert 165 + 15 == 180

    all_cases = []
    for case in source["cases"]:
        m = metas[case["examId"]]
        line = next(x for x in export if
                    x["examId"] == case["examId"] and x["number"] == case["number"])
        all_cases.append({**case, "sourcePage": line["sourcePage"],
                          "originalSheetAnswer": line["pdfOriginalLetter"],
                          "bankAnswer": line["bankLetter"] or None,
                          "appliedAnswer": line["scoredLetter"]})

    report = {
        "schemaVersion": 1, "round": "R24",
        "scope": "SOLO Mercancias 2022–2024 con plantilla; Viajeros y exámenes sin "
                 "plantilla quedan para la fase final",
        "totalExamModels": len(exams),
        "totalQuestionRows": len(export),
        "originalSheetLetters": total_original,
        "scoringEligible": total_scored,
        "originalSheetConflicts": total_disputed,
        "caseCount": len(all_cases),
        "reversibleTextCorrections": len(corrected),
        "reviewCompletedVisualAll100": False,
        "sourceKeyChanges": 0,
        "exams": exams, "cases": all_cases,
        "deferredToFinal": deferred,
        "globalEditorialProgress": {
            "totalExamModels": 26, "allHistoricalQuestions": 2600,
            "modelsIndexedR22R23R24": 23,
            "questionsIndexedR22R23R24": 2300,
            "modelsDeferredToFinal": 3, "questionsDeferredToFinal": 300,
            "printedSheetLetters": full_original,
            "scoringEligibleAllModels": full_scored,
            "totalUnscored": 183,
            "unscoredFromMissingTemplate": 180,
            "unscoredFromDocumentedDisputes": 3,
            "deferredMissingTemplateInThreeUnreviewedExams": 165,
            "deferredMissingTemplateIn2025BAlreadyIndexed": 15,
            "bankOriginalQuestionCount": 8655,
            "bankOriginalQuestionnaires": 33,
            "noAnswerKeyChangesInR24": True,
        },
    }
    (OUT / "editorial_casebook_r24.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    with (OUT / "editorial_casebook_r24.csv").open(
        "w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(export)
    (OUT / "editorial_progress_r24.json").write_text(
        json.dumps(report["globalEditorialProgress"], ensure_ascii=False, indent=2),
        encoding="utf-8")
    print("PASS R24: 10 examenes Mercancias 2022-24 con plantilla, "
          "1000 preguntas, 1000 letras, 18 incidencias, 7 correcciones, 0 claves cambiadas")
    print("PASS R24 GLOBAL: 23 modelos/2300 indexadas, "
          "3 modelos/300 aplazadas, 2200 hojas, 2417 puntuables, 183 sin puntuacion")


if __name__ == "__main__":
    main()
