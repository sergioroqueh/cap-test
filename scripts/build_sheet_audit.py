"""Build one reviewable, non-destructive audit record for every original CAP answer.

Reads the 26 × 100 imported exam questions; never assigns scoring keys.
The raw source letters remain immutable evidence, even when disputed.
"""
from collections import Counter
from pathlib import Path
import csv
import json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data" / "exams"
SRC = ROOT / "data-src" / "cap-exams"
FIELDS = (
    "examId","date","category","model","questionNumber","sourcePage",
    "question","optionA","optionB","optionC","optionD",
    "originalSheetNumber","originalSheetAnswer","originalSheetFile","originalSheetSha256",
    "mappedSheetNumber","mappedSheetAnswer","bankAnswer","appliedCorrectAnswer",
    "scoringEligible","answerStatus","transcriptionReview","answerEditoriallyVerified",
    "disputed","disputeReason","needsNumberAlignment",
)

def main():
    index = json.loads((DATA/"index.json").read_text(encoding="utf-8"))
    manifests = {x["id"]:x for x in json.loads((SRC/"manifest.json").read_text(encoding="utf-8"))["exams"]}
    summary = []
    entries = []
    for meta in index["exams"]:
        exam_id = meta["id"]
        rows = json.loads((DATA/"questions"/(exam_id+".json")).read_text(encoding="utf-8"))
        if len(rows)!=100 or {r["number"] for r in rows}!=set(range(1,101)):
            raise AssertionError(f"Examen incompleto: {exam_id}")
        has_sheet = meta.get("hasOriginalAnswerSheet") is True
        if bool(manifests[exam_id]["templateFile"]) != has_sheet:
            raise AssertionError(f"Plantilla/manifest incongruente: {exam_id}")
        counts = Counter()
        for q in rows:
            if bool(q["originalSheetAnswer"]) != has_sheet:
                raise AssertionError(f"Falta letra oficial: {exam_id} q{q['number']}")
            if has_sheet:
                n=q["number"]
                sheet=q["originalSheetAnswer"]
                if (sheet not in "ABCD" or q["originalSheetQuestionNumber"]!=n
                    or q["originalSheetSourceFile"]!=meta["templateFile"]):
                    raise AssertionError(f"Fuente original inconsistente: {exam_id} q{n}")
                if q["originalSheetSha256"] is None or len(q["originalSheetSha256"])!=64:
                    raise AssertionError(f"Hash de plantilla ausente: {exam_id} q{n}")
                if q["answerDispute"] and (q["correctAnswer"] is not None or q["answerDispute"]["pdfAnswer"]!=sheet):
                    raise AssertionError(f"Contradicción mal clasificada: {exam_id} q{n}")
                offset = q["mappedSheetQuestionNumber"]!=n
                counts["offsets"]+=int(offset)
                counts["disputes"]+=int(bool(q["answerDispute"]))
                counts["editorial"]+=int(q.get("answerEditoriallyVerified",False))
                counts["scored"]+=int(q["correctAnswer"] in "ABCD" if q["correctAnswer"] else False)
                counts["transcriptionReview"]+=int(bool(q.get("transcriptionReview")))
                counts["sheetAnswers"]+=1
                out={
                    "examId":exam_id,"date":meta["date"],"category":meta["category"],"model":meta["model"],
                    "questionNumber":n,"sourcePage":q["sourcePage"],"question":q["question"],
                    "optionA":q["options"]["A"],"optionB":q["options"]["B"],
                    "optionC":q["options"]["C"],"optionD":q["options"]["D"],
                    "originalSheetNumber":n,"originalSheetAnswer":sheet,
                    "originalSheetFile":q["originalSheetSourceFile"],"originalSheetSha256":q["originalSheetSha256"],
                    "mappedSheetNumber":q["mappedSheetQuestionNumber"] if q["mappedSheetQuestionNumber"] else "",
                    "mappedSheetAnswer":q["mappedSheetAnswer"] or "",
                    "bankAnswer":q["bankAnswer"] or "",
                    "appliedCorrectAnswer":q["correctAnswer"] or "",
                    "scoringEligible":"SI" if q["correctAnswer"] else "NO",
                    "answerStatus":q["answerStatus"],
                    "transcriptionReview":"SI" if q.get("transcriptionReview") else "NO",
                    "answerEditoriallyVerified":"SI" if q.get("answerEditoriallyVerified") else "NO",
                    "disputed":"SI" if q["answerDispute"] else "NO",
                    "disputeReason":q["answerDispute"]["reason"] if q["answerDispute"] else "",
                    "needsNumberAlignment":"SI" if offset else "NO",
                }
                entries.append(out)
            else:
                if q["originalSheetSourceFile"] is not None or q["originalSheetSha256"] is not None:
                    raise AssertionError(f"Fuente inventada sin plantilla: {exam_id}")
                counts["deferred"]+=int(q["correctAnswer"] is None)
        summary.append({
            "examId":exam_id,"date":meta["date"],"category":meta["category"],
            "model":meta["model"],"sourceFile":meta.get("templateFile"),
            "withOriginalSheet":has_sheet,"printedAnswers":counts["sheetAnswers"],
            "scoredAnswers":meta["readyCount"],
            "disputed":counts["disputes"],"numberAlignments":counts["offsets"],
            "editoriallyVerified":counts["editorial"],
            "questionsWithTranscriptionReview":counts["transcriptionReview"],
            "deferredWithoutSheet":counts["deferred"],
            "nextReview":"revisar_contradicciones" if counts["disputes"]
              else "revisar_numeracion" if counts["offsets"]
              else "revisar_texto_preguntas" if has_sheet
              else "aplazado_sin_plantilla",
        })
    if len(summary)!=26 or len(entries)!=2200:
        raise AssertionError("No están las 22 plantillas originales completas")
    if sum(s["disputed"] for s in summary)!=3:
        raise AssertionError("Han cambiado los 3 conflictos documentados")
    if sum(s["numberAlignments"] for s in summary)!=57:
        raise AssertionError("El desfase parcial de julio 2023 A no está aislado")
    if sum(s["editoriallyVerified"] for s in summary)!=13:
        raise AssertionError("No están las 13 decisiones editoriales de julio 2023 A")
    if sum(s["printedAnswers"] for s in summary)!=2200:
        raise AssertionError("Se han perdido letras impresas de plantillas")
    if sum(s["scoredAnswers"] for s in summary)!=2417:
        raise AssertionError("El banco autocorregible se ha alterado")
    review_order={"revisar_contradicciones":0,"revisar_numeracion":1,"revisar_texto_preguntas":2,"aplazado_sin_plantilla":3}
    summary.sort(key=lambda e:(review_order[e["nextReview"]], e["date"], e["model"]))
    payload={
        "schemaVersion":1,
        "source":"PDF originales de Respuestas(1).zip",
        "note":"La letra impresa NO implica respuesta técnicamente correcta; correcciones y bloqueos se guardan separadamente.",
        "modelCount":26,
        "withOriginalSheetCount":22,
        "originalSheetAnswerCount":len(entries),
        "unscoredConflictsWithSheet":3,
        "withoutOriginalSheetCount":4,
        "deferredWithoutSheet":180,
        "scoredTotal":2417,
        "exams":summary
    }
    (DATA/"sheet_audit_index.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    with (DATA/"sheet_audit_2200.csv").open("w",encoding="utf-8-sig",newline="") as file:
        writer=csv.DictWriter(file,fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(entries)
    print("PASS CAP R19: 22 plantillas / 2200 respuestas impresas, 3 conflictos, 57 ajustes, 13 correcciones editoriales")
if __name__=="__main__":
    main()
