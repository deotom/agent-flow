'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const crypto=require('node:crypto')
const {packageArtifactPaths}=require('../artifact-policy.cjs')
const {installCandidateAsar}=require('../install-artifacts.cjs')
const sha=value=>crypto.createHash('sha256').update(value).digest('hex')
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-flow-install-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}))
 const p=packageArtifactPaths(root),asar=output=>path.join(output,'Agent Flow-win32-x64','resources','app.asar'),canonical=asar(p.canonical),candidate=asar(p.candidate),rollback=asar(p.rollback)
 for(const file of [canonical,candidate])fs.mkdirSync(path.dirname(file),{recursive:true})
 fs.writeFileSync(canonical,'installed A');fs.writeFileSync(candidate,'candidate B')
 return {root,p,canonical,candidate,rollback}
}
test('verifies installation and reuses one fixed last-good ASAR and hashed manifest',async t=>{
 const f=fixture(t),first=await installCandidateAsar({repoRoot:f.root})
 assert.equal(first.installed,true);assert.equal(fs.readFileSync(f.canonical,'utf8'),'candidate B');assert.equal(fs.readFileSync(f.rollback,'utf8'),'installed A')
 assert.equal(first.candidateHash,sha('candidate B'));assert.equal(first.rollbackHash,sha('installed A'))
 assert.equal(JSON.parse(fs.readFileSync(first.manifestPath,'utf8')).sha256,sha('installed A'))
 fs.writeFileSync(f.candidate,'candidate C');const second=await installCandidateAsar({repoRoot:f.root})
 assert.equal(fs.readFileSync(f.canonical,'utf8'),'candidate C');assert.equal(fs.readFileSync(f.rollback,'utf8'),'candidate B');assert.equal(second.rollbackHash,sha('candidate B'))
 assert.deepEqual(fs.readdirSync(path.join(f.root,'artifacts.local')).sort(),['desktop','desktop-last-good','desktop-review-candidate'])
 assert.deepEqual(fs.readdirSync(path.dirname(f.rollback)),['app.asar'])
})
test('identical candidate preserves the previous rollback and manifest',async t=>{
 const f=fixture(t),first=await installCandidateAsar({repoRoot:f.root}),before=fs.readFileSync(first.manifestPath,'utf8')
 const second=await installCandidateAsar({repoRoot:f.root})
 assert.equal(second.installed,false);assert.equal(fs.readFileSync(f.rollback,'utf8'),'installed A');assert.equal(fs.readFileSync(first.manifestPath,'utf8'),before)
})
test('missing candidate leaves canonical and the established last-good untouched',async t=>{
 const f=fixture(t),first=await installCandidateAsar({repoRoot:f.root}),manifest=fs.readFileSync(first.manifestPath,'utf8')
 fs.unlinkSync(f.candidate)
 await assert.rejects(installCandidateAsar({repoRoot:f.root}),/candidate|missing|ENOENT/i)
 assert.equal(fs.readFileSync(f.canonical,'utf8'),'candidate B');assert.equal(fs.readFileSync(f.rollback,'utf8'),'installed A');assert.equal(fs.readFileSync(first.manifestPath,'utf8'),manifest)
})
test('a partial replacement failure restores the verified previous installed ASAR',async t=>{
 const f=fixture(t),copyFile=fs.promises.copyFile.bind(fs.promises);let failed=false
 t.mock.method(fs.promises,'copyFile',async(source,destination,...rest)=>{
  if(source===f.candidate&&destination===f.canonical&&!failed){failed=true;fs.writeFileSync(destination,'partial');throw Error('simulated write failure')}
  return copyFile(source,destination,...rest)
 })
 await assert.rejects(installCandidateAsar({repoRoot:f.root}),/restored/i)
 assert.equal(failed,true);assert.equal(fs.readFileSync(f.canonical,'utf8'),'installed A');assert.equal(fs.readFileSync(f.rollback,'utf8'),'installed A')
})
test('replacement hash mismatch restores previous bytes instead of accepting a changing candidate',async t=>{
 const f=fixture(t),copyFile=fs.promises.copyFile.bind(fs.promises)
 t.mock.method(fs.promises,'copyFile',async(source,destination,...rest)=>{if(source===f.candidate&&destination===f.canonical){fs.writeFileSync(destination,'unexpected bytes');return}return copyFile(source,destination,...rest)})
 await assert.rejects(installCandidateAsar({repoRoot:f.root}),/restored/i)
 assert.equal(fs.readFileSync(f.canonical,'utf8'),'installed A')
})
test('failed backup staging preserves canonical and the already verified last-good',async t=>{
 const f=fixture(t),first=await installCandidateAsar({repoRoot:f.root}),manifest=fs.readFileSync(first.manifestPath,'utf8'),copyFile=fs.promises.copyFile.bind(fs.promises)
 fs.writeFileSync(f.candidate,'candidate C')
 t.mock.method(fs.promises,'copyFile',async(source,destination,...rest)=>{if(destination===`${f.rollback}.pending`){fs.writeFileSync(destination,'partial backup');throw Error('simulated backup failure')}return copyFile(source,destination,...rest)})
 await assert.rejects(installCandidateAsar({repoRoot:f.root}),/simulated backup failure/i)
 assert.equal(fs.readFileSync(f.canonical,'utf8'),'candidate B');assert.equal(fs.readFileSync(f.rollback,'utf8'),'installed A');assert.equal(fs.readFileSync(first.manifestPath,'utf8'),manifest)
 assert.equal(fs.existsSync(`${f.rollback}.pending`),false)
})
test('rejects linked candidate, canonical and rollback paths before touching installed bytes',async t=>{
 for(const part of ['candidate-parent','candidate-asar','canonical-parent','canonical-asar','rollback-parent','rollback-asar']){
  const f=fixture(t),outside=path.join(f.root,'outside');fs.mkdirSync(outside);const safe=path.join(outside,'safe.asar');fs.writeFileSync(safe,'outside untouched')
  const destination=part.startsWith('candidate')?f.candidate:part.startsWith('canonical')?f.canonical:f.rollback
  fs.mkdirSync(path.dirname(destination),{recursive:true})
  if(part.endsWith('parent')){fs.rmSync(path.dirname(destination),{recursive:true,force:true});fs.symlinkSync(outside,path.dirname(destination),process.platform==='win32'?'junction':'dir')}
  else{if(fs.existsSync(destination))fs.unlinkSync(destination);fs.symlinkSync(process.platform==='win32'?outside:safe,destination,process.platform==='win32'?'junction':'file')}
  await assert.rejects(installCandidateAsar({repoRoot:f.root}),/symbolic|junction|symlink/i,part)
  assert.equal(fs.readFileSync(safe,'utf8'),'outside untouched')
  if(!part.startsWith('canonical'))assert.equal(fs.readFileSync(f.canonical,'utf8'),'installed A')
 }
})
