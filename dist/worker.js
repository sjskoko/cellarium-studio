import {Model,History} from './engine.js';
let history=null,serial=0;
const send=()=>{const m=history.model,s=m.snapshot();postMessage({type:'frame',...s,config:m.config},[s.a.buffer,s.b.buffer]);};
onmessage=async({data})=>{
  if(data.type==='export'&&history){const s=history.checkpoints.get(0);postMessage({type:'project',config:history.model.config,origin:{a:Array.from(s.a),b:Array.from(s.b),generation:0},generation:history.model.generation});return;}
  const ticket=++serial;
  try{
    if(data.type==='reset'){history=new History(new Model(data.config,data.snapshot));history.resetOrigin();send();return;}
    if(data.type==='seek'){
      if(!history)return;
      history.prepare(data.target);
      let last=performance.now();
      while(history.model.generation<data.target){
        history.advance();
        if(performance.now()-last>25){
          postMessage({type:'progress',generation:history.model.generation,target:data.target});
          await new Promise(r=>setTimeout(r,0));if(ticket!==serial)return;last=performance.now();
        }
      }
      if(ticket===serial)send();
    }
    if(data.type==='cancel'&&history)send();
  }catch(error){postMessage({type:'error',message:error.message});}
};
