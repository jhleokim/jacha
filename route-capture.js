// Only Kakao car directions are accepted; callers cannot choose a capture URL.
export function routeQuery(url){
  try{
    const raw=url.searchParams.get('rt')||'', names=JSON.parse(url.searchParams.get('names')||'null');
    if(!/^\d+(?:,\d+){3,13}$/.test(raw))return null;
    const points=raw.split(',').map(Number);
    if(points.length%2||!Array.isArray(names)||names.length!==points.length/2||names.some(n=>typeof n!=='string'||!n.trim()||n.length>100||/[\x00-\x1f]/.test(n)))return null;
    if(points.some(n=>n<1||n>3000000))return null;
    const p=new URLSearchParams({map_type:'TYPE_MAP',target:'car',rt:raw});
    names.forEach((n,i)=>p.set('rt'+(i+1),n));
    return {names,url:'https://map.kakao.com/?'+p};
  }catch{return null;}
}

export function routeDistance(snapshot,names){
  if(snapshot.names.length!==names.length||names.some((n,i)=>snapshot.names[i]!==n))throw new Error('route_conditions_mismatch');
  const m=/^([\d,]+(?:\.\d+)?)\s*(km|m)$/.exec(snapshot.distance.trim());
  const km=m?Number(m[1].replace(/,/g,''))/(m[2]==='m'?1000:1):NaN;
  if(!Number.isFinite(km)||km<=0||km>3000)throw new Error('route_distance_missing');
  return km;
}

export async function renderRoute(binding,q,launch){
  if(!launch)launch=(await import('@cloudflare/puppeteer')).default.launch;
  const browser=await launch(binding);
  const deadline=setTimeout(()=>{void browser.close().catch(()=>{});},45000);
  try{
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
    page.setDefaultTimeout(20000);
    await page.goto(q.url,{waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForFunction(()=>{
      const e=document.querySelector('.CarRouteSummaryView .distance');
      const tiles=[...document.images].filter(im=>im.src.includes('kakaocdn.net/')&&im.src.includes('/tile/'));
      return e&&e.getBoundingClientRect().height>0&&/\d/.test(e.innerText)
        &&[...document.querySelectorAll('svg path')].some(p=>(p.getAttribute('d')||'').length>100)
        &&tiles.length>=4&&tiles.every(im=>im.complete&&im.naturalWidth>0);
    });
    if(new URL(page.url()).origin!=='https://map.kakao.com')throw new Error('route_unexpected_page');
    const snapshot=await page.evaluate(()=>({
      names:[...document.querySelectorAll('input[name^="routePoint-"]')].filter(e=>e.getBoundingClientRect().height>0).map(e=>e.value),
      distance:document.querySelector('.CarRouteSummaryView .distance').innerText
    }));
    const km=routeDistance(snapshot,q.names);
    await page.evaluate(()=>document.fonts.ready);
    const png=await page.screenshot({type:'png'});
    return {png,km};
  }finally{clearTimeout(deadline);await browser.close().catch(()=>{});}
}

export async function routeCaptureResponse(request,env,render=renderRoute){
  const fail=(error,status)=>Response.json({error},{status,headers:{'cache-control':'no-store'}});
  const q=routeQuery(new URL(request.url));
  if(!q)return fail('invalid_route',400);
  if(!env.BROWSER)return fail('capture_unavailable',503);
  try{
    const {png,km}=await render(env.BROWSER,q);
    return new Response(png,{headers:{'content-type':'image/png','cache-control':'no-store','x-route-km':String(km)}});
  }catch{
    // Route addresses and screenshots are never written to application logs or cache.
    console.warn('route_capture_failed');
    return fail('capture_failed',502);
  }
}
