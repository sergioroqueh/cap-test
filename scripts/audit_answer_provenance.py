#!/usr/bin/env python3
"""C19 read-only inventory: provenance of scored historical and general CAP answers.

Never copies question text, answer letters, names or links into the output.
This is evidence coverage, NOT a normative correctness or copyright clearance.
"""
from collections import Counter
from pathlib import Path
import json
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
OUT = ROOT / "artifacts" / "cap-answer-provenance-coverage.json"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def safe_https(value):
    if not isinstance(value, str) or not value:
        return False
    url = urlsplit(value)
    return url.scheme == "https" and bool(url.netloc)


def report():
    bank = read_json(DATA / "index.json")
    exams = read_json(DATA / "exams" / "index.json")
    bank_counts = Counter()
    for questionnaire in bank["questionnaires"]:
        rows = read_json(ROOT / "public" / questionnaire["path"])
        if len(rows) != questionnaire["count"]:
            raise AssertionError("Bank questionnaire count mismatch")
        for row in rows:
            bank_counts["total"] += 1
            norm = bool((row.get("norm") or "").strip())
            reference = bool((row.get("reference") or "").strip())
            bank_counts["norm_field"] += norm
            bank_counts["reference_field"] += reference
            bank_counts["any_legacy_reference"] += bool(norm or reference)
            bank_counts["no_legacy_reference"] += not (norm or reference)
    if bank_counts["total"] != bank["totalQuestions"]:
        raise AssertionError("General bank count mismatch")

    historic = Counter()
    for exam in exams["exams"]:
        rows = read_json(ROOT / "public" / exam["path"])
        if len(rows) != exam["count"]:
            raise AssertionError("Historic exam row count mismatch")
        for row in rows:
            historic["total_appearances"] += 1
            historic["scored_in_raw_exam"] += row.get("correctAnswer") in ("A", "B", "C", "D")
            has_key = row.get("originalSheetAnswer") in ("A", "B", "C", "D")
            has_doc = has_key and bool(row.get("originalSheetSourceFile") and row.get("originalSheetSha256"))
            if has_key and not has_doc:
                raise AssertionError("Recorded original answer missing template name or hash")
            historic["original_key_with_document"] += bool(has_doc)
            historic["without_original_key"] += not has_key
            url = row.get("answerEvidenceUrl") or ""
            if url and not safe_https(url):
                historic["unlinked_independent_url"] += 1
            historic["independent_https_evidence"] += safe_https(url)
            tech = row.get("technicalDecision") or {}
            sources = tech.get("sources") or []
            historic["technical_review_with_https"] += any(safe_https(s) for s in sources)
            confirmed = row.get("answerSourceReview") or {}
            confirmed_sources = confirmed.get("sources") or []
            if confirmed:
                if confirmed.get("status") != "confirmed" or confirmed.get("round") not in ("R29", "R30", "R31"):
                    raise AssertionError("Unexpected confirmed source metadata")
                if not confirmed.get("reason") or not confirmed_sources or not all(safe_https(s) for s in confirmed_sources):
                    raise AssertionError("Confirmed review lacks usable evidence")
                if row.get("technicalDecision"):
                    raise AssertionError("Confirmed source metadata must not overwrite an editorial decision")
                historic["confirmed_editorial_sources"] += 1
            historic["legacy_norm_or_reference"] += bool((row.get("norm") or "").strip() or (row.get("reference") or "").strip())
            if not (has_doc or safe_https(url) or sources or confirmed_sources or row.get("norm") or row.get("reference")):
                historic["no_individual_evidence_metadata"] += 1
    if historic["total_appearances"] != exams["totalImportedQuestions"]:
        raise AssertionError("Historical appearance count mismatch")
    if historic["confirmed_editorial_sources"] != 176:
        raise AssertionError("R29–R31 confirmed source references missing: expected 36+23+117")
    result = {
        "scope": "C19 provenance coverage only; not legal or technical approval",
        "general_bank": dict(bank_counts),
        "historical_appearances": dict(historic),
        "notes": {
            "template": "Printed official/source-document key, not automatically a normative explanation",
            "technical": "Editorial review sources never override tribunal keys automatically",
            "legacy": "Unverified strings in an inherited bank are not document-level certification",
            "rights": "Commercial republication status not determined here",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("C19_PROVENANCE_SUMMARY " + json.dumps(result, ensure_ascii=False))
    return result


if __name__ == "__main__":
    report()
