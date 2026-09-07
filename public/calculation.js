/* 정산 계산. 십진 입력을 정수 비율로 유지해 10원 경계의 부동소수점 오차를 피합니다. */
(function(root){
  "use strict";
  function fraction(value){
    var parts=String(Number(value)).toLowerCase().split("e"), digits=parts[0].split(".");
    var scale=(digits[1]||"").length-Number(parts[1]||0);
    var n=BigInt(digits.join("")), d=1n;
    if(scale>0)d=10n**BigInt(scale); else n*=10n**BigInt(-scale);
    return {n:n,d:d};
  }
  function rounded(n,d,mode){
    var unit=mode==="none"?1n:10n;
    var divisor=d*unit;
    return Number((mode==="floor"?n/divisor:(2n*n+divisor)/(2n*divisor))*unit);
  }
  function round10(v,mode){
    if(!Number.isFinite(v))return 0;
    // Standalone callers may already have performed floating-point arithmetic.
    var units=v/(mode==="none"?1:10), nearest=Math.round(units);
    if(Math.abs(units-nearest)<=Number.EPSILON*Math.max(1,Math.abs(units))*8)units=nearest;
    return (mode==="floor"?Math.floor(units):Math.round(units))*(mode==="none"?1:10);
  }
  function calculate(v){
    var km=Number(v.km),pr=Number(v.price),fe=Number(v.fe),rt=Number(v.rate);
    var tv=Number(v.toll||0),pv=Number(v.park||0),toll=Math.round(tv),park=Math.round(pv);
    var mode=v.mode,inc=!!v.inc,err="",raw=0,sub=0,total=0;
    [[km,"주행거리"],[pr,"유가"],[fe,"고정연비"],[rt,"가산율"]].some(function(p){
      if(!Number.isFinite(p[0])||p[0]<=0){err=p[1]+"를 0보다 큰 유한한 숫자로 입력하세요";return true;}
      return false;
    });
    if(!err && (!Number.isFinite(tv)||tv<0||!Number.isSafeInteger(toll)))err="통행료를 0 이상의 유효한 금액으로 입력하세요";
    if(!err && (!Number.isFinite(pv)||pv<0||!Number.isSafeInteger(park)))err="주차료를 0 이상의 유효한 금액으로 입력하세요";
    if(!err && !["floor","round","none"].includes(mode))err="원단위 처리 방식을 확인하세요";
    if(!err){
      var k=fraction(km),p=fraction(pr),f=fraction(fe),r=fraction(rt);
      sub=rounded(k.n*p.n*r.n*f.d,k.d*p.d*r.d*f.n,mode);
      raw=km/fe*pr*rt; total=sub+(inc?toll+park:0);
      if(!Number.isFinite(raw)||!Number.isSafeInteger(sub)||!Number.isSafeInteger(total))err="계산 가능한 금액 범위를 초과했습니다";
    }
    if(err){raw=0;sub=0;total=0;}
    return {km:Number.isFinite(km)?km:0,pr:Number.isFinite(pr)?pr:0,
      fe:Number.isFinite(fe)?fe:0,rt:Number.isFinite(rt)?rt:0,
      toll:Number.isFinite(toll)?toll:0,park:Number.isFinite(park)?park:0,
      inc:inc,mode:mode,err:err,raw:raw,sub:sub,total:total};
  }
  root.JachaCalc=Object.freeze({calculate:calculate,round10:round10});
})(globalThis);
