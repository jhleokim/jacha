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
    emit(event){for(const cb of this.listeners[event]||[])cb.call(this,{target:this,preventDefault(){}});}
    click(){this.emit('click');}
    appendChild(el){this.children.push(el);if(el.id)elements.set(el.id,el);return el;}
    querySelectorAll(selector){return selector==='canvas'?this.children.filter(e=>e.tagName==='canvas'):[];}
    querySelector(){return this.input;}
    setAttribute(){} focus(){} scrollIntoView(){}
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
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))vm.runInContext(match[1],context);
  return {c:context,e:elements,pins,saved,timers,frames};
}
function valid(a){for(const [k,v] of Object.entries({km:'23',price:'1500',fe:'10',rate:'1.2',toll:'0',park:'0'}))a.e.get(k).value=v;}
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
  a.c.OVMODE='route';a.e.get('ovkm').value='11.5';a.e.get('ovrt').checked=true;a.e.get('ovuse').click();
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
test('clear removes pinned values and cancels pending draft resurrection',()=>{
  const a=app();valid(a);a.e.get('name').value='테스트';a.pins.get('name').input.checked=true;a.c.pinSave();a.c.초안저장();
  a.e.get('clr').click();assert.equal(a.saved.has('jacha_pinned_v1'),false);assert.equal(a.saved.has('jacha_draft_v1'),false);
  assert.equal(a.c.DRAFT_T,null);assert.equal(a.e.get('name').value,'');assert.equal(a.pins.get('name').input.checked,false);
  const b=app(a.saved);assert.equal(b.e.get('name').value,'');
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
