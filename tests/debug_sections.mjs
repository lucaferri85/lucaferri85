import fs from 'fs';
import { detectLandmarks } from '/app/frontend/src/lib/landmarkDetector.js';
import { sampleTriangles } from '/app/frontend/src/lib/meshSampler.js';
const verts=[],tris=[]; for (const line of fs.readFileSync(process.argv[2],'utf8').split('\n')) { const t=line.trim().split(/\s+/); if (t[0]==='v') verts.push([+t[1],+t[2],+t[3]]); else if (t[0]==='f') { const f=t.slice(1).map(k=>verts[parseInt(k,10)-1]); for (let i=1;i+1<f.length;i++) tris.push([...f[0],...f[i],...f[i+1]]); } } const pts=sampleTriangles(tris,80000);
let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9]; for (const p of pts) for (let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}
const s=1.75/(mx[1]-mn[1]); const norm=pts.map(p=>[(p[0]-(mn[0]+mx[0])/2)*s,(p[1]-mn[1])*s,(p[2]-(mn[2]+mx[2])/2)*s]);
const r=detectLandmarks(norm,{debug:true});
for (const sec of r.sections) { const f=sec.y/r.height; if (f<0.40||f>0.95) continue; if (Math.round(f*140)%3) continue;
 console.log((f*100).toFixed(0)+'%', sec.clusters.map(c=>`[${c.minx.toFixed(2)}..${c.maxx.toFixed(2)} n${c.n} cx${c.cx.toFixed(2)}]`).join(' ')); }
