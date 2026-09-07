import test from 'node:test';
import assert from 'node:assert/strict';
import {captureQuery,verifiedPrice,renderOpinet,captureResponse} from '../opinet-capture.js';
const query=(date='20260906',fuel='B027')=>captureQuery(new URL(`https://example.com/opinet/screenshot?date=${date}&prodcd=${fuel}`));
const snapshot={start:'20260906',end:'20260906',term:'D',headers:['구분','보통휘발유','자동차용경유'],rows:[['2026년09월05일','1,800.00','1,750.00'],['2026년09월06일','1,859.33','1,843.73']]};
test('capture only accepts a real historical date and supported fuel',()=>{
  assert.equal(query().iso,'2026-09-06');
  for(const [date,fuel] of [['20260230','B027'],['20990101','B027'],['20260906','https://evil.test'],['2026090','B027']])assert.equal(query(date,fuel),null);
  assert.match(query('20260906','K015').url,/dopVsAvselSelect/);
});
test('capture verifies selected day and correct product column including LPG short year',()=>{
  assert.equal(verifiedPrice(snapshot,query()),1859.33);
  assert.equal(verifiedPrice(snapshot,query('20260906','D047')),1843.73);
  assert.equal(verifiedPrice({...snapshot,headers:['기간','자동차부탄 (원/ℓ)'],rows:[['26년09월06일','1,098.57']]},query('20260906','K015')),1098.57);
  for(const changes of [{start:'20260905'},{term:'W'},{headers:['구분','고급휘발유']},{rows:[]},{rows:[['2026년09월06일','0']]}])assert.throws(()=>verifiedPrice({...snapshot,...changes},query()));
});
test('browser always closes after screenshot or a verification failure',async()=>{
  for(const fail of [false,true]){
    let closed=0,captured=0,evals=0;
    const page={setDefaultTimeout(){},setDefaultNavigationTimeout(){},async setViewport(){},async goto(){return {ok:()=>true};},async waitForSelector(){},async select(){},async $$eval(){return [];},async click(){},async waitForNavigation(){},url:()=>query().url,
      async evaluate(fn,arg){if(arg)return;evals++;return evals===1?{...snapshot,start:fail?'20000101':snapshot.start}:evals===3?1200:undefined;},async screenshot(){captured++;return new Uint8Array([137,80,78,71]);}};
    const launch=async()=>({newPage:async()=>page,close:async()=>{closed++;}});
    if(fail)await assert.rejects(renderOpinet({},query(),launch),/mismatch/);else assert.equal((await renderOpinet({},query(),launch)).price,1859.33);
    assert.equal(closed,1);assert.equal(captured,fail?0:1);
  }
});
test('cache reuses verified PNGs and never caches capture failure',async()=>{
  const entries=new Map(),pending=[];let calls=0;
  globalThis.caches={default:{match:async k=>entries.get(k.url)?.clone(),put:async(k,r)=>entries.set(k.url,r)}};
  const req=new Request('https://example.com/opinet/screenshot?date=20260906&prodcd=B027');
  const ctx={waitUntil:p=>pending.push(p)};
  const render=async()=>{calls++;return {png:new Uint8Array([137,80,78,71]),price:1859.33};};
  const first=await captureResponse(req,{BROWSER:{}},ctx,render);await Promise.all(pending);
  assert.equal(first.headers.get('content-type'),'image/png');assert.equal(first.headers.get('x-oil-date'),'2026-09-06');
  assert.equal(first.headers.get('x-oil-price'),'1859.33');
  await captureResponse(req,{BROWSER:{}},ctx,render);assert.equal(calls,1);
  entries.clear();
  const bad=await captureResponse(req,{BROWSER:{}},ctx,async()=>{throw new Error('timeout');});
  assert.equal(bad.status,502);assert.equal(bad.headers.get('cache-control'),'no-store');assert.equal(entries.size,0);
  assert.equal((await captureResponse(req,{},ctx,render)).status,503);
});
