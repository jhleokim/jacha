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
    setAttribute(k,v){(this.attributes??={})[k]=v;} focus(){doc.activeElement=this;} scrollIntoView(options){this.lastScroll=options;} showModal(){this.open=true;} close(){this.open=false;}
    getContext(){const owner=this;return {
      measureText(text){return {width:Array.from(String(text)).reduce((n,c)=>n+(/[\u3000-\uffff]/.test(c)?1:.55),0)*(parseFloat(/([\d.]+)px/.exec(this.font||'16px')[1]))};},
      fillText(text,x,y){owner.texts.push({text:String(text),x,y,font:this.font});},
      fillRect(){},strokeRect(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},drawImage(){}
    };}
  }
  for(const match of html.matchAll(/<(input|select|[a-z0-9]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const e=new Element(match[1],match[3]);e.value=/\bvalue="([^"]*)"/.exec(match[2])?.[1]||'';
    e.type=/\btype="([^"]*)"/.exec(match[2])?.[1]||'';e.checked=/\bchecked\b/.test(match[2]);elements.set(e.id,e);
    e.className=/\bclass="([^"]*)"/.exec(match[2])?.[1]||'';
    e.hidden=/\bhidden\b/.test(match[2]);
  }
  for(const k of ['name','dept','date','from','purp']){const p=new Element();p.input=new Element('input');pins.set(k,p);}
  elements.get('oil').value='휘발유';elements.get('rnd').value='floor';
  const doc=new Element();doc.getElementById=id=>elements.get(id);
  doc.body=new Element('body');doc.createElement=tag=>new Element(tag);doc.createTextNode=t=>({textContent:t});
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
  vm.runInContext(readFileSync('public/report.js','utf8'),context);
  for(const file of ['receipt-amount.js','receipt-reader.js','receipt-evidence.js'])vm.runInContext(readFileSync('public/'+file,'utf8'),context);
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))vm.runInContext(match[1],context);
  return {c:context,e:elements,pins,saved,timers,frames};
}
function valid(a){for(const [k,v] of Object.entries({km:'23',price:'1500',fe:'10',rate:'1.2',toll:'0',park:'0'}))a.e.get(k).value=v;}

test('all review entry points warn about missing toll proof even when the amount is zero',()=>{
  for(const id of ['reviewgo','mobilereview','navreview'])for(const toll of ['0','9600']){
    const a=app();valid(a);a.e.get('toll').value=toll;a.e.get(id).click();
    assert.equal(a.e.get('tollReview').open,true);assert.notEqual(a.e.get('previewDetails').open,true);assert.equal(a.e.get('tollReviewAmount').hidden,toll==='0');
    a.e.get('tollRoad').click();assert.equal(a.e.get('tollReview').open,false);assert.equal(a.e.get('previewDetails').open,true);
    assert.equal(a.c.document.activeElement.id,'review');assert.equal(a.e.get('review').lastScroll.block,'start');
    assert.equal(a.e.get('toll').value,toll);assert.equal(a.c.SHOT.toll.length,0);
    a.e.get('previewDetails').open=false;a.e.get(id).click();assert.equal(a.e.get('tollReview').open,false);assert.equal(a.e.get('previewDetails').open,true);
  }
});
test('recheck opens toll attachment directly; dismissing the warning never advances or remembers consent',()=>{
  const a=app();valid(a);a.e.get('reviewgo').click();a.e.get('tollRecheck').click();
  assert.equal(a.e.get('tollReview').open,false);assert.equal(a.e.get('ov').open,true);assert.equal(a.c.OVMODE,'toll');assert.equal(a.c.TOLL_REVIEW_ACK,null);
  a.c.ovClose();a.e.get('reviewgo').click();a.e.get('tollReview').emit('cancel');
  assert.equal(a.e.get('tollReview').open,false);assert.equal(a.c.TOLL_REVIEW_PENDING,null);assert.notEqual(a.e.get('previewDetails').open,true);
  a.e.get('reviewgo').click();a.e.get('tollReviewClose').click();assert.equal(a.c.TOLL_REVIEW_ACK,null);
});
test('existing toll evidence skips the warning, but deletion and a different trip require a fresh decision',()=>{
  const a=app();valid(a);a.c.SHOT.toll=[{use:{width:100,height:100}}];a.e.get('reviewgo').click();
  assert.notEqual(a.e.get('tollReview').open,true);assert.equal(a.e.get('previewDetails').open,true);
  a.c.SHOT.toll=[];a.e.get('reviewgo').click();assert.equal(a.e.get('tollReview').open,true);a.e.get('tollRoad').click();
  a.e.get('to').value='새 도착지';a.e.get('to').emit('input');a.e.get('reviewgo').click();assert.equal(a.e.get('tollReview').open,true);a.e.get('tollRoad').click();
  a.e.get('toll').value='5000';a.e.get('toll').emit('input');a.e.get('reviewgo').click();assert.equal(a.e.get('tollReview').open,true);
  a.e.get('clr').click();assert.equal(a.e.get('tollReview').open,false);assert.equal(a.c.TOLL_REVIEW_ACK,null);assert.equal(a.c.TOLL_REVIEW_PENDING,null);
});
test('direct PDF and PNG actions share the toll check and preserve the original continuation',()=>{
  const a=app();valid(a);let printed=0;a.c.window.open=()=>({document:{write(){printed++;},close(){}},focus(){}});
  a.e.get('prt').click();assert.equal(a.e.get('tollReview').open,true);assert.equal(printed,0);
  a.e.get('tollRoad').click();assert.equal(printed,1);a.e.get('prt').click();assert.equal(printed,2);
  a.c.TOLL_REVIEW_ACK=null;a.e.get('png').click();assert.equal(a.e.get('tollReview').open,true);
  a.e.get('tollReviewClose').click();assert.equal(a.c.TOLL_REVIEW_PENDING,null);
});

test('claim summary distinguishes missing inputs, paid expenses and actual evidence',()=>{
  const a=app();assert.equal(a.e.get('claimTotal').textContent,'—');assert.equal(a.e.get('err').textContent,'');
  valid(a);a.e.get('toll').value='9600';a.e.get('park').value='3000';a.c.draw();
  assert.equal(a.e.get('claimTotal').textContent,'16,740 원');assert.equal(a.e.get('mobileTotal').textContent,'16,740 원');
  assert.equal(a.e.get('checkTollState').textContent,'미첨부');assert.match(a.e.get('reviewHint').textContent,/통행료/);
  a.c.SHOT.map=[{use:{},full:{}}];a.c.SHOT.oil=[{use:{},full:{},autoOil:true,webOil:false}];a.c.draw();
  assert.equal(a.e.get('claimCount').textContent,'2장');assert.equal(a.e.get('checkOilState').textContent,'조회값 자료');
  a.e.get('inc').checked=false;a.c.draw();assert.equal(a.e.get('claimTotal').textContent,'4,140 원');assert.equal(a.e.get('claimToll').textContent,'별도 청구');
});
test('invalid export focuses the field including collapsed settlement criteria',()=>{
  const a=app();let opened=0;a.c.window.open=()=>{opened++;};
  a.e.get('prt').click();assert.equal(opened,0);assert.equal(a.c.document.activeElement.id,'km');assert.equal(a.e.get('km').attributes['aria-invalid'],'true');
  valid(a);a.e.get('fe').value='0';a.e.get('png').click();
  assert.equal(a.e.get('dtStd').open,true);assert.equal(a.c.document.activeElement.id,'fe');assert.equal(opened,0);
  a.e.get('fe').value='10';a.e.get('fe').emit('input');a.c.draw();assert.equal(a.e.get('exportError').textContent,'');assert.equal(a.e.get('fe').attributes['aria-invalid'],'false');
});
test('route cancel and immediate retry isolate old completion and fallback',async()=>{
  for(const rejects of [false,true]){
    const a=app();valid(a);a.e.get('to').value='도착';a.c.확정좌표=()=>[{x:127,y:37},{x:128,y:38}];
    const jobs=[];let fallbacks=0;a.c.경로웹캡처=(_cs,_names,controller)=>new Promise((resolve,reject)=>jobs.push({resolve,reject,controller}));a.c.자동거리=async()=>{fallbacks++;return 99;};
    const first=a.c.경로자동조회();a.e.get('routecancel').click();assert.equal(jobs[0].controller.signal.aborted,true);assert.equal(a.e.get('autoroute').disabled,false);
    const second=a.c.경로자동조회();rejects?jobs[0].reject(Error('cancelled')):jobs[0].resolve({km:99,image:{}});await first;
    assert.equal(a.e.get('autoroute').disabled,true);assert.equal(a.e.get('routecancel').hidden,false);assert.equal(a.c.SHOT.map.length,0);assert.equal(fallbacks,0);
    jobs[1].resolve({km:12,image:{}});await second;
    assert.equal(a.e.get('km').value,'12');assert.equal(a.c.SHOT.map.length,1);assert.equal(a.e.get('autoroute').disabled,false);assert.equal(a.e.get('routecancel').hidden,true);
    assert.notEqual(a.e.get('dtShot').open,true);
  }
});
test('changed addresses cannot be overwritten by an earlier address response',async()=>{
  const a=app();a.e.get('to').value='도착';const jobs=[];
  a.c.searchPlaces=()=>new Promise(resolve=>jobs.push(resolve));a.c.경로웹캡처=async()=>({km:12,image:{}});
  const first=a.c.주소확인();a.e.get('to').value='새 도착';a.e.get('to').emit('input');const second=a.c.주소확인();
  jobs[0]([{nm:'옛 출발',x:1,y:1}]);jobs[1]([{nm:'옛 도착',x:2,y:2}]);await first;
  assert.equal(a.c.ADDR.length,0);assert.equal(a.e.get('chkaddr').disabled,true);
  jobs[2]([{nm:'새 출발',x:127,y:37}]);jobs[3]([{nm:'새 도착',x:128,y:38}]);await second;
  assert.equal(a.c.ADDR[0].pick.nm,'새 출발');assert.equal(a.e.get('km').value,'');assert.equal(a.e.get('omaprow').hidden,false);
});
test('oil cancel and retry ignore older screenshot errors and preserve the new busy state',async()=>{
  const a=app();valid(a);a.e.get('date').value='2026-09-07';
  a.c.lookupOil가까운=async()=>({price:1652,date:'2026-09-06'});
  const jobs=[];let fallbacks=0;a.c.유가웹캡처=(_r,controller)=>new Promise((resolve,reject)=>jobs.push({resolve,reject,controller}));
  a.c.유가증빙그리기=()=>{fallbacks++;return {};};
  const first=a.c.유가증빙자동첨부();await new Promise(setImmediate);
  a.e.get('oilcancel').click();assert.equal(jobs[0].controller.signal.aborted,true);assert.equal(a.e.get('price').value,'1652');
  const second=a.c.유가증빙자동첨부();await new Promise(setImmediate);
  jobs[0].reject(Error('cancel'));await first;assert.equal(a.e.get('oilshot').disabled,true);assert.equal(fallbacks,0);
  jobs[1].resolve({});await second;assert.equal(a.c.SHOT.oil.length,1);assert.equal(a.c.SHOT.oil[0].webOil,true);assert.equal(a.e.get('oilcancel').hidden,true);assert.notEqual(a.e.get('dtShot').open,true);
});
test('modal uses native dialog lifecycle and receipt capture starts collapsed',()=>{
  const a=app();a.c.ovOpen('toll');assert.equal(a.e.get('ov').open,true);assert.equal(a.e.get('captureDetails').open,false);
  a.e.get('ov').emit('cancel');assert.equal(a.e.get('ov').open,false);assert.equal(a.e.get('ov').className,'ov');
});
test('already imported photos can be confirmed before OCR finishes',()=>{
  const a=app();valid(a);a.c.ovOpen('toll');a.c.SHOT.toll=[{use:{},full:{}}];
  a.e.get('ovtollamt').value='';a.e.get('ovuse').click();assert.equal(a.e.get('ov').open,false);assert.equal(a.c.SHOT.toll.length,1);
});
test('late oil modal response cannot change a newly opened receipt modal',async()=>{
  const a=app();let resolve;a.c.유가자동조회=()=>new Promise(r=>resolve=r);
  a.c.ovOpen('oil');a.c.ovClose();a.c.ovOpen('toll');const before=a.e.get('ovs1sub').textContent;
  resolve({유종:'휘발유',값:1652,날짜:'2026-09-06'});await new Promise(setImmediate);
  assert.equal(a.e.get('ovs1sub').textContent,before);assert.equal(a.c.OVMODE,'toll');
});

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
  const a=app();assert.equal(a.e.get('chkaddr').className,'p route-action');assert.equal(a.e.get('omaprow').hidden,true);
  assert.equal(a.e.get('omap').className,'p2 route-action');
  a.c.확정좌표=()=>[{x:127,y:37}];a.c.경로단계갱신(true);
  assert.equal(a.e.get('omap').className,'p2 route-action');assert.equal(a.e.get('chkaddr').className,'done route-action');
  assert.equal(a.e.get('omaprow').hidden,false);
});
test('route actions appear only for all confirmed current addresses and disappear on edit or clear',async()=>{
  const a=app();let calls=0;a.c.searchPlaces=async(raw)=>{calls++;return [{nm:raw,x:127,y:37}];};
  await a.c.주소확인();assert.equal(calls,0);assert.equal(a.c.document.activeElement.id,'to');
  a.e.get('to').value='서울역';await a.c.경로자동조회();assert.equal(calls,0);assert.equal(a.e.get('omaprow').hidden,true);
  await a.c.주소확인();assert.equal(calls,2);assert.equal(a.e.get('omaprow').hidden,false);assert.equal(a.e.get('hint1').hidden,false);
  a.e.get('to').value='용산역';a.e.get('to').emit('input');assert.equal(a.e.get('omaprow').hidden,true);assert.equal(a.e.get('hint1').hidden,true);
  await a.c.주소확인();assert.equal(a.e.get('omaprow').hidden,false);
  a.e.get('via').value='시청';a.e.get('via').emit('input');assert.equal(a.e.get('omaprow').hidden,true);
  a.c.searchPlaces=async()=>[{nm:'후보1',x:1,y:1},{nm:'후보2',x:2,y:2}];await a.c.주소확인();assert.equal(a.e.get('omaprow').hidden,true);assert.equal(a.e.get('addressDetails').open,true);
  a.c.ADDR.forEach(it=>it.pick=it.cands[0]);a.c.경로단계갱신(true);assert.equal(a.e.get('omaprow').hidden,false);
  a.c.ADDR[0].pick=null;a.c.경로단계갱신(true);assert.equal(a.e.get('omaprow').hidden,true);
  a.c.searchPlaces=async()=>{throw Error('offline');};await a.c.주소확인();assert.equal(a.e.get('mapfallback').hidden,false);assert.equal(a.e.get('omaprow').hidden,true);
  a.e.get('clr').click();assert.equal(a.e.get('mapfallback').hidden,true);assert.equal(a.e.get('addressDetails').hidden,true);assert.equal(a.e.get('omaprow').hidden,true);
});
test('native report preserves escaped text, exact totals, provenance, selected photos and highlight coordinates',()=>{
  const a=app();valid(a);a.e.get('name').value='<img src=x onerror=alert(1)>';a.e.get('purp').value='현장 검토 & 출장 보고';a.e.get('toll').value='9600';
  a.c.SHOT.toll=[{use:{width:800,height:1400,src:'data:image/png;base64,TEST'},hl:[{x:20,y:50,w:300,h:40}],zoom:.6},{use:null}];
  a.c.draw();const preview=a.e.get('reportPreview').innerHTML;
  assert.match(preview,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(preview,/<img src=x/);
  assert.match(preview,/13,740 원/);assert.match(preview,/현장 검토 &amp; 출장 보고/);assert.match(preview,/viewBox="0 0 800 1400"/);assert.match(preview,/<rect x="20" y="50" width="300" height="40"/);assert.match(preview,/width:60%/);
  let printed='';a.c.window.open=()=>({document:{write:s=>printed=s,close(){}},focus(){}});a.e.get('prt').click();
  assert.match(printed,/<title>자차보조금정산_/);assert.match(printed,/report-costs/);assert.match(printed,/\/fonts.css/);assert.match(printed,/\/print.js/);assert.doesNotMatch(printed,/<canvas/);
  assert.match(printed,/13,740 원/);assert.equal((printed.match(/class="report-sheet report-evidence"/g)||[]).length,1);
});
test('report numbers and toll status link to the first matching evidence, with return links',()=>{
  const a=app();valid(a);a.e.get('toll').value='9600';a.e.get('park').value='3000';
  const photo=()=>({use:{width:800,height:600,src:'data:image/png;base64,TEST'},hl:[]});
  a.c.SHOT.map=[photo(),photo()];a.c.SHOT.oil=[photo()];a.c.SHOT.toll=[{use:null},photo(),photo()];a.c.SHOT.park=[photo()];
  a.c.RT_INFO={편도:11.5};a.c.draw();const out=a.e.get('reportPreview').innerHTML;
  assert.match(out,/href="#report-evidence-1"[^>]*>23\.0 km<\/a>/);
  assert.match(out,/href="#report-evidence-1"[^>]*>11\.5 km<\/a>/);
  assert.match(out,/href="#report-evidence-3"[^>]*>1,500 원\/L<\/a>/);
  assert.match(out,/<th scope="row">통행료<\/th><td><a[^>]*href="#report-evidence-4"[^>]*>증빙 첨부<\/a>/);
  assert.match(out,/16,740 원/);assert.doesNotMatch(out,/\[object Object\]/);
  assert.equal((out.match(/href="#report-summary"/g)||[]).length,6);
  const ids=new Set([...out.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for(const m of out.matchAll(/\bhref="#([^"]+)"/g))assert.ok(ids.has(m[1]),'missing destination: '+m[1]);
  assert.deepEqual(Array.from(a.c.reportEvidence(),pg=>pg.key),['map','map','oil','toll','toll','park']);
  assert.ok(a.e.get('pv').texts.some(t=>t.text==='증빙 첨부'));
});
test('missing or removed evidence is plain text and never leaves a dangling PDF link',()=>{
  const a=app();valid(a);a.c.draw();let out=a.e.get('reportPreview').innerHTML;
  assert.match(out,/<th scope="row">통행료<\/th><td>증빙 미첨부<\/td><td class="amount">0 원<\/td>/);
  assert.doesNotMatch(out,/href="#report-evidence-/);
  a.c.SHOT.toll=[{use:{width:800,height:600,src:'data:image/png;base64,TEST'},hl:[]}];a.e.get('toll').value='9600';a.e.get('inc').checked=false;a.c.draw();
  out=a.e.get('reportPreview').innerHTML;assert.match(out,/href="#report-evidence-1"[^>]*>증빙 첨부<\/a> · 별도 청구 · 합계 제외/);assert.match(out,/4,140 원/);
  a.c.SHOT.toll=[];a.c.draw();out=a.e.get('reportPreview').innerHTML;
  assert.match(out,/증빙 미첨부 · 별도 청구 · 합계 제외/);assert.doesNotMatch(out,/href="#report-evidence-/);
  assert.ok(a.e.get('pv').texts.some(t=>t.text.includes('증빙 미첨부')));
});
test('print document uses internal destinations for long summaries and escapes linked labels',()=>{
  const a=app();valid(a);a.e.get('purp').value='현장 설계 변경 검토 '.repeat(100);
  a.c.SHOT.oil=[{use:{width:800,height:600,src:'data:image/png;base64,TEST'},hl:[]}];
  const model=a.c.reportModel();model.evidence=a.c.reportEvidence();model.evidence[0].label='유가 <증빙> "확인"';
  const printed=a.c.window.JachaReport.printDocument(model,'https://example.com');
  assert.match(printed,/href="#report-evidence-1" title="유가 &lt;증빙&gt; &quot;확인&quot;로 이동"/);
  assert.doesNotMatch(printed,/<a[^>]*href="https?:|#page=/);
  assert.match(printed,/id="report-summary"/);assert.match(printed,/id="report-evidence-1"/);
  assert.match(printed,/증빙 미첨부/);assert.doesNotMatch(printed,/\[object Object\]/);
});
test('PNG layout wraps long Korean purpose and addresses without clipping its footer',()=>{
  const a=app();valid(a);const purpose='협력사와 공동 현장 점검 및 설계 변경 사항 검토 '.repeat(8);a.e.get('purp').value=purpose;a.e.get('to').value='서울특별시 중구 세종대로 서울시청 별관 지하주차장 방문객 출입구 '.repeat(6);
  a.c.FSCALE=1.3;a.c.draw();const cv=a.e.get('pv');assert.ok(cv.texts.every(t=>t.y<cv._h-16));
  assert.ok(cv.texts.some(t=>t.text.includes('협력사와 공동')));assert.ok(cv.texts.filter(t=>t.text.includes('서울특별시')).length>=2);
  assert.ok(cv.texts.filter(t=>/정산서|청구 합계/.test(t.text)).every(t=>/^(600|700) /.test(t.font)));
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
