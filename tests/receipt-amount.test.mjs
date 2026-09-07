import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({});vm.runInContext(readFileSync('public/receipt-amount.js','utf8'),context);
const {parse,summary,totals}=context.ReceiptAmount;
const item=(amount,pending=false)=>({receipt:{amount,pending}});
test('parking and toll use paid totals instead of tax, discounts, timestamps or plate numbers',()=>{
  for(const [text,amount] of [
    ['주차 영수증\n차량번호 123가4567\n주차요금 10,000원\n할인금액 2,000원\n결제금액 8,000원\n부가세 727원',8000],
    ['한국도로공사\n2026-09-08 12:32\n통행요금 2,800원\n승인번호 93472318',2800],
    ['주차료 0원\n할인금액 3,000원\n결제금액 0원',0],
    ['결 제 금 액\n3,000 원',3000],
    ['AMOUNT PAID 4,500\nTAX 409\nCHANGE 5,500',4500],
    ['결제금액 1 2 , 8 0 0 원',12800]
  ])assert.equal(parse(text).amount,amount,text);
});
test('ambiguous, low confidence and numeric identifiers do not auto-fill',()=>{
  for(const text of ['승인번호 12345678\n차량번호 123가4567','결제금액 3,000원\n결제금액 4,000원','합계\n승인번호 12345678','주차시간 300분','결제금액 2,80원','주차요금 -3000원','결제금액 999999999999원','부가세 300원\n할인금액 500원'])assert.equal(parse(text).amount,null,text);
  assert.equal(parse('결제금액 3,000원',25).amount,null);
});
test('receipt totals wait for all pages, recalculate deletion and never add round-trip multipliers',()=>{
  const ledger=totals(),a=[item(2800),item(null,true)];assert.equal(ledger.choose('toll',a,'0'),null);
  a[1]=item(3200);assert.equal(ledger.choose('toll',a,'0'),6000);
  assert.equal(ledger.choose('toll',[a[0]],'6000'),2800);
  assert.equal(ledger.choose('toll',[],'2800'),0);
  assert.equal(summary([item(0)]).complete,true);
});
test('manual input including zero survives delayed OCR; explicit apply enables totals again',()=>{
  const ledger=totals(),a=[item(3000)];assert.equal(ledger.choose('park',a,'5000'),null);
  ledger.manual('park');assert.equal(ledger.choose('park',a,'0'),null);
  assert.equal(ledger.choose('park',a,'0',true),3000);
  assert.equal(ledger.choose('park',[...a,item(2000)],'3000'),5000);
  ledger.manual('park');assert.equal(ledger.choose('park',[],'5000'),null);
  ledger.reset();assert.equal(ledger.choose('park',a,'0'),3000);
});
