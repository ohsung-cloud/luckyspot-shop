-- ============================================================================
-- 특허 1호 — 교차예측 · 다중사업자 자동발주 스키마 (2026-11-23)
-- 저장소 사본: 원본은 notes/supabase-patent1-auto-order-2026-11-23.sql (같은 내용)
-- 프로젝트: koqkvlmnltbpuxoifxpp (https://koqkvlmnltbpuxoifxpp.supabase.co)
--
-- 실행 방법
--   1) https://supabase.com/dashboard/project/koqkvlmnltbpuxoifxpp/sql/new 를 연다
--   2) 이 파일 전체를 붙여넣고 [Run] 한 번 누른다
--   3) 맨 끝의 확인 쿼리가 표 4개 · rls = true · bom_rules = 8 을 보여주면 끝
--
-- 담긴 것 (순서를 바꾸면 안 된다)
--   1) pos_daily_sales          지점별 일일 카페 매출/잔수 + 프린트 매출/출력매수
--   1-1) device_telemetry_snapshots 외 3종 — 에스칼프린트·로얄선즈 실측 스냅샷(§6)
--   2) consumable_bom_rules     SKU별 단위 소모량 · 교차 상관계수 · 안전재고일 · 상한 · 부담 사업자
--   3) auto_order_proposals     예측 제안 큐 (pending_approval → grace_cancel_window 5분
--                               → confirmed_split | canceled, 이상 시 held_anomaly)
--   4) auto_order_ledger        사업자별 조달 원가 귀속 원장 (정산)
--
-- 안전성
--   * 전부 IF NOT EXISTS / OR REPLACE 로 작성했다. 두 번 실행해도 결과가 같다(멱등).
--   * DELETE · TRUNCATE · DROP TABLE · DROP COLUMN 문장은 한 줄도 없다.
--   * 데이터를 쓰는 문장은 consumable_bom_rules 시드 8행뿐이며,
--     on conflict (sku) do nothing 이라 운영 중에 고친 값을 덮어쓰지 않는다.
--   * RLS를 켜고 정책을 만들지 않는다. 서버(sb_secret_* = service_role)만 접근한다.
--     (기존 럭키스팟 스키마와 같은 방식)
--
-- 특허 청구항 ↔ 테이블 매핑 (변리사 미팅용)
--   (b) 귀속 프로파일 저장부 → consumable_bom_rules
--       (장비 식별자는 sku·primary_domain로, 소유 사업자는 owner_entity_type로 정규화)
--   (c) 소진 예측부        → pos_daily_sales (교차 보정 입력) + 엔진 src/features/auto-order/forecast.ts
--   (d) 발주 제안부        → auto_order_proposals.items (사업자별 분해 제안 스냅샷)
--   (e) 승인 게이트부      → auto_order_proposals.status + grace_expires_at (5분 유예)
--                            + split_result (사업자별 발주 전표·세금계산서 타겟)
--   (f) 정산 귀속부        → auto_order_ledger (entity_type별 조달 원가·부가세)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 공통: updated_at 자동 갱신
--   (기존 스키마에 같은 함수가 있으면 본문만 같으므로 그대로 대체된다)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- 1) pos_daily_sales — 지점별 일일 POS 마감
--
--   cafe_revenue / drinks_sold      : 카페(점주 사업자) 매출·음료 잔수
--   print_revenue / print_sheets    : 프린트(본사·샵인샵 사업자) 매출·출력 매수
--   color_sheets                    : 그중 컬러 출력 매수 (컬러토너 소진 계산용)
--
--   한 행에 두 사업자의 매출이 같이 들어오는 것이 이 특허의 출발점이다.
--   → 같은 매장·같은 날의 이기종 매출을 한 시계열로 묶어 교차 보정에 쓴다.
-- ----------------------------------------------------------------------------
create table if not exists public.pos_daily_sales (
  id            uuid        primary key default gen_random_uuid(),
  store_code    text        not null,
  sales_date    date        not null,
  cafe_revenue  integer     not null default 0 check (cafe_revenue >= 0),
  drinks_sold   integer     not null default 0 check (drinks_sold >= 0),
  print_revenue integer     not null default 0 check (print_revenue >= 0),
  print_sheets  integer     not null default 0 check (print_sheets >= 0),
  color_sheets  integer     not null default 0 check (color_sheets >= 0),
  -- 'manual' | 'auto-order-ingest' | 'pos-api' 등 입력 경로
  -- 그날 그 도메인 값이 실제로 보고되었는가. 한쪽 포털만 들어온 날을 0(=급감)으로 읽지 않기 위한 플래그.
  cafe_reported  boolean     not null default true,
  print_reported boolean     not null default true,
  source        text        not null default 'manual',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 지점·날짜 1건. ON CONFLICT (store_code, sales_date) 업서트가 이 인덱스를 쓴다.
alter table public.pos_daily_sales
  add column if not exists cafe_reported  boolean not null default true,
  add column if not exists print_reported boolean not null default true;

create unique index if not exists pos_daily_sales_store_date_uidx
  on public.pos_daily_sales (store_code, sales_date);

create index if not exists pos_daily_sales_store_date_desc_idx
  on public.pos_daily_sales (store_code, sales_date desc);

comment on table  public.pos_daily_sales is
  '지점별 일일 POS 마감 — 카페(점주)와 프린트(본사) 매출을 한 행에 담아 교차 소진예측의 입력으로 쓴다';
comment on column public.pos_daily_sales.drinks_sold is
  '음료 판매 잔수 — 카페 소모품(원두·컵·리드)의 주 운전값';
comment on column public.pos_daily_sales.print_sheets is
  '프린트 출력 매수(A4 환산) — 프린트 소모품(용지·토너)의 주 운전값이자 카페 소모품의 교차 보정 신호';


-- ----------------------------------------------------------------------------
-- 2) consumable_bom_rules — SKU별 소진 규칙(BOM)과 소유 사업자 귀속
--
--   owner_entity_type : 이 소모품 값을 실제로 부담하는 사업자
--                       franchisee_cafe = 점주(카페) / hq_print = 본사·샵인샵(프린트)
--   primary_domain    : 소진을 직접 이끄는 도메인
--   cross_domain      : 교차 보정에 쓰는 반대편 도메인
--   cross_domain_weight : 교차 상관계수 w (0~1). 엔진은 ±40%까지만 반영한다.
--   consumption_per_driver_unit : 1잔당 g, 1매당 g/개 같은 단위 환산계수
--   pack_size / pack_label      : 발주 1단위에 들어 있는 소모 단위
--   max_order_qty               : 1회 자동발주 상한(초과 시 보류·재승인)
-- ----------------------------------------------------------------------------
create table if not exists public.consumable_bom_rules (
  sku                        text          primary key,
  name                       text          not null,
  owner_entity_type          text          not null
                               check (owner_entity_type in ('franchisee_cafe', 'hq_print')),
  primary_domain             text          not null
                               check (primary_domain in ('cafe', 'print')),
  driver_field               text          not null
                               check (driver_field in ('drinks', 'sheets', 'colorSheets')),
  cross_domain               text          not null
                               check (cross_domain in ('cafe', 'print')),
  cross_driver_field         text          not null
                               check (cross_driver_field in ('drinks', 'sheets', 'colorSheets')),
  cross_domain_weight        numeric(4,3)  not null default 0
                               check (cross_domain_weight >= 0 and cross_domain_weight <= 1),
  consumption_per_driver_unit numeric(12,4) not null
                               check (consumption_per_driver_unit > 0),
  stock_unit                 text          not null
                               check (stock_unit in ('g', '개', '장', '매')),
  pack_size                  numeric(12,2) not null check (pack_size > 0),
  pack_label                 text,
  lead_time_days             integer       not null default 3 check (lead_time_days >= 0),
  safety_stock_days          integer       not null default 3 check (safety_stock_days >= 0),
  max_order_qty              integer       not null default 3 check (max_order_qty >= 1),
  stock_on_hand              numeric(14,2) not null default 0 check (stock_on_hand >= 0),
  supplier                   text          not null,
  -- 부가세 포함 발주 단가. 화면·서버 계산은 src/data/products.ts를 원본으로 쓰고,
  -- 이 컬럼은 특허 실시예·정산 대조용 스냅샷이다.
  unit_price                 integer       not null default 0 check (unit_price >= 0),
  is_active                  boolean       not null default true,
  created_at                 timestamptz   not null default now(),
  updated_at                 timestamptz   not null default now()
);

create index if not exists consumable_bom_rules_entity_idx
  on public.consumable_bom_rules (owner_entity_type, is_active);

comment on table public.consumable_bom_rules is
  'SKU별 소진 규칙 — 장비/도메인 ↔ 소유 사업자 ↔ 단위 소모량 ↔ 리드타임 ↔ 발주 상한 매핑(청구항 b)';
comment on column public.consumable_bom_rules.cross_domain_weight is
  '교차 상관계수 w — 반대 도메인 변화율을 clamp(±0.4)한 뒤 1+w*x 로 소진량을 보정한다';
comment on column public.consumable_bom_rules.owner_entity_type is
  '소모품 원가를 부담하는 사업자. 발주 전표·세금계산서 수신 주체 분기의 기준';

-- 시드 8종 — 앱의 src/features/auto-order/rules.ts와 같은 값.
-- 운영 중에 값을 고쳤다면 이 문장은 아무것도 하지 않는다(do nothing).
insert into public.consumable_bom_rules (
  sku, name, owner_entity_type, primary_domain, driver_field,
  cross_domain, cross_driver_field, cross_domain_weight,
  consumption_per_driver_unit, stock_unit, pack_size, pack_label,
  lead_time_days, safety_stock_days, max_order_qty, stock_on_hand, supplier, unit_price
) values
  ('bean-10kg', '제이웨이브 레귤러핏 원두 1박스', 'franchisee_cafe', 'cafe', 'drinks',
   'print', 'sheets', 0.120, 12.5000, 'g', 10000, '1박스(10kg)',
   2, 3, 3, 3300, '제이웨이브', 200000),
  ('cup-plastic-16', '16온즈 플라스틱컵 92파이', 'franchisee_cafe', 'cafe', 'drinks',
   'print', 'sheets', 0.280, 0.5500, '개', 1000, '1박스(1,000개)',
   3, 4, 6, 90, '로얄선스', 72600),
  ('cup-paper-16', '16온즈 친환경 종이컵', 'franchisee_cafe', 'cafe', 'drinks',
   'print', 'sheets', 0.280, 0.3500, '개', 1000, '1박스(1,000개)',
   3, 4, 6, 60, '로얄선스', 72600),
  ('lid-white-16', '16온즈 흰색 컵리드', 'franchisee_cafe', 'cafe', 'drinks',
   'print', 'sheets', 0.280, 0.6000, '개', 1000, '1박스(1,000개)',
   3, 4, 6, 80, '로얄선스', 34430),
  ('a4-paper', 'A4 용지 75g', 'hq_print', 'print', 'sheets',
   'cafe', 'drinks', 0.100, 1.0000, '매', 2500, '1박스(2,500매)',
   2, 3, 4, 420, '본사 지정 공급처', 23000),
  ('toner-black', '복합기 정품 검정토너 (K)', 'hq_print', 'print', 'sheets',
   'cafe', 'drinks', 0.100, 0.0250, 'g', 500, '1개(500g·약 2만매)',
   3, 4, 2, 14, '본사 지정 공급처', 99800),
  ('toner-color', '복합기 정품 컬러토너 (C/M/Y)', 'hq_print', 'print', 'colorSheets',
   'cafe', 'drinks', 0.100, 0.0600, 'g', 500, '1개(500g·약 8천매)',
   3, 4, 2, 12, '본사 지정 공급처', 149800)
on conflict (sku) do nothing;


-- ----------------------------------------------------------------------------
-- 3) auto_order_proposals — 예측 제안 큐 + 5분 유예 상태 + 사업자 분기 결과
--
--   상태 전이
--     pending_approval ──승인──▶ grace_cancel_window ──5분 경과──▶ confirmed_split
--            │                          └────취소(만료 전)────▶ canceled
--            └─(단측 급감 이상)────────▶ held_anomaly
--
--   items        : 승인 시점의 발주 라인 스냅샷(사업자·수량·단가·교차 근거)
--   split_result : 사업자별 발주 전표 + 세금계산서 발행 주체/수신 주체 + 결제 귀속
--   grace_expires_at : 승인 + 5분. 이 시각 전에는 cancel만, 이후에는 confirm만 성립한다.
-- ----------------------------------------------------------------------------
create table if not exists public.auto_order_proposals (
  id               text        primary key,
  store_code       text        not null,
  store_label      text,
  status           text        not null default 'pending_approval'
                     check (status in (
                       'pending_approval',
                       'grace_cancel_window',
                       'held_anomaly',
                       'confirmed_split',
                       'canceled'
                     )),
  as_of_date       date,
  items            jsonb       not null default '[]'::jsonb,
  split_result     jsonb,
  total_amount     integer     not null default 0 check (total_amount >= 0),
  anomaly          jsonb       not null default '[]'::jsonb,
  data_source      text,
  approved_at      timestamptz,
  grace_expires_at timestamptz,
  confirmed_at     timestamptz,
  canceled_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists auto_order_proposals_store_status_idx
  on public.auto_order_proposals (store_code, status, created_at desc);

create index if not exists auto_order_proposals_grace_idx
  on public.auto_order_proposals (grace_expires_at)
  where status = 'grace_cancel_window';

comment on table public.auto_order_proposals is
  '자동발주 제안 큐 — 승인 게이트(5분 유예) 상태 전이와 사업자별 분기 결과를 함께 보관한다(청구항 d·e)';
comment on column public.auto_order_proposals.grace_expires_at is
  '유예 만료 시각 = approved_at + 5분. 만료 전 취소만, 만료 후 확정만 허용하는 서버 판정 기준';
comment on column public.auto_order_proposals.split_result is
  '사업자별 발주 전표·세금계산서 발행/수신 주체·결제 귀속 JSONB';


-- ----------------------------------------------------------------------------
-- 4) auto_order_ledger — 사업자별 조달 원가 귀속 원장
--
--   확정(confirmed_split) 시 발주 라인마다 1행. 점주 사업자와 본사 사업자의
--   조달 원가·부가세가 섞이지 않게 원장에서 갈라 둔다(청구항 f).
-- ----------------------------------------------------------------------------
create table if not exists public.auto_order_ledger (
  id                  uuid        primary key default gen_random_uuid(),
  approval_id         text        not null,
  store_code          text        not null,
  entity_type         text        not null
                        check (entity_type in ('franchisee_cafe', 'hq_print')),
  entity_name         text,
  supplier            text,
  sku                 text        not null,
  quantity            numeric(12,2) not null default 0 check (quantity >= 0),
  amount              integer     not null default 0 check (amount >= 0),
  supply_amount       integer     not null default 0 check (supply_amount >= 0),
  vat_amount          integer     not null default 0 check (vat_amount >= 0),
  tax_invoice_issuer  text,
  tax_invoice_recipient text,
  settled_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index if not exists auto_order_ledger_approval_idx
  on public.auto_order_ledger (approval_id);

create index if not exists auto_order_ledger_entity_idx
  on public.auto_order_ledger (store_code, entity_type, settled_at desc);

comment on table public.auto_order_ledger is
  '사업자별 조달 원가 귀속 원장 — 점주(카페)·본사(프린트) 원가와 부가세를 분리 집계한다(청구항 f)';


-- ----------------------------------------------------------------------------
-- 5) updated_at 트리거 (이미 있으면 교체)
-- ----------------------------------------------------------------------------
drop trigger if exists pos_daily_sales_set_updated_at on public.pos_daily_sales;
create trigger pos_daily_sales_set_updated_at
  before update on public.pos_daily_sales
  for each row execute function public.set_updated_at();

drop trigger if exists consumable_bom_rules_set_updated_at on public.consumable_bom_rules;
create trigger consumable_bom_rules_set_updated_at
  before update on public.consumable_bom_rules
  for each row execute function public.set_updated_at();

drop trigger if exists auto_order_proposals_set_updated_at on public.auto_order_proposals;
create trigger auto_order_proposals_set_updated_at
  before update on public.auto_order_proposals
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 6) 접근 차단 — RLS 켜기 + anon/authenticated 권한 회수 + service_role만 허용
--    (정책은 만들지 않는다. 기존 럭키스팟 테이블과 같은 방식)
-- ----------------------------------------------------------------------------
alter table public.pos_daily_sales      enable row level security;
alter table public.consumable_bom_rules enable row level security;
alter table public.auto_order_proposals enable row level security;
alter table public.auto_order_ledger    enable row level security;

revoke all on table public.pos_daily_sales      from anon, authenticated;
revoke all on table public.consumable_bom_rules from anon, authenticated;
revoke all on table public.auto_order_proposals from anon, authenticated;
revoke all on table public.auto_order_ledger    from anon, authenticated;

grant all on table public.pos_daily_sales      to service_role;
grant all on table public.consumable_bom_rules to service_role;
grant all on table public.auto_order_proposals to service_role;
grant all on table public.auto_order_ledger    to service_role;



-- ----------------------------------------------------------------------------
-- 6) 포털 실측 스냅샷 — 에스칼프린트(프린트) · 로얄선즈(커피)
--
--   수집기(스크래핑)가 하루 3회 보내는 값을 그대로 쌓는다.
--   /api/auto-order/ingest-pos 의 snapshot 입력이 이 표들로 들어온다.
--
--   device_telemetry_snapshots : 장비 모델·S/N·누적 출력 매수·토너 K/C/M/Y %·용지 Tray1/Tray2 %
--   beverage_sales_snapshots   : 베스트셀러 상품명칭별 판매량(잔)
--   portal_revenue_snapshots   : 카페 금일/어제/이달, 프린트 월 실매출(카드+티머니+키오스크−환불)
--   coffee_machine_status_snapshots : 온라인/오프라인, 재료 부족 알림
--
--   ★ 토너·용지 %는 consumable_bom_rules.stock_signal 로 현재고 환산에 쓰인다.
--     stock_signal: toner_black_pct | toner_color_pct | paper_tray_pct
--     stock_signal_capacity: 100%일 때의 소모 단위(토너 500g, A4 2트레이 1,100매)
-- ----------------------------------------------------------------------------
alter table public.consumable_bom_rules
  add column if not exists stock_signal          text,
  add column if not exists stock_signal_capacity numeric(14,2);

create table if not exists public.device_telemetry_snapshots (
  id                     uuid        primary key default gen_random_uuid(),
  store_code             text        not null,
  source                 text        not null default 'escalprint',
  device_model           text,
  device_serial          text,
  captured_at            timestamptz not null,
  cumulative_print_count bigint      check (cumulative_print_count is null or cumulative_print_count >= 0),
  toner_k_pct            numeric(5,2) check (toner_k_pct is null or (toner_k_pct >= 0 and toner_k_pct <= 100)),
  toner_c_pct            numeric(5,2) check (toner_c_pct is null or (toner_c_pct >= 0 and toner_c_pct <= 100)),
  toner_m_pct            numeric(5,2) check (toner_m_pct is null or (toner_m_pct >= 0 and toner_m_pct <= 100)),
  toner_y_pct            numeric(5,2) check (toner_y_pct is null or (toner_y_pct >= 0 and toner_y_pct <= 100)),
  tray1_pct              numeric(5,2) check (tray1_pct is null or (tray1_pct >= 0 and tray1_pct <= 100)),
  tray2_pct              numeric(5,2) check (tray2_pct is null or (tray2_pct >= 0 and tray2_pct <= 100)),
  raw                    jsonb,
  created_at             timestamptz not null default now()
);

-- 하루 3회 스냅샷이 같은 시각에 다시 들어와도 1건만 남긴다(재수집 멱등).
create unique index if not exists device_telemetry_store_source_captured_uidx
  on public.device_telemetry_snapshots (store_code, source, captured_at);
create index if not exists device_telemetry_store_captured_idx
  on public.device_telemetry_snapshots (store_code, captured_at desc);

create table if not exists public.beverage_sales_snapshots (
  id           uuid        primary key default gen_random_uuid(),
  store_code   text        not null,
  source       text        not null default 'loyalsuns',
  captured_at  timestamptz not null,
  sales_date   date        not null,
  product_name text        not null,
  quantity     integer     not null default 0 check (quantity >= 0),
  amount       integer     check (amount is null or amount >= 0),
  raw          jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists beverage_sales_store_date_idx
  on public.beverage_sales_snapshots (store_code, sales_date desc);

create table if not exists public.portal_revenue_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  store_code    text        not null,
  source        text        not null check (source in ('loyalsuns', 'escalprint', 'manual')),
  scope         text        not null check (scope in ('day', 'month')),
  period_start  date,
  period_end    date,
  captured_at   timestamptz not null,
  gross_amount  bigint      not null default 0 check (gross_amount >= 0),
  refund_amount bigint      not null default 0 check (refund_amount >= 0),
  net_amount    bigint      not null default 0,
  order_count   integer,
  refund_count  integer,
  raw           jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists portal_revenue_store_scope_idx
  on public.portal_revenue_snapshots (store_code, source, scope, captured_at desc);

create table if not exists public.coffee_machine_status_snapshots (
  id          uuid        primary key default gen_random_uuid(),
  store_code  text        not null,
  source      text        not null default 'loyalsuns',
  captured_at timestamptz not null,
  online      boolean,
  alerts      jsonb       not null default '[]'::jsonb,
  raw         jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists coffee_machine_store_captured_idx
  on public.coffee_machine_status_snapshots (store_code, captured_at desc);

comment on table public.device_telemetry_snapshots is
  '프린트 장비 실측 스냅샷(일 3회) — 누적 출력 매수·토너 %·용지 트레이 %. %는 BOM stock_signal로 현재고 환산';
comment on table public.beverage_sales_snapshots is
  '커피 포털 베스트셀러 판매 라인 — 상품명칭별 판매량. 음료 잔수(driver)의 실측 입력';
comment on table public.portal_revenue_snapshots is
  '포털 매출 스냅샷 — 카페 금일/어제/이달, 프린트 월 실매출(카드+티머니+키오스크−환불)';
comment on table public.coffee_machine_status_snapshots is
  '커피 머신 상태 스냅샷 — 온라인 여부·재료 부족 알림(재고 소진과 구분하기 위한 신호)';

alter table public.device_telemetry_snapshots   enable row level security;
alter table public.beverage_sales_snapshots     enable row level security;
alter table public.portal_revenue_snapshots     enable row level security;
alter table public.coffee_machine_status_snapshots enable row level security;

revoke all on table public.device_telemetry_snapshots   from anon, authenticated;
revoke all on table public.beverage_sales_snapshots     from anon, authenticated;
revoke all on table public.portal_revenue_snapshots     from anon, authenticated;
revoke all on table public.coffee_machine_status_snapshots from anon, authenticated;

grant all on table public.device_telemetry_snapshots   to service_role;
grant all on table public.beverage_sales_snapshots     to service_role;
grant all on table public.portal_revenue_snapshots     to service_role;
grant all on table public.coffee_machine_status_snapshots to service_role;


-- ----------------------------------------------------------------------------
-- 확인 쿼리 (Run 후 결과를 눈으로 확인)
--   tables = 8, rls_true = 8, bom_rules = 7, policies = 0 이면 정상
-- ----------------------------------------------------------------------------
select 'tables' as check,
       count(*) as value
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('pos_daily_sales', 'consumable_bom_rules', 'auto_order_proposals', 'auto_order_ledger',
                      'device_telemetry_snapshots', 'beverage_sales_snapshots', 'portal_revenue_snapshots',
                      'coffee_machine_status_snapshots');

select 'rls_true' as check,
       count(*) as value
  from pg_tables
 where schemaname = 'public'
   and tablename in ('pos_daily_sales', 'consumable_bom_rules', 'auto_order_proposals', 'auto_order_ledger',
                     'device_telemetry_snapshots', 'beverage_sales_snapshots', 'portal_revenue_snapshots',
                     'coffee_machine_status_snapshots')
   and rowsecurity = true;

select 'bom_rules' as check, count(*) as value
  from public.consumable_bom_rules;

select 'policies' as check, count(*) as value
  from pg_policies
 where schemaname = 'public'
   and tablename in ('pos_daily_sales', 'consumable_bom_rules', 'auto_order_proposals', 'auto_order_ledger',
                     'device_telemetry_snapshots', 'beverage_sales_snapshots', 'portal_revenue_snapshots',
                     'coffee_machine_status_snapshots');


-- ----------------------------------------------------------------------------
-- 되돌리기 (필요할 때만 직접 실행 — 이 파일은 스스로 지우지 않는다)
--
--   drop table if exists public.coffee_machine_status_snapshots;
--   drop table if exists public.portal_revenue_snapshots;
--   drop table if exists public.beverage_sales_snapshots;
--   drop table if exists public.device_telemetry_snapshots;
--   drop table if exists public.auto_order_ledger;
--   drop table if exists public.auto_order_proposals;
--   drop table if exists public.consumable_bom_rules;
--   drop table if exists public.pos_daily_sales;
-- ----------------------------------------------------------------------------
