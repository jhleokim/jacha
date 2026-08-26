/*
 * 자차보조금 정산 — Cloudflare Worker
 *
 * 두 가지 일을 합니다.
 *   1) public/ 안의 화면(index.html, config.js)을 웹사이트로 제공
 *   2) 브라우저 대신 카카오·오피넷 API를 호출 (CORS 우회 + 키 보호)
 *
 * API 키는 코드에 넣지 않고 Cloudflare 비밀값(Secrets)으로 관리합니다.
 *   npx wrangler secret put KAKAO_REST_KEY
 *   npx wrangler secret put OPINET_KEY
 */

const 조회결과_보관 = {
  "/kakao/": 60 * 60 * 24 * 180,   // 주소의 좌표는 잘 안 바뀝니다
  "/navi/":  60 * 60 * 24 * 30,    // 통행료 변경을 감안해 30일
  "/opinet/": 60 * 60 * 24 * 7,
  "/tmap/":  60 * 60 * 24 * 30,
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function 대신호출(request, target, headers, ttl) {
  const req = new Request(target, { method: "GET", headers });
  const cache = caches.default;
  const cacheKey = new Request(target, { method: "GET" });

  let res = await cache.match(cacheKey);
  if (res) {
    res = new Response(res.body, res);
    res.headers.set("x-cache", "HIT");
    return res;
  }

  const upstream = await fetch(req, { cf: { cacheTtl: 0 } });
  const body = await upstream.arrayBuffer();

  res = new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttl}`,
      "x-cache": "MISS",
    },
  });

  if (upstream.ok) {
    await cache.put(cacheKey, res.clone());
  }
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── 카카오 주소·장소 검색 ─────────────────────────
    if (path.startsWith("/kakao/")) {
      if (!env.KAKAO_REST_KEY) return json({ error: "카카오 키가 등록되지 않았습니다" }, 500);
      const target = "https://dapi.kakao.com" + path.replace("/kakao", "") + url.search;
      return 대신호출(request, target,
        { Authorization: "KakaoAK " + env.KAKAO_REST_KEY },
        조회결과_보관["/kakao/"]);
    }

    // ── 카카오모빌리티 길찾기 ────────────────────────
    //    (현재 화면에서는 쓰지 않습니다. 자동 거리 조회를 되살릴 때를 위해 남겨둡니다)
    if (path.startsWith("/navi/")) {
      if (!env.KAKAO_REST_KEY) return json({ error: "카카오 키가 등록되지 않았습니다" }, 500);
      const target = "https://apis-navi.kakaomobility.com" + path.replace("/navi", "") + url.search;
      return 대신호출(request, target,
        { Authorization: "KakaoAK " + env.KAKAO_REST_KEY },
        조회결과_보관["/navi/"]);
    }

    // ── TMAP 자동차 경로안내 ─────────────────────────
    //    (현재 화면에서는 쓰지 않습니다. 자동 거리 조회를 되살릴 때를 위해 남겨둡니다)
    if (path === "/tmap/routes") {
      if (!env.TMAP_KEY) return json({ error: "TMAP 키가 등록되지 않았습니다" }, 500);
      const target = "https://apis.openapi.sk.com/tmap/routes?version=1";
      const body = await request.text();

      // POST 라 캐시 키를 본문으로 만듭니다
      const cacheKey = new Request(
        "https://cache.local/tmap?" + encodeURIComponent(body),
        { method: "GET" }
      );
      const cache = caches.default;
      let hit = await cache.match(cacheKey);
      if (hit) {
        hit = new Response(hit.body, hit);
        hit.headers.set("x-cache", "HIT");
        return hit;
      }

      const up = await fetch(target, {
        method: "POST",
        headers: {
          appKey: env.TMAP_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
      });
      const buf = await up.arrayBuffer();
      const res = new Response(buf, {
        status: up.status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": `public, max-age=${조회결과_보관["/tmap/"]}`,
          "x-cache": "MISS",
        },
      });
      if (up.ok) await cache.put(cacheKey, res.clone());
      return res;
    }

    // ── 오피넷 유가 ──────────────────────────────────
    if (path === "/opinet/price") {
      if (!env.OPINET_KEY) return json({ error: "오피넷 키가 등록되지 않았습니다" }, 500);
      const p = new URLSearchParams(url.search);
      p.set("out", "json");
      p.set("code", env.OPINET_KEY);
      const target = "https://www.opinet.co.kr/api/avgRecentPrice.do?" + p.toString();
      return 대신호출(request, target, {}, 조회결과_보관["/opinet/"]);
    }

    // ── 그 밖에는 화면 파일 ──────────────────────────
    return env.ASSETS.fetch(request);
  },
};
