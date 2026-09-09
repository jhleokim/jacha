/* Never print before the actual font and evidence images are ready. */
(async function(){
  'use strict';
  var status=document.getElementById('printStatus'),button=document.getElementById('printAgain');
  // document.write into about:blank inherits the opener's base URL. Pin each
  // fragment to this print document so PDF links cannot point back to the app.
  var ownURL=document.URL.split('#')[0];
  document.querySelectorAll('a[href^="#"]').forEach(function(link){
    link.setAttribute('href',ownURL+link.getAttribute('href'));
  });
  var pending=false;
  async function prepare(){
    if(pending)return;
    pending=true;button.disabled=true;
    try{
      var fonts=document.fonts?Promise.all([400,500,600,700].map(function(w){return document.fonts.load(w+' 16px "Jacha Pretendard"','정산서 출장비');})).then(function(loaded){if(loaded.some(function(faces){return !faces.length;}))throw new Error('font');}):Promise.resolve();
      var imgs=Array.from(document.querySelectorAll('svg image')).map(function(el){
        return new Promise(function(resolve,reject){var image=new Image();image.onload=resolve;image.onerror=function(){reject(new Error('image'));};image.src=el.getAttribute('href');});
      });
      var timeout;
      try{await Promise.race([Promise.all([fonts].concat(imgs)),new Promise(function(_r,reject){timeout=setTimeout(function(){reject(new Error('timeout'));},15000);})]);}
      finally{clearTimeout(timeout);}
      if(document.fonts&&!document.fonts.check('400 16px "Jacha Pretendard"','정산서'))throw new Error('font');
      status.textContent='준비됐어요. 인쇄 대상에서 ‘PDF로 저장’을 선택해 주세요.';
      button.disabled=false;pending=false;
      await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});
      window.print();
    }catch(e){status.textContent='글꼴이나 증빙을 불러오지 못했어요. 연결을 확인한 뒤 다시 눌러 주세요.';button.disabled=false;pending=false;}
  }
  button.addEventListener('click',prepare);
  await prepare();
})();
