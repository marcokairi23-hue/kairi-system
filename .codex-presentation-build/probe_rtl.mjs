import fs from 'node:fs';
const s=fs.readFileSync('C:/Users/97250/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs','utf8');
for(const term of ['function rYt','var tf=','rtl','rightToLeft']) {
 let pos=-1, count=0;
 while((pos=s.indexOf(term,pos+1))>=0) { if(term==='rtl' && !s.slice(pos-40,pos+60).includes('bidi') && !s.slice(pos-40,pos+60).includes('paragraph') && !s.slice(pos-40,pos+60).includes('attributes') ) continue; if(term==='rightToLeft' && s.slice(pos,pos+25).includes('Columns'))continue; if(count++<25)console.log(term,s.slice(Math.max(0,pos-120),pos+250)); }
}
