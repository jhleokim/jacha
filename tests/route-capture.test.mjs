import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {routeQuery,routeDistance,routeMapReady,renderRoute,routeCaptureResponse} from '../route-capture.js';
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

function mapDOM(){
  let now=0;
  function el(){return {rect:{x:0,y:0,left:0,top:0,right:256,bottom:256,width:256,height:256},style:{display:'block',visibility:'visible',opacity:'1'},getBoundingClientRect(){return this.rect;},checkVisibility(){return !this.hidden;}};}
  const tiles=Array.from({length:4},(_,i)=>Object.assign(el(),{src:'https://mts.kakaocdn.net/api/v1/tile/'+i+'.png',complete:true,naturalWidth:512,naturalHeight:512}));
  const path=Object.assign(el(),{d:'M10 20 L'+('30 40 ').repeat(50),getAttribute(){return this.d;}}),paths=[path];
  const distance=Object.assign(el(),{innerText:'12.8km'});
  const context=vm.createContext({window:{},innerWidth:1440,innerHeight:1000,performance:{now:()=>now},getComputedStyle:el=>el.style,
    document:{getElementById:()=>({querySelectorAll:s=>s==='img'?tiles:paths}),querySelector:()=>distance}});
  const ready=()=>vm.runInContext('('+routeMapReady.toString()+')(2000)',context);
  return {tiles,paths,path,distance,ready,time:n=>now=n};
}
test('map captures require two continuous seconds of loaded, stationary tiles and route lines',()=>{
  const m=mapDOM();assert.equal(m.ready(),false);m.time(1999);assert.equal(m.ready(),false);m.time(2000);assert.equal(m.ready(),true);
  m.path.d+=' 50 60';assert.equal(m.ready(),false);m.time(3999);assert.equal(m.ready(),false);m.time(4000);assert.equal(m.ready(),true);
  m.tiles[0].rect.x=50;assert.equal(m.ready(),false);m.time(6000);assert.equal(m.ready(),true);
  m.tiles[0].src+='?new';assert.equal(m.ready(),false);m.time(8000);assert.equal(m.ready(),true);
  m.distance.innerText='15.2km';assert.equal(m.ready(),false);
});
test('a late or broken visible tile restarts readiness; offscreen preloads do not block capture',()=>{
  const m=mapDOM();m.ready();m.time(1999);m.tiles[0].complete=false;assert.equal(m.ready(),false);
  m.time(2200);m.tiles[0].complete=true;assert.equal(m.ready(),false);m.time(4200);assert.equal(m.ready(),true);
  m.tiles[0].naturalWidth=0;assert.equal(m.ready(),false);m.tiles[0].naturalWidth=512;
  m.tiles[0].naturalHeight=0;assert.equal(m.ready(),false);m.tiles[0].naturalHeight=512;
  const offscreen={...m.tiles[0],complete:false,rect:{...m.tiles[0].rect,x:2000,left:2000,right:2256}};m.tiles.push(offscreen);
  assert.equal(m.ready(),false);m.time(6200);assert.equal(m.ready(),true);
});
test('hidden, missing or unfinished route content cannot pass map readiness',()=>{
  for(const mode of ['hiddenPath','emptyPath','noTiles','hiddenDistance','badDistance']){
    const m=mapDOM();m.ready();m.time(2500);
    if(mode==='hiddenPath')m.path.hidden=true;
    if(mode==='emptyPath')m.path.d='M0 0';
    if(mode==='noTiles')m.tiles.length=0;
    if(mode==='hiddenDistance')m.distance.style.visibility='hidden';
    if(mode==='badDistance')m.distance.innerText='조회 중';
    assert.equal(m.ready(),false,mode);
  }
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
test('map readiness or decode failure closes the browser without a partial screenshot',async()=>{
  for(const stage of ['initial','decode','recheck']){
    let closed=0,captured=0,waits=0,evaluations=0;const q=routeQuery(url());
    const page={async setViewport(){},setDefaultTimeout(){},async goto(){},url:()=>q.url,
      async waitForFunction(fn,options,stableMs){assert.equal(fn,routeMapReady);assert.equal(stableMs,2000);waits++;if((stage==='initial'&&waits===1)||(stage==='recheck'&&waits===2))throw Error('map_not_ready');},
      async evaluate(){evaluations++;if(stage==='decode'&&evaluations===2)throw Error('decode_failed');return {names:q.names,distance:'12.8km'};},
      async screenshot(){captured++;}};
    await assert.rejects(renderRoute({},q,async()=>({newPage:async()=>page,close:async()=>{closed++;}})));
    assert.equal(captured,0);assert.equal(closed,1);
  }
});
