/* Receipt의 금액 라벨/제외 항목 규칙을 정산용으로 적용. 불명확한 후보는 자동 반영하지 않는다. */
(function(root){
  'use strict';
  const negative = /공급가|부가세|부가가치세|세액|면세|과세|거스름|잔액|잔돈|할인|포인트|적립|마일리지|쿠폰|받은돈|받은금액|취소|환불|미납|미결제|예상|기본요금|추가요금|선불|충전|balance|change|discount|tax|refund|subtotal/i;
  const tiers = [
    /실결제금액|최종결제금액|총결제금액|결제금액|카드승인금액|승인금액|실납부금액|납부금액|납부액|수납금액|수납액|지불금액|지불액|결제요금|최종요금|받을금액|amountpaid|amountdue|paid/i,
    /합계금액|총합계|합계|총계|총액|총요금|totalamount|total/i,
    /통행요금|통행료|주차요금|주차료|이용금액|이용요금|요금|금액|toll|parkingfee/i
  ];
  function normalize(text){
    return String(text||'').normalize('NFKC').replace(/(?:[\d,.]\s){3,}[\d,.]/g,s=>s.replace(/\s/g,''));
  }
  function money(line){
    const cleaned=line.replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/g,' ')
      .replace(/\d{1,2}:\d{2}(?::\d{2})?/g,' ')
      .replace(/[\d*]{2,4}(?:\s*-\s*[\d*]{2,5})+/g,' ')
      .replace(/\d{2,3}\s*[가-힣]\s*\d{4}/g,' ')
      .replace(/(?:승인|거래|전표|단말기|차량|카드|가맹점)\s*(?:번호|NO)?\s*[:：]?\s*[\d*-]+/gi,' ');
    const values=[];
    for(const m of cleaned.matchAll(/(?:\d[\d,]*)(?:\.\d+)?/g)){
      const raw=m[0], before=cleaned.slice(0,m.index), after=cleaned.slice(m.index+raw.length);
      if(raw.includes('.') || (raw.includes(',')&&!/^\d{1,3}(?:,\d{3})+$/.test(raw)))continue;
      if(/[\d*]$|[-−(]\s*$/.test(before)||/^[\d*-]/.test(after)||/^\s*(?:km|분|시간|일|월|년|대|건|%)/i.test(after))continue;
      const n=Number(raw.replace(/,/g,''));
      if(Number.isSafeInteger(n)&&n>=0&&n<=50000000&&(n>=100||/^\s*원/.test(after)||/[₩￦]\s*$/.test(before)))values.push(n);
    }
    return [...new Set(values)];
  }
  function parse(text, confidence=100){
    if(!Number.isFinite(confidence)||confidence<45)return {amount:null,reason:'흐린 글씨 · 금액을 확인해 주세요'};
    const lines=normalize(text).split('\n').map(s=>s.trim()).filter(Boolean), found=[[],[],[]];
    for(let i=0;i<lines.length;i++){
      const c=lines[i].replace(/\s/g,'');
      if(negative.test(c))continue;
      const tier=tiers.findIndex(re=>re.test(c));if(tier<0)continue;
      let values=money(lines[i]);
      // 다음 줄은 숫자/통화만 있는 경우에만 라벨의 값으로 인정한다.
      if(!values.length&&lines[i+1]&&/^[₩￦\d,\s원]+$/.test(lines[i+1]))values=money(lines[i+1]);
      found[tier].push(...values);
    }
    for(const candidates of found){
      const values=[...new Set(candidates)];
      if(values.length===1)return {amount:values[0],reason:'금액 인식 완료 · 영수증과 확인해 주세요'};
      if(values.length>1)return {amount:null,reason:'서로 다른 금액이 있어요 · 직접 확인해 주세요'};
    }
    return {amount:null,reason:'결제 금액을 찾지 못했어요 · 직접 입력해 주세요'};
  }
  function summary(items){
    const ready=items.filter(it=>Number.isSafeInteger(it.receipt?.amount)&&it.receipt.amount>=0);
    const pending=items.filter(it=>it.receipt?.pending).length;
    return {count:items.length,ready:ready.length,pending,total:ready.reduce((n,it)=>n+it.receipt.amount,0),complete:!!items.length&&ready.length===items.length&&!pending};
  }
  // 수동 수정은 별도 소유권으로 기록한다. 0으로 고쳐도 OCR이 다시 덮지 않는다.
  function totals(){
    const states=new Map();
    function state(key){if(!states.has(key))states.set(key,{manual:false,last:null});return states.get(key);}
    return {
      manual(key){state(key).manual=true;},
      reset(){states.clear();},
      choose(key,items,current,force=false){
        const s=state(key), info=summary(items);
        if(force&&info.complete){s.manual=false;s.last=String(info.total);return info.total;}
        if(s.manual||(!info.complete&&items.length))return null;
        const owns=s.last!==null&&String(current)===s.last;
        const empty=s.last===null&&(current===''||Number(current)===0);
        if(!owns&&!empty)return null;
        if(!items.length&&s.last===null)return null;
        s.last=String(info.total);return info.total;
      }
    };
  }
  root.ReceiptAmount={parse,summary,totals};
})(typeof globalThis!=='undefined'?globalThis:this);
