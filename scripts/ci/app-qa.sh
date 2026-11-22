#!/usr/bin/env bash
# CI E2E — 앱 하나의 빌드·QA. 사용: bash scripts/ci/app-qa.sh <app>
# 각 앱은 별도 러너에서 병렬로 돈다(포트 충돌 없음).
set -euo pipefail
app="$1"
# 정적 서버를 띄우고 실제로 응답할 때까지 기다린다(고정 1초 대기는 병렬 러너에서 늦게 떠 ERR_CONNECTION_REFUSED — 2026-11-19 PR #97 grants)
serve() {
  (cd "$1" && python3 -m http.server "$2" --bind 127.0.0.1 >/dev/null 2>&1 &)
  for _ in $(seq 1 40); do curl -sf --noproxy "*" --max-time 2 -o /dev/null "http://127.0.0.1:$2/" && return 0; sleep 0.5; done
  echo "서버가 20초 안에 뜨지 않음: $1 :$2" >&2; return 1
}
case "$app" in
  tech)
    npm run build
    node tests/e2e/smoke.mjs
    node tests/e2e/flow-parity.mjs
    npm run test:pdf ;;
  hr)
    serve hr 8791
    node hr/tests/qa.mjs http://127.0.0.1:8791/
    (cd hr && npm run build)
    node hr/tests/ai-contract.mjs ;;
  growth)
    (cd growth && npm run build); serve growth/dist 8792
    node growth/tests/qa.mjs http://127.0.0.1:8792/
    node growth/tests/sweep.mjs http://127.0.0.1:8792/ ;;
  grants)
    (cd grants && npm run build && npm run build:demo); serve grants/dist 8793
    node grants/tests/qa.mjs http://127.0.0.1:8793/
    node grants/tests/eval-precision.mjs http://127.0.0.1:8793/ ;;
  ir)
    (cd ir && npm run build); serve ir/dist 8794
    node ir/tests/qa.mjs http://127.0.0.1:8794/ ;;
  prestartup)
    (cd prestartup && npm run build); serve prestartup/dist 8795
    node prestartup/tests/qa.mjs http://127.0.0.1:8795/ ;;
  esg)
    node esg/tests/qa.mjs ;;
  finance)
    (cd finance && npm run build); serve finance/dist 8790
    node finance/tests/qa.mjs http://127.0.0.1:8790/ ;;
  psf)
    (cd psf && npm run build); serve psf/dist 8796
    node psf/tests/qa.mjs http://127.0.0.1:8796/
    node psf/tests/ai-contract.mjs ;;
  certification)
    (cd certification && npm test && npm run build); serve certification/dist 8797
    node certification/tests/qa.mjs http://127.0.0.1:8797/
    node certification/tests/pdf.mjs http://127.0.0.1:8797/ ;;
  *) echo "알 수 없는 앱: $app" >&2; exit 2 ;;
esac
