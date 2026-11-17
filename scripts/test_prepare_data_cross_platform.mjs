import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolvePython, STEPS } from './prepare_data_cross_platform.mjs'

test('C25 preserves all 17 original data scripts and the manifest uses a portable runner', () => {
  assert.equal(STEPS.length,17)
  assert.equal(STEPS[0],'scripts/build_data.py')
  assert.equal(STEPS.at(-1),'scripts/build_technical_review_r31.py')
  assert.equal(new Set(STEPS).size,17)
  assert.ok(STEPS.every(p=>/^scripts\/[a-z0-9_]+\.py$/.test(p)))
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'))
  assert.equal(pkg.scripts['prepare:data'],'node scripts/prepare_data_cross_platform.mjs')
})
test('C25 selects py -3 on Windows and python3 on Linux',()=>{
  const fake=(name)=>name==='py'||name==='python3'
    ? {status:0,stdout:'Python 3.13.2',stderr:''} : {status:1,stdout:'',stderr:''}
  assert.deepEqual(resolvePython('win32',fake),{command:'py',prefix:['-3']})
  assert.deepEqual(resolvePython('linux',fake),{command:'python3',prefix:[]})
})
test('C25 supports Windows Python installation without the py launcher',()=>{
  const fake=name=>name==='python'
    ? {status:0,stdout:'Python 3.13.2',stderr:''} : {status:1,stdout:'',stderr:''}
  assert.deepEqual(resolvePython('win32',fake),{command:'python',prefix:[]})
})
test('C25 does not accept the Microsoft Store missing Python alias',()=>{
  assert.throws(()=>resolvePython('win32',()=>({status:1,stdout:'',stderr:'no se encontró Python'})),/No se encontró Python 3/)
})
