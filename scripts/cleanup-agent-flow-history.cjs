'use strict'
const fs=require('node:fs'),path=require('node:path')

function canonical(value){return process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value)}
function assertNoLinks(target){
  let current=path.parse(target).root
  for(const part of target.slice(current.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part)
    const stat=fs.lstatSync(current)
    if(stat.isSymbolicLink())throw Error(`Refusing link/junction: ${current}`)
  }
}
function validOrigin(value){
  const match=typeof value==='string'&&value.match(/^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/)
  return !!match&&Number(match[1])<=65535
}
/** Clear rebuildable IndexedDB only. No raw recursive deletion or source-history access. */
async function cleanupHistory({profilePath,appDataPath,buckets,protectedOrigins,apply=false,session}){
  const expected=path.join(path.resolve(appDataPath),'Agent Flow')
  if(canonical(profilePath)!==canonical(expected))throw Error('Refusing a profile outside the named Agent Flow profile')
  assertNoLinks(expected);assertNoLinks(path.join(expected,'WebStorage'))
  if(!Array.isArray(protectedOrigins)||!protectedOrigins.length||!protectedOrigins.every(validOrigin))throw Error('Protect the current loopback origin explicitly')
  const protect=new Set(protectedOrigins),origins=new Set(),bucketIds=[]
  for(const bucket of buckets){
    if(!Number.isSafeInteger(bucket.id)||bucket.id<1||bucket.name!=='_default')continue
    const match=typeof bucket.storage_key==='string'&&bucket.storage_key.match(/^(http:\/\/127\.0\.0\.1:\d+)\/\^0file:\/\/$/)
    // Stable preferred origins occupy 20000–39999; legacy random ports are higher.
    // Keep every lower port too, even if the caller omitted a newer workspace.
    if(!match||!validOrigin(match[1])||Number(new URL(match[1]).port)<40000||protect.has(match[1]))continue
    const bucketPath=path.join(expected,'WebStorage',String(bucket.id))
    if(fs.existsSync(bucketPath))assertNoLinks(bucketPath)
    const indexedDB=path.join(bucketPath,'IndexedDB')
    if(fs.existsSync(indexedDB))assertNoLinks(indexedDB)
    origins.add(match[1]);bucketIds.push(String(bucket.id))
  }
  const plan={profilePath:expected,origins:[...origins].sort(),bucketIds,protectedOrigins:[...protect].sort(),applied:false}
  if(!apply||!plan.origins.length)return plan
  if(typeof session?.clearData!=='function')throw Error('Electron session.clearData is required; refusing a broader fallback')
  await session.clearData({dataTypes:['indexedDB'],origins:plan.origins,originMatchingMode:'origin-in-all-contexts'})
  return {...plan,applied:true}
}
function readBuckets(profilePath){
  const {DatabaseSync}=require('node:sqlite')
  const db=new DatabaseSync(path.join(profilePath,'WebStorage','QuotaManager'),{readOnly:true})
  try{
    const check=db.prepare('PRAGMA quick_check').all()
    if(check.length!==1||Object.values(check[0])[0]!=='ok')throw Error('Quota metadata integrity check failed')
    return db.prepare('SELECT id,storage_key,name FROM buckets').all()
  }finally{db.close()}
}
function assertAppClosed(){
  if(process.platform!=='win32')throw Error('This cleanup utility targets the Windows Agent Flow profile only')
  const {execFileSync}=require('node:child_process')
  const raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name 'Agent Flow' -ErrorAction SilentlyContinue | Select-Object Id,Path) | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim()
  if(raw&&JSON.parse(raw).length!==0)throw Error('Close every Agent Flow process before inspecting or clearing the profile')
}
async function main(){
  const apply=process.argv.includes('--apply'),appDataPath=process.env.APPDATA
  if(!appDataPath)throw Error('APPDATA is required')
  const profilePath=path.join(appDataPath,'Agent Flow')
  const protectedOrigins=process.argv.filter(arg=>arg.startsWith('--protect-origin=')).map(arg=>arg.slice('--protect-origin='.length))
  assertAppClosed();assertNoLinks(profilePath)
  const buckets=readBuckets(profilePath)
  let app,storage
  if(apply){
    const electron=require('electron');app=electron.app
    if(!app)throw Error('Apply must run with desktop/node_modules/electron/dist/electron.exe, not Node')
    app.setName('Agent Flow');app.setPath('userData',profilePath);app.setPath('sessionData',profilePath)
    if(!app.requestSingleInstanceLock())throw Error('Agent Flow profile is in use')
    await app.whenReady();storage=electron.session.defaultSession
    if(canonical(storage.getStoragePath())!==canonical(profilePath))throw Error('Electron session does not own the expected profile')
  }
  const result=await cleanupHistory({profilePath,appDataPath,buckets,protectedOrigins,apply,session:storage})
  const report={at:new Date().toISOString(),...result}
  const reportArg=process.argv.find(arg=>arg.startsWith('--report='))
  if(reportArg)fs.writeFileSync(reportArg.slice('--report='.length),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report));app?.quit()
}
// Electron's default-app loader does not mark a .cjs entry as require.main.
function isCLIEntry({isMain,electron,entry,filename}){return isMain||!!electron&&!!entry&&canonical(entry)===canonical(filename)}
module.exports={cleanupHistory,isCLIEntry}
if(isCLIEntry({isMain:require.main===module,electron:process.versions.electron,entry:process.argv[1],filename:__filename}))main().catch(error=>{console.error(error);const electron=process.versions.electron&&require('electron');if(electron?.app)electron.app.exit(1);else process.exitCode=1})
