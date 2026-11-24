// Only the separated protected build may be packaged here. No public/ copy.
import {readFileSync,writeFileSync,readdirSync,lstatSync,existsSync,copyFileSync,realpathSync} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {validatePublicCatalog} from '../src/protectedCatalogContract.mjs'
const allowedRoot=new Set(['index.html','manifest.webmanifest','icon.svg','sw.js','catalog.json'])
const fail=m=>{throw Error('R94 '+m)}
export function verifyProtectedDist(root='dist-protected'){
 const base=resolve(root)
 if(!lstatSync(base).isDirectory()||realpathSync(base)!==base)fail('invalid output root')
 const rootEntries=readdirSync(base)
 for(const name of allowedRoot)if(!rootEntries.includes(name))fail('missing '+name)
 for(const name of rootEntries){
  const s=lstatSync(join(base,name))
  if(name==='assets'){
   if(!s.isDirectory()||s.isSymbolicLink())fail('invalid assets directory')
   for(const entry of readdirSync(join(base,name))){
    if(!/^[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.(?:js|css)$/.test(entry)||!lstatSync(join(base,name,entry)).isFile())fail('unexpected asset '+entry)
   }
  }else if(!allowedRoot.has(name)||!s.isFile()||s.isSymbolicLink())fail('unexpected root entry '+name)
 }
 if(!rootEntries.includes('assets'))fail('missing assets')
 const catalog=validatePublicCatalog(JSON.parse(readFileSync(join(base,'catalog.json'),'utf8')))
 const html=readFileSync(join(base,'index.html'),'utf8')
 if(!html.includes('/assets/')||html.includes('/src/main.tsx')||html.includes('/cap-test/'))fail('wrong entry/base')
 const sw=readFileSync(join(base,'sw.js'),'utf8')
 if(sw!==readFileSync('ops/rutacap/sw-protected.js','utf8')||/cache\.put|cache\.addAll|caches\.open/.test(sw))fail('worker mismatch')
 if(readFileSync(join(base,'manifest.webmanifest'),'utf8')!==readFileSync('public/manifest.webmanifest','utf8')||
    readFileSync(join(base,'icon.svg'),'utf8')!==readFileSync('public/icon.svg','utf8'))fail('shell asset mismatch')
 return {files:rootEntries.length,catalogUnits:catalog.items.length}
}
export function packageProtected(){
 const root=resolve('dist-protected'),repo=realpathSync('.')
 if(!existsSync(root)||realpathSync(root)!==root||!lstatSync(root).isDirectory())fail('missing or unsafe output')
 const path=process.env.RUTACAP_R94_PUBLIC_CATALOG
 let catalog={schemaVersion:1,items:[]}
 if(path){
  const input=realpathSync(path)
  if(input===repo||input.startsWith(repo+sep)||!lstatSync(input).isFile())fail('catalog input must be outside repo')
  catalog=validatePublicCatalog(JSON.parse(readFileSync(input,'utf8')))
 }
 for(const [src,dst] of [['public/manifest.webmanifest','manifest.webmanifest'],['public/icon.svg','icon.svg'],['ops/rutacap/sw-protected.js','sw.js']])
  writeFileSync(join(root,dst),readFileSync(src),{flag:'wx'})
 writeFileSync(join(root,'catalog.json'),JSON.stringify(catalog)+'\n',{flag:'wx'})
 return verifyProtectedDist(root)
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.includes('--verify')?verifyProtectedDist():packageProtected()
 console.log('[R94] protected shell verified; catalog units: '+result.catalogUnits)
}
