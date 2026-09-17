import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {KEY_ROWS,GREETING,GREETING_ENGLISH,greetingEvents,mountKeyboard} from './keyboard-model.mjs';
import {Element,tick} from './test-dom.mjs';
const source=(await readFile(new URL('./hero.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'').replace(/import\("\.\/vendor\/scene-3d\.min\.js[^"\n]*"\)/,'loadModule()');
async function setup({reduced=false,saveData=false,fail=false,deferred=false,scheduler='none',noGsap=false}={}){
 const elements=Object.fromEntries(['keyboard-scene','hero-greeting','hero-english','greeting-line','hero-pause'].map(id=>[id,new Element()]));
 const document=new Element(),window=new Element(),motion=new Element(),connection=new Element();motion.matches=reduced;connection.saveData=saveData;document.hidden=false;document.querySelector=s=>elements[s.slice(1)];
 const timelines=[],presses=[],frames=new Map(),idles=new Map(),timers=new Map();let intersect,imports=0,disposed=0,created=0,release,mounts=0,fallbackDisposed=0,nextJob=0;
 if(scheduler!=='none') { window.setTimeout=fn=>{timers.set(++nextJob,fn);return nextJob;};window.clearTimeout=id=>timers.delete(id); }
 if(['both','raf-only'].includes(scheduler)) { window.requestAnimationFrame=fn=>{frames.set(++nextJob,fn);return nextJob;};window.cancelAnimationFrame=id=>frames.delete(id); }
 if(['both','idle-only'].includes(scheduler)) { window.requestIdleCallback=(fn,options)=>{assert.equal(options.timeout,1000);idles.set(++nextJob,fn);return nextJob;};window.cancelIdleCallback=id=>idles.delete(id); }
 window.gsap={timeline(options){const t={options,calls:[],active:false,killed:false,call(fn,args,time){this.calls.push({fn,time});return this;},to(){return this;},play(){this.active=true;},pause(){this.active=false;},kill(){this.killed=true;this.active=false;}};timelines.push(t);return t;}};
 const module={createKeyboardScene(host,opts){created++;assert.equal(opts.interactive,false);opts.onReady();return{press:k=>presses.push(k),dispose(){disposed++;}};}};
 if(noGsap)window.gsap=undefined;
 vm.runInNewContext(source,{document,window,matchMedia:()=>motion,navigator:{connection},GREETING_ENGLISH,greetingEvents,mountKeyboard:()=>{mounts++;return{press:k=>presses.push(k),dispose(){fallbackDisposed++;}};},IntersectionObserver:class{constructor(fn){intersect=fn;}observe(){}disconnect(){}},loadModule:async()=>{imports++;if(fail)throw Error('WebGL unavailable');return deferred?new Promise(resolve=>{release=()=>resolve(module);}):module;}});await tick();
 const flush=async queue=>{const callbacks=[...queue.values()];queue.clear();callbacks.forEach(fn=>fn());await tick();};
 return{elements,document,window,motion,connection,timelines,presses,frames,idles,timers,frame:()=>flush(frames),idle:()=>flush(idles),timer:()=>flush(timers),release:()=>release(),imports:()=>imports,created:()=>created,disposed:()=>disposed,mounts:()=>mounts,fallbackDisposed:()=>fallbackDisposed,intersect:v=>intersect([{isIntersecting:v}])};
}
test('complete 26-key board, exact greeting, corresponding keys and phrase holds',()=>{
 const keys=KEY_ROWS.flat().map(k=>k.id);assert.equal(keys.filter(k=>/^[A-Z]$/.test(k)).length,26);assert.equal(new Set(keys).size,keys.length);for(const k of ['SPACE','ENTER','BACKSPACE','LANG'])assert.ok(keys.includes(k));
 const phrases=GREETING.map(s=>s.map(c=>c[0]).join(''));assert.deepEqual(phrases,['你好','欢迎你来看我的作品','跪求star支持']);const seq=greetingEvents();let last=-1;
 for(const e of seq.events){assert.ok(e.time>=last);last=e.time;if(e.key)assert.ok(keys.includes(e.key));}
 for(const [i,text] of phrases.entries()){const j=seq.events.findIndex(e=>e.text===text);assert.ok(seq.events[j+1].time-seq.events[j].time>=(i===2?3:1.5));}
});
test('automatic timeline drives physical keys and clears for next loop',async()=>{
 const a=await setup(),t=a.timelines[0];assert.equal(t.options.repeat,-1);assert.ok(t.active);t.calls.forEach(c=>c.fn());assert.ok(a.presses.includes('N'));assert.equal(a.elements['hero-greeting'].textContent,'');assert.equal(a.presses.filter(k=>k==='ENTER').length,3);
});
test('every timeline event preserves the bilingual pair, including key-only events and repeated-loop clears',async()=>{
 const a=await setup(),sequence=greetingEvents(),phrases=GREETING.map(s=>s.map(c=>c[0]).join(''));
 assert.deepEqual(GREETING_ENGLISH,['Hello','Welcome to my project','Please support me with a star']);
 assert.equal(a.elements['hero-greeting'].textContent,'');assert.equal(a.elements['hero-english'].textContent,'');
 let expectedChinese='',expectedEnglish='';
 for(let loop=0;loop<2;loop++) {
  for(const [index,event] of sequence.events.entries()) {
   assert.equal(a.timelines[0].calls[index].time,event.time);
   a.timelines[0].calls[index].fn();
   if(event.text!==undefined) {
    expectedChinese=event.text;expectedEnglish=event.text?GREETING_ENGLISH[phrases.findIndex(phrase=>phrase.startsWith(event.text))]:'';
    assert.equal(event.english,expectedEnglish);
   } else assert.equal(event.english,undefined,'key-only events must not replace the translation');
   assert.equal(a.elements['hero-greeting'].textContent,expectedChinese,'Chinese at event '+index);
   assert.equal(a.elements['hero-english'].textContent,expectedEnglish,'English at event '+index);
  }
 }
});
test('English has a no-script default and complete static copy for reduced motion, save-data and failed GSAP',async()=>{
 const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
 assert.match(html,/id="hero-english" lang="en">Hello<\/div>/);assert.match(html,/<span lang="en">Hello\. Welcome to my project\. Please support me with a star\.<\/span>/);
 const noScript=html.match(/<noscript>([\s\S]*?)<\/noscript>/)[1];
 assert.match(noScript,/class="greeting-line is-static no-script-greeting"/);assert.match(noScript,/class="greeting-chinese">你好，欢迎你来看我的作品。跪求star支持。/);assert.match(noScript,/class="greeting-english" lang="en">Hello\. Welcome to my project\. Please support me with a star\./);
 assert.match(noScript,/\.greeting-line:not\(\.no-script-greeting\),#hero-pause\{display:none\}/);
 for(const options of [{reduced:true},{saveData:true},{noGsap:true}]) {
  const a=await setup(options);assert.equal(a.timelines.length,0);assert.equal(a.elements['hero-english'].textContent,GREETING_ENGLISH.join('. ')+'.');assert.ok(a.elements['greeting-line'].classList.contains('is-static'));
 }
 const a=await setup({reduced:true});a.motion.matches=false;a.motion.emit('change');await tick();
 assert.ok(!a.elements['greeting-line'].classList.contains('is-static'));assert.equal(a.elements['hero-english'].textContent,'');
 a.timelines[0].calls.find((_,index)=>greetingEvents().events[index].text==='你好').fn();assert.equal(a.elements['hero-english'].textContent,'Hello');
 a.elements['hero-pause'].emit('click');a.document.hidden=true;a.document.emit('visibilitychange');a.document.hidden=false;a.document.emit('visibilitychange');
 assert.ok(!a.timelines[0].active);assert.equal(a.elements['hero-greeting'].textContent,'你好');assert.equal(a.elements['hero-english'].textContent,'Hello');
});
test('second and third phrases switch to static bilingual copy and restart once after preference restoration',async()=>{
 for(const [partial,translation] of [['欢迎你来',GREETING_ENGLISH[1]],['跪求',GREETING_ENGLISH[2]]]) for(const preference of ['motion','connection']) {
  const a=await setup({scheduler:'both'}),sequence=greetingEvents(),before=a.timelines[0];
  const pair=()=>[a.elements['hero-greeting'].textContent,a.elements['hero-english'].textContent];
  const index=sequence.events.findIndex(event=>event.text===partial);assert.ok(index>=0);
  before.calls.slice(0,index+1).forEach(call=>call.fn());assert.deepEqual(pair(),[partial,translation]);
  const setPreference=value=>{a[preference][preference==='motion'?'matches':'saveData']=value;a[preference].emit('change');};
  setPreference(true);
  assert.ok(before.killed);assert.equal(a.timelines.filter(t=>!t.killed).length,0);
  assert.deepEqual(pair(),['你好，欢迎你来看我的作品。跪求star支持',GREETING_ENGLISH.join('. ')+'.']);
  assert.ok(a.elements['greeting-line'].classList.contains('is-static'));assert.ok(a.elements['hero-pause'].hidden);
  assert.equal(a.frames.size+a.idles.size+a.timers.size,0);
  setPreference(false);a.window.emit('pageshow');a.window.emit('pageshow');a.intersect(true);a.document.emit('visibilitychange');
  let live=a.timelines.filter(t=>!t.killed);assert.equal(live.length,1);assert.ok(live[0].active);assert.equal(a.timelines.length,2);
  assert.deepEqual(pair(),['','']);assert.ok(!a.elements['greeting-line'].classList.contains('is-static'));assert.ok(!a.elements['hero-pause'].hidden);assert.equal(a.frames.size,1);
  live[0].calls.slice(0,index+1).forEach(call=>call.fn());assert.deepEqual(pair(),[partial,translation]);
  a.window.emit('pagehide');a.window.emit('pageshow');a.window.emit('pageshow');
  live=a.timelines.filter(t=>!t.killed);assert.equal(live.length,1);assert.ok(live[0].active);assert.deepEqual(pair(),['','']);assert.equal(a.frames.size,1);
 }
});
test('manual pause keeps its bilingual snapshot across pagehide and repeated pageshow',async()=>{
 const a=await setup(),sequence=greetingEvents(),index=sequence.events.findIndex(event=>event.text==='欢迎你来');
 a.timelines[0].calls.slice(0,index+1).forEach(call=>call.fn());a.elements['hero-pause'].emit('click');
 const pair=()=>[a.elements['hero-greeting'].textContent,a.elements['hero-english'].textContent];
 const paused=['欢迎你来',GREETING_ENGLISH[1]];assert.deepEqual(pair(),paused);
 a.window.emit('pagehide');a.window.emit('pageshow');a.window.emit('pageshow');await tick();
 const live=a.timelines.filter(t=>!t.killed);assert.equal(live.length,1);assert.ok(!live[0].active);assert.deepEqual(pair(),paused);
 assert.equal(a.elements['hero-pause'].getAttribute('aria-pressed'),'true');
 a.intersect(false);a.intersect(true);a.document.hidden=true;a.document.emit('visibilitychange');a.document.hidden=false;a.document.emit('visibilitychange');
 assert.ok(!live[0].active);assert.deepEqual(pair(),paused);
 a.elements['hero-pause'].emit('click');assert.ok(live[0].active);
});
test('manual pause survives static preference toggles without losing either greeting',async()=>{
 for(const preference of ['motion','connection']) {
  const a=await setup(),sequence=greetingEvents(),index=sequence.events.findIndex(event=>event.text==='跪求star');
  a.timelines[0].calls.slice(0,index+1).forEach(call=>call.fn());a.elements['hero-pause'].emit('click');
  const pair=()=>[a.elements['hero-greeting'].textContent,a.elements['hero-english'].textContent];
  const paused=['跪求star',GREETING_ENGLISH[2]];assert.deepEqual(pair(),paused);
  const setPreference=value=>{a[preference][preference==='motion'?'matches':'saveData']=value;a[preference].emit('change');};
  for(let restore=0;restore<2;restore++) {
   setPreference(true);assert.ok(a.elements['greeting-line'].classList.contains('is-static'));
   assert.deepEqual(pair(),['你好，欢迎你来看我的作品。跪求star支持',GREETING_ENGLISH.join('. ')+'.']);
   setPreference(false);a.window.emit('pageshow');await tick();
   const live=a.timelines.filter(t=>!t.killed);assert.equal(live.length,1);assert.ok(!live[0].active);assert.deepEqual(pair(),paused);
   assert.equal(a.elements['hero-pause'].getAttribute('aria-pressed'),'true');assert.ok(!a.elements['greeting-line'].classList.contains('is-static'));
  }
  a.elements['hero-pause'].emit('click');assert.ok(a.timelines.at(-1).active);
 }
});
test('manual pause survives visibility changes; background and offscreen pause',async()=>{
 const a=await setup(),t=a.timelines[0];a.elements['hero-pause'].emit('click');assert.ok(!t.active);a.intersect(false);a.intersect(true);assert.ok(!t.active);a.elements['hero-pause'].emit('click');assert.ok(t.active);a.document.hidden=true;a.document.emit('visibilitychange');assert.ok(!t.active);a.document.hidden=false;a.document.emit('visibilitychange');assert.ok(t.active);a.intersect(false);assert.ok(!t.active);
});
test('reduced motion/save-data stay static; WebGL failure retains working fallback',async()=>{
 for(const options of [{reduced:true},{saveData:true}]){const a=await setup(options);assert.equal(a.imports(),0);assert.equal(a.timelines.length,0);assert.match(a.elements['hero-greeting'].textContent,/你好.*欢迎你来看我的作品.*跪求star支持/);assert.ok(a.elements['hero-pause'].hidden);}
 const a=await setup({fail:true});assert.ok(!a.elements['keyboard-scene'].classList.contains('is-ready'));a.timelines[0].calls.forEach(c=>c.fn());assert.ok(a.presses.length>0);
});
test('restoration and motion changes release scenes and never duplicate loops',async()=>{
 const a=await setup();a.window.emit('pagehide');assert.ok(a.timelines.every(t=>t.killed));a.window.emit('pageshow');await tick();assert.equal(a.timelines.filter(t=>!t.killed).length,1);a.motion.matches=true;a.motion.emit('change');assert.ok(a.timelines.every(t=>t.killed));a.motion.matches=false;a.motion.emit('change');await tick();assert.equal(a.timelines.filter(t=>!t.killed).length,1);assert.ok(a.disposed()>=2);
});
test('save-data arriving during import cannot install a stale hero renderer',async()=>{
 const a=await setup({deferred:true});a.connection.saveData=true;a.connection.emit('change');a.release();await tick();
 assert.equal(a.created(),0);assert.ok(a.timelines.every(t=>t.killed));assert.ok(a.elements['hero-pause'].hidden);
 a.connection.saveData=false;a.connection.emit('change');await tick();a.release();await tick();assert.equal(a.created(),1);assert.equal(a.timelines.filter(t=>!t.killed).length,1);
});
test('pagehide cancels a pending hero import and releases the dynamic fallback before restoration',async()=>{
 const a=await setup({deferred:true});a.window.emit('pagehide');a.release();await tick();assert.equal(a.created(),0);assert.equal(a.fallbackDisposed(),1);
 a.window.emit('pageshow');await tick();a.release();await tick();assert.equal(a.created(),1);assert.equal(a.mounts(),2);assert.equal(a.timelines.filter(t=>!t.killed).length,1);
});
test('dynamic fallback replaces the complete server-rendered keyboard instead of duplicating it',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');let removed=0;
 const create=()=>Object.assign(new Element(),{remove(){removed++;}}),host=create(),staticBoard=create();host.querySelector=selector=>selector==='[data-static-keyboard]'?staticBoard:undefined;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:create}});
 try{const fallback=mountKeyboard(host);assert.equal(removed,1);assert.equal(host.children.length,1);assert.equal(host.children[0].children.length,4);assert.equal(host.children[0].children.flatMap(row=>row.children).filter(key=>key.dataset.key).length,33);fallback.dispose();assert.equal(removed,2);}
 finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
});
test('hero mounts DOM immediately and imports Three only after a paint opportunity and idle',async()=>{
 const a=await setup({scheduler:'both'});
 assert.equal(a.mounts(),1);assert.ok(a.timelines[0].active);assert.equal(a.imports(),0);assert.equal(a.frames.size,1);
 a.intersect(true);a.window.emit('pageshow');assert.equal(a.frames.size,1);
 await a.frame();assert.equal(a.imports(),0);assert.equal(a.frames.size,1);assert.equal(a.idles.size,0);
 await a.frame();assert.equal(a.imports(),0);assert.equal(a.frames.size,0);assert.equal(a.idles.size,1);
 await a.idle();assert.equal(a.imports(),1);assert.equal(a.created(),1);assert.equal(a.frames.size+a.idles.size+a.timers.size,0);
});
test('offscreen and background cancel queued frames and idle callbacks, including late callbacks',async()=>{
 const a=await setup({scheduler:'both'}),lateFrame=[...a.frames.values()][0];
 a.intersect(false);assert.equal(a.frames.size,0);lateFrame();assert.equal(a.frames.size+a.idles.size,0);assert.equal(a.imports(),0);
 a.intersect(true);await a.frame();await a.frame();const lateIdle=[...a.idles.values()][0];
 a.document.hidden=true;a.document.emit('visibilitychange');assert.equal(a.idles.size,0);
 a.document.hidden=false;a.document.emit('visibilitychange');assert.equal(a.frames.size,1);
 lateIdle();assert.equal(a.imports(),0);assert.equal(a.frames.size,1,'obsolete callback cannot clear replacement');
 await a.frame();await a.frame();await a.idle();assert.equal(a.created(),1);
});
test('motion, save-data and pagehide cancel queued starts before any module request',async()=>{
 const a=await setup({scheduler:'both'});await a.frame();
 a.motion.matches=true;a.motion.emit('change');assert.equal(a.frames.size+a.idles.size,0);
 a.motion.matches=false;a.motion.emit('change');await a.frame();await a.frame();
 a.connection.saveData=true;a.connection.emit('change');assert.equal(a.idles.size,0);assert.equal(a.imports(),0);
 a.connection.saveData=false;a.connection.emit('change');await a.frame();await a.frame();const stale=[...a.idles.values()][0];
 a.window.emit('pagehide');assert.equal(a.frames.size+a.idles.size,0);assert.equal(a.fallbackDisposed(),1);
 a.window.emit('pageshow');stale();assert.equal(a.imports(),0);assert.equal(a.frames.size,1);
 await a.frame();await a.frame();await a.idle();assert.equal(a.created(),1);assert.equal(a.mounts(),2);
});
test('repeated restore notifications keep one pending start and one live timeline/renderer',async()=>{
 const a=await setup({scheduler:'both'});
 for(let cycle=0;cycle<3;cycle++) {
  if(cycle) a.window.emit('pagehide');
  a.window.emit('pageshow');a.window.emit('pageshow');a.intersect(true);a.document.emit('visibilitychange');
  assert.equal(a.frames.size,1);assert.equal(a.timelines.filter(t=>!t.killed).length,1);
  await a.frame();a.window.emit('pageshow');assert.equal(a.frames.size,1);await a.frame();
  a.window.emit('pageshow');assert.equal(a.idles.size,1);await a.idle();
  assert.equal(a.imports(),cycle+1);assert.equal(a.created(),cycle+1);assert.equal(a.disposed(),cycle);
 }
});
test('a cancelled in-flight import retries through a new paint and idle schedule on restore',async()=>{
 const a=await setup({scheduler:'both',deferred:true});await a.frame();await a.frame();await a.idle();
 assert.equal(a.imports(),1);assert.equal(a.created(),0);
 a.window.emit('pagehide');a.window.emit('pageshow');a.window.emit('pageshow');assert.equal(a.frames.size,0,'in-flight import remains the only load');
 a.release();await tick();assert.equal(a.created(),0);assert.equal(a.frames.size,1);assert.equal(a.imports(),1);
 await a.frame();await a.frame();assert.equal(a.imports(),1);assert.equal(a.idles.size,1);
 await a.idle();assert.equal(a.imports(),2);a.release();await tick();assert.equal(a.created(),1);assert.equal(a.timelines.filter(t=>!t.killed).length,1);
});
test('missing frame or idle APIs retain cancellable task fallbacks and still create real Three',async()=>{
 for(const scheduler of ['raf-only','idle-only','timers','none']) {
  const a=await setup({scheduler});
  if(scheduler!=='none') {
   a.window.emit('pagehide');assert.equal(a.frames.size+a.idles.size+a.timers.size,0);
   a.window.emit('pageshow');
   for(let turn=0;turn<3;turn++) {await a.frame();await a.timer();await a.idle();}
  }
  assert.equal(a.imports(),1,scheduler);assert.equal(a.created(),1,scheduler);assert.equal(a.frames.size+a.idles.size+a.timers.size,0);
 }
});
