import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync('public/print.js','utf8');
function setup(){
  let printCount=0,fontResolve;const images=[],callbacks={},timers=new Map();let serial=0;
  const fontPromise=new Promise(resolve=>fontResolve=resolve);
  const status={},button={addEventListener:(type,cb)=>callbacks[type]=cb};
  const context=vm.createContext({document:{getElementById:id=>id==='printStatus'?status:button,fonts:{load:()=>fontPromise,check:()=>true},querySelectorAll:()=>[{getAttribute:()=> 'data:image/png;base64,test'}]},
    Image:class{constructor(){images.push(this);}},window:{print:()=>printCount++},
    setTimeout:cb=>{timers.set(++serial,cb);return serial;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:cb=>cb()});
  const done=vm.runInContext(script,context);return {done,status,button,images,callbacks,timers,fontResolve,context,prints:()=>printCount};
}
test('printing waits for both the Korean font and all evidence images',async()=>{
  const a=setup();assert.equal(a.button.disabled,true);assert.equal(a.prints(),0);
  a.fontResolve([{}]);await new Promise(setImmediate);assert.equal(a.prints(),0);
  a.images[0].onload();await a.done;assert.equal(a.prints(),1);assert.equal(a.button.disabled,false);assert.equal(a.timers.size,0);
});
test('an image error or readiness timeout offers retry without printing incomplete evidence',async()=>{
  for(const mode of ['image','timeout']){
    const a=setup();a.fontResolve([{}]);if(mode==='image')a.images[0].onerror();else [...a.timers.values()][0]();
    await a.done;assert.equal(a.prints(),0);assert.equal(a.button.disabled,false);assert.match(a.status.textContent,/다시/);
    const retry=a.callbacks.click();a.images[1].onload();await retry;assert.equal(a.prints(),1);
  }
});
test('a missing bundled Korean font prevents a silent fallback print',async()=>{
  const a=setup();a.context.document.fonts.check=()=>false;a.fontResolve([{}]);a.images[0].onload();await a.done;
  assert.equal(a.prints(),0);assert.equal(a.button.disabled,false);assert.match(a.status.textContent,/글꼴/);
});
test('a failed stylesheet cannot masquerade as a successfully loaded font',async()=>{
  const a=setup();a.fontResolve([]);a.images[0].onload();await a.done;
  assert.equal(a.prints(),0);assert.match(a.status.textContent,/글꼴/);
});
