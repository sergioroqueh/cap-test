"""R25-3: three closed editorial disputes, official sheets immutable.

Add an editorialDecision field to derived question rows after R24 was generated.
No attempt is made to change score, printed answers, or existing disputes.
"""
from pathlib import Path
import csv, json, unicodedata, re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/data/exams"
SRC = ROOT / "data-src/cap-exams/final_three_conflicts_decisions_2026_11_05.json"

def norm(v):
    t=unicodedata.normalize("NFKD",str(v)).encode("ascii","ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+"," ",t).split())

def main():
    proof=json.loads(SRC.read_text(encoding="utf-8"))
    assert proof["schemaVersion"]==1 and proof["caseCount"]==3
    assert proof["scoringChangeCount"]==0 and proof["officialCorrectionConfirmed"] is False
    assert proof["originalPrintedLettersPreserved"] is True
    expected={
        ("2025-07-26-mercancias-a",43):("A","B","B"),
        ("2026-02-07-mercancias-global",61):("A","C","C"),
        ("2026-03-28-mercancias-global",43):("C","B",None),
    }
    index=json.loads((OUT/"index.json").read_text(encoding="utf-8"))
    meta={e["id"]:e for e in index["exams"]}
    triage=json.loads((OUT/"editorial_triage_r21.json").read_text(encoding="utf-8"))
    assert len(proof["cases"])==3
    seen=set()
    export=[]
    for case in proof["cases"]:
        eid,n=case["examId"],case["number"]
        key=(eid,n)
        assert key in expected and key not in seen
        seen.add(key)
        sheet,bank,orientation=expected[key]
        assert (case["originalSheetAnswer"],case["bankAnswer"],case["editorialAnswer"]) == (sheet,bank,orientation)
        assert case["reviewCompleted"] is True and case["scoringPolicy"]=="NO_PUNTUA"
        assert len(case["sources"])>=2
        path=OUT/"questions"/f"{eid}.json"
        rows=json.loads(path.read_text(encoding="utf-8"))
        assert len(rows)==100 and rows[n-1]["number"]==n
        q=rows[n-1]
        assert norm(case["expectedQuestionFragment"]) in norm(q["question"]),key
        assert meta[eid]["sourcePageStart"]<=q["sourcePage"]<=meta[eid]["sourcePageEnd"]
        assert (q["originalSheetAnswer"],q["bankAnswer"],q["correctAnswer"])==(sheet,bank,None),key
        assert q["scoringEligible"] is False and q["answerDispute"],key
        assert (q["answerDispute"]["pdfAnswer"],q["answerDispute"]["bankAnswer"])==(sheet,bank)
        assert not q.get("editorialDecision")
        frozen={k:q.get(k) for k in (
            "question","options","correctAnswer","originalSheetAnswer",
            "originalSheetQuestionNumber","originalSheetSourceFile",
            "originalSheetSha256","bankAnswer","mappedSheetAnswer",
            "answerStatus","answerDispute","scoringEligible",
            "frequencyGroup","canonicalQuestionId","sourcePage")}
        q["editorialDecision"]={
            "round":"R25-3","status":case["status"],
            "reviewCompleted":True,"officialCorrectionConfirmed":False,
            "editorialAnswer":orientation,"originalSheetAnswer":sheet,
            "bankAnswer":bank,"scoringPolicy":"NO_PUNTUA",
            "decision":case["decision"],"reason":case["reason"],
            "scope":case["scope"],"sources":case["sources"],
        }
        assert frozen=={k:q.get(k) for k in frozen}
        assert next(r for r in triage["questions"][eid] if r["number"]==n)["priority"]=="P0"
        path.write_text(json.dumps(rows,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        export.append({
            "examId":eid,"number":n,"sourcePage":q["sourcePage"],
            "question":q["question"],
            "optionA":q["options"]["A"],"optionB":q["options"]["B"],
            "optionC":q["options"]["C"],"optionD":q["options"]["D"],
            "originalSheetLetter":sheet,"bankLetter":bank,
            "editorialTechnicalLetter":orientation or "",
            "editorialStatus":case["status"],"decision":case["decision"],
            "scoringEligible":"NO","officialErrataVerified":"NO",
            "sourceReferences":" | ".join(case["sources"]),
        })
    assert seen==set(expected)
    assert sum(bool(r["editorialTechnicalLetter"]) for r in export)==2
    assert index["totalExamModels"]==26 and index["totalImportedQuestions"]==2600
    assert sum(m["readyCount"] for m in index["exams"])==2417
    assert sum(m["originalSheetAnswersCount"] for m in index["exams"])==2200
    report={
        "schemaVersion":1,"round":"R25-3",
        "scope":"Tres conflictos originales. La duda tecnica noviembre 2022 q6 es separada",
        "caseCount":3,"reviewCompletedCount":3,
        "editorialTechnicalAnswers":2,"editoriallyInvalidatedCount":1,
        "scoringChanges":0,"officialErrataConfirmed":False,
        "printedOriginalLettersPreserved":2200,
        "scoringEligibleAllExams":2417,"originalDisputesStillUnscored":3,
        "cases":[{**case,"sourcePage":next(x["sourcePage"] for x in export
                                       if x["examId"]==case["examId"] and x["number"]==case["number"])}
                 for case in proof["cases"]],
        "remainingSeparateTechnicalQuestion":proof["additionalTechnicalReviewOutsideThree"],
    }
    (OUT/"editorial_decisions_r25_three.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    with (OUT/"editorial_decisions_r25_three.csv").open(
             "w",encoding="utf-8-sig",newline="") as fh:
        writer=csv.DictWriter(fh,fieldnames=list(export[0]))
        writer.writeheader()
        writer.writerows(export)
    print("PASS R25-3: 3 resoluciones editoriales cerradas, B/C orientativas, "
          "1 invalidada, 3 sin puntuacion, 0 respuestas historicas modificadas")

if __name__=="__main__":
    main()
