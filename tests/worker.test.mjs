import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
const env={KAKAO_REST_KEY:'test-key',OPINET_KEY:'test-oil',ASSETS:{fetch:async()=>new Response('asset')}};
function setup(body='{}',status=200){
  const entries=new Map(); let calls=0;
  globalThis.caches={default:{
    match:async key=>entries.get(key.url)?.clone(),
    put:async(key,res)=>entries.set(key.url,res.clone())
  }};
  globalThis.fetch=async request=>{calls++;return new Response(body,{status,headers:{'content-type':'application/json'}});};
  return {entries,calls:()=>calls};
}
const get=(path,options)=>worker.fetch(new Request('https://example.com'+path,options),env,{});
test('only application paths and GET are allowed; arbitrary products and unused TMAP blocked',async()=>{
  const state=setup();
  for(const path of ['/kakao/v2/user/me','/navi/v1/other','/tmap/routes','/opinet/other'])assert.equal((await get(path)).status,404);
  assert.equal((await get('/navi/v1/directions',{method:'POST'})).status,405);
  assert.equal((await get('/navi/v1/directions',{headers:{origin:'https://evil.example'}})).status,403);
  assert.equal(state.calls(),0);
  for(const path of ['/kakao/v2/local/search/address.json','/kakao/v2/local/search/keyword.json','/navi/v1/directions'])assert.equal((await get(path)).status,200);
});
test('empty, malformed, invalid-price and failed oil responses are not cached',async()=>{
  for(const [body,status] of [['{"RESULT":{"OIL":[]}}',200],['invalid',200],['{"RESULT":{"OIL":[{"PRICE":"0","DATE":"20260906"}]}}',200],['{}',502]]){
    const state=setup(body,status);
    const res=await get('/opinet/price?date=20260906&prodcd=B027');
    assert.equal(res.headers.get('cache-control'),'no-store'); assert.equal(state.entries.size,0);
    await get('/opinet/price?date=20260906&prodcd=B027'); assert.equal(state.calls(),2);
  }
});
test('valid oil data is cached, headers survive cache hits and API keys stay out of cache keys',async()=>{
  const state=setup('\uFEFF{"RESULT":{"OIL":[{"PRICE":"1652.10","DATE":"20260906"}]}}');
  const path='/opinet/price?date=20260906&prodcd=B027';
  await get(path); const hit=await get(path);
  assert.equal(hit.headers.get('x-cache'),'HIT'); assert.equal(hit.headers.get('x-content-type-options'),'nosniff');
  assert.equal(state.calls(),1); assert.ok([...state.entries.keys()].every(k=>!k.includes('test-oil')));
});
test('receipt sessions must be UUIDv4, with no relay caching',async()=>{
  setup(); let relays=0;
  env.RECEIPT={fetch:async()=>{relays++;return new Response('{}');}};
  for(const id of ['--------','12345678','00000000-0000-0000-0000-000000000000'])assert.equal((await get('/receipt/poll?s='+id)).status,400);
  const res=await get('/receipt/poll?s=12345678-1234-4234-a234-123456789abc');
  assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(relays,1);
});
