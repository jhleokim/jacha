/* Native text for PDF/print. All user text is escaped; receipt pixels stay local. */
(function(root){
  'use strict';
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function pair(label,value){return '<div><dt>'+esc(label)+'</dt><dd>'+esc(value||'—')+'</dd></div>';}
  function section(title,body){return '<div class="report-section"><h2>'+title+'</h2>'+body+'</div>';}
  function parts(value){return (Array.isArray(value)?value:[value]).map(function(p){return p&&typeof p==='object'?p:{text:p};});}
  function text(value){return parts(value).map(function(p){return p.text==null?'':p.text;}).join('');}
  function markup(m){
    // Fragment destinations follow actual attachments, including multi-page
    // summaries. Never guess a physical PDF page number or link outside the file.
    var targets=Object.create(null);
    m.evidence.forEach(function(pg,i){
      if(['map','oil','toll','park'].includes(pg.key)&&!targets[pg.key])targets[pg.key]={id:'report-evidence-'+(i+1),label:pg.label};
    });
    function linked(value){
      return parts(value).map(function(p){var target=targets[p.key];return target
        ?'<a class="report-link" href="#'+target.id+'" title="'+esc(target.label)+'로 이동">'+esc(p.text)+'</a>':esc(p.text);
      }).join('');
    }
    var rows=m.costs.map(function(r){return '<tr><th scope="row">'+esc(r.label)+'</th><td>'+linked(r.basis)+'</td><td class="amount">'+esc(r.amount)+'</td></tr>';}).join('');
    var summary='<article class="report-sheet report-main" id="report-summary" aria-label="자차보조금 정산서">'
      +'<header class="report-heading"><p>출장비 정산</p><h1>자차보조금 정산서</h1><div>출장일 '+esc(m.date||'—')+'</div></header>'
      +section('출장 정보','<dl class="report-facts">'+pair('출장자',m.name)+pair('부서',m.dept)+pair('출장목적',m.purpose)+pair('차량·유종',m.vehicle)+'</dl>')
      +section('이동 경로','<dl class="report-facts">'+(m.route.map(function(r){return pair(r[0],r[1]);}).join('')||pair('경로','미입력'))+'</dl><p class="report-distance">'+linked(m.distance)+'</p>')
      +section('산출 내역','<p class="report-formula">'+linked(m.formula)+'</p><table class="report-costs"><thead><tr><th scope="col">항목</th><th scope="col">적용 기준</th><th scope="col" class="amount">금액</th></tr></thead><tbody>'+rows+'</tbody></table>')
      +'<div class="report-total"><span>'+esc(m.totalLabel)+'</span><strong>'+esc(m.total)+'</strong></div>'
      +'<footer class="report-sources"><h2>조회·산출 기준</h2>'+m.sources.map(function(s){return '<p>'+esc(s)+'</p>';}).join('')+'</footer></article>';
    var evidence=m.evidence.map(function(pg,i){
      // Only locally loaded image data, never an arbitrary remote URL in the print document.
      var src=/^data:image\/(png|jpe?g|webp|gif|bmp);base64,/.test(pg.src||'')?pg.src:'';
      var highlights=pg.hl.map(function(h){return '<rect x="'+Number(h.x)+'" y="'+Number(h.y)+'" width="'+Number(h.w)+'" height="'+Number(h.h)+'" fill="#dc231e" fill-opacity=".10" stroke="#dc231e" stroke-width="2"/>';}).join('');
      return '<article class="report-sheet report-evidence" id="report-evidence-'+(i+1)+'" aria-label="'+esc(pg.label)+'"><header class="report-evidence-heading"><h2>'+esc(pg.label)+'</h2><div class="report-evidence-nav"><a class="report-link report-backlink" href="#report-summary">정산서로 돌아가기</a><p>첨부 '+(i+1)+' / '+m.evidence.length+'</p></div></header>'
        +'<figure style="width:'+Math.min(100,Math.max(16,pg.scale*100))+'%"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+Number(pg.width)+' '+Number(pg.height)+'" role="img" aria-label="'+esc(pg.label)+'"><image width="100%" height="100%" href="'+esc(src)+'"/>'+highlights+'</svg></figure></article>';
    }).join('');
    return '<div class="report-document" style="--report-scale:'+Math.min(1.3,Math.max(.8,m.scale||1))+'">'+summary+evidence+'</div>';
  }
  function printDocument(m,origin){
    var base=new URL(origin).origin;
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc('자차보조금정산_'+m.date+'_'+(m.name||'미입력'))+'</title>'
      +'<link rel="stylesheet" href="'+base+'/fonts.css"><link rel="stylesheet" href="'+base+'/report.css"></head><body class="print-window">'
      +'<div class="print-toolbar"><p id="printStatus" role="status">글꼴과 증빙을 준비하고 있어요.</p><button id="printAgain" disabled>PDF 저장·인쇄</button></div>'+markup(m)
      +'<script src="'+base+'/print.js"></script></body></html>';
  }
  root.JachaReport={markup:markup,printDocument:printDocument,text:text};
})(typeof window!=='undefined'?window:globalThis);
