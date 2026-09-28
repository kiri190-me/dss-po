# DSS PO / 내자 — 운영 이미지
#
# 개발 PC에서 굽고 NAS로 옮긴다. 절차는 ../dss-deploy/runbook/08-PO-배포.md
# (이미지를 굽는 일반 절차는 같은 곳의 02-이미지-빌드.md 와 같다.)
#
#   # 🔴 먼저 서브모듈 둘이 채워져 있는지 본다 — 비어 있으면 빌드가 죽는다
#   git submodule status
#   docker build -t dss-po:0.1 .
#   docker save dss-po:0.1 -o dss-po-0.1.tar
#   (NAS에서) docker load -i dss-po-0.1.tar
#
# 🔴 굽는 것도 올리는 것도 사람이 한다. 이 파일은 그때 쓸 절차를 적어 둔 것이지,
#    지금 돌리라는 뜻이 아니다.
#
# ⚠️ 이 이미지를 NAS 에 띄우려면 dss-deploy/nas/docker-compose.nas.yml 에
#    서비스(`app-po`)가 하나 늘어야 하고, 설정 파일 `env/po.env` 가 있어야 하며,
#    DSM 리버스 프록시에 주소가 하나 늘어야 한다. 그 파일들은 이 저장소의 것이
#    아니다 — dss-deploy 에서 따로 한다(런북 08 의 3절).
#
# 🔴 이 사이트는 **제 DB 를 갖지 않는다.** A/S 와 같은 dss_as 를 같은 롤로 본다.
#    그래서 이 저장소에는 마이그레이션도 drizzle.config.ts 도 없고, 아래에
#    **도구(tools) 스테이지도 없다** — 까닭은 2단계 끝의 곁말에 적었다.

ARG NODE_IMAGE=node:22-bookworm-slim

# ── 1단계 : 라이브러리만 설치한다 ─────────────────────────────────────
#
# package 파일만 먼저 복사한다. 소스를 먼저 복사하면 화면 한 줄만 고쳐도
# 라이브러리를 처음부터 다시 깐다 — 이 순서 하나가 빌드 시간을 몇 배 가른다.
#
# 서브모듈(vendor/)은 이 단계에 **필요 없다.** npm 의존성이 아니라 tsconfig 의
# 경로 별칭으로 연결되는 저장소 안의 소스라, `npm ci` 가 볼 일이 없다.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── 2단계 : 앱을 굽는다 ───────────────────────────────────────────────
#
# 🔴 여기서는 서브모듈 둘이 **반드시** 있어야 한다. vendor/dss-ui(메뉴바 ·
#    알림 종)와 vendor/dss-core(공용 스키마 · 공용 견적서 화면)는 tsconfig.json 의
#    경로 별칭(`@dss/ui` · `@dss/core/schema` · `@dss/core/ui/*`)으로 연결되고,
#    작업 트리에 실제 파일로 들어와 있어 아래 `COPY . .` 이 함께 가져온다.
#    `.dockerignore` 가 `vendor` 를 막으면 여기서 모듈을 못 찾아 **빌드가 죽는다**
#    — 조용히 옛 코드가 쓰이는 것이 아니라 죽는다. 그 점은 다행이다.
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 빌드에만 쓰는 가짜 DATABASE_URL.
#
# `next build` 는 각 화면의 데이터를 모으려고 서버 모듈을 실제로 불러온다.
# src/lib/env.ts 의 required("DATABASE_URL") 이 값이 없으면 던지는데, 이미지에는
# .dockerignore 가 .env* 를 막아 두어(그게 맞다) 값이 없다.
#
# 접속은 하지 않는다 — postgres.js 는 실제로 쓸 때 연결한다. 값이 "있기만" 하면
# 되므로 누가 봐도 가짜인 값을 쓴다. 이 값은 이 단계에만 있고 최종 이미지에는
# 남지 않는다(3단계는 별도 FROM 이다). 운영에서는 compose 가 진짜 값을 넘긴다.
ENV DATABASE_URL="postgres://build:build@127.0.0.1:5432/build_time_only"

# 🔴 다른 환경값은 빌드에 넣지 않는다.
#    src/lib/env.ts 는 전부 getter 라 **쓰는 시점에만** 값을 본다. 그래서 양식
#    경로 다섯(QUOTE_TEMPLATE_PATH 등) · SSO_* · AUTH_SESSION_SECRET 은 빌드에
#    필요 없고, 넣으면 사내 경로와 비밀이 이미지에 박힌다. 전부 운영에서
#    컨테이너 환경변수로 들어온다(런북 08 의 3-ㅁ · 3-ㅂ).
RUN npm run build

# ── 도구(tools) 스테이지는 없다 ───────────────────────────────────────
#
# 이웃 저장소(A/S · 개선요청)에는 여기에 `--target tools` 로 굽는 스테이지가
# 하나 더 있다. 마이그레이션과 야간 완전삭제를 돌리는 자리다.
#
# 🔴 이 사이트에는 NAS 에서 돌릴 스크립트가 없다. 스키마의 주인은 A/S 하나뿐이라
#    이 저장소에는 마이그레이션도 drizzle.config.ts 도 없고, 야간 완전삭제도
#    A/S 의 `tools-as` 가 계속 맡는다 — 같은 표를 보므로 그 야간 작업이 PO 의
#    휴지통도 함께 비운다(런북 08 의 3-ㅂ). compose 에도 `tools-po` 를 만들지
#    않는다.

# ── 3단계 : 실행에 필요한 것만 담는다 ─────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Seoul

# standalone 은 .next/static 을 자동으로 담지 않는다(Next 문서 output.md).
# 그래서 따로 한 줄을 더 둔다.
#
# 🔴 `public` 은 복사하지 않는다 — **이 저장소에 그 폴더가 없다**(2026-09-28 실측).
#    A/S 의 같은 자리에는 그 줄이 있는데, 저쪽은 src/app/layout.tsx 가 런타임에
#    public/theme-init.js 를 읽기 때문이다(다크 모드). 이 사이트에는 다크 모드가
#    없고, 런타임에 저장소 안 파일을 읽는 자리도 한 군데도 없다. 베껴 오면 없는
#    경로라 그 줄에서 빌드가 죽는다. 나중에 public/ 이 생기면 그때 한 줄 더한다.
#
# 소유자는 COPY 할 때 정한다 — 다 옮겨 놓고 `RUN chown -R /app` 을 하면 그 한
# 줄이 /app 전체를 새 레이어에 한 벌 더 복사한다(계측기 도구 이미지에서 실측
# 1.86GB → 1.07GB). 그래서 아래 chown 은 새로 만든 폴더 둘에만 건다.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

RUN mkdir -p .next/cache && chown node:node .next .next/cache

USER node

# ⚠️ 첨부파일(사진 · 도면 · 성적서)도, 견적서 양식(xlsx)도, 발행한 견적서를 놓는
#    공유폴더도 이미지에 없다. 셋 다 저장소 밖에 있고 운영에서는 볼륨으로 붙는다
#    — 그리고 🔴 첨부 폴더는 **A/S 와 같은 폴더**다(같은 attachments 표를 보므로
#    나누면 서로의 파일을 못 찾는다, 런북 08 의 3-ㄷ). 이미지를 새로 올려도
#    파일은 그대로 남는다.
#
# 엑셀 워크북을 파싱할 때 메모리가 크게 튄다. compose 에서 이 컨테이너에 상한을
# 걸어 둔다(런북 08 은 640M) — 터지더라도 이 컨테이너만 죽고 로그인 포털과
# 다른 사이트는 살아남는다.
#
# HOSTNAME 을 0.0.0.0 으로 두지 않으면 컨테이너 안 루프백에만 붙어, 포트를
# 열어도 밖에서 닿지 않는다.
ENV PORT=3600 HOSTNAME=0.0.0.0
EXPOSE 3600

CMD ["node", "server.js"]
