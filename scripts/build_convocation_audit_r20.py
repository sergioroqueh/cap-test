"""R20: auditoría por convocatoria. Solo genera evidencias; nunca modifica claves."""
from __future__ import annotations

from collections import defaultdict
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "exams"
LETTERS = {"A", "B", "C", "D"}
COLUMNS = (
    "prioridad", "fecha", "modalidad", "modelo", "examen", "paginas_pdf",
    "plantilla", "letras_originales", "respuestas_puntuables", "sin_puntuacion",
    "coincidencias_banco_plantilla_vinculada", "respuestas_comparables_banco",
    "sin_coincidencia_banco", "texto_provisional", "desfases_numeracion",
    "revisadas_editorialmente", "conflictos_bloqueados", "proxima_revision",
)


def main() -> None:
    index = json.loads((OUT / "index.json").read_text(encoding="utf-8"))
    audit = json.loads((OUT / "sheet_audit_index.json").read_text(encoding="utf-8"))
    by_exam = defaultdict(list)
    with (OUT / "sheet_audit_2200.csv").open(encoding="utf-8-sig", newline="") as stream:
        for item in csv.DictReader(stream):
            by_exam[item["examId"]].append(item)

    report = []
    anomalies = []
    total_scored = total_disputed = total_source_letters = total_offsets = total_editorial = 0
    for exam in index["exams"]:
        eid = exam["id"]
        rows = json.loads((OUT / "questions" / f"{eid}.json").read_text(encoding="utf-8"))
        assert len(rows) == 100 and {q["number"] for q in rows} == set(range(1, 101)), eid
        has_sheet = exam.get("hasOriginalAnswerSheet") is True
        proof_rows = by_exam[eid]
        assert len(proof_rows) == (100 if has_sheet else 0), eid
        scored = sum(q.get("correctAnswer") in LETTERS for q in rows)
        printed = sum(q.get("originalSheetAnswer") in LETTERS for q in rows)
        disputed = sum(bool(q.get("answerDispute")) for q in rows)
        provisional = sum(bool(q.get("transcriptionReview")) for q in rows)
        offset = sum(
            q.get("mappedSheetQuestionNumber") != q["number"]
            for q in rows if has_sheet
        )
        editorial = sum(bool(q.get("answerEditoriallyVerified")) for q in rows)
        bank = sum(q.get("bankAnswer") in LETTERS for q in rows)
        concordant = sum(
            q.get("bankAnswer") in LETTERS
            and q.get("mappedSheetAnswer") in LETTERS
            and q["bankAnswer"] == q["mappedSheetAnswer"]
            for q in rows
        )

        assert scored == exam["readyCount"], f"Claves puntuables desfasadas: {eid}"
        assert printed == (100 if has_sheet else 0), f"Letra original perdida: {eid}"
        assert disputed <= 1 and all(
            q.get("correctAnswer") is None for q in rows if q.get("answerDispute")
        ), f"Conflicto puntuado: {eid}"
        assert concordant <= bank and bank <= 100, eid
        if has_sheet:
            assert all(
                q["originalSheetQuestionNumber"] == q["number"]
                and q["originalSheetSourceFile"] == exam["templateFile"]
                and q["originalSheetSha256"] is not None
                for q in rows
            ), f"Procedencia PDF modificada: {eid}"
            assert all(
                int(a["questionNumber"]) == q["number"]
                and a["originalSheetAnswer"] == q["originalSheetAnswer"]
                for a, q in zip(proof_rows, rows)
            ), f"Auditoría y preguntas desalineadas: {eid}"

        if disputed:
            priority, next_step = "P0", "Resolver conflicto con fuentes originales; no puntuar"
        elif offset:
            priority, next_step = "P0", "Auditar desfase de plantilla 2023 A, sin reescribir letras"
        elif has_sheet and provisional:
            priority, next_step = "P1", "Revisar visualmente texto y cuatro opciones del PDF"
        elif has_sheet and bank < 65:
            priority, next_step = "P1", "Cotejar una a una las respuestas sin equivalencia en el banco"
        elif has_sheet:
            priority, next_step = "P2", "Comprobar 100 enunciados/opciones y clave por muestreo editorial"
        else:
            priority, next_step = "P3", "Sin plantilla: aplazar claves sin soporte; no inferir respuestas"

        record = {
            "prioridad": priority,
            "fecha": exam["date"],
            "modalidad": exam["category"],
            "modelo": exam["model"],
            "examen": eid,
            "paginas_pdf": f'{exam["sourcePageStart"]}-{exam["sourcePageEnd"]}',
            "plantilla": exam.get("templateFile") or "",
            "letras_originales": printed,
            "respuestas_puntuables": scored,
            "sin_puntuacion": 100 - scored,
            "coincidencias_banco_plantilla_vinculada": concordant,
            "respuestas_comparables_banco": bank,
            "sin_coincidencia_banco": 100 - bank,
            "texto_provisional": provisional,
            "desfases_numeracion": offset,
            "revisadas_editorialmente": editorial,
            "conflictos_bloqueados": disputed,
            "proxima_revision": next_step,
        }
        report.append(record)
        total_scored += scored
        total_disputed += disputed
        total_source_letters += printed
        total_offsets += offset
        total_editorial += editorial

        if eid == "2026-03-28-mercancias-global":
            q = rows[42]
            assert q["number"] == 43
            assert "problemas de circulación sanguínea" in q["question"].lower()
            assert "Placas de hielo" in q["options"]["A"]
            assert "Levantamiento de pesos" in q["options"]["B"]
            assert "Invasión de zonas" in q["options"]["C"]
            assert "maquinaria" in q["options"]["D"]
            assert q["originalSheetAnswer"] == "C"
            assert q["bankAnswer"] == "B"
            assert q["correctAnswer"] is None and q.get("answerDispute")
            anomalies.append({
                "examen": eid, "pregunta": 43, "pagina_pdf": q["sourcePage"],
                "observacion": "La propia pagina impresa pregunta por circulacion sanguinea, pero las cuatro alternativas tratan riesgos laborales no concordantes con ese enunciado.",
                "plantilla_original": "C", "banco_original": "B",
                "decision": "mantener_visible_sin_puntuar",
                "tipo_evidencia": "lectura_visual_pagina_355_PDF_original_2026_11_05",
            })

    assert len(report) == 26
    assert sum(bool(r["plantilla"]) for r in report) == 22
    assert total_source_letters == 2200
    assert total_scored == 2417 and total_disputed == 3
    assert total_offsets == 57 and total_editorial == 13
    assert sum(r["sin_puntuacion"] for r in report) == 183
    assert sum(r["sin_puntuacion"] for r in report if not r["plantilla"]) == 180
    assert len(anomalies) == 1 and len(by_exam) == 26
    # El orden de revisión no cambia el orden del JSON de exámenes ni de preguntas.
    report.sort(key=lambda e: (e["prioridad"], e["fecha"], e["modelo"]))
    payload = {
        "schemaVersion": 1,
        "round": "R20",
        "principio": "Priorización editorial; ninguna coincidencia automática valida una respuesta",
        "base": {
            "examenes": 26, "preguntas": 2600, "plantillas": 22,
            "letras_originales": 2200, "puntuables": 2417,
            "sin_puntuacion": 183, "conflictos": 3,
            "sin_plantilla_aplazadas": 180, "desfases": 57,
            "alineaciones_editoriales": 13,
        },
        "hallazgos_fuente": anomalies,
        "convocatorias": report,
    }
    (OUT / "convocatorias_auditoria_r20.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with (OUT / "convocatorias_auditoria_r20.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(report)
    print("PASS R20: 26 convocatorias, 22 plantillas, 2200 letras, 2417 puntuables; q43 marzo 2026 sin puntuar")


if __name__ == "__main__":
    main()
