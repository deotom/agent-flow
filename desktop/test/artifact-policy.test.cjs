'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const vm=require('node:vm')
const {packageArtifactPaths,resolvePackageOutput,auditPackageArtifacts}=require('../artifact-policy.cjs')

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-flow-artifacts-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const repo=path.join(root,'repo');fs.mkdirSync(path.join(repo,'artifacts.local'),{recursive:true});return {root,repo}}
test('default is one absolute repository candidate independent of cwd',t=>{
 const {repo,root}=fixture(t),p=packageArtifactPaths(repo)
 assert.equal(resolvePackageOutput({repoRoot:repo,cwd:root}),path.join(repo,'artifacts.local','desktop-review-candidate'))
 assert.equal(p.canonical,path.join(repo,'artifacts.local','desktop'));assert.equal(p.rollback,path.join(repo,'artifacts.local','desktop-last-good'))
 fs.mkdirSync(p.candidate,{recursive:true});fs.writeFileSync(path.join(p.candidate,'old.txt'),'retain until packager runs')
 assert.equal(resolvePackageOutput({repoRoot:repo}),p.candidate);assert.equal(fs.readFileSync(path.join(p.candidate,'old.txt'),'utf8'),'retain until packager runs')
})
test('safe legacy explicit overrides retain absolute and cwd-relative semantics',t=>{
 const {repo,root}=fixture(t)
 assert.equal(resolvePackageOutput({repoRoot:repo,cwd:root,output:'legacy-review'}),path.join(root,'legacy-review'))
 assert.equal(resolvePackageOutput({repoRoot:repo,output:path.join(repo,'artifacts.local','desktop-explicit')}),path.join(repo,'artifacts.local','desktop-explicit'))
})
test('refuses roots, sources, live app and last-good destinations including ancestors or descendants',t=>{
 const {repo,root}=fixture(t),p=packageArtifactPaths(repo)
 for(const output of [path.parse(repo).root,root,repo,path.join(repo,'desktop'),path.join(repo,'web','build'),path.join(repo,'node_modules'),path.join(root,'node_modules','package'),path.join(repo,'artifacts.local'),p.canonical,path.join(p.canonical,'nested'),p.rollback,path.join(p.rollback,'nested'),p.legacyRollback,path.join(p.legacyRollback,'nested')])assert.throws(()=>resolvePackageOutput({repoRoot:repo,output}),/unsafe|protected/i,output)
 assert.throws(()=>resolvePackageOutput({repoRoot:repo,output:'  '}),/unsafe/i)
})
test('rejects junction/symlink aliases at the destination and at parent components',t=>{
 const {repo,root}=fixture(t),live=packageArtifactPaths(repo).canonical;fs.mkdirSync(live,{recursive:true})
 const alias=path.join(root,'alias');fs.symlinkSync(live,alias,process.platform==='win32'?'junction':'dir')
 for(const output of [alias,path.join(alias,'nested')])assert.throws(()=>resolvePackageOutput({repoRoot:repo,output}),/symbolic|junction|symlink/i)
 const packaged=path.join(packageArtifactPaths(repo).candidate,'Agent Flow-win32-x64');fs.mkdirSync(path.dirname(packaged),{recursive:true});fs.symlinkSync(live,packaged,process.platform==='win32'?'junction':'dir')
 assert.throws(()=>resolvePackageOutput({repoRoot:repo}),/symbolic|junction|symlink/i)
})
test('reports historical generated directories and disk space without removing anything or following links',t=>{
 const {repo,root}=fixture(t),p=packageArtifactPaths(repo)
 for(const [name,data] of [['desktop','live'],['desktop-last-good','good'],['desktop-review-candidate','candidate'],['desktop-old-review','old']]){fs.mkdirSync(path.join(repo,'artifacts.local',name));fs.writeFileSync(path.join(repo,'artifacts.local',name,'app.asar'),data)}
 fs.mkdirSync(path.join(root,'outside'));fs.writeFileSync(path.join(root,'outside','large'),'not counted')
 fs.symlinkSync(path.join(root,'outside'),path.join(repo,'artifacts.local','desktop-old-review','linked'),process.platform==='win32'?'junction':'dir')
 const before=fs.readdirSync(path.join(repo,'artifacts.local')),audit=auditPackageArtifacts({repoRoot:repo})
 assert.deepEqual(fs.readdirSync(path.join(repo,'artifacts.local')),before)
 assert.deepEqual(audit.directories.map(d=>[d.name,d.role,d.bytes]),[['desktop','canonical',4],['desktop-last-good','rollback',4],['desktop-old-review','historical',3],['desktop-review-candidate','candidate',9]])
 assert.equal(audit.directories.find(d=>d.name==='desktop-old-review').skippedLinks,1)
 assert.ok(Number.isFinite(audit.freeBytes)&&audit.freeBytes>=0);assert.equal(fs.existsSync(p.canonical),true)
})
test('inventory refuses an artifacts-root junction instead of walking external history',t=>{
 const {repo,root}=fixture(t),outside=path.join(root,'outside');fs.mkdirSync(outside)
 fs.rmdirSync(path.join(repo,'artifacts.local'))
 fs.symlinkSync(outside,path.join(repo,'artifacts.local'),process.platform==='win32'?'junction':'dir')
 assert.throws(()=>auditPackageArtifacts({repoRoot:repo}),/symbolic|junction|symlink/i)
})
test('package report mode performs the read-only audit without loading packager',async t=>{
 const {repo}=fixture(t),messages=[];let imported=false
 const processStub={argv:['node','package.cjs','--artifact-report'],env:{},exitCode:0}
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../package.cjs'),'utf8'),{
  __dirname:path.join(repo,'desktop'),process:processStub,console:{log:value=>messages.push(value),error:error=>{throw error}},require:id=>id==='./artifact-policy.cjs'?require('../artifact-policy.cjs'):require(id),
 },{importModuleDynamically(){imported=true;throw Error('Report must not load packager')}})
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(imported,false);assert.equal(processStub.exitCode,0);assert.equal(JSON.parse(messages[0]).paths.candidate,path.join(repo,'artifacts.local','desktop-review-candidate'))
 assert.deepEqual(fs.readdirSync(path.join(repo,'artifacts.local')),[])
})
test('package command refuses a protected env override before loading or overwriting',async t=>{
 const {repo}=fixture(t),live=packageArtifactPaths(repo).canonical,errors=[];let imported=false
 fs.mkdirSync(live);fs.writeFileSync(path.join(live,'live.asar'),'last good')
 const processStub={argv:['node','package.cjs'],env:{AGENT_FLOW_PACKAGE_OUTPUT:live},exitCode:0}
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../package.cjs'),'utf8'),{
  __dirname:path.join(repo,'desktop'),process:processStub,console:{log(){},error:error=>errors.push(error)},require:id=>id==='./artifact-policy.cjs'?require('../artifact-policy.cjs'):require(id),
 },{importModuleDynamically(){imported=true;throw Error('Unsafe destination must not load packager')}})
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(imported,false);assert.equal(processStub.exitCode,1);assert.match(errors[0].message,/protected/i);assert.equal(fs.readFileSync(path.join(live,'live.asar'),'utf8'),'last good')
})
test('package options exclude nested experimental builds but retain the actual application assets',async t=>{
 const {repo}=fixture(t),source=fs.readFileSync(path.join(__dirname,'../package.cjs'),'utf8')
 const isolated=source.replace("await import('@electron/packager')",'({packager:testPackager})')
 assert.notEqual(isolated,source,'isolate only the external packager call')
 let options
 vm.runInNewContext(isolated,{
  __dirname:path.join(repo,'desktop'),process:{argv:['node','package.cjs'],env:{},exitCode:0},console:{log(){},error:error=>{throw error}},
  testPackager:async value=>{options=value;return []},
  require:id=>id==='./artifact-policy.cjs'?require('../artifact-policy.cjs'):id==='electron/package.json'?{version:'45.0.0'}:require(id),
 })
 await new Promise(resolve=>setImmediate(resolve))
 assert.ok(options)
 for(const file of ['/artifacts.local','/artifacts.local/desktop-old/Agent Flow.exe','/artifacts.local/desktop-old/resources/app.asar'])assert.ok(options.ignore.some(pattern=>pattern.test(file)),file)
 for(const file of ['/main.cjs','/dist/webview/index.js','/dist/webview/index.css'])assert.ok(!options.ignore.some(pattern=>pattern.test(file)),file)
})
