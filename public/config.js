/* 자차보조금 정산 — 화면 설정
 *
 * 이 파일은 브라우저가 읽습니다. API 키를 절대 여기에 넣지 마세요.
 * 키는 Cloudflare 비밀값(wrangler secret)에만 넣습니다.
 */
window.JACHA_CONFIG = {

  // 키를 등록했으면 true, 아직이면 false (직접 입력 모드).
  addr: true,     // 주소 → 좌표 변환 (카카오) — 지도 링크와 주소 확인에 씁니다
  oil:  true,     // 유가 자동 조회 (오피넷)

  // 사내 여비규정 값
  기준: {
    고정연비: 10,
    가산율: 1.2,
    원단위처리: "floor",              // floor(10원 절사) / round(10원 반올림) / none
    통행료_주차료_합계포함: true
  }
};
