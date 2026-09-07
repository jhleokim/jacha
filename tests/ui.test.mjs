import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('public/index.html','utf8');
// DOM/canvas doubles exercise the actual application script and event handlers.
// These assertions verify coordinates and state; they do not replace browser visual QA.
function app(saved=new Map(),config){
  const elements=new Map(),pins=new Map(),timers=new Map(),frames=new Map();let seq=0;
  class Element {
    constructor(tag='div',id=''){this.tagName=tag;this.id=id;this.value='';this.style={};this.checked=false;this.listeners={};this.children=[];this.textContent='';this.classList={add(){},remove(){},toggle(){}};this.texts=[];}
    set value(v){this._value=String(v);}
    get value(){return this._value;}
    set innerHTML(v){this.html=v;this.children=[];}
    get innerHTML(){return this.html||'';}
    addEventListener(event,cb){(this.listeners[event]??=[]).push(cb);}
    emit(event){for(const cb of this.listeners[event]||[])cb.call(this,{target:this,preventDefault(){},stopPropagation(){}});}
    click(){this.emit('click');}
    appendChild(el){this.children.push(el);if(el.id)elements.set(el.id,el);return el;}
    querySelectorAll(selector){return selector==='canvas'?this.children.filter(e=>e.tagName==='canvas'):[];}
    querySelector(){return this.input;}
    setAttribute(){} focus(){} scrollIntoView(){} showModal(){this.open=true;} close(){this.open=false;}
    getContext(){const owner=this;return {
      fillText(text,x,y){owner.texts.push({text:String(text),x,y,font:this.font});},
      fillRect(){},strokeRect(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},drawImage(){}
    };}
  }
  for(const match of html.matchAll(/<(input|select|[a-z0-9]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const e=new Element(match[1],match[3]);e.value=/\bvalue="([^"]*)"/.exec(match[2])?.[1]||'';
    e.type=/\btype="([^"]*)"/.exec(match[2])?.[1]||'';e.checked=/\bchecked\b/.test(match[2]);elements.set(e.id,e);
  }
  for(const k of ['name','dept','date','from','purp']){const p=new Element();p.input=new Element('input');pins.set(k,p);}
  elements.get('oil').value='휘발유';elements.get('rnd').value='floor';
  const doc=new Element();doc.getElementById=id=>elements.get(id);
  doc.createElement=tag=>new Element(tag);doc.createTextNode=t=>({textContent:t});
  doc.querySelector=sel=>pins.get(/data-pin="([^"]+)"/.exec(sel)?.[1]);
  doc.querySelectorAll=sel=>sel==='input,select'?[...elements.values()].filter(e=>['input','select'].includes(e.tagName)):[];
  const win=new Element();win.devicePixelRatio=2;win.open=()=>null;win.getComputedStyle=()=>({lineHeight:'25px',paddingTop:'15px'});
  win.JACHA_CONFIG=config||{addr:false,oil:true,기준:{고정연비:10,가산율:1.2,원단위처리:'floor',통행료_주차료_합계포함:true}};
  const context=vm.createContext({document:doc,window:win,location:{protocol:'https:',origin:'https://example.com'},navigator:{},
    localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
    setTimeout:cb=>{timers.set(++seq,cb);return seq;},clearTimeout:id=>timers.delete(id),clearInterval(){},setInterval:()=>++seq,
    requestAnimationFrame:cb=>{frames.set(++seq,cb);return seq;},cancelAnimationFrame:id=>frames.delete(id),
    console,alert(){},crypto:globalThis.crypto,Uint8Array,URL,URLSearchParams,AbortController,Image:class{}});
  vm.runInContext(readFileSync('public/calculation.js','utf8'),context);
  for(const file of ['receipt-amount.js','receipt-reader.js','receipt-evidence.js'])vm.runInContext(readFileSync('public/'+file,'utf8'),context);
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))vm.runInContext(match[1],context);
  return {c:context,e:elements,pins,saved,timers,frames};
}
function valid(a){for(const [k,v] of Object.entries({km:'23',price:'1500',fe:'10',rate:'1.2',toll:'0',park:'0'}))a.e.get(k).value=v;}

test('native modal file input resets immediately, preserves target and reports duplicate photos',async()=>{
  const a=app();valid(a);a.c.ReceiptReader.recognize=async()=>({amount:2800,reason:'test'});
  a.c.FileReader=class{readAsDataURL(f){this.result=f.data;this.onload();}};
  a.c.Image=class{constructor(){this.width=100;this.height=200;}set src(v){this._src=v;Promise.resolve().then(()=>this.onload());}get src(){return this._src;}};
  const input=a.e.get('ovfiles');input.files=[{type:'image/png',data:'data:image/png;base64,TEST'}];input.value='chosen';
  const pending=a.c.importEvidence(input,'toll');assert.equal(input.value,'');a.c.OVMODE='park';await pending;await Promise.resolve();
  assert.equal(a.c.SHOT.toll.length,1);assert.equal(a.c.SHOT.park.length,0);
  await a.c.importEvidence(input,'toll');assert.equal(a.c.SHOT.toll.length,1);assert.match(a.e.get('stat2').textContent,/중복 합산하지/);
  a.c.SHOT.toll=[];await a.c.importEvidence(input,'toll');assert.equal(a.c.SHOT.toll.length,1);
  input.files=[];input.value='cancelled';await a.c.importEvidence(input,'toll');assert.equal(input.value,'');assert.equal(a.c.SHOT.toll.length,1);
});
test('clear during file read or decode never restores an erased receipt',async()=>{
  for(const phase of ['read','decode']){
    const a=app();valid(a);let resume;
    a.c.FileReader=class{readAsDataURL(){this.result='data:image/png;base64,TEST';if(phase==='read')resume=()=>this.onload();else this.onload();}};
    a.c.Image=class{set src(v){resume=()=>this.onload();}};
    const input=a.e.get('ovfiles');input.files=[{type:'image/png'}];const pending=a.c.importEvidence(input,'park');await Promise.resolve();await Promise.resolve();
    a.e.get('clr').click();resume();await pending;assert.equal(a.c.SHOT.park.length,0);assert.equal(a.e.get('park').value,'0');
  }
});
test('delayed OCR respects user edits, deletion, retry and independent expense categories',async()=>{
  const a=app();valid(a);const jobs=[];
  a.c.ReceiptReader.recognize=()=>new Promise(resolve=>jobs.push(resolve));
  function add(k){const it={use:{width:100,height:100},full:{}};a.c.SHOT[k].push(it);a.c.ReceiptEvidence.start(k,it);return it;}
  const p=add('park'),t=add('toll');a.e.get('park').value='9000';a.e.get('park').emit('input');
  jobs[0]({amount:8000,reason:'read'});jobs[1]({amount:2800,reason:'read'});await Promise.resolve();await Promise.resolve();
  assert.equal(a.e.get('park').value,'9000');assert.equal(a.e.get('toll').value,'2800');
  a.c.ReceiptEvidence.start('toll',t);a.c.SHOT.toll=[];jobs[2]({amount:6000,reason:'read'});await Promise.resolve();assert.equal(a.e.get('toll').value,'2800');
  a.c.ReceiptEvidence.start('park',p);a.c.ReceiptEvidence.start('park',p);jobs[3]({amount:1,reason:'stale'});await Promise.resolve();assert.equal(p.receipt.amount,8000);
  jobs[4]({amount:7000,reason:'fresh'});await Promise.resolve();assert.equal(p.receipt.amount,7000);assert.equal(a.e.get('park').value,'9000');
});

test('round trip toggles reuse one-way distance, survive reload and preserve expenses',()=>{
  const a=app();valid(a);a.e.get('toll').value='9600';a.e.get('park').value='3000';
  a.c.경로거리반영(12.8,'지도 테스트');
  for(const rt of [true,false,true,true]){a.e.get('rt').checked=rt;a.e.get('rt').emit('change');assert.equal(Number(a.e.get('km').value),rt?25.6:12.8);}
  assert.equal(a.e.get('toll').value,'9600');assert.equal(a.e.get('park').value,'3000');
  const b=app(a.saved);b.e.get('rt').checked=false;b.e.get('rt').emit('change');assert.equal(Number(b.e.get('km').value),12.8);
  b.e.get('km').value='40';b.e.get('km').emit('input');b.e.get('rt').checked=true;b.e.get('rt').emit('change');assert.equal(Number(b.e.get('km').value),40);assert.equal(b.c.RT_INFO,null);
});

test('automatic route attaches matching screenshot once and ignores stale replies',async()=>{
  for(const change of ['none','address','clear','km']){
    const a=app();valid(a);a.e.get('to').value='도착';a.e.get('rt').checked=true;
    a.c.확정좌표=()=>[{x:127,y:37,nm:'출발'},{x:128,y:38,nm:'도착'}];
    let resolve,calls=0;a.c.경로웹캡처=()=>{calls++;return new Promise(r=>resolve=r);};
    const p=a.c.경로자동조회();await a.c.경로자동조회();assert.equal(calls,1);
    if(change==='address'){a.e.get('to').value='바뀐 도착';a.e.get('to').emit('input');}
    if(change==='clear')a.e.get('clr').click();
    if(change==='km'){a.e.get('km').value='99';a.e.get('km').emit('input');}
    resolve({km:12.8,image:{width:1440,height:1000}});await p;
    assert.equal(a.c.SHOT.map.length,change==='none'?1:0);assert.equal(a.e.get('autoroute').disabled,false);
    if(change==='none'){assert.equal(Number(a.e.get('km').value),25.6);assert.equal(a.c.SHOT.map[0].autoMap,true);}
    if(change==='km')assert.equal(a.e.get('km').value,'99');
  }
});

test('failed map capture keeps an explicit distance-only fallback and never invents evidence',async()=>{
  const a=app();valid(a);a.e.get('to').value='도착';a.c.확정좌표=()=>[{x:127,y:37},{x:128,y:38}];
  a.c.경로웹캡처=async()=>{throw new Error('timeout');};a.c.자동거리=async()=>10;
  await a.c.경로자동조회();assert.equal(Number(a.e.get('km').value),10);assert.equal(a.c.SHOT.map.length,0);assert.match(a.e.get('stat').textContent,/지도 캡처는 받지 못/);
  a.c.자동거리=async()=>{throw new Error('offline');};await a.c.경로자동조회();assert.equal(Number(a.e.get('km').value),10);assert.equal(a.e.get('autoroute').disabled,false);
});
test('footer baselines stay inside the actual canvas for all route/expense/font combinations',()=>{
  const a=app();valid(a);
  for(const scale of [.8,1,1.2])for(const count of [0,1,3,8])for(const toll of ['0','9600'])for(const park of ['0','3000']){
    a.c.FSCALE=scale;a.e.get('via').value=Array(count).fill('경유지').join(';');a.e.get('toll').value=toll;a.e.get('park').value=park;
    a.c.draw();const cv=a.e.get('pv');
    const footer=cv.texts.filter(t=>t.text.startsWith('공식:')||t.text.startsWith('실제 지급액')||/^(주행거리:|통행료:|주차료:|유가:)/.test(t.text));
    assert.equal(footer.length,6);for(const t of footer)assert.ok(t.y+12*scale<cv._h,`${t.text}: ${t.y}/${cv._h}`);
    assert.ok(cv.texts.every(t=>!t.text.includes('Infinity')&&!t.text.includes('∞')));
  }
});
test('modal round trip, toll and parking persist immediately with provenance',()=>{
  const a=app();valid(a);
  a.c.OVMODE='route';a.e.get('ovkm').value='11.5';a.e.get('rt').checked=true;a.e.get('ovuse').click();
  a.c.OVMODE='toll';a.e.get('ovtollamt').value='3000';a.e.get('ovuse').click();
  a.c.OVMODE='park';a.e.get('ovparkamt').value='2000';a.e.get('ovuse').click();
  const b=app(a.saved);assert.equal(b.e.get('km').value,'23');assert.equal(b.c.RT_INFO.편도,11.5);
  assert.equal(Number(b.e.get('toll').value),3000);assert.equal(Number(b.e.get('park').value),2000);
  assert.match(b.c.SRC.route,/왕복/);
});
test('automatic oil price and actual date survive reload without another edit',async()=>{
  const a=app();valid(a);a.e.get('date').value='2026-09-07';
  a.c.lookupOil가까운=async()=>({price:1652,date:'2026-09-06',대체:true});
  await a.c.유가자동조회();const b=app(a.saved);
  assert.equal(Number(b.e.get('price').value),1652);assert.equal(b.c.OIL_OK.date,'2026-09-06');
  assert.match(b.c.SRC.oil,/2026-09-06/);
  assert.ok(b.e.get('pv').texts.some(t=>t.text.includes('2026-09-06 기준')));
});
test('new configuration wins over legacy draft; personal values still restore',()=>{
  const saved=new Map([['jacha_draft_v1',JSON.stringify({t:Date.now(),f:{name:'테스트',fe:'10',rate:'1.2',rnd:'floor'},inc:true})]]);
  const a=app(saved,{기준:{고정연비:12,가산율:1.3,원단위처리:'round',통행료_주차료_합계포함:false}});
  assert.equal(a.e.get('name').value,'테스트');assert.equal(Number(a.e.get('rate').value),1.3);assert.equal(Number(a.e.get('fe').value),12);
  assert.equal(a.e.get('rnd').value,'round');assert.equal(a.e.get('inc').checked,false);
});
test('clear keeps pinned values but cancels pending draft resurrection',()=>{
  const a=app();valid(a);a.e.get('name').value='테스트';a.pins.get('name').input.checked=true;a.c.pinSave();
  a.e.get('to').value='지울 값';a.c.초안저장();
  a.e.get('clr').click();assert.equal(a.saved.has('jacha_pinned_v1'),true);assert.equal(a.saved.has('jacha_draft_v1'),false);
  assert.equal(a.c.DRAFT_T,null);assert.equal(a.e.get('name').value,'테스트');assert.equal(a.pins.get('name').input.checked,true);
  assert.equal(a.e.get('to').value,'');
  const b=app(a.saved);assert.equal(b.e.get('name').value,'테스트');
});
test('expired and legacy pins are discarded',()=>{
  for(const pin of [{name:'테스트'},{t:Date.now()-13*3600000,f:{name:'테스트'}}]){
    const a=app(new Map([['jacha_pinned_v1',JSON.stringify(pin)]]));assert.equal(a.e.get('name').value,'');assert.equal(a.saved.has('jacha_pinned_v1'),false);
  }
});
test('input and change render only once per frame; exports still draw synchronously',()=>{
  const a=app();valid(a);a.e.get('km').emit('input');a.e.get('km').emit('change');a.e.get('price').emit('input');
  assert.equal(a.frames.size,1);a.c.draw();assert.equal(a.frames.size,0);
  a.e.get('fsz').value='110';a.e.get('fsz').emit('input');assert.equal(a.frames.size,1);
});
test('oil response arriving after clear cannot restore erased data',async()=>{
  const a=app();valid(a);a.e.get('date').value='2026-09-07';let resolve;
  a.c.lookupOil가까운=()=>new Promise(r=>{resolve=r;});
  const pending=a.c.유가자동조회();a.e.get('clr').click();resolve({price:1500,date:'2026-09-06'});
  await assert.rejects(pending,/입력 조건/);assert.equal(a.e.get('price').value,'');assert.equal(a.saved.has('jacha_draft_v1'),false);
});

test('one click fills price and attaches one evidence page with raw value and actual date',async()=>{
  const a=app();valid(a);a.e.get('date').value='2026-09-07';
  a.c.lookupOil가까운=async()=>({price:1652.48,date:'2026-09-06',대체:true});
  await a.c.유가증빙자동첨부();
  assert.equal(a.c.SHOT.oil.length,1);assert.equal(a.e.get('price').value,'1652');
  assert.match(a.e.get('stat2').textContent,/첨부 완료/);
  assert.ok(a.c.SHOT.oil[0].use.texts.some(t=>t.text.includes('1652.48')));
  assert.ok(a.c.SHOT.oil[0].use.texts.some(t=>t.text.includes('2026-09-06')));
  assert.equal(a.c.imagePages().length,1);assert.equal(a.e.get('oilshot').disabled,false);
  await a.c.유가증빙자동첨부();assert.equal(a.c.SHOT.oil.length,1);
});
test('duplicate clicks share one request; changed inputs discard pending evidence',async()=>{
  const a=app();valid(a);a.e.get('date').value='2026-09-07';let resolve,calls=0;
  a.c.lookupOil가까운=()=>{calls++;return new Promise(r=>resolve=r);};
  const p=a.c.유가증빙자동첨부();await a.c.유가증빙자동첨부();assert.equal(calls,1);
  a.e.get('date').value='2026-09-05';a.e.get('date').emit('input');
  resolve({price:1500,date:'2026-09-06'});await p;
  assert.equal(a.c.SHOT.oil.length,0);assert.equal(a.e.get('price').value,'1500');
  assert.equal(a.e.get('oilshot').disabled,false);
});
test('changing date, fuel or price removes generated evidence but preserves manual attachments',async()=>{
  for(const k of ['date','oil','price']){
    const a=app();valid(a);a.e.get('date').value='2026-09-07';
    a.c.lookupOil가까운=async()=>({price:1652,date:'2026-09-06'});
    await a.c.유가증빙자동첨부();a.e.get(k).emit('input');assert.equal(a.c.SHOT.oil.length,0);
    a.c.SHOT.oil=[{use:{width:100,height:100}}];a.e.get(k).emit('input');assert.equal(a.c.SHOT.oil.length,1);
  }
});
test('failed or invalid lookup creates no evidence and allows retry',async()=>{
  for(const result of [null,{price:NaN,date:'2026-09-06'},{price:1500,date:'invalid'},{price:1500,date:'2026-09-09'}]){
    const a=app();valid(a);a.e.get('date').value='2026-09-07';
    a.c.lookupOil가까운=async()=>{if(!result)throw new Error('조회 실패');return result;};
    await a.c.유가증빙자동첨부();assert.equal(a.c.SHOT.oil.length,0);
    assert.equal(a.e.get('oilshot').disabled,false);assert.equal(a.e.get('price').value,'1500');
    assert.match(a.e.get('stat2').textContent,/다시 시도/);
  }
});
test('clear during one click lookup never attaches stale evidence',async()=>{
  const a=app();valid(a);a.e.get('date').value='2026-09-07';let resolve;
  a.c.lookupOil가까운=()=>new Promise(r=>resolve=r);
  const p=a.c.유가증빙자동첨부();a.e.get('clr').click();resolve({price:1500,date:'2026-09-06'});await p;
  assert.equal(a.c.SHOT.oil.length,0);assert.equal(a.e.get('price').value,'');
});
test('oil lookup selects the requested date and rejects malformed prices',async()=>{
  const a=app();
  a.c.jget=async()=>({RESULT:{OIL:[{DATE:'20260907',PRICE:'9999'},{DATE:'20260906',PRICE:'1652.48'}]}});
  assert.equal((await a.c.lookupOil('2026-09-06','휘발유')).price,1652.48);
  a.c.jget=async()=>({RESULT:{OIL:[{DATE:'20260906',PRICE:'1652oops'}]}});
  await assert.rejects(a.c.lookupOil('2026-09-06','휘발유'),/올바르지/);
});
test('transport failures do not retry seven different dates',async()=>{
  const a=app();let calls=0;
  a.c.오늘문자열=()=> '2026-09-08';
  a.c.lookupOil=async()=>{calls++;throw new Error('HTTP 503');};
  await assert.rejects(a.c.lookupOil가까운('2026-09-07','휘발유'),/503/);assert.equal(calls,1);
});
test('route keeps automatic and manual actions separate after address confirmation',()=>{
  const a=app();assert.equal(a.e.get('chkaddr').className,'p route-action');
  assert.equal(a.e.get('omap').className,'p2 route-action');
  a.c.확정좌표=()=>[{x:127,y:37}];a.c.경로단계갱신(true);
  assert.equal(a.e.get('omap').className,'p2 route-action');assert.equal(a.e.get('chkaddr').className,'done route-action');
});
test('actual web screenshot is attached when available; conditions changed during capture discard it',async()=>{
  for(const change of [false,true]){
    const a=app();valid(a);a.e.get('date').value='2026-09-07';let resolve,ready;
    a.c.lookupOil가까운=async()=>({price:1652.48,date:'2026-09-06'});
    const started=new Promise(r=>ready=r);
    a.c.유가웹캡처=()=>{ready();return new Promise(r=>resolve=r);};
    const p=a.c.유가증빙자동첨부();await started;
    if(change){a.e.get('oil').value='경유';a.e.get('oil').emit('input');}
    resolve({width:1280,height:1170,src:'data:image/png;base64,test'});await p;
    assert.equal(a.c.SHOT.oil.length,change?0:1);
    if(!change){assert.equal(a.c.SHOT.oil[0].webOil,true);assert.match(a.e.get('stat2').textContent,/웹화면 증빙/);}
    assert.equal(a.e.get('oilshot').disabled,false);
  }
});
test('receipt preview opens and deletion targets the original item without losing other photos',()=>{
  const a=app();a.c.QR_SLOT='toll';
  const first={use:{width:200,height:700,src:'data:image/png;base64,first'}},second={use:{width:200,height:700,src:'data:image/png;base64,second'}};
  a.c.SHOT.toll=[first,second];a.c.qrThumbs();
  const card=a.e.get('qrthumbs').children[0].children[0];card.children[0].click();
  assert.equal(a.e.get('receiptview').open,true);assert.equal(a.e.get('receiptimage').src,first.use.src);
  a.e.get('receiptclose').click();assert.equal(a.e.get('receiptview').open,false);
  card.children[1].children[1].click();assert.equal(a.c.SHOT.toll.length,1);assert.equal(a.c.SHOT.toll[0],second);
});
