import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const privateName=/^RutaCAP_.*(?:privad|ensayo|importacion)/i
function rejectPrivatePublicFiles(dir:string):void {
 for(const item of readdirSync(dir,{withFileTypes:true})){
  if(privateName.test(item.name))throw Error('No se permite compilar material editorial privado desde public/.')
  if(item.isDirectory())rejectPrivatePublicFiles(join(dir,item.name))
 }
}

const r63PublicDataAllowlist = {
  name: 'rutacap-r63-distribution-only-data',
  apply: 'build' as const,
  closeBundle() {
    // Vite copies public/ into dist/. Enforce the allowlist even if somebody
    // invokes vite build directly instead of the npm build script.
    const result = spawnSync(process.execPath, ['scripts/package_public_data_r63.mjs'], {
      stdio: 'inherit', windowsHide: true
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw Error('R63: empaquetado de dist/data fallido.')
  }
}

export default defineConfig(({ mode,command }) => {
  const protectedMode=mode==='cap-protected'
  if(protectedMode&&command!=='build')throw Error('R94: protected mode is build-only; serve only the verified dist-protected output.')
  const local=mode==='catalog-local'
  if(local&&command==='build')throw Error('El catálogo editorial local no admite compilación.')
  if(command==='build'&&!protectedMode)rejectPrivatePublicFiles('public')
  if(protectedMode)return {
    base:'/',publicDir:false,build:{outDir:'dist-protected',emptyOutDir:true,sourcemap:false,target:'es2020'},
    plugins:[react(),{
      name:'rutacap-r94-protected-entry',
      transformIndexHtml:{order:'pre' as const,handler(html:string){
        return html.replace('/src/main.tsx','/src/protectedMain.tsx')
      }},
      closeBundle(){
        const result=spawnSync(process.execPath,['scripts/package_protected_r94.mjs'],{stdio:'inherit',windowsHide:true})
        if(result.error)throw result.error
        if(result.status!==0)throw Error('R94: protected distribution verification failed.')
      }
    }]
  }
  const configured = loadEnv(mode, '.', 'CAP_PUBLIC_BASE').CAP_PUBLIC_BASE || '/cap-test/'
  const base = local||(mode === 'cap-preview'||mode === 'cap-launch')||command === 'serve' ? '/' : configured
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('CAP_PUBLIC_BASE debe ser una ruta absoluta con barra final, por ejemplo / o /cap-test/.')
  return { plugins: [react(),...(command==='build'?[r63PublicDataAllowlist]:[]),...(local?[{
    name:'rutacap-local-catalog-entry',
    configureServer(server:import('vite').ViteDevServer){
      if(server.config.server.host!=='127.0.0.1'||server.config.server.port!==4188||!server.config.server.strictPort)throw Error('El catálogo requiere 127.0.0.1:4188 exclusivamente.')
      server.middlewares.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
    },
    transformIndexHtml:{order:'pre' as const,handler(html:string){
      return html.replace('/src/main.tsx','/src/privateCatalogMain.tsx').replace(/<link rel="manifest"[^>]*>/,'').replace(/<link rel="icon"[^>]*>/,'').replace(/<title>[^<]*<\/title>/,'<title>RutaCAP · Catálogo editorial local</title>')
    }}
  }]:[])], base, ...(local?{publicDir:false as const,server:{host:'127.0.0.1',port:4188,strictPort:true,hmr:false}}:{}),build:{sourcemap:false,target:'es2020'} }
})
