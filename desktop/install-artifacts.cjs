'use strict'
const fs=require('node:fs')
const path=require('node:path')
const crypto=require('node:crypto')
const {packageArtifactPaths,resolvePackageOutput}=require('./artifact-policy.cjs')

function assertNoLinks(target){
 const parsed=path.parse(target);let current=parsed.root
 const parts=target.slice(parsed.root.length).split(path.sep).filter(Boolean)
 for(let index=0;index<parts.length;index++){
  current=path.join(current,parts[index]);let stat
  try{stat=fs.lstatSync(current)}catch(error){if(error.code==='ENOENT')return;throw error}
  if(stat.isSymbolicLink())throw new Error(`Unsafe symbolic link/junction in install path: ${current}`)
  if(index<parts.length-1&&!stat.isDirectory())throw new Error(`Unsafe install parent: ${current}`)
 }
}
function requireFile(file,label){
 assertNoLinks(file)
 let stat;try{stat=fs.statSync(file)}catch(error){throw new Error(`Missing ${label} ASAR: ${file}`,{cause:error})}
 if(!stat.isFile())throw new Error(`Invalid ${label} ASAR file: ${file}`)
}
async function hashFile(file){
 const hash=crypto.createHash('sha256')
 for await(const chunk of fs.createReadStream(file))hash.update(chunk)
 return hash.digest('hex')
}
async function verify(file,expected){if(await hashFile(file)!==expected)throw new Error(`ASAR hash verification failed: ${file}`)}
async function removePending(file){try{await fs.promises.unlink(file)}catch(error){if(error.code!=='ENOENT')throw error}}

/** Parent must close the installed app first. Copies ASAR only; never Electron binaries or historical folders. */
async function installCandidateAsar({repoRoot,candidateOutput}){
 const p=packageArtifactPaths(repoRoot),output=resolvePackageOutput({repoRoot,output:candidateOutput})
 const asar=directory=>path.join(directory,'Agent Flow-win32-x64','resources','app.asar')
 const candidateAsar=asar(output),canonicalAsar=asar(p.canonical),rollbackAsar=asar(p.rollback)
 const manifestPath=path.join(p.rollback,'manifest.json'),backupPending=`${rollbackAsar}.pending`,manifestPending=`${manifestPath}.pending`
 // Validate even the staging/manifest paths before creating directories or copying bytes.
 const paths=[candidateAsar,canonicalAsar,rollbackAsar,manifestPath,backupPending,manifestPending]
 for(const file of paths)assertNoLinks(file)
 requireFile(candidateAsar,'candidate');requireFile(canonicalAsar,'installed')
 const [candidateHash,previousHash]=await Promise.all([hashFile(candidateAsar),hashFile(canonicalAsar)])
 if(candidateHash===previousHash){
  const rollbackHash=fs.existsSync(rollbackAsar)?(requireFile(rollbackAsar,'rollback'),await hashFile(rollbackAsar)):null
  return {installed:false,candidateAsar,canonicalAsar,rollbackAsar,manifestPath,candidateHash,previousHash,rollbackHash}
 }
 try{
  await fs.promises.mkdir(path.dirname(rollbackAsar),{recursive:true})
  for(const file of paths)assertNoLinks(file)
  await fs.promises.copyFile(canonicalAsar,backupPending)
  await verify(backupPending,previousHash)
  await fs.promises.rename(backupPending,rollbackAsar)
  await verify(rollbackAsar,previousHash)
  const manifest={version:1,sha256:previousHash,asar:rollbackAsar,backedUpFrom:canonicalAsar,createdAt:new Date().toISOString()}
  await fs.promises.writeFile(manifestPending,`${JSON.stringify(manifest,null,2)}\n`,'utf8')
  await fs.promises.rename(manifestPending,manifestPath)
  for(const file of [candidateAsar,canonicalAsar,rollbackAsar])assertNoLinks(file)
  await verify(canonicalAsar,previousHash)
  try{
   await fs.promises.copyFile(candidateAsar,canonicalAsar)
   await verify(canonicalAsar,candidateHash)
  }catch(error){
   try{
    assertNoLinks(rollbackAsar);assertNoLinks(canonicalAsar)
    await verify(rollbackAsar,previousHash)
    await fs.promises.copyFile(rollbackAsar,canonicalAsar)
    await verify(canonicalAsar,previousHash)
   }catch(restoreError){throw new AggregateError([error,restoreError],`Candidate install and restore failed; verified last-good is at ${rollbackAsar}`)}
   throw new Error('Candidate install failed; previous installed ASAR restored from verified last-good.',{cause:error})
  }
  return {installed:true,candidateAsar,canonicalAsar,rollbackAsar,manifestPath,candidateHash,previousHash,rollbackHash:previousHash}
 }finally{
  // Only this installer's fixed staging files; no historical artifact cleanup.
  for(const file of [backupPending,manifestPending]){assertNoLinks(file);await removePending(file)}
 }
}

module.exports={installCandidateAsar}
if(require.main===module)installCandidateAsar({repoRoot:path.resolve(__dirname,'..'),candidateOutput:process.env.AGENT_FLOW_PACKAGE_OUTPUT}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1})
