from pathlib import Path
import base64
import io
import json
import re
import shutil
import tempfile
import unicodedata
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data-src'
PUBLIC = ROOT / 'public' / 'data'
QUESTIONS = PUBLIC / 'questions'

pattern = re.compile(
    r'COD:\s*(.*?)\n\s*\n(.*?)\n\s*\nA\s+(.*?)\n\s*\nB\s+(.*?)\n\s*\nC\s+(.*?)\n\s*\nD\s+(.*?)\n\s*\nRESPUESTA:\s*([ABCD])\s*\n\s*\nNORMA:\s*(.*?)\n\s*\nREFERENCIA DOCTRINAL:\s*(.*?)(?=\n\s*\n\s*COD:|\Z)',
    re.S,
)


def slugify(value: str) -> str:
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')


def get_section(parent_name: str) -> str:
    match = re.search(r'(\d+(?:;\d+)?)\s*$', parent_name) or re.search(r'(\d+(?:;\d+)?)', parent_name)
    return match.group(1) if match else parent_name


def read_source_zip() -> bytes:
    chunks = sorted(SRC.glob('questions.zip.b64.*'))
    if not chunks:
        raise RuntimeError('No se encontraron los fragmentos del banco de preguntas.')
    encoded = ''.join(path.read_text(encoding='ascii').strip() for path in chunks)
    return base64.b64decode(encoded)


def main() -> None:
    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)
    QUESTIONS.mkdir(parents=True, exist_ok=True)

    raw_zip = read_source_zip()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(io.BytesIO(raw_zip)) as archive:
            archive.extractall(tmp_path)

        txt_files = list(tmp_path.rglob('*.txt'))
        txt_files.sort(key=lambda p: (get_section(p.parent.name).replace(';', '.'), p.stem.lower()))
        index_items = []
        total = 0

        for path in txt_files:
            section = get_section(path.parent.name)
            questionnaire = path.stem
            text = path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')
            matches = list(pattern.finditer(text))
            cod_count = len(re.findall(r'(?m)^COD:', text))
            if len(matches) != cod_count:
                raise RuntimeError(f'No se pudo interpretar por completo {path.name}: {len(matches)}/{cod_count}.')

            rows = []
            for number, match in enumerate(matches, 1):
                code, question, a, b, c, d, answer, norm, reference = [part.strip() for part in match.groups()]
                qid = f"s{section.replace(';', '-')}-{slugify(questionnaire)}-{number:04d}-{slugify(code) or number}"
                rows.append({
                    'id': qid,
                    'code': code,
                    'number': number,
                    'section': section,
                    'questionnaireId': questionnaire,
                    'question': question,
                    'options': {'A': a, 'B': b, 'C': c, 'D': d},
                    'correctAnswer': answer,
                    'norm': norm,
                    'reference': reference,
                })

            slug = f"s{section.replace(';', '-')}-{slugify(questionnaire)}"
            output = QUESTIONS / f'{slug}.json'
            output.write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            index_items.append({
                'id': slug,
                'section': section,
                'questionnaireId': questionnaire,
                'title': f'Cuestionario {questionnaire}',
                'count': len(rows),
                'path': f'data/questions/{slug}.json',
            })
            total += len(rows)

    index = {
        'version': '2026.10.06',
        'totalQuestions': total,
        'totalQuestionnaires': len(index_items),
        'questionnaires': index_items,
    }
    (PUBLIC / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')
    if total != 8655 or len(index_items) != 33:
        raise RuntimeError(f'Validación fallida: {total} preguntas y {len(index_items)} cuestionarios.')
    print(f'Banco generado correctamente: {total} preguntas / {len(index_items)} cuestionarios.')


if __name__ == '__main__':
    main()
