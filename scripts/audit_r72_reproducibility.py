"""R72 read-only diagnostics for CI/Vercel byte reproducibility.

Runs against a prebuilt CI ZIP or dist/. Does not modify bank, keys, scores,
questionnaire source, generated JSON or deployment configuration.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import re
import unicodedata
import zipfile

def norm(value):
    text=unicodedata.normalize('NFKD',str(value)).encode('ascii','ignore').decode().lower()
    return ' '.join(re.sub(r'[^a-z0-9]+',' ',text).split())

def fingerprint(row):
    return norm(row['question'])+'||'+'||'.join(sorted(norm(x) for x in row['options'].values()))

class Input:
    def __init__(self,location):
        self.path=Path(location).resolve()
        if self.path.is_file() and self.path.suffix=='.zip':
            self.archive=zipfile.ZipFile(self.path)
            self.paths=sorted(p for p in self.archive.namelist() if not p.endswith('/'))
        elif self.path.is_dir():
            self.archive=None
            self.paths=sorted(p.relative_to(self.path).as_posix()
                              for p in self.path.rglob('*') if p.is_file())
        else:
            raise ValueError('Input must be a CI ZIP or a build directory')
    def read(self,path):
        if path not in self.paths:raise ValueError('Missing data file '+path)
        return self.archive.read(path) if self.archive else (self.path/path).read_bytes()
    def json(self,path):
        return json.loads(self.read(path))

def audit(source):
    bank_index=source.json('data/index.json')
    exam_index=source.json('data/exams/index.json')
    assert bank_index['totalQuestions']==8655
    assert bank_index['totalQuestionnaires']==len(bank_index['questionnaires'])==33
    assert exam_index['totalImportedQuestions']==2600
    assert exam_index['totalExamModels']==len(exam_index['exams'])==26
    allowed={'data/index.json','data/exams/index.json','data/exams/frequency_by_bank.json'}
    allowed.update(x['path'] for x in bank_index['questionnaires'])
    allowed.update(x['path'] for x in exam_index['exams'])
    assert len(allowed)==62
    assert {p for p in source.paths if p.startswith('data/')}==allowed
    hashes=[{'path':p,'sha256':sha256(source.read(p)).hexdigest()} for p in sorted(allowed)]
    manifest=sha256('\n'.join(f"{x['path']}:{x['sha256']}" for x in hashes).encode()).hexdigest()
    by_fingerprint=defaultdict(list)
    by_question=defaultdict(list)
    for item in bank_index['questionnaires']:
        rows=source.json(item['path'])
        assert len(rows)==item['count']
        for row in rows:
            by_fingerprint[fingerprint(row)].append(row)
            by_question[norm(row['question'])].append(row)
    ambiguities=[]
    published_without_link=[]
    for item in exam_index['exams']:
        rows=source.json(item['path'])
        assert len(rows)==item['count']==100
        for row in rows:
            matches=by_fingerprint.get(fingerprint(row),[])
            if not matches:
                candidates=by_question.get(norm(row['question']),[])
                proposed=set()
                consistent=bool(candidates)
                for candidate in candidates:
                    correct_text=norm(candidate['options'][candidate['correctAnswer']])
                    letters=[k for k,v in row['options'].items() if norm(v)==correct_text]
                    if len(letters)!=1:
                        consistent=False
                        break
                    proposed.add(letters[0])
                if consistent and len(proposed)==1:matches=candidates
            mapped=set()
            for candidate in matches:
                answer=norm(candidate['options'][candidate['correctAnswer']])
                mapped.update(k for k,v in row['options'].items() if norm(v)==answer)
            ids=sorted({str(x['id']) for x in matches})
            if len(ids)<=1 or len(mapped)!=1:continue
            chosen=row.get('canonicalQuestionId')
            if chosen not in ids:
                # Published display text can differ from text used at generation;
                # do not retroactively attach a different bank provenance.
                published_without_link.append({'examId':item['id'],'number':row['number'],
                                               'publishedCanonicalId':chosen,
                                               'postBuildCandidateIds':ids})
                continue
            sorted_first=min(matches,key=lambda x:(str(x['code']),str(x['id'])))['id']
            ambiguities.append({'examId':item['id'],'number':row['number'],
                                'selectedCanonicalId':chosen,'candidateIds':ids,
                                'alternativeCount':len(ids),
                                'selectedDiffersFromCodeSort':chosen!=sorted_first})
    return {
        'schemaVersion':1,'kind':'read-only-reproducibility-audit',
        'fileCount':len(allowed),'manifestSha256':manifest,
        'bankQuestions':sum(len(x) for x in by_fingerprint.values()),
        'uniqueFingerprints':len(by_fingerprint),
        'duplicatedBankFingerprintGroups':sum(len(x)>1 for x in by_fingerprint.values()),
        'historicalRowsWithMultipleCandidateIds':len(ambiguities),
        'postBuildMatchesWithoutProvenance':len(published_without_link),
        'selectedDiffersFromCodeSort':sum(x['selectedDiffersFromCodeSort'] for x in ambiguities),
        'ambiguousRows':ambiguities,'postBuildUnmatched':published_without_link,
        'files':hashes,
        'qualification':'Potential order dependency; Vercel per-file output not obtained. No answer or scoring changes.'
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',required=True,help='CI artifact ZIP or dist directory')
    parser.add_argument('--output',help='Optional report outside input')
    parser.add_argument('--reference',help='Optional other per-file manifest JSON to compare')
    args=parser.parse_args()
    source=Input(args.input)
    report=audit(source)
    if args.reference:
        other=json.loads(Path(args.reference).read_text(encoding='utf-8'))
        this={x['path']:x['sha256'] for x in report['files']}
        baseline={x['path']:x['sha256'] for x in other['files']}
        report['referenceComparison']={
            'manifestSha256':other.get('manifestSha256'),
            'equal':this==baseline,
            'differentPaths':[p for p in sorted(this.keys()|baseline.keys())
                              if this.get(p)!=baseline.get(p)]
        }
    print('R72 REPRO READ-ONLY: '+json.dumps({
        k:report[k] for k in ('fileCount','manifestSha256','bankQuestions',
          'uniqueFingerprints','duplicatedBankFingerprintGroups',
          'historicalRowsWithMultipleCandidateIds','postBuildMatchesWithoutProvenance',
          'selectedDiffersFromCodeSort')},ensure_ascii=False))
    if args.output:
        dest=Path(args.output).resolve()
        if source.archive is None and (dest==source.path or source.path in dest.parents):
            raise ValueError('Report must not be written into the distribution')
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':
    main()
