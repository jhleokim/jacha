/*
 * 자차보조금 정산 — Cloudflare Worker
 *
 * 세 가지 일을 합니다.
 *   1) public/ 안의 화면(index.html, config.js)을 웹사이트로 제공
 *   2) 브라우저 대신 카카오·오피넷 API를 호출 (CORS 우회 + 키 보호)
 *   3) 영수증 정리기(receipt)의 사진 릴레이를 중계 (폰 → PC 증빙 사진)
 *
 * API 키는 코드에 넣지 않고 Cloudflare 비밀값(Secrets)으로 관리합니다.
 *   npx wrangler secret put KAKAO_REST_KEY
 *   npx wrangler secret put OPINET_KEY
 */

import {captureResponse} from './opinet-capture.js';
import {routeCaptureResponse} from './route-capture.js';

const 조회결과_보관 = {
  "/kakao/": 60 * 60 * 24 * 180,   // 주소의 좌표는 잘 안 바뀝니다
  "/navi/":  60 * 60 * 24 * 30,    // 통행료 변경을 감안해 30일
  "/opinet/": 60 * 60 * 24 * 7,
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function validOil(body) {
  try {
    const rows=JSON.parse(new TextDecoder().decode(body).replace(/^\uFEFF/, "")).RESULT?.OIL;
    return Array.isArray(rows) && rows.length>0 && rows.every(row =>
      Number.isFinite(Number(row.PRICE)) && Number(row.PRICE)>0 && /^\d{8}$/.test(row.DATE));
  } catch { return false; }
}

async function 대신호출(request, target, headers, ttl, validate = null) {
  const req = new Request(target, { method: "GET", headers });
  const cache = caches.default;
  // 새 검증 정책의 키 공간으로 옮겨 기존 빈 응답 캐시를 재사용하지 않습니다.
  const cacheUrl=new URL(request.url);
  cacheUrl.searchParams.set("_cache_version", "2");
  const cacheKey = new Request(cacheUrl, { method: "GET" });

  let res = await cache.match(cacheKey);
  if (res) {
    res = new Response(res.body, res);
    res.headers.set("x-cache", "HIT");
    return res;
  }

  const upstream = await fetch(req, { cf: { cacheTtl: 0 } });
  const body = await upstream.arrayBuffer();

  const cacheable=upstream.ok && (!validate || validate(body));
  res = new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": cacheable ? `public, max-age=${ttl}` : "no-store",
      "x-cache": "MISS",
    },
  });

  if (cacheable) {
    await cache.put(cacheKey, res.clone());
  }
  return res;
}

async function handle(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const api=/^\/(kakao|navi|opinet|tmap|receipt)\//.test(path);
    const allowed=new Set([
      "/kakao/v2/local/search/address.json", "/kakao/v2/local/search/keyword.json",
      "/navi/v1/directions", "/navi/screenshot", "/opinet/price", "/opinet/screenshot", "/receipt/poll"
    ]);
    if(api){
      if(!allowed.has(path))return json({error:"not_found"},404);
      if(request.method!=="GET")return new Response(null,{status:405,headers:{allow:"GET","cache-control":"no-store"}});
      // 다른 웹사이트의 브라우저 호출 차단. 이것은 사용자 인증을 대신하지 않습니다.
      const origin=request.headers.get("origin");
      if((origin && origin!==url.origin) || request.headers.get("sec-fetch-site")==="cross-site")
        return json({error:"forbidden_origin"},403);
    }

    // ── 카카오 주소·장소 검색 ─────────────────────────
    if (path.startsWith("/kakao/")) {
      if (!env.KAKAO_REST_KEY) return json({ error: "카카오 키가 등록되지 않았습니다" }, 500);
      const target = "https://dapi.kakao.com" + path.replace("/kakao", "") + url.search;
      return 대신호출(request, target,
        { Authorization: "KakaoAK " + env.KAKAO_REST_KEY },
        조회결과_보관["/kakao/"]);
    }

    if(path==='/navi/screenshot')return routeCaptureResponse(request,env);

    // ── 카카오모빌리티 길찾기 ────────────────────────
    //    지도 모달의 편도 거리 자동 채움에 사용합니다.
    if (path.startsWith("/navi/")) {
      if (!env.KAKAO_REST_KEY) return json({ error: "카카오 키가 등록되지 않았습니다" }, 500);
      const target = "https://apis-navi.kakaomobility.com" + path.replace("/navi", "") + url.search;
      return 대신호출(request, target,
        { Authorization: "KakaoAK " + env.KAKAO_REST_KEY },
        조회결과_보관["/navi/"]);
    }

    // 사용하지 않는 TMAP 프록시는 외부 키 호출 범위를 줄이기 위해 제거했습니다.

    if(path==='/opinet/screenshot')return captureResponse(request,env,ctx);

    // ── 오피넷 유가 ──────────────────────────────────
    if (path === "/opinet/price") {
      if (!env.OPINET_KEY) return json({ error: "오피넷 키가 등록되지 않았습니다" }, 500);
      const p = new URLSearchParams(url.search);
      p.set("out", "json");
      p.set("code", env.OPINET_KEY);
      const target = "https://www.opinet.co.kr/api/avgRecentPrice.do?" + p.toString();
      return 대신호출(request, target, {}, 조회결과_보관["/opinet/"], validOil);
    }

    // ── 모바일 → PC 사진 가져오기 (영수증 정리기 릴레이 중계) ──
    //    브라우저에서 receipt 도메인을 직접 부르면 CORS 로 막힙니다.
    //    (receipt 쪽 Worker 가 Access-Control-Allow-Origin 을 붙이지 않음)
    //    그래서 여기서 서버끼리 대신 물어봐 줍니다. receipt 저장소는 수정하지 않습니다.
    //    같은 계정의 workers.dev 서브도메인끼리라 일반 fetch() 로 부르면
    //    Cloudflare 가 루프 방지로 막습니다(Error 1042) — 서비스 바인딩(RECEIPT)으로 부릅니다.
    //    릴레이는 한 번 받아가면 서버에서 지워지는 1회성이라 캐시하면 안 됩니다.
    if (path === "/receipt/poll") {
      const s = url.searchParams.get("s") || "";
      // 세션 ID 형식만 통과시켜 아무 주소나 중계되지 않게 막습니다
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return json({ error: "bad_session" }, 400);
      try {
        const up = await env.RECEIPT.fetch(
          "https://receipt/api/poll?s=" + encodeURIComponent(s),
          { headers: { accept: "application/json" } }
        );
        return new Response(up.body, {
          status: up.status,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      } catch (e) {
        return json({ error: "relay_unreachable" }, 502);
      }
    }

    // ── 그 밖에는 화면 파일 ──────────────────────────
    return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    let response;
    try { response=await handle(request,env,ctx); }
    catch { response=json({error:"upstream_unavailable"},502); }
    const safe=new Response(response.body,response);
    safe.headers.set("X-Content-Type-Options","nosniff");
    safe.headers.set("Referrer-Policy","strict-origin-when-cross-origin");
    if(/^\/(kakao|navi|opinet|tmap|receipt)\//.test(new URL(request.url).pathname))
      safe.headers.set("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'");
    return safe;
  }
};
