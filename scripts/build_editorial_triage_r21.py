"""R21: cribado reproducible de 26 examenes y marcas editoriales sin modificar soluciones.

Una marca de cotejo NO equivale a una respuesta erronea. Guarda procedencia,
evidencia, tipo y prioridad en un fichero separado del banco y de las plantillas.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data" / "exams"
SOURCE = ROOT / "data-src" / "cap-exams"
LETTERS = set("ABCD")
# Posibles confusiones entre I mayuscula y l minuscula en capas de texto PDF.
BAD_OCR = re.compile(r"\b(?:EI|eI|Ios|Ias|Ia|SoIo|soIo|AI)\b|(?<=[a-záéíóúüñ])I(?=[a-záéíóúüñ])")
FIELDS = ("examId", "date", "category", "model", "questionNumber", "sourcePage",
          "question", "optionA", "optionB", "optionC", "optionD",
          "priority", "flags", "explanation", "printedAnswer", "mappedAnswer",
          "bankAnswer", "scoredAnswer", "textReviewRequired", "sheetSource")


def norm(s: str) -> str:
    text = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def fingerprint(q: dict) -> tuple:
    return (norm(q["question"]), tuple(sorted(norm(v) for v in q["options"].values())))


def mark(target: dict, code: str, priority: str, reason: str, evidence: str) -> None:
    if code in {f["code"] for f in target["flags"]}:
        return
    target["flags"].append({
        "code": code,
        "priority": priority,
        "description": reason,
        "evidence": evidence,
        "sourceStatus": "AVISO_DE_REVISION_NO_MODIFICA_RESPUESTA",
    })


def main() -> None:
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    source = {e["id"]: e for e in json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))["exams"]}
    all_rows: list[dict] = []
    by_id: dict[tuple[str, int], dict] = {}
    by_fingerprint: dict[tuple, list[dict]] = defaultdict(list)
    for exam in index["exams"]:
        eid = exam["id"]
        questions = json.loads((DATA / "questions" / f"{eid}.json").read_text(encoding="utf-8"))
        assert len(questions) == 100 and {r["number"] for r in questions} == set(range(1, 101))
        assert source[eid]["category"] == exam["category"]
        for q in questions:
            item = {
                "examId": eid, "date": exam["date"], "category": exam["category"],
                "model": exam["model"], "questionNumber": q["number"],
                "sourcePage": q["sourcePage"], "question": q["question"],
                "options": q["options"],
                "printedAnswer": q.get("originalSheetAnswer"),
                "mappedAnswer": q.get("mappedSheetAnswer"),
                "bankAnswer": q.get("bankAnswer"),
                "scoredAnswer": q.get("correctAnswer"),
                "sheetSource": q.get("originalSheetSourceFile"),
                "textCorrection": q.get("textCorrection"),
                "textReviewRequired": bool(q.get("transcriptionReview")),
                "numberOffset": q.get("mappedSheetQuestionNumber") != q["number"]
                    if exam.get("hasOriginalAnswerSheet") else False,
                "editoriallyReviewed": bool(q.get("answerEditoriallyVerified")),
                "flags": [],
            }
            all_rows.append(item)
            by_id[(eid, q["number"])] = item
            by_fingerprint[fingerprint(q)].append(item)
            if q.get("answerDispute"):
                mark(item, "conflicto_clave_bloqueada", "P0", "Plantilla y banco contradictorios; no puntuar",
                     f"Plantilla={q['originalSheetAnswer']}; banco={q.get('bankAnswer')}; PDF pág. {q['sourcePage']}")
                assert q["correctAnswer"] is None
            if item["numberOffset"]:
                mark(item, "desfase_numeracion_plantilla", "P1",
                     "La casilla impresa y la pregunta del examen no tienen correspondencia directa",
                     f"Pregunta={q['number']}; casilla vinculada={q.get('mappedSheetQuestionNumber')}; "
                     f"respuesta impresa={q.get('originalSheetAnswer')}; vinculada={q.get('mappedSheetAnswer')}")
            options = [norm(v) for v in q["options"].values()]
            if len(set(options)) < 4:
                mark(item, "opciones_duplicadas", "P0",
                     "Dos o mas alternativas tienen el mismo texto normalizado",
                     "Comparacion de las cuatro opciones exactas importadas; revisar el PDF")
            if len(norm(q["question"])) < 15 or any(len(x) < 2 for x in options):
                mark(item, "texto_incompleto_posible", "P1",
                     "Enunciado o alternativa inusualmente corta",
                     "Comprobacion sintactica; no implica que la clave sea incorrecta")
            sample = q["question"] + " " + " ".join(q["options"].values())
            damaged = BAD_OCR.findall(sample)
            # Un glifo aislado puede ser texto genuino; multiples patrones o
            # la I anormal incrustada justifican cotejo con el papel.
            embedded = bool(re.search(r"(?<=[a-záéíóúüñ])I(?=[a-záéíóúüñ])", sample))
            if (len(damaged) >= 2 or embedded) and not q.get("transcriptionReview"):
                mark(item, "texto_pdf_glifos_sospechosos", "P1",
                     "Posible sustitucion de l minuscula por I mayuscula en el texto extraido",
                     "Coincidencias visibles: " + ", ".join(damaged[:7]) + "; revisar imagen PDF")
            if (q.get("originalSheetAnswer") is None and q.get("correctAnswer") is None):
                mark(item, "sin_clave_plantilla_ausente", "P3",
                     "No hay plantilla original ni respuesta cotejada",
                     "No sugerir una letra por repeticion; modelo aplazado")
            elif q.get("originalSheetAnswer") and not q.get("bankAnswer"):
                mark(item, "sin_segundo_cotejo_banco", "P2",
                     "La hoja original no tiene coincidencia comparable con el banco de 8.655",
                     "No es evidencia de error; verificar texto/opciones antes de certificar")
            if q.get("textCorrection"):
                proof = q["textCorrection"]
                assert proof["answerKeysChanged"] is False
                assert proof["sourcePage"] == q["sourcePage"]
                source_reference = proof.get("sourceOfficialPdf") or proof.get("sourceOriginalExam")
                if eid == "2025-09-27-mercancias-global":
                    assert source_reference.startswith("https://www.castillalamancha.es/")
                else:
                    assert source_reference == "Examenes TOTALES.pdf"
                mark(item, "texto_pdf_normalizado_r22", "P1",
                     "Texto de examen restaurado para lectura, con original conservado; pendiente cotejo visual individual",
                     f"Fuente {source_reference} pagina {q['sourcePage']}; "
                     f"opciones afectadas {','.join(proof['changedOptions']) or 'ninguna'}")
            if q.get("transcriptionReview"):
                # Etiqueta informativa: evita tratar centenares de preguntas OCR como malas.
                item["transcriptionStatus"] = "LECTURA_VISUAL_U_OCR_PENDIENTE_COTEJO"
            if q.get("correctAnswer") and q.get("correctAnswer") not in LETTERS:
                raise AssertionError("Respuesta fuera del alfabeto A-D")
            assert q["category"] == exam["category"]

    # Confrontacion independiente entre plantillas de la MISMA modalidad.
    # Solo coteja fuentes originales cuando la casilla corresponde al numero.
    groups_discordant = 0
    for fingerprint_key, rows in by_fingerprint.items():
        confirmed = []
        for item in rows:
            if (item["printedAnswer"] in LETTERS and
                    item["mappedAnswer"] in LETTERS and not item["numberOffset"]):
                text_answer = norm(item["options"][item["mappedAnswer"]])
                confirmed.append((item, text_answer))
        if len(confirmed) < 2:
            continue
        # Evitar cotejos entre modalidades aun si el enunciado coincide.
        across_category = defaultdict(list)
        for item, text_answer in confirmed:
            across_category[item["category"]].append((item, text_answer))
        for group in across_category.values():
            if len(group) < 2 or len({t for _, t in group}) == 1:
                continue
            groups_discordant += 1
            evidence = "; ".join(
                f"{item['examId']} q{item['questionNumber']}={item['printedAnswer']}"
                for item, _ in group
            )
            for item, _ in group:
                mark(item, "diferencia_plantillas_modelos_repetidos", "P0",
                     "Mismo enunciado y cuatro opciones con solucion distinta en otras hojas",
                     evidence)

    # Evidencia editorial individual. Solo anotar si el material no cambio.
    march = by_id[("2026-03-28-mercancias-global", 43)]
    assert "problemas de circulación sanguínea" in march["question"].lower()
    assert "Placas de hielo" in march["options"]["A"]
    assert "Levantamiento de pesos" in march["options"]["B"]
    assert "Invasión de zonas" in march["options"]["C"]
    assert march["printedAnswer"] == "C" and march["bankAnswer"] == "B"
    assert march["scoredAnswer"] is None
    mark(march, "enunciado_fuente_incoherente", "P0",
         "El enunciado original pregunta por circulacion sanguinea pero las cuatro opciones tratan riesgos diferentes",
         "Examenes TOTALES.pdf pagina 355, inspeccion visual 05/11/2026; conservar hoja C y banco B")

    # R22: discrepancia técnica independiente de la plantilla. Marcar sin
    # cambiar la letra A original ni el estado del banco.
    gearbox = by_id[("2022-11-26-mercancias-global", 6)]
    assert "caja de cambios" in gearbox["question"]
    assert gearbox["printedAnswer"] == "A"
    assert gearbox["scoredAnswer"] == "A"
    mark(gearbox, "dudosa_clave_caja_cambios_frente_dgt", "P0",
         "La plantilla atribuye a la caja de cambios la función de conectar motor y transmisión, "
         "pero el Manual VIII de la DGT atribuye el acoplamiento al embrague y a la caja "
         "la adaptación de la relación de transmisión; no se elige una letra alternativa",
         "https://sede.dgt.gob.es/.galleries/permisos-de-conducir/"
         "certificacion-aptitud-profesores-formacion-vial/2022/Manual-VIII-Mecanica-2022.pdf; "
         "TEMA 7; PDF de examen página 420")

    sept = by_id[("2025-09-27-mercancias-global", 1)]
    assert "A bordo de un vehículo que transporta animales" in sept["question"]
    assert sept["options"]["A"] == "El origen y el propietario de los animales."
    assert sept["textCorrection"] is not None
    original_options = sept["textCorrection"]["originalOptions"]
    assert BAD_OCR.search(" ".join(original_options.values()))
    mark(sept, "cotejo_visual_glifos_septiembre_2025", "P1",
         "Capa de texto incorrecta ya normalizada para estudio; conservar el original y revisar visualmente",
         "Cuestionario oficial JCCM septiembre 2025, pagina 1; copia compilada PDF 482-499")

    # Seis opciones recuperadas manualmente porque el extractor omitio
    # o pego la letra de una alternativa. Permanecen pendientes de cotejo visual.
    repairs = json.loads(
        (SOURCE / "override_transcriptions_review.json").read_text(encoding="utf-8"))
    repair_count = 0
    for eid, items in repairs.items():
        for number, proof in items.items():
            item = by_id[(eid, int(number))]
            assert item["sourcePage"] == proof["page"]
            assert norm(item["question"]) == norm(proof["question"])
            assert all(norm(item["options"][a]) == norm(proof["options"][a]) for a in "ABCD")
            assert item["textReviewRequired"] is True
            mark(item, "opcion_reconstruida_extractor_pdf", "P1",
                 "Se reconstruyo una alternativa con letra ausente o unida al texto extraido",
                 proof["transcriptionNote"] + f"; PDF pagina {proof['page']}")
            repair_count += 1
    assert repair_count == 6

    counts = Counter()
    exams_out = []
    export = []
    for exam in index["exams"]:
        rows = [r for r in all_rows if r["examId"] == exam["id"]]
        for item in rows:
            item["flags"].sort(key=lambda f: (f["priority"], f["code"]))
            priority = min((f["priority"] for f in item["flags"]), default="P4")
            item["priority"] = priority
            counts[priority] += 1
            for flag in item["flags"]:
                counts[flag["code"]] += 1
            export.append({
                "examId": item["examId"], "date": item["date"],
                "category": item["category"], "model": item["model"],
                "questionNumber": item["questionNumber"], "sourcePage": item["sourcePage"],
                "question": item["question"], "optionA": item["options"]["A"],
                "optionB": item["options"]["B"], "optionC": item["options"]["C"],
                "optionD": item["options"]["D"],
                "priority": priority,
                "flags": " | ".join(f["code"] for f in item["flags"]),
                "explanation": " | ".join(f["description"] for f in item["flags"]),
                "printedAnswer": item["printedAnswer"] or "",
                "mappedAnswer": item["mappedAnswer"] or "",
                "bankAnswer": item["bankAnswer"] or "",
                "scoredAnswer": item["scoredAnswer"] or "",
                "textReviewRequired": "SI" if item["textReviewRequired"] else "NO",
                "sheetSource": item["sheetSource"] or "",
            })
        exams_out.append({
            "examId": exam["id"], "date": exam["date"],
            "category": exam["category"], "model": exam["model"],
            "questionCount": len(rows),
            "P0": sum(x["priority"] == "P0" for x in rows),
            "P1": sum(x["priority"] == "P1" for x in rows),
            "P2": sum(x["priority"] == "P2" for x in rows),
            "P3": sum(x["priority"] == "P3" for x in rows),
            "P4": sum(x["priority"] == "P4" for x in rows),
            "pendingVisualTranscription": sum(x["textReviewRequired"] for x in rows),
            "withoutBankCorroboration": sum("sin_segundo_cotejo_banco" in
                {f["code"] for f in x["flags"]} for x in rows),
            "manualReviewCompletedCount": sum("enunciado_fuente_incoherente" in
                {f["code"] for f in x["flags"]} for x in rows),
        })

    assert len(all_rows) == 2600 and len(exams_out) == 26
    assert sum(x["questionCount"] for x in exams_out) == 2600
    assert sum(counts[f"P{i}"] for i in range(5)) == 2600
    assert sum(x["printedAnswer"] in LETTERS for x in all_rows) == 2200
    assert sum(x["scoredAnswer"] in LETTERS for x in all_rows) == 2417
    assert counts["conflicto_clave_bloqueada"] == 3
    assert counts["desfase_numeracion_plantilla"] == 57
    assert counts["sin_clave_plantilla_ausente"] == 180
    payload = {
        "schemaVersion": 1,
        "round": "R21",
        "interpretation": {
            "P0": "Conflicto probado o anomalia grave: NO implica correccion automatica",
            "P1": "Revisar enunciado/opciones o alineacion con PDF fuente",
            "P2": "Falta un segundo cotejo independiente; no significa respuesta erronea",
            "P3": "Sin plantilla original y sin clave, aplazado",
            "P4": "Sin alertas de este cribado automatico; NO supone revision visual de 100 preguntas",
        },
        "totalExams": 26, "totalQuestions": 2600, "printedAnswers": 2200,
        "scoredBeforeAfter": 2417, "sourceKeyChanges": 0,
        "repeatedSheetAnswerConflictGroups": groups_discordant,
        "flagCounts": dict(sorted(counts.items())),
        "exams": exams_out,
        "questions": {
            exam["id"]: [{
                "number": r["questionNumber"], "sourcePage": r["sourcePage"],
                "priority": r["priority"], "flags": r["flags"],
                "textReviewRequired": r["textReviewRequired"],
                "editoriallyReviewed": r["editoriallyReviewed"],
            } for r in all_rows if r["examId"] == exam["id"]]
            for exam in index["exams"]
        },
    }
    (DATA / "editorial_triage_r21.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    with (DATA / "editorial_triage_r21.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(export)
    print("PASS R21:", "examenes", len(exams_out), "preguntas", len(all_rows),
          "P0", counts["P0"], "P1", counts["P1"], "P2", counts["P2"],
          "P3", counts["P3"], "P4", counts["P4"], "conflictos_misma_pregunta_plantillas",
          groups_discordant)
    print("BANDERAS", dict(sorted((k, v) for k, v in counts.items() if not re.fullmatch("P[0-4]", k))))


if __name__ == "__main__":
    main()
