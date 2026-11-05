"""R14: cola editorial SOLO para exámenes CAP con plantilla identificada.

Ninguna clave se marca como definitiva desde una extracción automática.
Los modelos sin archivo de plantilla se aplazan y no participan en el
análisis editorial actual (sí permanecen en el inventario y la app).
"""
from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data-src" / "cap-exams"
OUT = ROOT / "public" / "data" / "exams"

def dump_csv(name, rows):
    fields = [
        "examId", "date", "category", "model", "templateFile",
        "hasDigitizedTemplate", "number", "sourcePage", "status",
        "bankAnswer", "templateAnswer", "question", "optionA",
        "optionB", "optionC", "optionD", "pendingReason",
    ]
    with (OUT / name).open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows([{k: row.get(k, "") for k in fields} for row in rows])

def main():
    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))["exams"]
    indexed = json.loads((OUT / "index.json").read_text(encoding="utf-8"))["exams"]
    by_id = {exam["id"]: exam for exam in manifest}
    digitized = set(json.loads((SRC / "answer_keys_unverified.json").read_text(encoding="utf-8")))
    if len(by_id) != len(indexed):
        raise AssertionError("Desfase entre manifiesto e índice")
    with_template, without_template = [], []
    for exam in indexed:
        meta = by_id[exam["id"]]
        if meta.get("templateFile") != exam.get("templateFile"):
            raise AssertionError("Plantilla desfasada en " + exam["id"])
        questions = json.loads((OUT / "questions" / (exam["id"] + ".json")).read_text(encoding="utf-8"))
        if len(questions) != 100:
            raise AssertionError("Modelo no completo: " + exam["id"])
        for question in questions:
            if question["correctAnswer"] is not None:
                continue
            row = dict(
                examId=exam["id"], date=exam["date"],
                category=exam["category"], model=exam["model"],
                templateFile=meta.get("templateFile") or "",
                hasDigitizedTemplate="SI" if exam["id"] in digitized else "NO",
                number=question["number"], sourcePage=question["sourcePage"],
                status=question["answerStatus"],
                bankAnswer=question.get("bankAnswer") or "",
                templateAnswer=question.get("templateAnswer") or "",
                question=question["question"],
                optionA=question["options"]["A"], optionB=question["options"]["B"],
                optionC=question["options"]["C"], optionD=question["options"]["D"],
                pendingReason="VERIFICAR_IMAGEN_PLANTILLA" if meta.get("templateFile")
                else "APLAZADO_SIN_ARCHIVO_PLANTILLA",
            )
            (with_template if meta.get("templateFile") else without_template).append(row)
    for rows in (with_template, without_template):
        rows.sort(key=lambda row: (row["examId"], row["number"]))
    dump_csv("template_review_priority.csv", with_template)
    dump_csv("without_template_deferred.csv", without_template)
    if len(with_template) + len(without_template) != 678:
        raise AssertionError("La cola debería contener 678 preguntas pendientes")
    if len(with_template) != 498 or len(without_template) != 180:
        raise AssertionError("Desfase de cola prioritaria y aplazada")

    # Una lectura textual de la plantilla oficial no basta para corregirla:
    # exige auditoría visual por número, sobre todo si contradice al banco.
    source = json.loads((SRC / "official_template_extraction_unverified_2025_03_29.json").read_text(encoding="utf-8"))
    exam_id = source["examId"]
    source_key = source["correctAnswersCandidate"]
    if len(source_key) != 100 or set(source_key) - set("ABCD"):
        raise AssertionError("Lectura textual de plantilla no contiene 100 respuestas A-D")
    if "BLOQUEADO" not in source["reviewStatus"]:
        raise AssertionError("Extracción textual no está bloqueada")
    exam_rows = json.loads((OUT / "questions" / (exam_id + ".json")).read_text(encoding="utf-8"))
    conflicts, candidates, concordant = [], [], []
    for q in exam_rows:
        letter = source_key[q["number"] - 1]
        line = dict(
            examId=exam_id, number=q["number"], sourcePage=q["sourcePage"],
            extractedLetter=letter, bankAnswer=q.get("bankAnswer"),
            answerStatus=q["answerStatus"], question=q["question"],
            extractedAnswerText=q["options"][letter], sourceUrl=source["sourceUrl"],
            reviewStatus="LECTURA_PDF_SIN_IMAGEN_NO_APROBADA",
        )
        if q.get("bankAnswer") in ('A', 'B', 'C', 'D'):
            (concordant if q["bankAnswer"] == letter else conflicts).append(line)
        else:
            candidates.append(line)
    (OUT / "template_2025_03_29_unverified_comparison.json").write_text(
        json.dumps({
            "sourceUrl": source["sourceUrl"],
            "reviewStatus": source["reviewStatus"],
            "meaning": "Extracción de texto de web; ningún resultado es definitivo sin leer la plantilla original",
            "matchingExistingBank": len(concordant),
            "disagreeingWithExistingBank": len(conflicts),
            "noExistingBankAnswer": len(candidates),
            "disagreements": conflicts,
            "candidatesUnapproved": candidates,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
    if (len(concordant), len(conflicts), len(candidates)) != (76, 9, 15):
        raise AssertionError("La extracción no reproduce la auditoría; detener")
    summary = {
        "modelCount": len(indexed),
        "totalUnscored": len(with_template) + len(without_template),
        "prioritizedWithTemplate": len(with_template),
        "deferredWithoutTemplate": len(without_template),
        "templateModels": sum(bool(x.get("templateFile")) for x in indexed),
        "modelsWithoutTemplate": [x["id"] for x in indexed if not x.get("templateFile")],
        "priorityByExam": dict(Counter(r["examId"] for r in with_template)),
        "deferredByExam": dict(Counter(r["examId"] for r in without_template)),
        "unverifiedTemplateTextExample": {
            "examId": exam_id,
            "matchedBank": len(concordant),
            "conflictsBlocked": len(conflicts),
            "withoutBankCandidateBlocked": len(candidates),
        },
        "publishedAnswerChanges": 0,
        "instructions": "Esperar lectura VISUAL de plantilla original, no convertir las letras de la extracción en definitivas",
    }
    (OUT / "template_review_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("PASS R14", summary["prioritizedWithTemplate"], "con plantilla;",
          summary["deferredWithoutTemplate"], "aplazadas; conflicto lectura:", len(conflicts))

if __name__ == "__main__":
    main()
