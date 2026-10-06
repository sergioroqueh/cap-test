from pathlib import Path
import base64
import json
import lzma
import re
import shutil
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data-src" / "questions.xz.b64"
PUBLIC = ROOT / "public" / "data"
QUESTIONS = PUBLIC / "questions"

QUESTION_PATTERN = re.compile(
    r"COD:\s*(.*?)\n\s*\n(.*?)\n\s*\nA\s+(.*?)\n\s*\nB\s+(.*?)\n\s*\nC\s+(.*?)\n\s*\nD\s+(.*?)\n\s*\nRESPUESTA:\s*([ABCD])\s*\n\s*\nNORMA:\s*(.*?)\n\s*\nREFERENCIA DOCTRINAL:\s*(.*?)(?=\n\s*\n\s*COD:|\Z)",
    re.S,
)

SOURCE_MARKER = re.compile(r"(?m)^@@@([^|\n]+)\|([^\n]+)\n")


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def load_sources() -> list[tuple[str, str, str]]:
    if not SRC.exists():
        raise RuntimeError(f"No existe el banco fuente: {SRC}")

    encoded = SRC.read_text(encoding="ascii").strip()
    raw = lzma.decompress(base64.b64decode(encoded)).decode("utf-8")

    matches = list(SOURCE_MARKER.finditer(raw))
    if not matches:
        raise RuntimeError("No se encontraron cuestionarios en el banco fuente.")

    sources: list[tuple[str, str, str]] = []
    for pos, marker in enumerate(matches):
        start = marker.end()
        end = matches[pos + 1].start() if pos + 1 < len(matches) else len(raw)
        section = marker.group(1).strip()
        questionnaire = marker.group(2).strip()
        body = raw[start:end].strip()
        sources.append((section, questionnaire, body))
    return sources


def parse_questionnaire(section: str, questionnaire: str, text: str) -> list[dict]:
    matches = list(QUESTION_PATTERN.finditer(text))
    cod_count = len(re.findall(r"(?m)^COD:", text))
    if len(matches) != cod_count:
        raise RuntimeError(
            f"No se pudo interpretar por completo {questionnaire}: {len(matches)}/{cod_count}."
        )

    rows: list[dict] = []
    for number, match in enumerate(matches, 1):
        code, question, a, b, c, d, answer, norm, reference = [
            part.strip() for part in match.groups()
        ]
        qid = (
            f"s{section.replace(';', '-')}-{slugify(questionnaire)}-"
            f"{number:04d}-{slugify(code) or number}"
        )
        rows.append(
            {
                "id": qid,
                "code": code,
                "number": number,
                "section": section,
                "questionnaireId": questionnaire,
                "question": question,
                "options": {"A": a, "B": b, "C": c, "D": d},
                "correctAnswer": answer,
                "norm": norm,
                "reference": reference,
            }
        )
    return rows


def section_sort_key(section: str):
    return tuple(int(part) for part in section.replace(";", ".").split("."))


def main() -> None:
    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)
    QUESTIONS.mkdir(parents=True, exist_ok=True)

    sources = load_sources()
    sources.sort(key=lambda item: (section_sort_key(item[0]), item[1].lower()))

    index_items = []
    total = 0

    for section, questionnaire, text in sources:
        rows = parse_questionnaire(section, questionnaire, text)
        slug = f"s{section.replace(';', '-')}-{slugify(questionnaire)}"
        output = QUESTIONS / f"{slug}.json"
        output.write_text(
            json.dumps(rows, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        index_items.append(
            {
                "id": slug,
                "section": section,
                "questionnaireId": questionnaire,
                "title": f"Cuestionario {questionnaire}",
                "count": len(rows),
                "path": f"data/questions/{slug}.json",
            }
        )
        total += len(rows)

    index = {
        "version": "2026.10.06",
        "totalQuestions": total,
        "totalQuestionnaires": len(index_items),
        "questionnaires": index_items,
    }
    (PUBLIC / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if total != 8655 or len(index_items) != 33:
        raise RuntimeError(
            f"Validación fallida: {total} preguntas y {len(index_items)} cuestionarios."
        )

    print(f"Banco generado correctamente: {total} preguntas / {len(index_items)} cuestionarios.")


if __name__ == "__main__":
    main()
