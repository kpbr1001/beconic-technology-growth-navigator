/* ============================================================
   K-ITEM FINDER — PDF Report Layout (Chromium Print)  v0.5.0
   "사업기회 발굴 결과보고서" · 후보 1개 = 1쪽, 쪽 번호 자동
   구성: 표지 · 문서정보 · 요약 · 후보×N · 비교 · 검증 3걸음 · 근거·신뢰도 · 평가 방법·다음 진단
   ============================================================ */
const PDFLayout = {
  LOGO: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCACUAJADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6SkNHFADqKZRQA+imUUAPoplFAD6KZRQA+imUUAPoplFAD6KZR0oAfRTVpRQAGvOfj14a8Z+Jvh3qEXgDxJceGvFcC+fZzRJEyTsB/qXEiMMN0yMYOO1ej0m3nNOL5XcT1Vj8WtY/bT/aG8P6pd6bqXjvVLHULSRoZ7aewtUkjdTgqwMPBqof26vjwoyfiPfAf9edp/8Zrq/wDgpJaw237U2seVEkXmWFpI5jUDcxj5Y+p4FeZfsr6XZa3+0Z8PbDULWG+sp9WjSW3uEDxyLg8MDwRX1EY05Uvaci2vseU5S5+VM3/+G8Pjr/0Um8/8BLT/AONUf8N4fHX/AKKTef8AgJaf/Gq/Xmf4N/DiziMk3gzw3DGvBeTToFUfiVqoPhp8Kv8AoWfCQ/7c7b/CvO+t0elL8jp9lP8AmPyR/wCG8Pjr/wBFJvP/AAEtP/jVH/DeHx1/6KTef+Alp/8AGq/W/wD4Vn8Kv+ha8Jf+Adt/hR/wrP4Vf9C14S/8A7b/AAp/W6X/AD6/APZS/mPyQ/4bw+Ov/RSbz/wEtP8A41R/w3h8df8AopN5/wCAlp/8ar9b/wDhWfwq/wCha8Jf+Adt/hR/wrP4Vf8AQteEv/AO2/wo+t0v+fX4B7KX8x+SH/DeHx1/6KTef+Alp/8AGqP+G8Pjr/0Um8/8BLT/AONV+t//AArP4Vf9C14S/wDAO2/wo/4Vn8Kv+ha8Jf8AgHbf4UfW6X/Pr8A9lL+Y/JD/AIbw+Ov/AEUm8/8AAS0/+NUf8N4fHX/opN5/4CWn/wAar9bv+FafCr/oWvCX/gJbf4Vag+D/AMOLuPzIPBnhuaMnAePToGH5haX1uitXS/IPYz/mPyKH7dXx4PT4j3x/7c7T/wCM1a0v9tb9oTW9StdP0/x7qd7fXUiwwW8Fhau8jk4CgeTyTXI/tUaXZ6H+0Z8RLDT7WGysrfWJkht7dAkca5+6qjgD6V6h/wAE2bSC8/al0rzoY5TFp13LHvUHY4UAMPQ4J5969GcacaXtVBbX2OZOfPy3P08+Afhrxp4b+HOnp8QPElx4l8VXKie8kmSJFt2YD9ygjRRhfU5yc16QKavHFOWvl27ybPVSsrC0UUUhn4//APBSzj9qbVP+wbZ/+izXm37If/Jznw3/AOwvH/6C1ek/8FLP+TptU/7Btn/6LNebfshf8nOfDf8A7C8f/oLV9RD/AHVen6HkS0qP1P0y/wCCijtH+yb4qZGZG+0WPzKcH/j6ir8dFvrr/n5n/wC/hr9if+Ci/wDyaX4r/wCvmx/9Koq/HBawy/8AhM1xHxk/265/5+Z/++zR9uuf+fmf/vs1Fz6UZr07I5bsl+3XP/PzP/32aPt1z/z8z/8AfZqL8KPwosguyX7dc/8APzP/AN9mj7dc/wDPzP8A99movwo59KLILslN9c/8/M3/AH8P+NfsH/wTnd5f2V/D7O7O32u65Ykn/Wmvx1bPpX7E/wDBOP8A5NV8P/8AX5df+jTXmZgl7Jep1Yb4j80/2vP+TnviWP8AqNz/AMxXpn/BNH/k6bT/APsFXn/oK15p+15/yc98S/8AsNz/AMxXpf8AwTR/5Om0/wD7Bd5/6CtdE/8Adfl+hnH+N8z9fVHWlFIvelHevlj1RaKKKBn4/wD/AAUs/wCTptU/7Btn/wCizXm37IOf+GnPht/2F4//AEFq9J/4KWf8nTap/wBg2z/9FmvNv2Qv+TnPht/2F4//AEFq+oh/uq9P0PIl/Efqfph/wUY/5NN8V/8AXzY/+lUdfjgua/Y7/goz/wAml+K+M/6TY/8ApVFX5t/CP9kH4i/G/wACz+K/CFnZahYQ3kli8Ml2sUwdFRyQGGCMSL39a5sDKMKTcnbU2xCcp2R4vzQqNIwVVLMeAqjJr1XxZ+yr8W/BKu+q+AdZSFfvTW0BnQf8CTNJ+zr481T4L/HDw5qq6LDcXzXSWZtdVhddgldYy4HBDAHIPqK9JzTi3F3OXld7PQ9D/Zd/Y38Z/Er4geHb3xN4Kv4/ATTb7+a+LWfmxbGxs5DnJK/d/On/ALUX7GnjL4b+PvEF74X8FahL4DWXdYz2Ja88uPaCd4yzjnPLfnX1v+1h+1x8Wv2avFsMbeF/C9/4Y1OR/wCyr5pJzK4UAssihxhxnsMHtXD/AAs/bm/aA+Nf9pHwZ8MfDutjTjGLoxySp5W/dszulHXY35V5arYiTVbS3qdXJStyXdz85ijRttYFWzyrDBFHNemfHb4heIfjh8WtU1vU/D8Gna8220uNP0eF3XzI8oTj5iWJ6mrHhP8AZV+LfjdY30rwDrTwv92e4t/Ijx65fAr1PaLlvPQ5eVt2R5Vya94+Hf7a3xL+E/w1sfBfhO70/StPtXlkF19kE1w5dsnJclQPTC133hb/AIJi/GDXth1H+xPD8RPP2y8MjAf7satz9SK9t8H/APBJbSodsnirx7eXrdTDpNmkC/Tc5ckfQCuSriMPtOz/ABNoU6vTQ/O/xR4m1Pxp4i1DXdZu2v8AVdQma4ubmTAaSQ8knHH5V9K/8E0f+TpNP/7Bd5/6CteJ/HvwPp3w1+NHjHwtpBlOmaRqMlrbee++TYvTc2OTXtn/AATR/wCTpdP/AOwVef8AoK1rWtLDtraxFP8Ai6n6+r3pR3pF70o718oeuhaKKKBn4/8A/BSz/k6bVP8AsG2f/os15r+yFj/hpz4b/wDYXj/9BavSv+Cln/J02qf9g2z/APRZrzX9kLH/AA058Nv+wvH/AOgtX1EP91Xp+h5Ev4r9T9Mf+CjH/Jpviv8A6+bH/wBK4q8W/wCCeXxy8A/Cn9nnUrfxb4q03Q7p9fuJVtrmX96UMFuAwQZOMg9uxr2n/gowM/sm+Kx/08WP/pVFX434FcOFoqtQcJPqdNWXJUufr74r/wCClHwW8Oq62ep6nr0oyAun2TbSf959tfJ/xy/aEl/a38d/D268KfD3WbKw0PW4zPqAtzO0haWIkOY1IXaFzy38VfGnHqa+o/8Agn/8ftU+E/xah8Mw2MmraX4snhsntRNsEM27Czjg5IUuCOMjHPArp+qwoRc4K7MvbOo+WWx9Gf8ABVTwtrPibR/h0NH0e/1Z4bi7MgsbV5ygKRgbtgOM89ar/wDBKnwrrXhlPiUNY0fUNJ81tP8AK+32rwb8C4zt3AZxkdPUetdd8ZP+CkWnfCX4qa54KbwNcaq+l3K2zXqaksayEgHO0xnGM+tfY2nXf2+xtroLsE0Sy7c5xlQcfrXmyqTp4dU3HR9TpjGMqnMnqj8s/gp+0FL+yT8QviJeeKfh7rF7p2uay7Qah9nMBiKyScI0qgNuDZ4YdO9fVvhX/gpV8FvESxi81HUtBmbgrqFk20H/AHkLA18W/wDBQf4+6p8Uvi5d+E5LN9L0jwjeXFikBl3/AGmYOVNweBjcoXA5wCea+VePWvSWFhiIqdRWb8zm9rKm+VPRH7u+Ff2kPhf402jR/Hmh3UjcCN7xYnJPba+DmvRYpkmjV43EiMMhlOQR9a/nc+7yDzX7Ff8ABOVmf9lbw+WYsftd0ASc/wDLU152KwaoR54s6aVZ1HZo/NL9rz/k574mf9huf+Yr0z/gmj/ydNp//YKvP5LXmf7Xn/Jz3xM/7Dc/9K9M/wCCaP8AydLp/wD2C7z+S168/wDdfl+hxx/i/M/X1e9KO9IvelHevlj1ULRRRQM/IH/gphG0f7UmoMy4WTTbMqfXCYrzD9km4S2/aY+G0khCr/bMK5PqcqP1Ir6V/wCCrnw/n0/x74U8ZRRsbTUbNtPlkxws0TbgD6ZV+PXafSvinwT4lm8G+MND1+DmbS76G8UKeSY3Df0r6mh7+GSXY8mppUdz9ev+CiFrLdfsm+MPKQuYpbKVtoyQouosn8K/Gxa/ejxDpejfHr4NXtkkiXGjeKNJIjlU5G2WPKsPcEg/UV+GvjzwPq/w18Zat4Z1y2e01PTZ2hlRxjdg8MPVWGCD6GuXLpLllDqjXErVS6GFXu37C+jf23+1V4CQruFvcyXfTOPLjY14PX1h/wAEytJ/tD9puC5K8WWl3MufcgL/AOzV34iTjSk/I56avNI8l/aY1H+1P2mPiBck5z4gnT/vmTb/AOy1+33h3/kX9M/69Iv/AEAV+C3xC1T+3fip4k1Ldu+2a1cXG713zs39a/erw7x4f0z/AK9Yv/QBXlY9csKaOvDu8pM/Gj9u/R/7H/au8dqBhLieG6X/AIHBGSf++t1eB19Yf8FNNI/s79pue6C7RfaVay/XAZP/AGWvk/mvVoO9KL8jkqK02I1fsb/wTptZrX9lTw0ZoygmuLqWPd/EplIB/Q1+SHgPwTq3xI8ZaT4Z0W3e51LU7hLeJUGQMnlj6ADknsBX7leF9F0b4BfBmy0/zY4NH8MaV+8mf5QRGhZ3Puzbj+NcGYSXKqa3OjDLVy6H44/tcSrN+018S3jYMh1qfBB684/pXqH/AATNjZ/2o7IhchdJvGPoBhB/Ovm3xp4km8ZeMNa16fd52pXs102f9tiQPyNfa3/BKHwLNfePPF3i2SFvs2n2SWEUmPlMkjbiAfZVH5iumt+7w7T7GUPeqadz9N170o70L9c0tfLnrBRRRQB5X+0r8FbX49/CDW/CkwRb2RPtGn3D/wDLG6TmNvYHlT7Ma/DzxH4d1Lwlr9/our2klhqljM1vPbyphkdTggj/ADnNf0Kt0r5D/bj/AGM1+OWmt4v8KRx2/jbT4CJLfbhdTiUZCEj/AJaD+E9849K9PB4lUnyT2Zy16Tmrx3PF/wDgm5+1RbaNs+FPim98m3nlZ9CurhvlR2OWtiT0BOSue+R3Fe//ALbP7IEX7Q3h+PW9AWG08caXEwhZwFW+i6+S7djn7rHpkjoa/Ia4tbzRdSkgmjmsb+0l2tG6lJIZFPI9QQa/Tz9iP9uq3+IVvY+A/H93FaeJo1WHT9UlIWPUVAwEfsJf0b68V1YijKnP29ExpzTj7OZ+Y2raTe6Dqd1p2pWstjf2sjQz206FXjcHBUg9Oa+x/wDgmGn9m+OPiN4iYfu9K8OO+70beG/kh/Kvrz9rT9i3Qv2idPOq6Y8GgeNrdf3WoCP5Lpcf6ucDr7N1HuK+df2W/hj4i+BPwb/aSbxVpcul6pb6cLJVkBCsBbz5eNujKfMQgj0qpYmNei0t3bQSounUXY+BVl87VFkPV7gNn/gWa/oL8O/8i/pf/XrF/wCgCv57rH/j5th6SIP1Ff0IeHf+Rf0z/r1i/wDQFrPMdoF4bdn5qf8ABWLR/s/xQ8FamBj7VpMsJb/rnLn/ANnr4h0nSb3XtUtdN061mvr+6kWGC3gTc8jscBQPWv1A/wCCk3wd8Q/Fqb4YWXhfS5dU1aa+ubTbGvyxo0asXduioNvJNegfsk/sWaF+zvp66vqxg13xxcL+81Dy/wB3aqescAPT3bqfpVUsVGjh433JnRc6jtsU/wBiX9kCH9nvQJNd8QLDd+OdSjAmZQGWxiPPkoe5P8TDr06DnwX/AIKSftUQ6oz/AAo8LXwmt43V9eurd8qzqcrbAjrggM3vgdjXoP7b37c1t8O7fUfAPgO6ju/FM0ZhvtVgfcmnA/eVCOsuP++c+vT8wYbe71jUkgiSS8v7qXaiIpeSWRjwB3JJP60YejKrP29UVWajH2dMseHvD+o+LNdsNF0m1kvtTv5lt7e2hXLO7HAGPxr9w/2Z/glZ/AH4SaP4WgCvfKv2jULhR/rrl8Fzn0HCj2UV4p+w3+xj/wAKNsD4u8WRxT+Nb+ELFABuXTYiOUB7yH+I9ug719fKOetcuMxKqvkjsvxNqFLlXM9x1FFFeYdYUUUUAFJtpaSgD5Y/a8/Yf0b4/Wr69oBt9D8cQqcXGwLDfD+5Njo3o/Ud8jp+UHjrwH4j+Fviq50PxHptxo2s2b5aOVSpIByHQ9GU9mFf0CH3615x8a/gB4M+Pfh86Z4s0tbiSNWFtqEOEubUnvG/bnscg9xXo4fGSprlnqjlqUVPVbnwv+yX/wAFFpfDNva+FPipcTX2mIFjs/EIXfLAOm2cdXUf3hyO+a/QDxX4e8P/ABr+GuoaRLefb/DviCyMX2rT5h88TjIZHHHpX5MftGfsM+OvgK11qkETeJvCKFiuq2SEvCnYzx9U46sMr71zH7Pv7Wvjr9nnUoxpF8dS8Ps2Z9CvXZreQdyn/PNv9pfxzXXVw0K372gzKNV0/dqI7f8AaE/YP8bfAq8fV9NjfxV4QjmG2/tYyZ7dN3HnRjpjuwyv0r9dfDrf8U/pfr9li/8AQBXjXwB/bB+H37Q1vFZabef2V4haPMuhaiQsp4+bYekg+nOO1L8fv2w/h9+z5bzWup339q+IlTMeh6cQ02ccbz0jH159q460q1blpyjqjeHJTXMnoe061rFj4f0u51HU7uGw0+1jMs9zcOEjjQDksTwBX5vftbf8FF5fEUN54R+Fc8lrpj5iu/EQBWWZe6wDqi/7fU9sd/nH9oT9rbxz+0RqUq6rfNpnh0Put9DsZCLdAOhfp5je7fgBXR/s5/sOeOvjy1nqs0J8NeEJGBbVLxCrzJ38iPq/sTge9ddLCwoL2lZnPOtKo+WmjxPwT4F8RfFHxVa6D4d0641jWbx+IowWPXl3bso6licV+rn7I37D+jfAK1j1/wAQm31/xxKMi52ZhsB/chz1b1f8sd/YPgn+z54L+Afh8aZ4U0tYJXA+06hPh7m5b1d+uP8AZGAOwr0jb2zXNicY63uw0ib06Khq9WGzHenYpaK806QooooAKKKKACkpaKAE2j0o2ilooAa8aSKysoZWGCpGQR6V8j/tBf8ABOnwN8U47vU/Cfl+CvErkybrdM2U7ejxD7uT3Xp6Gvrqm4PNaU6k6TvB2IlGMlaSPwt+LP7PPxH/AGd9XSXxBpNzp8cUoNtrVhIWgLA5VkmXG0+mdpo+FP7PvxI/aJ1qWfQNJutRWaUtc65qDlbcMTyzzNksfXGTX7iaxoth4i0u407VLG31GwuEKS2t1GJI3UjBBUjBo0XQ9P8ADul22m6XY2+nafbp5cNraxCOONR0CqOBXp/2hLl+HU5vqyvvofKf7Pv/AATo8DfC2O01Txb5fjTxLHtkJnjxZQt6JEfvYPd+voOlfXEMSRIERVRFG1VUYAA7AU+lrzKlSdR3m7nVGKirRE2iloorMoKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//Z",
  build(R, info){
    info = info || {};
    const esc = s => Result.esc(s);
    const bandKo = b => BAND_LABEL[b] || "확인 필요";
    const primary = State.primary ? R.top5.find(o=>o.opportunityId===State.primary)
                  : (State.shortlist[0] ? R.top5.find(o=>o.opportunityId===State.shortlist[0]) : R.top5[0]);
    const inp = State.isSample ? {} : (State.input || {});
    const target = (info.org && info.org !== "—") ? info.org : (inp.userType ? `${inp.userType} 사업기회 탐색` : "개인 사업기회 탐색");
    const date = info.date || Plus.dateKo();

    // 쪽 내용(머리·바닥은 아래에서 일괄)
    const pages = [];
    pages.push(this.exec(R, inp, esc, bandKo));
    R.top5.forEach((o,i)=>pages.push(this.oppPage(o,i,R,esc,bandKo)));
    pages.push(this.compare(R, primary, esc, bandKo));
    if (primary) pages.push(this.planPage(primary, esc));
    if (primary) pages.push(this.evidencePage(R, primary, esc));
    pages.push(this.methodPage(R, esc));

    const cover = `<section class="pdf-page pdf-cover">
      <div class="cov-accent"></div>
      <div class="cov-body">
        <div class="cov-kicker">${APP_META.productName}</div>
        <h1 class="cov-title">사업기회 발굴<br>결과보고서</h1>
        <div class="cov-sub">Customer &amp; Market Opportunity Discovery</div>
        <div class="cov-meta">
          <div><span>분석 대상</span><b>${esc(target)}</b></div>
          <div><span>작성일</span><b>${esc(date)}</b></div>
          <div><span>문서번호</span><b>${esc(Plus.docNo(R))}</b></div>
          <div><span>Version</span><b>${APP_META.appVersion}</b></div>
        </div>
        <div class="cov-foot">
          <img src="${this.LOGO}" alt=""/>
          <div><b>${esc(COMPANY_INFO.companyName)}</b><br><span>${esc(COMPANY_INFO.platformName)}</span></div>
        </div>
      </div>
    </section>`;

    const toc = ["요약","후보 상세 "+R.top5.length+"개","비교","검증 첫 3걸음","근거·결과 신뢰도","평가 방법·다음 진단"];
    const docinfo = `<h2 class="pdf-h2">문서 정보</h2>
      <table class="pdf-info">
        <tr><th>문서명</th><td>K-ITEM FINDER 사업기회 발굴 결과보고서</td></tr>
        <tr><th>분석 대상</th><td>${esc(target)}</td></tr>
        <tr><th>담당자</th><td>${esc(info.person||"—")}</td></tr>
        <tr><th>작성 목적</th><td>${esc(info.purpose||"창업아이템 탐색 참고")}</td></tr>
        <tr><th>기밀 등급</th><td>${esc(info.conf||"일반")}</td></tr>
        <tr><th>작성일</th><td>${esc(date)}</td></tr>
        <tr><th>문서번호</th><td>${esc(Plus.docNo(R))} (탐색일 ${esc(Plus.dateKo(R._createdAt))})</td></tr>
        <tr><th>Version</th><td>앱 ${APP_META.appVersion} · 규칙 ${PLUS_DATA.rulesVersion} · Prompt ${esc(APP_META.promptVersion)}</td></tr>
        <tr><th>작성기관</th><td>${esc(COMPANY_INFO.companyName)} · ${esc(COMPANY_INFO.platformName)} · ${esc(COMPANY_INFO.certification)}</td></tr>
      </table>
      <h3 class="pdf-h3">목차</h3>
      <ol class="pdf-toc">${toc.map(t=>`<li>${esc(t)}</li>`).join("")}</ol>
      <div class="pdf-disclaimer"><b>면책 조항</b><br>
        본 보고서는 사용자가 입력한 정보와 시장 신호 및 AI 분석을 기반으로 사업기회 탐색을 지원하기 위한 참고자료입니다.
        제시된 아이템과 신호는 사업 성공확률, 투자등급, 매출, 투자유치 가능성 또는 정부지원사업 선정 가능성을 의미하지 않습니다.
        AI 분석과 외부 데이터에는 오류·누락·시차가 있을 수 있으며, 실제 사업화 전 고객검증·시장조사·기술·재무·법률/규제 및 지식재산권 확인이 필요합니다.</div>`;

    const all = [docinfo, ...pages];
    return cover + all.map((body,i)=>`<section class="pdf-page">${this.header()}<div class="pdf-body">${body}</div>${this.footer(i+2)}</section>`).join("");
  },

  // 화면에 넣은 뒤 호출: 바닥글 위로 넘치는 쪽만 글자 배율을 0.97→0.72까지 낮춰 A4 한 쪽에 맞춘다
  fit(root){
    const pages=[...root.querySelectorAll(".pdf-page")];
    let adjusted=0;
    pages.forEach(p=>{
      const body=p.querySelector(".pdf-body"), foot=p.querySelector(".pdf-foot-row");
      if(!body||!foot) return;
      // 바닥글은 쪽 아래 고정(bottom:10mm)이라 쪽이 늘면 같이 내려간다 → A4 높이 기준으로 한계 계산
      const mm=p.getBoundingClientRect().height/Math.max(p.offsetHeight,1)*96/25.4;
      const limit=()=>p.getBoundingClientRect().top+(297-19)*mm;
      let z=1;
      while(body.getBoundingClientRect().bottom>limit() && z>0.72){ z=Math.round((z-0.03)*100)/100; body.style.zoom=z; }
      if(z<1) adjusted++;
    });
    return adjusted;
  },

  exec(R, inp, esc, bandKo){
    const val = v => v && !String(v).startsWith("__") ? v : "";
    const fields = (inp.fields||[]).map(k=>FIELD_NAME[k]).filter(Boolean);
    if (val(inp.fieldOther)) fields.push(inp.fieldOther);
    const res = inp.resources ? [...(inp.resources.hw||[]),...(inp.resources.sw||[]),...(inp.resources.human||[])] : [];
    const ct = {B2B:"기업·기관(B2B)",B2C:"개인 소비자(B2C)",B2G:"공공(B2G)"}[inp.customerType]||"";
    const rows = [
      ["사용자 유형", inp.userType], ["관심 분야", fields.join(", ") || (State.isSample?"":"AI가 넓게 탐색")], ["판매 대상", ct],
      ["관심 고객", val(inp.industry)], ["알고 있는 문제", val(inp.knownProblem)], ["경험·역량", inp.experience],
      ["활용 자원", res.join(", ")], ["초기 투자", PLUS_DATA.budgetLabel[inp.budget]], ["지역 · 고객층", [val(inp.region),val(inp.targetAge)].filter(Boolean).join(" · ")],
      ["선호 형태", inp.preferredForm && inp.preferredForm!=="상관없어요" ? inp.preferredForm : ""],
    ].filter(r=>r[1]);
    const q = Plus.inputQuality();
    return `<h2 class="pdf-h2">요약 (Executive Summary)</h2>
      ${R.marketPerspective?`<div class="pdf-view"><span>시장을 보는 관점</span>${esc(this.clip(Result.cleanInsight(R.marketPerspective),200))}</div>`:''}
      <p class="pdf-lead">입력한 조건에서 <b>검토할 가치가 있는 사업기회 ${R.top5.length}개</b>를 찾았습니다. 순서는 성공 가능성 순위가 아닙니다.</p>
      <table class="pdf-cmp pdf-exec">
        <thead><tr><th>#</th><th style="text-align:left">아이템</th><th>분야</th><th>문제</th><th>공백</th><th>타이밍</th></tr></thead>
        <tbody>${R.top5.map((o,i)=>`<tr><td>${i+1}</td><td style="text-align:left"><b>${esc(this.clip(o.narrative?.name||o.title,40))}</b><br><span class="pdf-sub">${esc(this.clip(o.narrative?.tagline||"",60))}</span></td>
          <td>${esc(Plus.fieldName(o)||"-")}</td><td>${bandKo(o.signals.problemSignal.band)}</td><td>${bandKo(o.signals.marketGapSignal.band)}</td><td>${bandKo(o.signals.timingSignal.band)}</td></tr>`).join("")}</tbody>
      </table>
      <h3 class="pdf-h3">탐색 조건 ${State.isSample?'':`<span class="pdf-tag">입력 충실도 ${q.n}/${q.total} · ${q.level.k}</span>`}</h3>
      ${rows.length?`<table class="pdf-info pdf-tight">${rows.map(([k,v])=>`<tr><th>${k}</th><td>${esc(this.clip(String(v),120))}</td></tr>`).join("")}</table>`:`<p class="pdf-small">샘플 결과입니다(입력 없음).</p>`}`;
  },

  oppPage(o,i,R,esc,bandKo){
    const s=o.signals, n=o.narrative||{};
    const sig=(name,b)=>`<span class="pdf-sig"><em>${name}</em><b class="b-${b.band}">${bandKo(b.band)}${typeof b.raw==="number"?` (${b.raw})`:''}</b></span>`;
    const row=(th,v,max=150)=>{ v=(v==null?'':String(v)).trim(); return v && v!=="확인 필요" ?`<tr><th>${th}</th><td>${esc(this.clip(v,max))}</td></tr>`:''; };
    const alt=Plus.altText(o);
    const fit=State.isSample?[]:Plus.fitChecks(o);
    const path=(o.explainPath||[]).slice(0,6);
    return `<div class="pdf-opp">
      <div class="pdf-opp-head"><span class="rk">${i+1}</span>
        <div><h4>${esc(this.clip(n.name||o.title,40))}</h4><span class="who">${Plus.fieldName(o)?esc(Plus.fieldName(o))+' · ':''}${esc(this.clip(n.tagline||n.who||'',80))}</span></div></div>
      <div class="pdf-sigs">${sig("문제",s.problemSignal)}${sig("시장공백",s.marketGapSignal)}${sig("타이밍",s.timingSignal)}
        <span class="pdf-sig"><em>근거</em><b>${esc(EVIDENCE_LABEL[s.evidenceConfidence]||"-")}</b></span></div>
      <table class="pdf-opp-grid">
        ${row("고객",o.customer?.roles?.user,60)}
        ${row("문제",n.problem||o.problem?.statement)}
        ${row("현재 대안",[alt.how,alt.broken].filter(Boolean).join(" — "))}
        ${row("시장 공백",Plus.gapText(o))}
        ${row("왜 지금",n.whyNow)}
        ${row("해결 방식",n.solutionConcept)}
        ${row("핵심 가치",n.valueProp)}
        ${row("차별점",n.differentiator)}
        ${row("강점",n.strength)}
        ${row("유의점",n.caution)}
        ${row("수익 주체",n.buyer||o.buyer)}
        ${row("사업화 전 확인",n.unknowns||(o.unknowns||[]).join(", "))}
        <tr><th>적합도</th><td>${esc(o.founderFit?.note||'정밀 평가 전')}${fit.length?`<br><span class="mf">${fit.map(f=>esc(f.t)).join("<br>")}</span>`:''}</td></tr>
        ${(n.nameOptions||[]).length||n.nameReason?`<tr><th>이름</th><td>${esc(n.nameReason||"")}${(n.nameOptions||[]).length?` <span class="pdf-sub">다른 후보: ${(n.nameOptions||[]).map(esc).join(" · ")}</span>`:''}</td></tr>`:''}
      </table>
      ${path.length?`<div class="pdf-why"><div class="pdf-why-t">왜 이 아이템인가</div><ol class="pdf-why-list">${path.map(p=>`<li>${esc(this.clip(p,70))}</li>`).join("")}</ol></div>`:''}
    </div>`;
  },

  compare(R, primary, esc, bandKo){
    const cmp=R.comparison||{rows:[]};
    const rowMap=[["분야",null],["문제 강도","problem"],["시장 공백","marketGap"],["타이밍","whyNow"],["근거 수준","evidence"],["적합도","founderFitStatus"]];
    const cell=(r,key,o)=>{
      if(!key) return esc(Plus.fieldName(o)||"-");
      if(key==="evidence")return esc(EVIDENCE_LABEL[r.evidence]||"-");
      if(key==="founderFitStatus")return r.founderFitStatus==="misfit"?"⚠ 걸림돌":"평가 전";
      return bandKo(r[key]);
    };
    const oOf=r=>R.top5.find(x=>x.opportunityId===(r.id||r.opportunityId))||{};
    const known=(primary?.explainPath||[]).slice(0,4);
    const unk=Plus.validationPlan(primary||R.top5[0]).unknowns;
    return `<h2 class="pdf-h2">후보 비교</h2>
      ${R.comparisonInsight?`<div class="pdf-view"><span>${R.top5.length}개를 어떻게 나눠 볼까</span>${esc(this.clip(Result.cleanInsight(R.comparisonInsight),190))}</div>`:''}
      <table class="pdf-cmp pdf-cmp-wide">
        <thead><tr><th></th>${cmp.rows.map((r,i)=>`<th>${i+1}. ${esc((r.title||'').slice(0,16))}</th>`).join("")}</tr></thead>
        <tbody>${rowMap.map(([l,k])=>`<tr><th>${l}</th>${cmp.rows.map(r=>`<td>${cell(r,k,oOf(r))}</td>`).join("")}</tr>`).join("")}
          <tr><th>차별점</th>${cmp.rows.map(r=>`<td class="pdf-left">${esc(String(oOf(r).narrative?.differentiator||"-").slice(0,40))}</td>`).join("")}</tr></tbody>
      </table>
      <p class="pdf-note">※ 단일 1등을 강요하지 않습니다. 후보마다 서로 다른 강점이 있습니다.</p>
      ${primary?`<h3 class="pdf-h3">선택 후보 · ${esc(primary.narrative?.name||primary.title)}</h3>
      <div class="pdf-two">
        <div><b class="pdf-mini">알고 있는 것</b><ul class="pdf-ul pdf-ul-tight">${known.map(p=>`<li>${esc(this.clip(p,60))}</li>`).join("")}</ul></div>
        <div><b class="pdf-mini">아직 모르는 것</b><ul class="pdf-ul pdf-ul-tight">${(unk.length?unk:["실제 고객 지불의향","초기 고객 접근 채널"]).slice(0,4).map(u=>`<li>${esc(this.clip(u,60))}</li>`).join("")}</ul></div>
      </div>`:''}`;
  },

  planPage(o,esc){
    const p=Plus.validationPlan(o);
    const ev=PLUS_DATA.evidence[o.signals.evidenceConfidence]||PLUS_DATA.evidence.L0;
    return `<h2 class="pdf-h2">검증 첫 3걸음</h2>
      <p class="pdf-lead"><b>${esc(o.narrative?.name||o.title)}</b> · 현재 근거 수준 <b>${esc(o.signals.evidenceConfidence)} ${esc(ev.n)}</b>.
        아래 순서로 2~3주 안에 확인하면 근거 수준을 L3(직접 고객근거)까지 올릴 수 있습니다.</p>
      <table class="pdf-info pdf-plan">
        <tr><th>순서</th><th>할 일 · 방법</th><th>완료 판단</th></tr>
        ${p.steps.map(st=>`<tr><td><b>${st.when}</b></td><td><b>${esc(st.t)}</b><br>${esc(this.clip(st.how,150))}${st.qs.length?`<ol class="pdf-qs">${st.qs.map(q=>`<li>${esc(q)}</li>`).join("")}</ol>`:''}</td><td>${esc(st.done)}</td></tr>`).join("")}
      </table>
      ${p.unknowns.length?`<p class="pdf-small"><b>함께 확인할 점</b> ${p.unknowns.map(esc).join(" · ")}</p>`:''}
      <p class="pdf-small"><b>다음 단계</b> 3걸음을 마친 뒤 BECONIC AI 아이템 진단(PMF)에서 증거 기반 검증(고객문제·시장매력도·PMF·실행계획)을 이어가세요.</p>`;
  },

  evidencePage(R,o,esc){
    const src=Plus.sourcesFor(o);
    const q=Plus.inputQuality(); const d=Plus.diversity(R);
    const fit=State.isSample?[]:R.top5.map((x,i)=>({i,list:Plus.fitChecks(x)})).filter(x=>x.list.length);
    return `<h2 class="pdf-h2">근거 확인처와 결과 신뢰도</h2>
      <h3 class="pdf-h3" style="margin-top:0">근거 확인처 · ${esc(o.narrative?.name||o.title)} <span class="pdf-tag">주소 확인 ${PLUS_DATA.checked}</span></h3>
      <table class="pdf-info pdf-tight">${src.map(x=>`<tr><th>${esc(x.n)}</th><td>${esc(x.what)}<br><span class="pdf-url">${esc(x.url)}</span></td></tr>`).join("")}</table>
      <p class="pdf-small">확인처는 AI가 조회한 출처가 아니라, 가설을 직접 확인할 공식 사이트입니다.</p>
      <h3 class="pdf-h3">결과 신뢰도</h3>
      <table class="pdf-info pdf-tight">
        <tr><th>입력 충실도</th><td>${State.isSample?'샘플 결과(해당 없음)':`${q.n}/${q.total} · <b>${q.level.k}</b> — ${esc(q.level.d)}`}</td></tr>
        <tr><th>후보 다양성</th><td>분야 ${new Set(R.top5.map(x=>x.field).filter(Boolean)).size||'-'}종 · 제공 형태 ${d.forms}종 · 고객 유형 ${d.custs}종${d.sameProblem?' — 같은 고객·같은 문제의 다른 해법 위주':''}</td></tr>
        <tr><th>입력 조건 점검</th><td>${State.isSample?'샘플 결과(해당 없음)':fit.length?fit.map(x=>`${x.i+1}번: ${x.list.map(f=>esc(f.t)).join(" / ")}`).join("<br>"):'입력한 예산·선호 형태와 부딪히는 후보 없음'}</td></tr>
        <tr><th>계산 주체</th><td>규칙 엔진(코드): 신호·근거 수준·다양성·조건 점검 · AI: 구조화와 문장 서술 · 계산하지 않음: 성공확률·매출·투자등급·시장규모</td></tr>
      </table>`;
  },

  methodPage(R,esc){
    const nx=Plus.nextDiagnoses(R); const ev=PLUS_DATA.evidence;
    return `<h2 class="pdf-h2">평가 방법과 다음 진단</h2>
      <ol class="pdf-ul pdf-method">
        <li>3가지 신호(문제 강도·시장 공백·타이밍)는 AI가 구조화한 항목값으로 규칙 엔진이 0~100 값을 계산합니다. 20 이하 매우 낮음 · 40 이하 낮음 · 60 이하 보통 · 80 이하 높음 · 81 이상 매우 높음.</li>
        <li>근거 수준: ${Object.entries(ev).map(([k,v])=>`${k} ${v.n}`).join(" · ")}. 외부 근거가 붙기 전에는 L0(AI 가설)입니다.</li>
        <li>데이터가 없는 항목은 추정하지 않고 '확인 필요'로 둡니다. 확인 필요는 감점이 아닙니다.</li>
        <li>나와의 적합도는 점수화하지 않고, 예산·형태·자원과 부딪히는 걸림돌만 표시합니다.</li>
        <li>후보는 고객·문제·분야·형태가 겹치지 않도록 다양성 필터를 거칩니다. 순서는 성공 가능성 순위가 아닙니다.</li>
      </ol>
      <h3 class="pdf-h3">추천 연계 진단 (BECONIC 31)</h3>
      <table class="pdf-info pdf-tight">${nx.map((x,i)=>`<tr><th>${i+1}. ${esc(x.n)}</th><td>${esc(x.why)}<br><span class="pdf-url">${esc(x.url)}</span></td></tr>`).join("")}</table>
      <div class="pdf-cta-box"><b>상담</b><br>${esc(COMPANY_INFO.email)} · ${esc(COMPANY_INFO.phone)} — 문서번호 <b>${esc(Plus.docNo(R))}</b>를 알려 주시면 이 결과로 바로 상담합니다. 재탐색 권장 주기 ${PLUS_DATA.rediagnoseDays}일.</div>`;
  },

  // 쪽 넘침 방지: 문장 단위로 자르고 말줄임
  clip(t,max){ t=String(t||"").trim(); if(t.length<=max) return t; const cut=t.slice(0,max); const k=Math.max(cut.lastIndexOf(". "),cut.lastIndexOf(", "),cut.lastIndexOf(" ")); return (k>max*0.6?cut.slice(0,k):cut).replace(/[,.\s]+$/,"")+"…"; },
  header(){
    return `<div class="pdf-head-row"><span>K-ITEM FINDER · 사업기회 발굴 결과보고서</span><span>그로스벤처스㈜ · BECONIC</span></div>`;
  },
  footer(page){
    return `<div class="pdf-foot-row">
      <span>${COMPANY_INFO.companyName}</span>
      <span>Page ${page}</span>
      <span>중소기업상담회사 제2025-684호</span></div>`;
  },
};
