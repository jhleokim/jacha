const ORIGIN='https://www.opinet.co.kr';
const FUELS={B027:'보통휘발유',D047:'자동차용경유',K015:'자동차부탄'};

export function captureQuery(url){
  const date=url.searchParams.get('date')||'',fuel=url.searchParams.get('prodcd')||'';
  const iso=date.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
  const parsed=new Date(iso+'T00:00:00Z');
  const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10).replace(/-/g,'');
  if(!/^\d{8}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso||date<'19970101'||date>=today||!FUELS[fuel])return null;
  return {date,iso,fuel,label:FUELS[fuel],url:ORIGIN+(fuel==='K015'?'/user/dopvsavsel/dopVsAvselSelect.do':'/user/dopospdrg/dopOsPdrgSelect.do')};
}

export function verifiedPrice(snapshot,q){
  if(snapshot.start!==q.date||snapshot.end!==q.date||snapshot.term!=='D')throw new Error('capture_conditions_mismatch: '+JSON.stringify({start:snapshot.start,end:snapshot.end,term:snapshot.term}));
  const column=snapshot.headers.findIndex(h=>h.replace(/\s/g,'').startsWith(q.label));
  const row=snapshot.rows.find(r=>{
    const m=/^(\d{2}|\d{4})년(\d{1,2})월(\d{1,2})일$/.exec((r[0]||'').replace(/\s/g,''));
    return m && (m[1].length===2?'20'+m[1]:m[1])+m[2].padStart(2,'0')+m[3].padStart(2,'0')===q.date;
  });
  const price=column>0&&row?Number(row[column]?.replace(/,/g,'')):NaN;
  if(!Number.isFinite(price)||price<=0)throw new Error('capture_result_missing');
  return price;
}

// Opinet draws its "처리 중" message inside a GIF, so text/DOM readiness alone
// cannot prove the result is ready. Never hide the site's overlay to get a PNG.
export function opinetIdle(){
  return [...document.querySelectorAll('#mask,#modalwindow')].every(el=>{
    const style=getComputedStyle(el),rect=el.getBoundingClientRect();
    return style.display==='none'||style.visibility==='hidden'||style.opacity==='0'||rect.width<=0||rect.height<=0;
  });
}

export async function renderOpinet(binding,q,launch){
  if(!launch)launch=(await import('@cloudflare/puppeteer')).default.launch;
  const browser=await launch(binding);
  const deadline=setTimeout(()=>{void browser.close().catch(()=>{});},45000);
  let stage='open';
  try{
    const page=await browser.newPage();
    page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(18000);
    await page.setViewport({width:1280,height:1000,deviceScaleFactor:1});
    const response=await page.goto(q.url,{waitUntil:'domcontentloaded'}).catch(error=>{
      if(error.name!=='TimeoutError')throw error;
      return null; // Background widgets may keep loading; verify the actual form below.
    });
    if(response&&!response.ok())throw new Error('capture_page_unavailable');
    await page.waitForSelector('#STA_Y');
    await page.waitForFunction(opinetIdle);
    stage='conditions';
    // Fire the site's period handler before setting dates, since it resets them.
    await page.evaluate(({date,fuel})=>{
      const daily=document.querySelector('input[name="TERM"][value="D"]');
      if(!daily.checked)daily.click();
      for(const prefix of ['STA','END'])for(const [part,value] of [['Y',date.slice(0,4)],['M',date.slice(4,6)],['D',date.slice(6,8)]]){
        const field=document.getElementById(prefix+'_'+part);
        field.value=value;if(field.value!==value)throw new Error('capture_date_not_selectable');
      }
      // Click to update Opinet's selected-product count as well as the checkbox.
      if(fuel!=='K015')document.querySelectorAll('input[type="checkbox"][name^="OIL_CD_"]').forEach(e=>{if(e.checked!==(e.name==='OIL_CD_'+fuel))e.click();});
    },{date:q.date,fuel:q.fuel});
    // Use the site's own form and query handler. Never rewrite result text or prices.
    stage='query';
    await Promise.all([
      page.waitForNavigation({waitUntil:'domcontentloaded'}).catch(error=>{if(error.name!=='TimeoutError')throw error;}),
      page.click(q.fuel==='K015'?'#dopVsAvselSelect':'#btn_search')
    ]);
    if(new URL(page.url()).origin!==ORIGIN)throw new Error('capture_unexpected_page');
    stage='verify';
    await page.waitForFunction(date=>{
      const selected=['STA_Y','STA_M','STA_D'].map(id=>document.getElementById(id)?.value).join('');
      const end=['END_Y','END_M','END_D'].map(id=>document.getElementById(id)?.value).join('');
      return document.readyState==='complete'&&selected===date&&end===date&&document.querySelector('input[name="TERM"]:checked')?.value==='D'&&[...document.querySelectorAll('table.tbl_type10 tbody tr')].some(row=>{
        const m=/^(\d{2}|\d{4})년(\d{1,2})월(\d{1,2})일$/.exec((row.querySelector('th,td')?.innerText||'').replace(/\s/g,''));
        return m&&(m[1].length===2?'20'+m[1]:m[1])+m[2].padStart(2,'0')+m[3].padStart(2,'0')===date;
      });
    },{},q.date);
    stage='loading_overlay';
    await page.waitForFunction(opinetIdle);
    stage='verify';
    const snapshot=await page.evaluate(()=>({
      start:['STA_Y','STA_M','STA_D'].map(id=>document.getElementById(id)?.value).join(''),
      end:['END_Y','END_M','END_D'].map(id=>document.getElementById(id)?.value).join(''),
      term:document.querySelector('input[name="TERM"]:checked')?.value,
      headers:[...document.querySelectorAll('table.tbl_type10 thead th')].map(e=>e.innerText.trim()),
      rows:[...document.querySelectorAll('table.tbl_type10 tbody tr')].map(r=>[...r.querySelectorAll('th,td')].map(e=>e.innerText.trim()))
    }));
    const price=verifiedPrice(snapshot,q);
    stage='image';
    await page.evaluate(()=>Promise.race([
      Promise.all([document.fonts.ready,...[...document.images].map(im=>im.complete?Promise.resolve():new Promise(resolve=>{im.onload=resolve;im.onerror=resolve;}))]),
      new Promise(resolve=>setTimeout(resolve,4000))
    ]));
    const height=await page.evaluate(()=>document.documentElement.scrollHeight);
    if(height>4000)throw new Error('capture_unexpected_layout');
    const png=await page.screenshot({type:'png',fullPage:true});
    return {png,price};
  }catch(error){throw new Error(stage+': '+error.message);}
  finally{clearTimeout(deadline);await browser.close().catch(()=>{});}
}

export async function captureResponse(request,env,ctx,render=renderOpinet){
  const q=captureQuery(new URL(request.url));
  const fail=(error,status)=>Response.json({error},{status,headers:{'cache-control':'no-store'}});
  if(!q)return fail('invalid_capture_conditions',400);
  if(!env.BROWSER)return fail('capture_unavailable',503);
  const key=new Request(new URL('/opinet/screenshot?date='+q.date+'&prodcd='+q.fuel+'&v=2',request.url));
  const cached=await caches.default.match(key);if(cached)return cached;
  try{
    const {png,price}=await render(env.BROWSER,q);
    const response=new Response(png,{headers:{'content-type':'image/png','cache-control':'public, max-age=86400','x-oil-date':q.iso,'x-oil-price':String(price)}});
    ctx.waitUntil(caches.default.put(key,response.clone()));
    return response;
  }catch(error){
    console.warn('opinet_capture_failed',{reason:error?.message||'unknown'});
    return fail('capture_failed',502);
  }
}
