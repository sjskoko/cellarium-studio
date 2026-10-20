// Optional production dependency: @napi-rs/canvas plus FFmpeg on PATH.
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process'),{once}=require('node:events');
const {createCanvas,GlobalFonts}=require(process.env.CELLARIUM_CANVAS_MODULE||'@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist','story'),review=path.resolve(root,'../../work/cellarium-review');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(review,{recursive:true});
if(process.env.CELLARIUM_FONT)GlobalFonts.registerFromPath(process.env.CELLARIUM_FONT,'Arial');
async function main(){
 const {Model,configFor}=await import('../dist/engine.js'),{drawWorld,drawPoster}=await import('../dist/renderer.js');
 const specs=[
  {id:'01-small-rules',preset:'glider',dim:2,size:24,lines:['Five cells.', 'A moving pattern.'],label:'01 / SMALL RULES',sub:'The pattern shifts. Individual cells stay in place.',speed:3},
  {id:'02-changing-rules',preset:'highlife',dim:2,size:64,lines:['Change one rule.', 'Change the world.'],label:'02 / CUSTOM BIRTH RULES',sub:'HighLife · Birth 3, 6 / Survival 2, 3',speed:8},
  {id:'03-elemental-waves',preset:'elements',dim:2,size:80,lines:['Five states.', 'Local decisions.'],label:'03 / ELEMENTAL WORLDS',sub:'Empty · Water · Fire · Air · Earth',speed:12},
  {id:'04-between-zero-and-one',preset:'fire',dim:2,size:48,lines:['Between 0 and 1,', 'a pattern grows.'],label:'04 / CONTINUOUS STATES',sub:'Lenia · smooth neighborhoods, continuous growth.',speed:20},
  {id:'05-another-dimension',preset:'life',dim:3,size:20,density:.25,lines:['Add a dimension.', 'Find a new world.'],label:'05 / THREE DIMENSIONS',sub:'A cubic lattice · 26 neighbors · B6/S5,6,7',speed:1},
  {id:'06-time-is-a-playground',preset:'water',dim:2,size:48,lines:['Pause the world.', 'Explore its history.'],label:'06 / TIME EXPLORATION',sub:'Deterministic history replay — not reverse physics.',speed:20}
 ];
 const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d');
 for(const spec of specs){
  if(process.env.CELLARIUM_EPISODES&&!process.env.CELLARIUM_EPISODES.split(',').includes(spec.id.slice(0,2)))continue;
  const c=configFor(spec.preset,spec.dim,{size:spec.size,seed:42,...(spec.density?{density:spec.density}:{})}),m=new Model(c),origin=m.snapshot(),frames=[];
  if(spec.id.startsWith('06')){for(let i=0;i<181;i++){frames.push(m.snapshot());m.step();}}
  const file=path.join(out,spec.id+'.mp4');
  const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgba','-video_size','1080x1920','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:['pipe','inherit','inherit'],windowsHide:true});
  const done=new Promise((res,rej)=>{ff.on('error',rej);ff.on('exit',code=>code===0?res():rej(Error('FFmpeg failed '+code)));});
  ff.stdin.on('error',()=>{});
  for(let f=0;f<450;f++){
    const secs=f/30;
    if(frames.length){const g=secs<6?Math.floor(secs*30):secs<9?180:secs<12?Math.max(0,180-Math.floor((secs-9)*60)):Math.floor((secs-12)*30);m.restore(frames[g]);}
    else{const target=Math.floor(secs*spec.speed);while(m.generation<target)m.step();}
    const lines=f<360?spec.lines:['Your rules.', 'Your living world.'];
    const view={yaw:-.7+f*.0015,pitch:.5,depth:1};
    drawPoster(ctx,1080,1920,m,{view,lines,label:spec.label,sub:f<360?spec.sub:'Explore binary, elemental and continuous worlds.',cta:'Try Cellarium — link in bio'});
    ctx.fillStyle='#a5ebd2';ctx.fillRect(81,188,918*f/450,3);
    ctx.fillStyle='#8ba6b2';ctx.font='22px Arial';ctx.fillText('GEN '+String(m.generation).padStart(4,'0')+'  /  '+spec.dim+'D',81,1480);
    if(f===180){fs.writeFileSync(path.join(out,spec.id+'-cover.jpg'),canvas.toBuffer('image/jpeg',92));fs.writeFileSync(path.join(review,spec.id+'-middle.png'),canvas.toBuffer('image/png'));}
    if(f===0||f===420)fs.writeFileSync(path.join(review,spec.id+'-'+f+'.png'),canvas.toBuffer('image/png'));
    if(!ff.stdin.write(ctx.getImageData(0,0,1080,1920).data))await once(ff.stdin,'drain');
  }
  ff.stdin.end();await done;console.log('Rendered '+spec.id+' — '+fs.statSync(file).size+' bytes');
 }
 const labCanvas=createCanvas(640,300),labCtx=labCanvas.getContext('2d'),model=new Model(configFor('water',2,{size:48}));
 drawWorld(labCtx,640,300,model);labCtx.fillStyle='#a5ebd2';labCtx.font='bold 22px Arial';labCtx.fillText('CELLARIUM',24,35);fs.writeFileSync(path.join(out,'lab-preview.png'),labCanvas.toBuffer('image/png'));
 fs.writeFileSync(path.join(out,'render-manifest.json'),JSON.stringify({width:1080,height:1920,fps:30,duration:15,frames:450,seed:42,clips:specs},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
