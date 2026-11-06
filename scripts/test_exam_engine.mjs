import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeSession, deadlineAt, remainingMs, formatRemaining, uniqueExamQuestions, mostFrequentExamQuestions } from '../src/examEngine.mjs';

const answers = (right, wrong, empty, excluded = 0) => [
  ...Array.from({length:right},()=>({selected:'A',correct:true,scoringEligible:true})),
  ...Array.from({length:wrong},()=>({selected:'B',correct:false,scoringEligible:true})),
  ...Array.from({length:empty},()=>({correct:false,scoringEligible:true})),
  ...Array.from({length:excluded},()=>({selected:'A',correct:false,scoringEligible:false}))
];

test('100 CAP questions: +1, -0.5, blanks 0, pass from 50',()=>{
  const grade = gradeSession(answers(67,33,0),true);
  assert.equal(grade.netPoints,50.5);
  assert.equal(grade.passed,true);
  assert.equal(grade.officialComparable,true);
  assert.equal(grade.blank,0);
});
test('50 correct and 50 blank passes at exactly 50 points',()=>{
  const grade=gradeSession(answers(50,0,50),true);
  assert.equal(grade.netPoints,50);
  assert.equal(grade.passed,true);
  assert.equal(grade.blank,50);
});
test('wrong answers are penalized, blanks are not',()=>{
  const grade=gradeSession(answers(66,34,0),true);
  assert.equal(grade.netPoints,49);
  assert.equal(grade.passed,false);
  assert.equal(grade.scorePercentage,49);
});
test('three editorial exclusions do not create mistakes or a false official pass',()=>{
  const grade=gradeSession(answers(50,0,47,3),true);
  assert.equal(grade.graded,97);
  assert.equal(grade.excluded,3);
  assert.equal(grade.incorrect,0);
  assert.equal(grade.netPoints,50);
  assert.equal(grade.passed,null);
  assert.equal(grade.officialComparable,false);
  assert.equal(grade.scorePercentage,51.55);
});
test('general-bank exam continues to use ordinary accuracy',()=>{
  const grade=gradeSession(answers(2,1,1),false);
  assert.equal(grade.scorePercentage,50);
  assert.equal(grade.passed,null);
});
test('clock does not pause when the tab is hidden or page reloads',()=>{
  const start=1_700_000_000_000;
  assert.equal(deadlineAt(start),start+7_200_000);
  assert.equal(remainingMs(start,start+6_000_000),1_200_000);
  assert.equal(remainingMs(start,start+7_500_000),0);
  assert.equal(formatRemaining(7_200_000),'02:00:00');
  assert.equal(formatRemaining(0),'00:00:00');
});

test('mixed exams discard repeated canonical ids and identical enunciados',()=>{
 const input=[
  {id:'1',progressId:'canonical-a',question:'¿Qué carga corresponde?'},
  {id:'2',progressId:'canonical-a',question:'Pregunta distinta con el mismo id'},
  {id:'3',progressId:'canonical-b',question:'¿Qué   carga corresponde?'},
  {id:'4',progressId:'canonical-c',question:'Pregunta realmente diferente'}
 ];
 assert.deepEqual(uniqueExamQuestions(input).map(q=>q.id),['1','4']);
});

test('Top 100 sorts by historical frequency, excludes unscored questions and repeats',()=>{
 const rows=[
  {id:'cap:2024:1',progressId:'same',examId:'2024',question:'¿Qué documentación se necesita?',examFrequency:5,scoringEligible:true},
  {id:'cap:2026:1',progressId:'same',examId:'2026',question:'¿Qué documentación se necesita?',examFrequency:5,scoringEligible:true},
  {id:'cap:2026:2',progressId:'other',examId:'2026',question:'Otra pregunta',examFrequency:4,scoringEligible:true},
  {id:'cap:2025:3',progressId:'third',examId:'2025',question:'¿Qué documentación se necesita ? ',examFrequency:3,scoringEligible:true},
  {id:'cap:2024:4',progressId:'excluded',examId:'2024',question:'Pregunta discutida',examFrequency:100,scoringEligible:false},
  {id:'cap:2024:5',progressId:'low',examId:'2024',question:'Muy poco repetida',examFrequency:1,scoringEligible:true}
 ];
 assert.deepEqual(mostFrequentExamQuestions(rows,2).map(q=>q.id),['cap:2026:1','cap:2026:2']);
});
test('Top frequency ties prefer less flagged copies and then newer exam models',()=>{
 const rows=[
  {id:'cap:2026:1',progressId:'id',examId:'2026',question:'Pregunta repetida',examFrequency:4,reviewRequired:true},
  {id:'cap:2025:1',progressId:'id',examId:'2025',question:'Pregunta repetida',examFrequency:4,reviewRequired:false},
  {id:'cap:2024:1',progressId:'distinct',examId:'2024',question:'Otra pregunta',examFrequency:4,reviewRequired:false}
 ];
 assert.deepEqual(mostFrequentExamQuestions(rows,2).map(q=>q.id),['cap:2025:1','cap:2024:1']);
});
