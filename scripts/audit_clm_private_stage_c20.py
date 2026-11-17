#!/usr/bin/env python3
"""C20 offline-only guard for the PRIVATE RutaCAP C13 staged CLM corpus.

Use only with a local, owner-authorized copy of RutaCAP_C13_importacion_privada.json.
Prints aggregate counts. Never uploads, writes, republishes, or echoes questions.
CI exercises synthetic self-tests only; it must never ingest real CLM content.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
import re
from pathlib import Path

C13_IMPORT_SHA256 = "9dc09e69f7c96c40a1973ed90439eb7428a606ff448245e2a8a07448d5307cc0"
C13_CORPUS_SHA256 = "20b470761fcc1da5b9aa983e9df50d7cfc7bb2f048627b8cad6567673a3ac226"
EXPECTED_IDENTITY_COUNTS = {
    "legacy_exact_candidate": 336,
    "legacy_changed_keep_old_progress_separate": 64,
    "unique_bank_exact_candidate": 454,
    "new_or_variant_pending": 42,
    "multiple_bank_exact_candidates": 7,
}
HOLD_INITIAL_KEYS = {
    "clm:2026-05-30:mercancias:global:a:029": "D",
    "clm:2026-05-30:mercancias:global:a:085": "B",
    "clm:2026-09-26:mercancias:global:a:022": "B",
    "clm:2026-09-26:mercancias:global:a:048": "D",
    "clm:2026-09-26:viajeros:global:a:032": "B",
    "clm:2026-09-26:viajeros:global:a:042": "A",
}
MAY_M32 = "clm:2026-05-30:mercancias:global:a:032"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
ID = re.compile(r"^clm:(2026-(?:05-30|07-25|09-26)):(mercancias|viajeros):(global|promotion):([a-z]):(\d{3})$")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError("C20 STOP: " + message)


def validate(stage: dict, strict_identity: bool = True) -> dict:
    require(stage.get("schemaVersion") == 1, "unknown schema version")
    for k in ("stageOnly", "releaseAllowed", "scoringAllowed"):
        require(stage.get(k) is (k == "stageOnly"), f"global gate invalid: {k}")
    require(stage.get("sourceCorpusSha256") == C13_CORPUS_SHA256,
            "the referenced C13 source corpus digest changed")
    rows = stage.get("occurrences")
    require(isinstance(rows, list) and len(rows) == 903, "expected 903 private occurrences")
    seen: set[str] = set()
    per_model: dict[str, set[int]] = defaultdict(set)
    per_model_type: dict[str, str] = {}
    statuses: Counter[str] = Counter()
    held: dict[str, str] = {}
    source_by_date: dict[str, set[str]] = defaultdict(set)
    key_by_date: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        occ = row.get("occurrenceId")
        match = ID.fullmatch(occ) if isinstance(occ, str) else None
        require(match is not None, "malformed occurrence ID")
        date, category, kind, model, n = match.groups()
        number = int(n)
        require(occ not in seen, "duplicate occurrence ID")
        seen.add(occ)
        require(row.get("number") == number, "position and occurrence ID disagree")
        require(isinstance(row.get("modelId"), str) and row["modelId"], "missing model ID")
        mid = row["modelId"]
        if mid in per_model_type:
            require(per_model_type[mid] == kind, "model changes kind")
        per_model_type[mid] = kind
        require(number not in per_model[mid], "duplicate position inside model")
        per_model[mid].add(number)
        require(number in (set(range(1, 104)) if kind == "global" else set(range(1, 26)) | {101}),
                "unexpected main/reserve/promotion number")
        require(row.get("initialKey") in "ABCD", "missing initial A-D key")
        require(row.get("progressMigrationAllowed") is False, "unapproved progress migration")
        require(row.get("scoringAllowed") is False, "unapproved scoring")
        require(row.get("releaseAllowed") is False, "unapproved release")
        require(isinstance(row.get("sourcePage"), int) and row["sourcePage"] > 0, "bad source page")
        require(isinstance(row.get("templatePage"), int) and row["templatePage"] > 0, "bad template page")
        for k in ("sourceHash", "templateHash"):
            require(isinstance(row.get(k), str) and bool(HEX64.fullmatch(row[k])),
                    "invalid source/template sha256")
        source_by_date[date].add(row["sourceHash"])
        key_by_date[date].add(row["templateHash"])
        require(isinstance(row.get("candidateBankIds"), list), "missing candidate list")
        require(all(isinstance(i, str) and i for i in row["candidateBankIds"]),
                "invalid bank candidate identifier")
        status = row.get("identityStatus")
        require(status in EXPECTED_IDENTITY_COUNTS, "unexpected identity status")
        statuses[status] += 1
        note = row.get("editorialHoldC13")
        if note is not None:
            require(occ in HOLD_INITIAL_KEYS, "unexpected editorial hold")
            require(note.get("status") == "hold", "hold released without review")
            require(note.get("officialInitialAnswer") == row["initialKey"], "hold key mismatch")
            held[occ] = row["initialKey"]
    require(len(per_model) == 14, "expected fourteen exam/promotion models")
    require(Counter(per_model_type.values()) == {"global": 7, "promotion": 7},
            "incorrect model kind distribution")
    for model, nums in per_model.items():
        expected = set(range(1, 104)) if per_model_type[model] == "global" else set(range(1, 26)) | {101}
        require(nums == expected, f"model numbering/gaps: {model}")
    require(held == HOLD_INITIAL_KEYS, "six held items changed or disappeared")
    require(len(source_by_date) == len(key_by_date) == 3, "expected three 2026 dates")
    require(all(len(a) == 1 for a in source_by_date.values()), "source hash varies within date")
    require(all(len(a) == 1 for a in key_by_date.values()), "template hash varies within date")
    require(len({next(iter(x)) for x in source_by_date.values()}) == 3, "same questionnaire hash across dates")
    require(len({next(iter(x)) for x in key_by_date.values()}) == 3, "same template hash across dates")
    by_id = {row["occurrenceId"]: row for row in rows}
    m32 = by_id.get(MAY_M32)
    require(bool(m32) and m32["initialKey"] == "C" and
            m32["identityStatus"] == "legacy_changed_keep_old_progress_separate" and
            bool(m32.get("legacyId")), "May M32 historical identity is not protected")
    actual = dict(statuses)
    if strict_identity:
        require(actual == EXPECTED_IDENTITY_COUNTS, "C13 identity counts differ from frozen baseline")
        require(stage.get("identityCounts") == EXPECTED_IDENTITY_COUNTS, "C13 manifest identity summary differs")
        require(stage.get("reviewC13", {}).get("holds") == 6, "C13 review hold count invalid")
    return {
        "status": "PASS_PRIVATE_STAGE_INTEGRITY_ONLY",
        "occurrences": len(rows),
        "models": len(per_model),
        "globalModels": 7,
        "promotionModels": 7,
        "holds": len(held),
        "m32OldProgressProtected": True,
        "identityCounts": actual,
        "rightsVerified": False,
        "finalKeysVerified": False,
        "individualAnswersTechnicallyApproved": False,
        "releaseAllowed": False,
        "scoringAllowed": False,
    }


def synthetic_stage() -> dict:
    # Only generated, fictitious records; no CLM question text or solutions in CI.
    specs = [
        ("2026-05-30", "mercancias", "may-m-a"),
        ("2026-05-30", "viajeros", "may-v-a"),
        ("2026-07-25", "mercancias", "jul-m-a"),
        ("2026-07-25", "mercancias", "jul-m-b"),
        ("2026-07-25", "viajeros", "jul-v-a"),
        ("2026-09-26", "mercancias", "sep-m-a"),
        ("2026-09-26", "viajeros", "sep-v-a"),
    ]
    rows = []
    for date, category, label in specs:
        dateslot = {"2026-05-30": "1", "2026-07-25": "2", "2026-09-26": "3"}[date]
        for kind in ("global", "promotion"):
            for number in (range(1, 104) if kind == "global" else [*range(1, 26), 101]):
                occ = f"clm:{date}:{category}:{kind}:a:{number:03d}"
                key = HOLD_INITIAL_KEYS.get(occ, "C")
                row = {
                    "occurrenceId": occ,
                    "modelId": label + ("-global" if kind == "global" else "-ampl"),
                    "number": number,
                    "initialKey": key,
                    "sourcePage": 1,
                    "templatePage": 1,
                    "sourceHash": dateslot * 64,
                    "templateHash": str(int(dateslot) + 3) * 64,
                    "candidateBankIds": [],
                    "identityStatus": "legacy_changed_keep_old_progress_separate" if occ == MAY_M32 else "new_or_variant_pending",
                    "legacyId": "OLD-STABLE-ID" if occ == MAY_M32 else None,
                    "progressMigrationAllowed": False,
                    "scoringAllowed": False,
                    "releaseAllowed": False,
                }
                if occ in HOLD_INITIAL_KEYS:
                    row["editorialHoldC13"] = {
                        "status": "hold", "officialInitialAnswer": key,
                    }
                rows.append(row)
    # A and B July are unique models in real C13; synthetic IDs must be unique
    # even if the same date/category/model letter is otherwise reused.
    for row in rows:
        if ":2026-07-25:mercancias:" in row["occurrenceId"] and row["modelId"].startswith("jul-m-b"):
            row["occurrenceId"] = row["occurrenceId"].replace(":a:", ":b:")
    return {
        "schemaVersion": 1,
        "stageOnly": True,
        "scoringAllowed": False,
        "releaseAllowed": False,
        "sourceCorpusSha256": C13_CORPUS_SHA256,
        "occurrences": rows,
    }


def selftest() -> None:
    data = synthetic_stage()
    validate(data, strict_identity=False)
    # Every dangerous gate fails closed.
    for key in ("releaseAllowed", "scoringAllowed"):
        data[key] = True
        try:
            validate(data, strict_identity=False)
        except ValueError:
            pass
        else:
            raise AssertionError("Fail-open global " + key)
        data[key] = False
    data["occurrences"][0]["scoringAllowed"] = True
    try:
        validate(data, strict_identity=False)
    except ValueError:
        pass
    else:
        raise AssertionError("Fail-open row scoring")
    data["occurrences"][0]["scoringAllowed"] = False
    data["occurrences"][0]["occurrenceId"] = data["occurrences"][1]["occurrenceId"]
    try:
        validate(data, strict_identity=False)
    except ValueError:
        pass
    else:
        raise AssertionError("Fail-open duplicate")
    print("C20 SELFTEST PASS: synthetic 903 rows, 14 models, six holds, M32, no real content")


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--input", type=Path, help="owner-authorized local C13 JSON; NEVER use in public CI")
    mode.add_argument("--self-test", action="store_true", help="synthetic records only; safe in public CI")
    args = parser.parse_args()
    if args.self_test:
        selftest()
        return
    payload = args.input.read_bytes()
    require(sha256(payload).hexdigest() == C13_IMPORT_SHA256,
            "C13 private file SHA-256 differs; inspect version before retrying")
    summary = validate(json.loads(payload.decode("utf-8")))
    print("C20 LOCAL PRIVATE STAGE " + json.dumps(summary, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
