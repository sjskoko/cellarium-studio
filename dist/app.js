import {Model,Clock,configFor,validateConfig,parseCounts,PRESETS,ELEMENTS,STEP_HZ} from './engine.js';
import {drawWorld,drawPoster,PALETTE} from './renderer.js';
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d');
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'}),clock=new Clock();
let config=configFor(),current=null,busy=true,desired=null,autoplay=false,loadAt=0,toastTimer=0,paint=false,drag=null,recording=null;
let view={yaw:-.65,pitch:.52,depth:1,slice:false,threshold:.09};
let lastFrame=0,lastSubmit=0,started=new Date(),renderDirty=true;
const describe={
  binary:'Each cell is on or off. Birth and survival depend on its immediate neighbors.',
  multi:'Water, fire, air and earth pass through local transition rules, with an empty state for drawing.',
  continuous:'Lenia: a smooth neighborhood and a growth rule create continuous living patterns.'
};
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function fail(message){pause();busy=false;$('loading').hidden=true;$('formError').textContent=message;$('formError').hidden=false;toast(message);}
function saveBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function pressed(selector,test){document.querySelectorAll(selector).forEach(b=>b.setAttribute('aria-pressed',String(test(b))));}
function transitionRow(rule) {
  const row=document.createElement('div');row.className='transition';
  const options=ELEMENTS.map((s,i)=>`<option value="${i}">${s}</option>`).join('');
  row.innerHTML=`<select aria-label="From state" class="from">${options}</select><span aria-hidden="true">→</span><select aria-label="To state" class="to">${options}</select><button type="button" class="remove-rule" aria-label="Remove transition">×</button><div class="range-row">Target neighbors <input aria-label="Minimum target neighbors" class="min" type="number" min="0" max="26"><span>to</span><input aria-label="Maximum target neighbors" class="max" type="number" min="0" max="26"></div>`;
  for(const key of ['from','to','min','max'])row.querySelector('.'+key).value=rule[key];
  row.querySelector('button').onclick=()=>row.remove();$('transitions').append(row);
}
function populate() {
  pressed('[data-kind]',b=>b.dataset.kind===config.kind);pressed('[data-dimension]',b=>+b.dataset.dimension===config.dimension);
  $('preset').replaceChildren(...Object.entries(PRESETS).filter(([,p])=>p.kind===config.kind).map(([key,p])=>{const o=document.createElement('option');o.value=key;o.textContent=p.label;return o;}));
  $('preset').value=config.preset;
  $('kindDescription').textContent=describe[config.kind];$('worldTitle').textContent=config.kind==='continuous'&&config.dimension===3?'Lenia · exploratory 3D field':(PRESETS[config.preset]?.label||'Your experiment')+(config.dimension===3?' · 3D':'');
  $('sceneHint').textContent=config.dimension===3?'Drag to orbit · use Depth to reveal the interior':config.kind==='binary'?'Small decisions. Surprising patterns.':config.kind==='multi'?'Water → fire → air → earth. What changes next?':'A continuous field, from tiny local changes.';
  $('gridBadge').textContent=Array(config.dimension).fill(config.size).join(' × ');
  for(const kind of ['binary','multi','continuous'])$(kind+'Rules').hidden=kind!==config.kind;
  $('volumeControls').hidden=config.dimension!==3;
  $('birth').value=config.birth.join(', ');$('survive').value=config.survive.join(', ');
  $('neighborHelp').textContent=`Use comma-separated counts. ${config.dimension===3?26:8} surrounding neighbors; the cell itself is excluded.`;
  for(const key of ['mu','sigma','theme','radius','dt','growth','kernel','size','seed','density','boundary'])$(key).value=config[key];
  $('beta').value=config.beta.join(', ');$('radius').max=config.dimension===3?6:18;
  $('size').max=config.dimension===3?28:160;$('densityValue').textContent=Math.round(config.density*100)+'%';
  $('density').disabled=config.kind==='continuous';$('densityHint').hidden=config.kind!=='continuous';
  $('transitions').replaceChildren();config.transitions.forEach(transitionRow);
  $('legend').innerHTML=config.kind==='multi'?ELEMENTS.map((s,i)=>`<span><i style="background:${PALETTE[i]}"></i>${s}</span>`).join(''):config.kind==='binary'?'<span><i style="background:#a5ebd2"></i>Alive</span><span><i style="background:#4c626b"></i>Off</span>':'<span>Low concentration</span><span style="color:#a5ebd2">↗ Higher concentration</span>';
  $('formError').hidden=true;renderDirty=true;
}
function setRunningUI() {
  const running=clock.running;$('play').textContent=running?'Ⅱ':'▶';$('play').setAttribute('aria-label',running?'Pause simulation':'Play simulation');
  $('liveMode').setAttribute('aria-pressed',String(running));$('exploreMode').setAttribute('aria-pressed',String(!running));
  for(const id of ['timeInput','timeline','seekButton','back','forward'])$(id).disabled=running;
  $('timeStatus').textContent=running?'Real time · '+clock.rate+'×':'Paused · choose a moment';
}
function pause(){clock.pause(current?.generation||0);autoplay=false;setRunningUI();}
function playNow(){if(!current||busy){autoplay=true;return;}paint=false;updatePaint();clock.resume(current.generation,performance.now());setRunningUI();}
function seek(generation,show=true){
  if(!Number.isSafeInteger(generation)||generation<0||generation>1000000){toast('Choose a time from 0 to 83,333 seconds.');return;}
  desired=generation;busy=true;if(show){$('loading').hidden=false;$('loadingText').textContent='Finding that moment…';}
  worker.postMessage({type:'seek',target:generation});lastSubmit=performance.now();
}
function reset(next,snapshot=null,at=0){
  if(recording){toast('Finish or cancel the recording first.');return;}
  pause();config=validateConfig(next);current=null;desired=null;loadAt=at;busy=true;started=new Date();paint=false;updatePaint();populate();
  $('loading').hidden=false;$('loadingText').textContent='Preparing your world…';
  worker.postMessage({type:'reset',config,snapshot});
}
worker.onmessage=({data})=>{
  if(data.type==='error'){fail(data.message);return;}
  if(data.type==='progress'){$('loadingText').textContent=`Computing generation ${data.generation.toLocaleString()} of ${data.target.toLocaleString()}…`;$('activity').textContent='Calculating every step · no frames skipped';return;}
  if(data.type==='project'){saveBlob(new Blob([JSON.stringify({format:'cellarium-1',...data,config:{...data.config,theme:config.theme},view},null,2)],{type:'application/json'}),'cellarium-experiment.json');toast('Experiment saved, including its initial state and timeline.');return;}
  if(data.type==='frame'){
    current={config:{...data.config,theme:config.theme},n:data.config.size,depth:data.config.dimension===3?data.config.size:1,a:data.a,b:data.b,generation:data.generation,clipped:data.clipped};
    busy=false;renderDirty=true;$('loading').hidden=true;
    const t=current.generation/STEP_HZ;
    if(document.activeElement!==$('timeInput'))$('timeInput').value=t.toFixed(2);
    const max=Math.max(30,Math.ceil(t/30)*30);$('timeline').max=max;$('timeline').value=t;$('horizon').textContent=max+' s';
    $('generation').textContent='Generation '+current.generation.toLocaleString();
    $('activity').textContent=config.kind==='continuous'?`Lenia · ${current.clipped} cells at bounds · R ${config.radius}`:config.dimension===3?`${config.size}³ cells · ${26} neighbors`:`${(config.size**2).toLocaleString()} cells · deterministic seed ${config.seed}`;
    if(loadAt){const at=loadAt;loadAt=0;seek(at);return;}
    if(autoplay){autoplay=false;playNow();}
  }
};
worker.onerror=()=>fail('The simulation worker could not start. Open this page through its web address, not a local file URL.');
function render() {
  if(!current)return;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  drawWorld(ctx,w,h,current,view);renderDirty=false;
}
function tick(now){
  if(clock.running&&!recording&&current&&!busy&&now-lastSubmit>65){
    const target=clock.target(now);
    if(target>1000000){pause();toast('Timeline limit reached. Save this state or start a new experiment.');}
    else if(target>current.generation)seek(target,false);
  }
  if(renderDirty&&now-lastFrame>25){render();lastFrame=now;}
  requestAnimationFrame(tick);
}
new ResizeObserver(()=>renderDirty=true).observe($('canvasWrap'));
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>reset(configFor({binary:'life',multi:'elements',continuous:'water'}[b.dataset.kind],config.dimension,{seed:config.seed})));
document.querySelectorAll('[data-dimension]').forEach(b=>b.onclick=()=>{if(+b.dataset.dimension!==config.dimension)reset(configFor(config.preset,+b.dataset.dimension,{seed:config.seed}));});
$('preset').onchange=()=>reset(configFor($('preset').value,config.dimension,{seed:config.seed}));
$('theme').onchange=()=>{config.theme=$('theme').value;if(current)current.config.theme=config.theme;renderDirty=true;};
$('ruleForm').onsubmit=e=>{
  e.preventDefault();
  try{
    const c=structuredClone(config);
    for(const key of ['mu','sigma','radius','dt','size','seed','density'])c[key]=+$(key).value;
    for(const key of ['theme','boundary','growth','kernel'])c[key]=$(key).value;
    c.beta=$('beta').value.split(',').map(v=>Number(v.trim()));
    const max=c.dimension===3?26:8;c.birth=parseCounts($('birth').value,max);c.survive=parseCounts($('survive').value,max);
    c.transitions=[...$('transitions').children].map(row=>Object.fromEntries(['from','to','min','max'].map(key=>[key,+row.querySelector('.'+key).value])));
    reset(c);toast('New rules applied. This experiment starts at T = 0.');
  }catch(e){$('formError').textContent=e.message;$('formError').hidden=false;}
};
$('density').oninput=()=>$('densityValue').textContent=Math.round($('density').value*100)+'%';
$('addTransition').onclick=()=>{if($('transitions').children.length>=16){toast('Use up to 16 transitions.');return;}transitionRow({from:0,to:1,min:2,max:config.dimension===3?26:8});};
$('play').onclick=()=>clock.running?pause():playNow();$('liveMode').onclick=playNow;$('exploreMode').onclick=pause;
$('seekButton').onclick=()=>{pause();seek(Math.round(+$('timeInput').value*STEP_HZ));};
$('timeInput').onkeydown=e=>{if(e.key==='Enter')$('seekButton').click();};
$('timeline').oninput=()=>{pause();seek(Math.round(+$('timeline').value*STEP_HZ));};
$('back').onclick=()=>{pause();seek(Math.max(0,(current?.generation||0)-1));};
$('forward').onclick=()=>{pause();seek((current?.generation||0)+1);};
$('restart').onclick=()=>{pause();seek(0);};
$('speed').onchange=()=>{const running=clock.running;pause();clock.rate=+$('speed').value;if(running)playNow();};
$('cancelSeek').onclick=()=>{pause();worker.postMessage({type:'cancel'});};
$('depth').oninput=()=>{view.depth=+$('depth').value;renderDirty=true;};
$('slice').onchange=()=>{view.slice=$('slice').checked;renderDirty=true;};
$('resetView').onclick=()=>{view={yaw:-.65,pitch:.52,depth:1,slice:false,threshold:.09};$('depth').value=1;$('slice').checked=false;renderDirty=true;};
$('snapshotButton').onclick=()=>{render();canvas.toBlob(blob=>{if(blob)saveBlob(blob,'cellarium-'+(current?.generation||0)+'.png');});};
$('fullscreenButton').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.stage').requestFullscreen();}catch{toast('Fullscreen is not supported here.');}};
function updatePaint(){$('paintToggle').setAttribute('aria-pressed',String(paint));$('paintLabel').hidden=!paint;$('paintToggle').textContent=paint?'✓ Painting':'✎ Paint cells';}
$('paintToggle').onclick=()=>{if(config.dimension===3&&!view.slice){view.slice=true;$('slice').checked=true;renderDirty=true;toast('Slice view enabled for precise 3D painting.');}pause();paint=!paint;updatePaint();};
function paintAt(e){
  if(!current||busy)return;
  const rect=canvas.getBoundingClientRect(),side=Math.min(rect.width,rect.height)*.92;
  const x=Math.floor((e.clientX-rect.left-(rect.width-side)/2)/side*config.size),y=Math.floor((e.clientY-rect.top-(rect.height-side)/2)/side*config.size);
  if(x<0||y<0||x>=config.size||y>=config.size)return;
  const z=config.dimension===3?Math.round(view.depth*(config.size-1)):0,i=x+config.size*(y+config.size*z),value=+$('brush').value;
  if(config.kind==='continuous'){current.a[i]=value?.8:0;current.b[i]=0;}else current.a[i]=config.kind==='binary'?+(value>0):value;
  renderDirty=true;
}
canvas.onpointerdown=e=>{if(!current||busy||recording)return;canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,moved:false};if(paint)paintAt(e);};
canvas.onpointermove=e=>{if(!drag)return;if(paint){paintAt(e);drag.moved=true;}else if(config.dimension===3){view.yaw+=(e.clientX-drag.x)*.009;view.pitch=Math.max(-.9,Math.min(1.2,view.pitch+(e.clientY-drag.y)*.006));drag.x=e.clientX;drag.y=e.clientY;renderDirty=true;}};
canvas.onpointerup=()=>{if(drag&&paint&&current){const snapshot={a:current.a,b:current.b,generation:0};worker.postMessage({type:'reset',config,snapshot});busy=true;toast('Your drawing is the new initial state at T = 0.');}drag=null;};
canvas.onpointercancel=()=>drag=null;
$('saveProject').onclick=()=>{pause();worker.postMessage({type:'export'});};
$('loadProject').onclick=()=>$('projectFile').click();
$('projectFile').onchange=async()=>{
  try{const file=$('projectFile').files[0];if(!file)return;if(file.size>4_000_000)throw Error('Choose an experiment smaller than 4 MB.');
    const data=JSON.parse(await file.text());if(data.format!=='cellarium-1')throw Error('Choose a Cellarium experiment file.');
    const c=validateConfig(data.config);if(!Number.isInteger(data.generation)||data.generation<0||data.generation>1000000)throw Error('Invalid saved time.');
    new Model(c,data.origin);view={yaw:-.65,pitch:.52,depth:1,slice:false,threshold:.09};reset(c,data.origin,data.generation);toast('Experiment restored, including its original timeline.');
  }catch(e){fail(e.message);}finally{$('projectFile').value='';}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(clock.running){pause();toast('Paused while the tab was hidden.');}if(recording)recording.cancel();}});
const guideHTML=`<h3>1. Choose a world</h3><p>Binary cells turn on and off. Elements use five discrete states: empty, water, fire, air and earth. Lenia fields store one continuous value between 0 and 1. Water and fire are visual themes, not fluid or combustion physics.</p>
<h3>2. Change one rule</h3><p>Binary rules count the surrounding 8 neighbors in 2D or 26 in 3D. Elemental transitions count neighbors in their target state; the first matching rule wins. All cells update from the same previous generation. Lenia uses a normalized radial kernel to average a circular neighborhood in 2D or a spherical neighborhood in 3D. A growth function maps that average to a change, followed by clipping to [0,1]. Radius R, growth center μ, growth width σ and numerical Δt are editable. Advanced controls expose kernel shape, ring weights and the growth formula.</p>
<h3>3. Make time your playground</h3><p>T is elapsed playback time in seconds, with 12 fixed generations per second at 1×. Numerical Δt is a separate integration parameter. Live uses a monotonic real-time clock. Pause, enter T or drag the timeline, and resume from that point. Long jumps are computed without skipping generations. “Stop here” ends the jump. Hidden tabs pause automatically.</p><p>History is reconstructed from deterministic initial data and checkpoints. This is history replay, not a mathematically reversible cellular automaton. Changing rules or painting starts a new T = 0. The 2D Orbium and Rotorbium seeds are from Bert Chan’s original Lenia notebook. 3D uses an exploratory seeded field; a 2D organism is not guaranteed to survive in 3D.</p>
<h3>4. Go into three dimensions</h3><p>The 3D mode simulates a real cubic lattice. Drag to orbit. Depth cuts away layers; Slice shows one exact layer. Paint in a slice to edit individual cells. Small voxels are drawn with a depth-sorted projection, rather than a full physical volume renderer.</p>
<h3>5. Keep it</h3><p>Save an experiment to preserve the initial field, rules and observed generation. Open it to reconstruct the same timeline. Record exports a silent 720 × 1280 vertical clip; format depends on your browser. A finished 1080 × 1920 MP4 is available on the film page.</p>
<h3>Mathematics & sources</h3><ul><li><a href="https://golly.sourceforge.io/Help/Algorithms/QuickLife.html" target="_blank" rel="noreferrer">Golly: Life-like B/S rules</a></li><li><a href="https://wpmedia.wolfram.com/sites/13/2018/02/01-3-1.pdf" target="_blank" rel="noreferrer">Carter Bays: three-dimensional Life</a> (3D default B6/S5,6,7)</li><li><a href="https://arxiv.org/abs/2108.06404" target="_blank" rel="noreferrer">Cyclic cellular automata</a> — inspiration for editable elemental transitions, not a proof of behavior on this grid.</li><li><a href="https://github.com/Chakazul/Lenia" target="_blank" rel="noreferrer">Bert Chan: Lenia, original code and organisms</a> · <a href="./LENIA-LICENSE.txt">MIT license</a></li><li><a href="https://arxiv.org/abs/1812.05433" target="_blank" rel="noreferrer">Lenia: Biology of Artificial Life</a></li></ul><p>Wrapped edges are periodic. Fixed edges have zero exterior state for all models. Lenia clips to [0,1] as part of its rule; the number of bounded cells is shown. Custom growth functions can create extinction, saturation or unstable behavior.</p><p>Everything is computed in your browser. No uploaded experiment is sent to a server.</p>`;
function showGuide(){$('guideContent').innerHTML=guideHTML;$('guide').showModal();}
for(const id of ['helpButton','timeInfo','sourcesButton'])$(id).onclick=showGuide;
$('closeGuide').onclick=()=>$('guide').close();
$('guide').onclick=e=>{if(e.target===$('guide'))$('guide').close();};
$('recordButton').onclick=async()=>{
  if(!current||busy||recording)return;
  if(!canvas.captureStream||typeof MediaRecorder==='undefined'){toast('This browser cannot record video. Download the finished film on the film page.');return;}
  pause();paint=false;updatePaint();
  const mime=['video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp9','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mime){toast('No supported video encoder.');return;}
  try{
    const film=document.createElement('canvas');film.width=720;film.height=1280;const fc=film.getContext('2d'),m=new Model(config,{a:current.a,b:current.b,generation:current.generation});
    const origin=m.generation,start=performance.now(),stream=film.captureStream(30),rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000}),chunks=[];
    let cancelled=false,frameId=0;
    const cleanup=()=>{cancelAnimationFrame(frameId);stream.getTracks().forEach(t=>t.stop());recording=null;$('cancelRecord').hidden=true;$('recordButton').disabled=false;};
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    rec.onstop=()=>{cleanup();if(!cancelled&&chunks.length){const ext=mime.includes('mp4')?'mp4':'webm';saveBlob(new Blob(chunks,{type:mime}),`cellarium-reel.${ext}`);$('recordStatus').textContent=`Saved 720 × 1280 ${ext.toUpperCase()}. ${ext==='webm'?'Convert to MP4 before Instagram import.':'Ready for review.'}`;}else $('recordStatus').textContent='Recording cancelled.';};
    rec.onerror=()=>{cancelled=true;cleanup();toast('Video encoder failed. Try another browser.');};
    recording={cancel:()=>{cancelled=true;if(rec.state!=='inactive')rec.stop();else cleanup();}};
    $('cancelRecord').hidden=false;$('recordButton').disabled=true;
    drawPoster(fc,720,1280,m,{view,label:'YOUR RULES. YOUR WORLD.'});rec.start(250);
    function frame(now){
      if(!recording)return;const seconds=Math.min(15,(now-start)/1000),target=origin+Math.floor(seconds*STEP_HZ);
      try{while(m.generation<target)m.step();drawPoster(fc,720,1280,m,{view,label:'YOUR RULES. YOUR WORLD.',sub:`${config.kind} · ${config.dimension}D · generation ${m.generation}`});}
      catch(e){recording.cancel();toast(e.message);return;}
      $('recordStatus').textContent=`Recording ${seconds.toFixed(1)} / 15 s. Keep this tab visible.`;
      if(seconds>=15){rec.stop();return;}frameId=requestAnimationFrame(frame);
    }
    frameId=requestAnimationFrame(frame);
  }catch(e){recording=null;$('cancelRecord').hidden=true;$('recordButton').disabled=false;toast('Recording could not start: '+e.message);}
};
$('cancelRecord').onclick=()=>recording?.cancel();
const params=new URLSearchParams(location.search),preset=params.get('preset')||'water',dimension=params.get('dim')==='3'?3:2;
const seed=Number(params.get('seed')||42);
try{reset(configFor(preset,dimension,{seed:Number.isInteger(seed)&&seed>=0&&seed<=4294967295?seed:42}));}catch{reset(configFor());}
requestAnimationFrame(tick);
