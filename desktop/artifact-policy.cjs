'use strict'
const fs=require('node:fs')
const path=require('node:path')

const PACKAGE_NAME='Agent Flow-win32-x64'
function packageArtifactPaths(repoRoot){
 const root=path.resolve(repoRoot),artifacts=path.join(root,'artifacts.local')
 return {root,artifacts,canonical:path.join(artifacts,'desktop'),candidate:path.join(artifacts,'desktop-review-candidate'),rollback:path.join(artifacts,'desktop-last-good'),legacyRollback:path.join(artifacts,'desktop-gestures-20261116-final')}
}
function within(target,parent){const relative=path.relative(parent,target);return relative===''||relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative)}
function noLinkedComponents(target){
 const parsed=path.parse(target);let current=parsed.root
 for(const segment of target.slice(parsed.root.length).split(path.sep).filter(Boolean)){
  current=path.join(current,segment)
  let stat;try{stat=fs.lstatSync(current)}catch(error){if(error.code==='ENOENT')return;throw error}
  if(stat.isSymbolicLink())throw new Error(`Unsafe symbolic link/junction in package destination: ${current}`)
  if(!stat.isDirectory())throw new Error(`Unsafe non-directory package destination: ${current}`)
 }
}
function noLinkedPackageEntries(directory){
 if(!fs.existsSync(directory))return
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const item=path.join(directory,entry.name),stat=fs.lstatSync(item)
  if(stat.isSymbolicLink())throw new Error(`Unsafe symbolic link/junction in existing package: ${item}`)
  if(stat.isDirectory())noLinkedPackageEntries(item)
 }
}

/** Validation only: never creates, clears, renames or removes an output directory. */
function resolvePackageOutput({repoRoot,output,cwd=process.cwd()}){
 const p=packageArtifactPaths(repoRoot)
 if(output!==undefined&&output!==''&&(typeof output!=='string'||!output.trim()))throw new Error('Unsafe package output value')
 const target=output?path.resolve(cwd,output):p.candidate
 noLinkedComponents(target)
 const protectedPaths=[p.canonical,p.rollback,p.legacyRollback,path.join(p.root,'desktop'),path.join(p.root,'node_modules')]
 if(target===path.parse(target).root||within(p.root,target)||protectedPaths.some(protectedPath=>within(target,protectedPath)||within(protectedPath,target))||
  within(target,p.root)&&!within(target,p.artifacts)||target.split(path.sep).some(part=>part.toLowerCase()==='node_modules'))throw new Error(`Unsafe or protected package destination: ${target}`)
 for(const directory of [process.env.WINDIR,process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean))if(within(target,path.resolve(directory)))throw new Error(`Protected system package destination: ${target}`)
 noLinkedComponents(path.join(target,PACKAGE_NAME))
 noLinkedPackageEntries(path.join(target,PACKAGE_NAME))
 return target
}

function directoryUsage(directory){
 let bytes=0,files=0,skippedLinks=0
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const item=path.join(directory,entry.name),stat=fs.lstatSync(item)
  if(stat.isSymbolicLink()){skippedLinks++;continue}
  if(stat.isDirectory()){const child=directoryUsage(item);bytes+=child.bytes;files+=child.files;skippedLinks+=child.skippedLinks}
  else if(stat.isFile()){bytes+=stat.size;files++}
 }
 return {bytes,files,skippedLinks}
}
/** Read-only inventory; historical artifacts require a separate authorized cleanup. */
function auditPackageArtifacts({repoRoot}){
 const p=packageArtifactPaths(repoRoot),directories=[]
 noLinkedComponents(p.artifacts)
 if(fs.existsSync(p.artifacts))for(const entry of fs.readdirSync(p.artifacts,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(!entry.name.startsWith('desktop'))continue
  const directory=path.join(p.artifacts,entry.name),stat=fs.lstatSync(directory)
  if(stat.isSymbolicLink()){directories.push({name:entry.name,path:directory,role:'linked',bytes:0,files:0,skippedLinks:1});continue}
  if(!stat.isDirectory())continue
  const role=directory===p.canonical?'canonical':directory===p.candidate?'candidate':directory===p.rollback||directory===p.legacyRollback?'rollback':'historical'
  directories.push({name:entry.name,path:directory,role,...directoryUsage(directory)})
 }
 const disk=fs.statfsSync(p.root)
 return {directories,totalBytes:directories.reduce((sum,d)=>sum+d.bytes,0),freeBytes:Number(disk.bavail)*Number(disk.bsize),capacityBytes:Number(disk.blocks)*Number(disk.bsize),paths:p}
}
module.exports={packageArtifactPaths,resolvePackageOutput,auditPackageArtifacts}
