import test from 'node:test';
import assert from 'node:assert/strict';
import {routeQuery,routeDistance,renderRoute,routeCaptureResponse} from '../route-capture.js';
const url=(rt='509722,1110113,495766,1128615',names=['강남역','서울역'])=>new URL('https://example.com/navi/screenshot?'+new URLSearchParams({rt,names:JSON.stringify(names)}));
test('route capture only builds fixed Kakao URLs with bounded points and matching names',()=>{
  const q=routeQuery(url());assert.equal(new URL(q.url).origin,'https://map.kakao.com');
  for(const [rt,names] of [['https://evil.test',['a','b']],['1,2,3',['a','b']],['1,2,3,4',['a']],['0,2,3,4',['a','b']],['1,2,3,4',['a'.repeat(101),'b']]])assert.equal(routeQuery(url(rt,names)),null);
  assert.equal(new URL(routeQuery(url('1,2,3,4',['A & B','C#D'])).url).searchParams.get('rt1'),'A & B');
});
test('distance comes from matching map points and supports metres without guessing',()=>{
  const names=['출발','경유','도착'];
  assert.equal(routeDistance({names,distance:'12.8\nkm'},names),12.8);
  assert.equal(routeDistance({names,distance:'850m'},names),.85);
  for(const snapshot of [{names:['출발','도착'],distance:'12km'},{names,distance:'0km'},{names,distance:'통행료 1200원'},{names,distance:'Infinitykm'}])assert.throws(()=>routeDistance(snapshot,names));
});
test('route browser closes and mismatched results are never captured',async()=>{
  for(const valid of [true,false]){
    let closed=0,captured=0;
    const q=routeQuery(url());
    const page={async setViewport(){},setDefaultTimeout(){},async goto(){},async waitForFunction(){},url:()=>q.url,
      async evaluate(){return {names:valid?q.names:['wrong'],distance:'12.8km'};},async screenshot(){captured++;return new Uint8Array([137,80,78,71]);}};
    const launch=async()=>({newPage:async()=>page,close:async()=>{closed++;}});
    if(valid)assert.equal((await renderRoute({},q,launch)).km,12.8);else await assert.rejects(renderRoute({},q,launch));
    assert.equal(closed,1);assert.equal(captured,valid?1:0);
  }
});
test('route screenshots and failures are never cached',async()=>{
  const req=new Request(url());
  const res=await routeCaptureResponse(req,{BROWSER:{}},async()=>({png:new Uint8Array([137,80,78,71]),km:12.8}));
  assert.equal(res.status,200);assert.equal(res.headers.get('x-route-km'),'12.8');assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal((await routeCaptureResponse(req,{})).status,503);
  assert.equal((await routeCaptureResponse(req,{BROWSER:{}},async()=>{throw new Error('unavailable');})).status,502);
});
