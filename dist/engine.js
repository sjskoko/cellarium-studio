import {ORBIUM,ROTORBIUM} from './lenia-seeds.js';
// Pure synchronous mathematics shared by the worker, tests and film renderer.
export const STEP_HZ = 12;
export const ELEMENTS = ['Empty', 'Water', 'Fire', 'Air', 'Earth'];
export const DEFAULT_TRANSITIONS = [
  {from: 1, to: 2, min: 2, max: 26}, {from: 2, to: 3, min: 2, max: 26},
  {from: 3, to: 4, min: 2, max: 26}, {from: 4, to: 1, min: 2, max: 26},
  {from: 0, to: 1, min: 2, max: 26}
];
export const PRESETS = {
  life: {label: 'Game of Life', kind: 'binary', birth: [3], survive: [2,3], pattern:'random', density:.28},
  glider: {label: 'Glider garden', kind:'binary', birth:[3], survive:[2,3], pattern:'gliders', density:.2},
  highlife: {label: 'HighLife', kind:'binary', birth:[3,6], survive:[2,3], pattern:'random', density:.3},
  seeds: {label:'Seeds', kind:'binary', birth:[2], survive:[], pattern:'random', density:.08},
  elements: {label:'Elemental waves', kind:'multi', pattern:'random', density:1},
  islands: {label:'Elemental islands', kind:'multi', pattern:'islands', density:.85},
  water: {label:'Lenia · Orbium / water', kind:'continuous', mu:.15, sigma:.014, theme:'water', pattern:'orbium'},
  fire: {label:'Lenia · Rotorbium / fire', kind:'continuous', mu:.156, sigma:.0224, theme:'fire', pattern:'rotorbium'},
  coral: {label:'Lenia · Seeded field', kind:'continuous', mu:.15, sigma:.022, theme:'coral', pattern:'field'}
};
export function configFor(preset='water', dimension=2, overrides={}) {
  const p=PRESETS[preset] || PRESETS.water;
  return validateConfig({
    kind:p.kind, dimension, size:dimension===3?20:64, preset, seed:42, density:.28,
    boundary:'wrap', warmup:0, birth:dimension===3?[6]:[3], survive:dimension===3?[5,6,7]:[2,3],
    transitions:structuredClone(DEFAULT_TRANSITIONS), radius:dimension===3?3:Math.min(13,Math.floor((overrides.size||64)/2)-1),
    mu:.15,sigma:.014,dt:.1,beta:[1],kernel:'polynomial',theme:'water',pattern:'random',
    growth:'2*max(0,1-((n-m)^2)/(9*s*s))^4-1',
    ...p, ...(dimension===3 && p.kind==='binary'?{birth:[6],survive:[5,6,7],pattern:'random',density:.22}:{}),
    ...(dimension===3&&p.kind==='continuous'?{mu:.26,sigma:.045,pattern:'field'}:{}),
    ...overrides
  });
}
function finite(x,min,max,name) {
  if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max) throw Error(`${name} must be between ${min} and ${max}.`);
  return x;
}
export function parseCounts(value, max) {
  if(!String(value).trim()) return [];
  const parts=String(value).split(',').map(x=>x.trim());
  if(parts.some(x=>!/^\d+$/.test(x))) throw Error('Separate neighbor counts with commas, for example 3, 6.');
  const counts=[...new Set(parts.map(Number))].sort((a,b)=>a-b);
  if(counts.some(x=>x>max)) throw Error(`Neighbor counts must be between 0 and ${max}.`);
  return counts;
}
// A small arithmetic grammar, never eval/Function. Bounded expression length and depth.
export function compileExpression(source) {
  if(typeof source!=='string'||source.length>220) throw Error('Use a formula of at most 220 characters.');
  const tokens=source.match(/\d*\.?\d+(?:e[+-]?\d+)?|[A-Za-z]\w*|[()+*/^,-]/g)||[];
  if(tokens.join('')!==source.replace(/\s/g,'')) throw Error('Unsupported formula character.');
  let at=0,depth=0;
  const names=new Set(['n','m','s']);
  const funcs={abs:Math.abs,min:Math.min,max:Math.max,exp:Math.exp,sin:Math.sin,cos:Math.cos};
  function atom() {
    if(++depth>24)throw Error('Formula is too deeply nested.');
    const t=tokens[at++]; let fn;
    if(t==='+'||t==='-'){const a=atom();fn=t==='-'?s=>-a(s):a;}
    else if(t==='('){fn=sum();if(tokens[at++]!==')')throw Error('Missing closing parenthesis.');}
    else if(/^(?:\d|\.)/.test(t||'')){const n=Number(t);if(!Number.isFinite(n))throw Error('Invalid number.');fn=()=>n;}
    else if(names.has(t))fn=s=>s[t];
    else if(Object.hasOwn(funcs,t)){
      if(tokens[at++]!=='(')throw Error(`Use ${t}(…).`);
      const args=[sum()];while(tokens[at]===','){at++;args.push(sum());}
      if(tokens[at++]!==')')throw Error('Missing function parenthesis.');
      if((['min','max'].includes(t)&&args.length!==2)||(!['min','max'].includes(t)&&args.length!==1))throw Error(`Invalid argument count for ${t}.`);
      fn=s=>funcs[t](...args.map(a=>a(s)));
    } else throw Error(`Unknown formula term: ${t||'end'}.`);
    depth--; return fn;
  }
  function power(){let a=atom();if(tokens[at]==='^'){at++;const l=a,r=power();a=s=>l(s)**r(s);}return a;}
  function product(){let a=power();while(['*','/'].includes(tokens[at])){const op=tokens[at++],l=a,r=power();a=op==='*'?s=>l(s)*r(s):s=>l(s)/r(s);}return a;}
  function sum(){let a=product();while(['+','-'].includes(tokens[at])){const op=tokens[at++],l=a,r=product();a=op==='+'?s=>l(s)+r(s):s=>l(s)-r(s);}return a;}
  const fn=sum();if(at!==tokens.length)throw Error('Unexpected formula term.');
  return fn;
}
export function validateConfig(input) {
  const c=structuredClone(input);
  if(!['binary','multi','continuous'].includes(c.kind))throw Error('Choose a cell type.');
  if(![2,3].includes(c.dimension))throw Error('Choose 2D or 3D.');
  const limit=c.dimension===3?28:160;
  finite(c.size,8,limit,'Grid size');if(!Number.isInteger(c.size))throw Error('Grid size must be an integer.');
  finite(c.seed,0,4294967295,'Seed');if(!Number.isInteger(c.seed))throw Error('Seed must be an integer.');
  finite(c.density,0,1,'Density');
  c.warmup=c.warmup??0;finite(c.warmup,0,2000,'Initial field preparation');if(!Number.isInteger(c.warmup))throw Error('Preparation steps must be an integer.');
  if(!['wrap','fixed'].includes(c.boundary))throw Error('Choose wrapped or fixed edges.');
  const max=c.dimension===3?26:8;
  for(const key of ['birth','survive']) {
    if(!Array.isArray(c[key])||c[key].some(n=>!Number.isInteger(n)||n<0||n>max))throw Error(`Invalid ${key} counts (0–${max}).`);
    c[key]=[...new Set(c[key])];
  }
  if(!Array.isArray(c.transitions)||c.transitions.length>16)throw Error('Use at most 16 transition rules.');
  for(const r of c.transitions) {
    for(const key of ['from','to'])if(!Number.isInteger(r[key])||r[key]<0||r[key]>4)throw Error('Invalid elemental state.');
    if(!Number.isInteger(r.min)||!Number.isInteger(r.max)||r.min<0||r.max>26||r.min>r.max)throw Error('Invalid transition count range.');
  }
  finite(c.radius,2,Math.min(c.dimension===3?6:18,Math.floor(c.size/2)-1),'Kernel radius');
  finite(c.mu,.01,.99,'Growth center');finite(c.sigma,.001,.3,'Growth width');finite(c.dt,.01,.5,'Numerical step');
  if(!['polynomial','exponential'].includes(c.kernel))throw Error('Choose a kernel shape.');
  if(!Array.isArray(c.beta)||!c.beta.length||c.beta.length>4||c.beta.some(b=>!Number.isFinite(b)||b<0||b>1)||!c.beta.some(b=>b>0))throw Error('Use 1 to 4 ring weights between 0 and 1, at least one positive.');
  compileExpression(c.growth);
  if(!['water','fire','coral'].includes(c.theme))c.theme='water';
  return c;
}
function random(seed){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export class Model {
  constructor(config, snapshot=null) {
    this.config=validateConfig(config);this.n=this.config.size;
    this.depth=this.config.dimension===3?this.n:1;this.length=this.n*this.n*this.depth;
    this.a=new Float32Array(this.length);this.b=new Float32Array(this.length);
    this.nextA=new Float32Array(this.length);this.nextB=new Float32Array(this.length);
    this.generation=0;this.clipped=0;
    this.growth=compileExpression(this.config.growth);
    this.standard=this.config.growth.replace(/\s/g,'')==='2*max(0,1-((n-m)^2)/(9*s*s))^4-1';
    this.offsets=[];
    for(let z=this.depth===1?0:-1;z<=(this.depth===1?0:1);z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)if(x||y||z)this.offsets.push([x,y,z]);
    this.neighbors=new Int32Array(this.length*this.offsets.length);
    this.faces=new Int32Array(this.length*2*this.config.dimension);
    for(let z=0;z<this.depth;z++)for(let y=0;y<this.n;y++)for(let x=0;x<this.n;x++){
      const i=this.index(x,y,z);
      this.offsets.forEach(([dx,dy,dz],j)=>this.neighbors[i*this.offsets.length+j]=this.neighbor(x+dx,y+dy,z+dz));
      let j=0;for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],...(this.depth>1?[[0,0,1],[0,0,-1]]:[])])this.faces[i*2*this.config.dimension+j++]=this.neighbor(x+dx,y+dy,z+dz);
    }
    if(this.config.kind==='continuous')this.buildKernel();
    if(snapshot)this.restore(snapshot);else {this.seed();if(this.config.kind==='continuous')for(let j=0;j<this.config.warmup;j++)this.step();this.generation=0;}
  }
  index(x,y,z=0){return x+this.n*(y+this.n*z);}
  neighbor(x,y,z){
    if(this.config.boundary==='wrap')return this.index((x+this.n)%this.n,(y+this.n)%this.n,(z+this.depth)%this.depth);
    if(x<0||y<0||z<0||x>=this.n||y>=this.n||z>=this.depth)return -1;
    return this.index(x,y,z);
  }
  seed() {
    const c=this.config,rng=random(c.seed),n=this.n;
    if(c.kind==='continuous'){
      this.a.fill(0);this.b.fill(0);
      if(this.depth===1&&['orbium','rotorbium'].includes(c.pattern)){
        const cells=c.pattern==='orbium'?ORBIUM:ROTORBIUM,scale=c.radius/13,w=Math.max(1,Math.round(cells[0].length*scale)),h=Math.max(1,Math.round(cells.length*scale));
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const sx=Math.min(cells[0].length-1,Math.floor(x/scale)),sy=Math.min(cells.length-1,Math.floor(y/scale));
          this.a[this.index(Math.floor((n-w)/2)+x,Math.floor((n-h)/2)+y)]=cells[sy][sx];
        }
      }else{
        for(let z=0;z<this.depth;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
          const d=Math.hypot(x-n/2,y-n/2,this.depth>1?z-n/2:0);
          if(d<n*.32)this.a[this.index(x,y,z)]=.15+rng()*.45;
        }
      }
    }else if(c.kind==='binary'&&c.pattern==='gliders'&&this.depth===1){
      for(let y=4;y<n-4;y+=16)for(let x=4;x<n-4;x+=16)for(const [dx,dy] of [[1,0],[2,1],[0,2],[1,2],[2,2]])this.a[this.index(x+dx,y+dy)]=1;
    }else{
      for(let i=0;i<this.length;i++){
        if(c.kind==='binary')this.a[i]=rng()<c.density?1:0;
        else this.a[i]=rng()<c.density?(c.pattern==='islands'?1+(Math.floor((i%n)/8)+Math.floor(Math.floor(i/n)%n/8))%4:1+Math.floor(rng()*4)):0;
      }
    }
  }
  buildKernel(){
    const c=this.config,r=Math.ceil(c.radius),offsets=[],weights=[];
    for(let z=this.depth>1?-r:0;z<=(this.depth>1?r:0);z++)for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){
      const d=Math.hypot(x,y,z)/c.radius;if(d>=1)continue;
      const br=d*c.beta.length,ring=Math.min(c.beta.length-1,Math.floor(br)),q=br-ring;
      const core=c.kernel==='polynomial'?(4*q*(1-q))**4:(q>0&&q<1?Math.exp(4-1/(q*(1-q))):0);
      const w=c.beta[ring]*core;if(w>1e-14){offsets.push([x,y,z]);weights.push(w);}
    }
    const sum=weights.reduce((a,b)=>a+b,0);if(!sum)throw Error('Kernel has no sampled weights; increase its radius.');
    this.kernelWeights=Float64Array.from(weights,w=>w/sum);this.kernelOffsets=offsets;
    this.kernelNeighbors=new Int32Array(this.length*weights.length);
    for(let z=0;z<this.depth;z++)for(let y=0;y<this.n;y++)for(let x=0;x<this.n;x++){
      const base=this.index(x,y,z)*weights.length;
      for(let j=0;j<offsets.length;j++){const [dx,dy,dz]=offsets[j];this.kernelNeighbors[base+j]=this.neighbor(x+dx,y+dy,z+dz);}
    }
  }
  step() {
    const c=this.config,a=this.a,b=this.b,na=this.nextA,nb=this.nextB,m=this.offsets.length,faces=2*c.dimension;
    let clipped=0;
    const counts=new Int16Array(5);
    for(let i=0;i<this.length;i++){
      if(c.kind==='continuous'){
        let potential=0;const count=this.kernelWeights.length,offset=i*count;
        for(let j=0;j<count;j++){const index=this.kernelNeighbors[offset+j];if(index>=0)potential+=a[index]*this.kernelWeights[j];}
        const distance=(potential-c.mu)/c.sigma;
        const g=this.standard?2*Math.max(0,1-distance*distance/9)**4-1:this.growth({n:potential,m:c.mu,s:c.sigma});
        const value=a[i]+c.dt*g;
        if(!Number.isFinite(value))throw Error('The growth formula produced a non-finite value. Adjust the formula.');
        if(value<0||value>1)clipped++;
        na[i]=Math.max(0,Math.min(1,value));nb[i]=0;
      }else if(c.kind==='binary'){
        let neighbors=0;for(let j=0;j<m;j++){const k=this.neighbors[i*m+j];if(k>=0)neighbors+=a[k];}
        na[i]=(a[i]?c.survive:c.birth).includes(neighbors)?1:0;
      }else{
        counts.fill(0);for(let j=0;j<m;j++){const k=this.neighbors[i*m+j];if(k>=0)counts[a[k]]++;}
        let value=a[i];
        for(const rule of c.transitions)if(rule.from===a[i]&&counts[rule.to]>=rule.min&&counts[rule.to]<=rule.max){value=rule.to;break;}
        na[i]=value;
      }
    }
    [this.a,this.nextA]=[this.nextA,this.a];[this.b,this.nextB]=[this.nextB,this.b];
    this.generation++;this.clipped=clipped;
  }
  snapshot(){return{a:this.a.slice(),b:this.b.slice(),generation:this.generation,clipped:this.clipped};}
  restore(s){
    if(s.a?.length!==this.length||s.b?.length!==this.length||!Number.isInteger(s.generation)||s.generation<0)throw Error('Snapshot does not match the grid.');
    for(let i=0;i<this.length;i++){
      if(!Number.isFinite(s.a[i])||!Number.isFinite(s.b[i]))throw Error('Invalid snapshot values.');
      if(this.config.kind==='continuous'){if(s.a[i]<0||s.a[i]>1||s.b[i]<0||s.b[i]>1)throw Error('Concentrations must be in [0,1].');}
      else if(!Number.isInteger(s.a[i])||s.a[i]<0||s.a[i]>(this.config.kind==='binary'?1:4))throw Error('Invalid discrete cell state.');
    }
    this.a.set(s.a);this.b.set(s.b);this.generation=s.generation;this.clipped=s.clipped||0;
  }
}
export class History {
  constructor(model){this.model=model;this.checkpoints=new Map([[0,model.snapshot()]]);}
  resetOrigin(){this.model.generation=0;this.checkpoints=new Map([[0,this.model.snapshot()]]);}
  prepare(target){
    if(!Number.isSafeInteger(target)||target<0||target>1000000)throw Error('Choose a generation between 0 and 1,000,000.');
    if(target<this.model.generation){
      const keys=[...this.checkpoints.keys()].filter(x=>x<=target);
      this.model.restore(this.checkpoints.get(Math.max(...keys)));
    } else {
      const best=Math.max(...[...this.checkpoints.keys()].filter(x=>x<=target));
      if(best>this.model.generation)this.model.restore(this.checkpoints.get(best));
    }
  }
  advance(){this.model.step();if(this.model.generation%40===0){this.checkpoints.set(this.model.generation,this.model.snapshot());if(this.checkpoints.size>96){const key=[...this.checkpoints.keys()].filter(x=>x!==0).sort((a,b)=>a-b)[0];this.checkpoints.delete(key);}}}
  seek(target){this.prepare(target);while(this.model.generation<target)this.advance();return this.model;}
}
export class Clock {
  constructor(hz=STEP_HZ){this.hz=hz;this.rate=1;this.anchor=0;this.anchorMs=0;this.running=false;}
  target(now){return this.running?Math.floor(this.anchor+(now-this.anchorMs)/1000*this.hz*this.rate):this.anchor;}
  resume(generation,now){this.anchor=generation;this.anchorMs=now;this.running=true;}
  pause(generation){this.anchor=generation;this.running=false;}
}
