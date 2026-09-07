import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/calculation.js';
const {calculate,round10}=globalThis.JachaCalc;
const base={km:'156.8',price:'1652',fe:'10',rate:'1.2',toll:'9600',park:'3000',inc:true,mode:'floor'};
test('normal settlement and expense inclusion',()=>{
  const result=calculate(base);
  assert.equal(result.err,''); assert.equal(result.sub,31080); assert.equal(result.total,43680);
  assert.equal(calculate({...base,inc:false}).total,31080);
});
test('45,000 distance/price combinations match integer arithmetic',()=>{
  for(const price of [1000,1200,1400,1500,1600,1652,1750,1800,2000]){
    for(let tenth=1;tenth<=5000;tenth++){
      const expected=Number(BigInt(tenth)*BigInt(price)*12n/10000n)*10;
      assert.equal(calculate({...base,km:String(tenth/10),price:String(price)}).sub,expected,`${tenth/10}km / ${price}`);
    }
  }
});
test('decimal rates, economy and rounding boundaries',()=>{
  const input={...base,km:'1',fe:'1',rate:'1',price:'19.9999999'};
  assert.equal(calculate(input).sub,10);
  assert.equal(calculate({...input,price:'20'}).sub,20);
  assert.equal(calculate({...input,price:'15',mode:'round'}).sub,20);
  assert.equal(calculate({...input,price:'14.99999',mode:'round'}).sub,10);
  assert.equal(calculate({...input,price:'15.5',mode:'none'}).sub,16);
  assert.equal(calculate({...input,km:'1.25',fe:'2.5',price:'1000',rate:'1.3'}).sub,650);
  assert.equal(calculate({...input,km:'1e-3',price:'2e4'}).sub,20);
  assert.equal(round10(11.5/10*1500*1.2,'floor'),2070);
  assert.equal(round10(4139.999999999999,'floor'),4140);
});
test('invalid values block totals, including fractional negative expenses and overflow',()=>{
  for(const field of ['km','price','fe','rate'])for(const value of ['',0,-1,'bad',Infinity]){
    const r=calculate({...base,[field]:value}); assert.ok(r.err,`${field}=${value}`); assert.equal(r.total,0); assert.equal(r.sub,0);
  }
  for(const field of ['toll','park'])for(const value of [-1,-0.1,Infinity,'bad'])assert.ok(calculate({...base,[field]:value}).err);
  assert.ok(calculate({...base,km:'1e300'}).err);
});
