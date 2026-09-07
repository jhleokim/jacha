(function(root){
  'use strict';
  let ledger;
  const keys=['toll','park'], labels={toll:'통행료',park:'주차료'};
  const $=id=>document.getElementById(id);
  const items=k=>root.SHOT[k]||[];
  const model=()=>ledger||(ledger=ReceiptAmount.totals());
  function current(k,it,version){return items(k).includes(it)&&it.receipt.version===version;}
  function apply(k,value){
    $(k).value=String(value);root.SRC[k]=labels[k]+': 영수증별 확인 금액 합계';
    if(root.OVMODE===k)$('ov'+k+'amt').value=String(value);
    root.초안즉시저장();root.draw();
  }
  function sync(k){
    if(!keys.includes(k))return;
    const value=model().choose(k,items(k),$(k).value);if(value!==null)apply(k,value);
    const info=ReceiptAmount.summary(items(k));
    const text=!info.count?'영수증 사진을 넣으면 금액을 자동으로 읽습니다.'
      :info.pending?'금액 인식 중 · '+info.ready+'/'+info.count+'장 확인'
      :!info.complete?info.ready+'/'+info.count+'장 확인 · 읽지 못한 사진의 금액을 입력해 주세요.'
      :info.total.toLocaleString('ko-KR')+'원 · '+info.count+'장 합계'+(String($(k).value)===String(info.total)?' 반영됨 · 금액을 확인해 주세요.':' · 현재 입력값은 유지했습니다.');
    for(const id of ['ocr_'+k,root.OVMODE===k?'ovocr':null]){
      const box=id&&$(id);if(!box)continue;box.textContent=text;
      if(info.complete&&String($(k).value)!==String(info.total)){
        const b=document.createElement('button');b.type='button';b.className='mini';b.textContent='이 합계 적용';
        b.addEventListener('click',()=>{const v=model().choose(k,items(k),$(k).value,true);if(v!==null)apply(k,v);sync(k);});box.appendChild(b);
      }
    }
  }
  function refresh(k,it){
    const state=it.receipt;
    it.receiptViews=(it.receiptViews||[]).filter(view=>view.status.isConnected!==false);
    for(const view of it.receiptViews){
      view.status.textContent=state.status;
      if(document.activeElement!==view.input)view.input.value=state.amount===null?'':String(state.amount);
      view.retry.disabled=state.pending;
    }
    sync(k);
  }
  function start(k,it){
    if(!keys.includes(k))return;
    const previous=it.receipt||{version:0,amount:null};
    it.receipt={version:previous.version+1,amount:previous.amount,pending:true,status:'금액 인식 대기 중…'};
    const version=it.receipt.version;refresh(k,it);
    ReceiptReader.recognize(it.use,()=>current(k,it,version),status=>{
      if(current(k,it,version)){it.receipt.status=status;refresh(k,it);}
    }).then(result=>{
      if(!current(k,it,version)||!result)return;
      it.receipt.pending=false;
      if(result.amount!==null)it.receipt.amount=result.amount;
      it.receipt.status=result.reason;refresh(k,it);
    }).catch(()=>{
      if(!current(k,it,version))return;
      it.receipt.pending=false;it.receipt.status='금액을 읽지 못했어요 · 직접 입력하거나 다시 인식해 주세요';refresh(k,it);
    });
  }
  function render(k,it,container,index){
    if(!keys.includes(k))return;
    const state=it.receipt||(it.receipt={version:0,amount:null,pending:false,status:'금액을 입력하거나 다시 인식해 주세요'});
    const box=document.createElement('div');box.className='receipt-amount';
    const label=document.createElement('label');label.textContent=(index+1)+'번째 영수증 금액 (원)';
    const input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.placeholder='인식 후 자동 입력';input.value=state.amount===null?'':String(state.amount);
    label.appendChild(input);box.appendChild(label);
    const status=document.createElement('p');status.className='note';status.setAttribute('role','status');status.textContent=state.status;box.appendChild(status);
    const retry=document.createElement('button');retry.type='button';retry.className='mini';retry.textContent='금액 다시 인식';retry.disabled=state.pending;
    retry.addEventListener('click',()=>start(k,it));box.appendChild(retry);
    input.addEventListener('input',()=>{
      const n=Number(input.value);it.receipt.version++;it.receipt.pending=false;
      it.receipt.amount=input.value!==''&&Number.isSafeInteger(n)&&n>=0&&n<=50000000?n:null;
      it.receipt.status=it.receipt.amount===null?'금액을 확인해 주세요':'직접 확인한 금액';refresh(k,it);
    });
    it.receiptViews=it.receiptViews||[];it.receiptViews.push({input,status,retry});container.appendChild(box);
  }
  function gallery(){
    const box=$('ovattachments');if(!box)return;box.innerHTML='';
    const k=root.OVMODE==='route'?'map':root.OVMODE;
    (root.SHOT[k]||[]).forEach((it,index)=>{
      const card=document.createElement('div');card.className='evidence-photo';
      const preview=document.createElement('button');preview.type='button';preview.className='qr-preview';preview.setAttribute('aria-label',(index+1)+'번째 첨부 사진 크게 보기');
      const img=document.createElement('img');img.src=it.use.src||it.use.toDataURL('image/png');img.alt=(index+1)+'번째 첨부 사진';preview.appendChild(img);
      preview.addEventListener('click',()=>{
        $('receiptimage').src=img.src;$('receiptviewtitle').textContent=(index+1)+'번째 첨부 사진';
        $('receiptview').className='receipt-view';$('receiptzoom').textContent='글씨 확대';$('receiptzoom').setAttribute('aria-pressed','false');$('receiptview').showModal();
      });
      card.appendChild(preview);render(k,it,card,index);
      const del=document.createElement('button');del.type='button';del.className='mini';del.textContent='사진 삭제';
      del.addEventListener('click',()=>{const index=items(k).indexOf(it);if(index>=0)items(k).splice(index,1);root.refreshSlot(k);});card.appendChild(del);box.appendChild(card);
    });
    $('ovocr').hidden=!keys.includes(k);sync(k);
  }
  function init(){
    for(const k of keys){
      [$(k),$('ov'+k+'amt')].forEach(el=>el.addEventListener('input',()=>model().manual(k)));
    }
  }
  root.ReceiptEvidence={start,render,sync,gallery,init,manual:k=>model().manual(k),reset(){model().reset();}};
})(typeof globalThis!=='undefined'?globalThis:this);
