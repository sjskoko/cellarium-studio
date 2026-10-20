import test from 'node:test';
import assert from 'node:assert/strict';
import {Model,History,Clock,configFor,compileExpression,parseCounts} from '../dist/engine.js';
const empty=c=>{const m=new Model(c);m.a.fill(0);m.b.fill(0);return m;};
test('a 2D blinker oscillates every two synchronous generations',()=>{
  const m=empty(configFor('life',2,{size:12}));for(const x of [4,5,6])m.a[m.index(x,5)]=1;
  const before=m.a.slice();m.step();for(const y of [4,5,6])assert.equal(m.a[m.index(5,y)],1);assert.equal(m.a.reduce((s,v)=>s+v),3);m.step();assert.deepEqual(m.a,before);
});
test('a glider translates one cell diagonally in four generations',()=>{
  const m=empty(configFor('life',2,{size:12})),points=[[4,3],[5,4],[3,5],[4,5],[5,5]];
  points.forEach(([x,y])=>m.a[m.index(x,y)]=1);for(let i=0;i<4;i++)m.step();
  assert.equal(m.a.reduce((s,v)=>s+v),5);points.forEach(([x,y])=>assert.equal(m.a[m.index(x+1,y+1)],1));
});
test('3D Moore neighborhood has 26 distinct cells, excludes the center',()=>{
  const m=empty(configFor('life',3,{size:8,birth:[26],survive:[]})),center=m.index(4,4,4);
  for(const [x,y,z]of m.offsets)m.a[m.index(4+x,4+y,4+z)]=1;
  assert.equal(m.offsets.length,26);m.step();assert.equal(m.a[center],1);
});
test('elemental updates use the previous state and first matching rule',()=>{
  const m=empty(configFor('elements',2,{size:8,transitions:[{from:1,to:2,min:1,max:8},{from:1,to:3,min:1,max:8},{from:2,to:3,min:1,max:8}]}));
  m.a[m.index(3,3)]=1;m.a[m.index(4,3)]=2;m.a[m.index(4,4)]=3;m.step();
  assert.equal(m.a[m.index(3,3)],2);assert.equal(m.a[m.index(4,3)],3);
});
test('Lenia preserves a uniform potential and agrees with an independent growth calculation in 2D and 3D',()=>{
  for(const d of [2,3]){
    const c=configFor('water',d,{size:8,mu:.2,sigma:.03,dt:.1}),m=new Model(c);m.a.fill(.21);
    const n=m.a[0],g=2*Math.max(0,1-(n-.2)**2/(9*.03**2))**4-1;
    m.step();assert.ok(Math.abs(m.a[0]-(n+.1*g))<1e-7);
    for(const value of m.a)assert.equal(value,m.a[0]);
  }
});
test('Lenia kernel is normalized and a single impulse matches the spatial convolution in 2D and 3D',()=>{
  for(const dimension of [2,3]){
    const m=empty(configFor('water',dimension,{size:8,radius:3,growth:'n',dt:.1}));
    assert.ok(Math.abs(m.kernelWeights.reduce((s,v)=>s+v,0)-1)<1e-12);
    m.a[0]=1;m.step();
    for(let j=0;j<m.kernelOffsets.length;j++){
      const [x,y,z]=m.kernelOffsets[j],i=m.neighbor(-x,-y,-z);
      assert.ok(Math.abs(m.a[i]-.1*m.kernelWeights[j])<1e-7);
    }
  }
});
test('Lenia fixed boundaries use zero exterior rather than wrapping',()=>{
  const fixed=empty(configFor('water',2,{size:8,radius:3,growth:'n',boundary:'fixed'}));
  const wrap=empty(configFor('water',2,{size:8,radius:3,growth:'n'}));
  fixed.a[0]=1;wrap.a[0]=1;fixed.step();wrap.step();
  assert.equal(fixed.a[7],0);assert.ok(wrap.a[7]>0);
});
test('reference Orbium remains alive and moves under its original polynomial Lenia rule',()=>{
  const m=new Model(configFor('water',2,{size:48}));
  const before=m.a.slice();for(let i=0;i<160;i++)m.step();
  const mass=m.a.reduce((s,v)=>s+v,0);assert.ok(mass>50&&mass<150);
  assert.ok(m.a.some((v,i)=>Math.abs(v-before[i])>.3));
});
test('rewind and replay reconstruct exactly the same state for every kind and dimension',()=>{
  for(const preset of ['life','elements','water'])for(const dim of [2,3]){
    const h=new History(new Model(configFor(preset,dim,{size:8,warmup:0})));
    h.seek(85);const expected=h.model.snapshot();h.seek(3);h.seek(85);
    assert.deepEqual(h.model.a,expected.a);assert.deepEqual(h.model.b,expected.b);
  }
});
test('serialized experiment preserves the origin and future',()=>{
  const c=configFor('water',2,{size:8,warmup:10}),m=new Model(c),origin=m.snapshot();for(let i=0;i<20;i++)m.step();
  const plain=JSON.parse(JSON.stringify({a:[...origin.a],b:[...origin.b],generation:0}));
  const restored=new Model(c,plain);for(let i=0;i<20;i++)restored.step();assert.deepEqual(restored.a,m.a);assert.deepEqual(restored.b,m.b);
});
test('clock counts real elapsed time and rebases after a paused seek',()=>{
  const c=new Clock();c.resume(24,1000);assert.equal(c.target(2500),42);c.pause(42);assert.equal(c.target(99999),42);
  c.resume(12,200000);assert.equal(c.target(201000),24);c.rate=2;assert.equal(c.target(201000),36);
});
test('expressions support arithmetic but reject execution and malformed syntax',()=>{
  const fn=compileExpression('max(0, n*m^2) - abs(s)');
  assert.equal(fn({n:.5,m:2,s:-.2}),1.8);
  for(const expression of ['window.alert(1)','u;process.exit()','u[0]','u +','min(1)','exp(1,2)','constructor(1)'])assert.throws(()=>compileExpression(expression));
});
test('invalid Lenia settings and non-finite custom growth fail visibly',()=>{
  assert.throws(()=>configFor('water',3,{radius:9}));
  assert.throws(()=>configFor('water',2,{sigma:0}));
  assert.throws(()=>configFor('water',2,{beta:[0,0]}));
  const m=new Model(configFor('water',2,{size:8,warmup:0,growth:'1/0'}));assert.throws(()=>m.step(),/non-finite/);
});
test('3D rule count parsing is unambiguous and bounded',()=>{
  assert.deepEqual(parseCounts('3, 10, 26',26),[3,10,26]);assert.deepEqual(parseCounts('',8),[]);
  assert.throws(()=>parseCounts('23',8));assert.throws(()=>parseCounts('2,,3',8));
});
test('all six default combinations stay finite and bounded',()=>{
  for(const preset of ['life','elements','water'])for(const dim of [2,3]){
    const m=new Model(configFor(preset,dim,{size:8,warmup:20}));for(let i=0;i<100;i++)m.step();
    for(const value of m.a)assert.ok(Number.isFinite(value)&&value>=0&&value<=(m.config.kind==='multi'?4:1));
    for(const value of m.b)assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
  }
});
