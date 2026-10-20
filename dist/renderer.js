export const PALETTE=['#101b24','#67c9ef','#ff855e','#d5d1f9','#a2c98c'];
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
export function cellColor(kind,a,b,theme='water'){
  if(kind==='binary')return a?'#a5ebd2':'#101b24';
  if(kind==='multi')return PALETTE[a]||PALETTE[0];
  const stops=theme==='fire'?[[19,25,34],[170,57,46],[255,195,112]]:theme==='coral'?[[19,25,34],[164,79,106],[255,203,184]]:[[16,27,36],[40,126,153],[162,239,222]];
  const t=Math.min(1,a),c=t<.5?mix(stops[0],stops[1],t*2):mix(stops[1],stops[2],(t-.5)*2);
  return `rgb(${c.join(',')})`;
}
export function drawWorld(ctx, width,height,model,view={}) {
  ctx.save();ctx.fillStyle=view.background||'#101922';ctx.fillRect(0,0,width,height);
  const c=model.config,n=model.n;
  if(c.dimension===2||view.slice){
    const side=Math.min(width,height)*.92,dx=(width-side)/2,dy=(height-side)/2,s=side/n;
    const z=c.dimension===3?Math.min(n-1,Math.round((view.depth??1)*(n-1))):0;
    const gap=c.kind==='continuous'?0:Math.min(.8,s*.12);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=x+n*(y+n*z);ctx.fillStyle=cellColor(c.kind,model.a[i],model.b[i],c.theme);
      ctx.fillRect(dx+x*s,dy+y*s,Math.ceil(s-gap),Math.ceil(s-gap));
    }
    if(c.kind!=='continuous'){
      ctx.strokeStyle='#50626a';ctx.lineWidth=.6;ctx.strokeRect(dx-.5,dy-.5,side+1,side+1);
    }
  }else{
    const yaw=view.yaw??-.65,pitch=view.pitch??.52,co=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const scale=Math.min(width,height)/(n*1.8),cut=Math.max(1,Math.round(n*(view.depth??1))),cells=[];
    const project=(x,y,z)=>{const xx=x*co-z*si,zz=x*si+z*co;return[xx,-y*cp+zz*sp,zz*cp+y*sp];};
    for(let z=0;z<cut;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=x+n*(y+n*z),value=model.a[i];
      if(value<(c.kind==='continuous'?(view.threshold??.09):.5))continue;
      const p=project(x-n/2,y-n/2,z-n/2);cells.push({p,i});
    }
    cells.sort((a,b)=>a.p[2]-b.p[2]);
    const size=scale*.82;
    for(const {p,i} of cells){
      const x=width/2+p[0]*scale,y=height*.51+p[1]*scale;
      ctx.fillStyle=cellColor(c.kind,model.a[i],model.b[i],c.theme);
      ctx.globalAlpha=.72+Math.min(.28,(p[2]+n)/(2*n)*.28);
      ctx.fillRect(x-size/2,y-size/2,size,size);
      if(size>4){ctx.fillStyle='rgba(255,255,255,.23)';ctx.fillRect(x-size/2,y-size/2,size,Math.max(1,size*.14));}
    }
    ctx.globalAlpha=1;
    ctx.strokeStyle='#3a5665';ctx.lineWidth=1;
    for(const [start,end]of [[[-n/2,-n/2,-n/2],[n/2,-n/2,-n/2]],[[-n/2,-n/2,-n/2],[-n/2,n/2,-n/2]],[[-n/2,-n/2,-n/2],[-n/2,-n/2,n/2]]]){
      const a=project(...start),b=project(...end);ctx.beginPath();ctx.moveTo(width/2+a[0]*scale,height*.51+a[1]*scale);ctx.lineTo(width/2+b[0]*scale,height*.51+b[1]*scale);ctx.stroke();
    }
  }
  ctx.restore();
}
export function drawPoster(ctx,w,h,model,options={}){
  const accent='#a5ebd2';ctx.fillStyle='#101922';ctx.fillRect(0,0,w,h);
  ctx.fillStyle=accent;ctx.font=`600 ${Math.round(w*.027)}px Arial`;ctx.fillText('CELLARIUM  /  INTERACTIVE LAB',w*.075,h*.087);
  ctx.fillStyle='#f0f3ef';ctx.font=`600 ${Math.round(w*.071)}px Arial`;
  const lines=options.lines||['Small rules.', 'Living worlds.'];lines.forEach((s,i)=>ctx.fillText(s,w*.075,h*(.16+i*.05)));
  ctx.save();ctx.translate(w*.04,h*.27);drawWorld(ctx,w*.92,h*.49,model,options.view||{});ctx.restore();
  ctx.fillStyle=accent;ctx.font=`600 ${Math.round(w*.025)}px Arial`;ctx.fillText(options.label||'CHANGE A RULE. WATCH A WORLD.',w*.075,h*.81);
  ctx.fillStyle='#b6c7c9';ctx.font=`${Math.round(w*.025)}px Arial`;ctx.fillText(options.sub||'Binary · Elements · Continuous · 2D / 3D',w*.075,h*.848);
  ctx.fillStyle='#edf3ed';ctx.font=`600 ${Math.round(w*.03)}px Arial`;ctx.fillText(options.cta||'Build your world — link in bio ↗',w*.075,h*.913);
}
