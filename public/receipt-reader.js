/* 한국어/영문 인식은 같은 사이트에서 받은 Tesseract로 기기 안에서만 처리한다. */
(function(root){
  'use strict';
  let scriptPromise=null, workerPromise=null, worker=null, queue=Promise.resolve(), idle=null, generation=0;
  const base='/vendor/ocr/';
  function deadline(promise,ms){
    let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('인식 시간이 초과됐어요. 다시 인식해 주세요.')),ms);})]).finally(()=>clearTimeout(timer));
  }
  function load(){
    if(root.Tesseract)return Promise.resolve(root.Tesseract);
    if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=base+'tesseract.min.js';
      script.onload=()=>resolve(root.Tesseract);script.onerror=()=>reject(new Error('금액 인식 파일을 받지 못했어요. 연결 후 다시 인식해 주세요.'));
      document.head.appendChild(script);
    }).catch(err=>{scriptPromise=null;throw err;});
    return scriptPromise;
  }
  async function release(){
    generation++;const old=worker;worker=null;workerPromise=null;
    if(old)await old.terminate().catch(()=>{});
  }
  async function getWorker(){
    if(!workerPromise){
      const version=generation;
      workerPromise=(async()=>{
        const engine=await load();
        if(version!==generation)throw new Error('이전 인식 취소');
        const created=await engine.createWorker('kor+eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base+'lang',workerBlobURL:false,errorHandler:()=>{}});
        if(version!==generation){await created.terminate();throw new Error('이전 인식 취소');}
        worker=created;return created;
      })().catch(err=>{if(version===generation)workerPromise=null;throw err;});
    }
    return workerPromise;
  }
  function prepare(image){
    const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
    if(!w||!h)throw new Error('사진을 읽지 못했어요.');
    const scale=Math.min(1,2600/Math.max(w,h),Math.sqrt(4000000/(w*h)));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas;
  }
  function recognize(image,isCurrent,onStatus){
    clearTimeout(idle);
    const task=queue.catch(()=>{}).then(async()=>{
      if(!isCurrent())return null;
      clearTimeout(idle);let canvas;
      try{
        onStatus('금액 인식 준비 중… 처음에는 잠시 걸릴 수 있어요');
        const active=await deadline(getWorker(),90000);if(!isCurrent())return null;
        canvas=prepare(image);onStatus('영수증 금액 읽는 중…');
        await active.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1'});
        let result=await deadline(active.recognize(canvas),60000);
        let parsed=ReceiptAmount.parse(result.data.text,result.data.confidence);
        if(parsed.amount===null&&isCurrent()){
          onStatus('금액 위치를 다시 확인하는 중…');
          await active.setParameters({tessedit_pageseg_mode:'11'});
          result=await deadline(active.recognize(canvas),60000);
          parsed=ReceiptAmount.parse(result.data.text,result.data.confidence);
        }
        return parsed;
      }catch(err){await release();throw err;}
      finally{if(canvas)canvas.width=canvas.height=0;idle=setTimeout(release,20000);}
    });
    queue=task.catch(()=>{});return task;
  }
  root.ReceiptReader={recognize};
})(typeof globalThis!=='undefined'?globalThis:this);
