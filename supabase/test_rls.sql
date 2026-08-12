-- =============================================================================
-- test_rls.sql — Harnais de test de la Row Level Security
--
-- À exécuter APRÈS `supabase db reset` (migrations + seed) :
--     psql "$DATABASE_URL" -f supabase/test_rls.sql
--   ou colle-le dans le SQL Editor de Supabase.
--
-- PRINCIPE : on "devient" chaque utilisateur en prenant le rôle Postgres
-- `authenticated` (ou `anon`) et en injectant le claim JWT `sub` (= l'UUID de
-- l'utilisateur). C'est exactement ce que lit auth.uid(). On compte alors les
-- lignes visibles sous RLS et on compare au résultat attendu (calculé depuis le
-- seed). Chaque ligne de sortie est PASS (notice) ou FAIL (warning).
--
-- Les valeurs attendues sont dérivées du seed :
--   Biens : P1(ownerA, loué T1) P2(ownerA, public) P3(ownerB, loué T2)
--           P4(indivision A+B, loué T3) P5(ownerB, public)
--   Baux  : L1(P1,T1) L2(P3,T2) L3(P4,T3)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Fonction utilitaire : exécute un COUNT sous l'identité (rôle + sub) donnée.
-- SECURITY INVOKER : elle prend réellement le rôle authenticated/anon pour que
-- la RLS s'applique (le rôle postgres, lui, contournerait la RLS).
-- ---------------------------------------------------------------------------
create or replace function public.rls_count(p_sub uuid, p_role text, p_sql text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if p_role = 'anon' then
    set local role anon;
    perform set_config('request.jwt.claims', '', true);
  else
    set local role authenticated;
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_sub, 'role', 'authenticated')::text,
      true
    );
  end if;

  execute p_sql into v_count;

  reset role; -- revient au rôle de session (postgres)
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Table des cas de test : (label, sub, rôle, requête, attendu)
-- ---------------------------------------------------------------------------
create temp table rls_tests (
  ord      serial,
  label    text,
  sub      uuid,
  role     text,
  sql      text,
  expected integer
);

insert into rls_tests (label, sub, role, sql, expected) values
-- ============ properties (admin | owns | rents) ============================
('properties  / admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from properties', 5),
('properties  / ownerA ', '22222222-2222-2222-2222-222222222221', 'authenticated', 'select count(*) from properties', 3),
('properties  / ownerB ', '22222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*) from properties', 3),
('properties  / tenant1', '33333333-3333-3333-3333-333333333331', 'authenticated', 'select count(*) from properties', 1),
('properties  / tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from properties', 1),
('properties  / tenant3', '33333333-3333-3333-3333-333333333333', 'authenticated', 'select count(*) from properties', 1),

-- ============ leases (admin | tenant | owns) ===============================
('leases      / admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from leases', 3),
('leases      / ownerA ', '22222222-2222-2222-2222-222222222221', 'authenticated', 'select count(*) from leases', 2),
('leases      / ownerB ', '22222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*) from leases', 2),
('leases      / tenant1', '33333333-3333-3333-3333-333333333331', 'authenticated', 'select count(*) from leases', 1),
('leases      / tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from leases', 1),
('leases      / tenant3', '33333333-3333-3333-3333-333333333333', 'authenticated', 'select count(*) from leases', 1),

-- ============ rent_charges (admin | is_lease_party) ========================
('rent_charges/ admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from rent_charges', 9),
('rent_charges/ ownerA ', '22222222-2222-2222-2222-222222222221', 'authenticated', 'select count(*) from rent_charges', 6),
('rent_charges/ ownerB ', '22222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*) from rent_charges', 6),
('rent_charges/ tenant1', '33333333-3333-3333-3333-333333333331', 'authenticated', 'select count(*) from rent_charges', 3),
('rent_charges/ tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from rent_charges', 3),
('rent_charges/ tenant3', '33333333-3333-3333-3333-333333333333', 'authenticated', 'select count(*) from rent_charges', 3),

-- ============ payments (admin | is_lease_party) ============================
('payments    / admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from payments', 7),
('payments    / ownerA ', '22222222-2222-2222-2222-222222222221', 'authenticated', 'select count(*) from payments', 5),
('payments    / ownerB ', '22222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*) from payments', 4),
('payments    / tenant1', '33333333-3333-3333-3333-333333333331', 'authenticated', 'select count(*) from payments', 3),
('payments    / tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from payments', 2),
('payments    / tenant3', '33333333-3333-3333-3333-333333333333', 'authenticated', 'select count(*) from payments', 2),

-- ============ payment_allocations (admin | via paiement) ===================
('allocations / admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from payment_allocations', 6),
('allocations / ownerA ', '22222222-2222-2222-2222-222222222221', 'authenticated', 'select count(*) from payment_allocations', 5),
('allocations / ownerB ', '22222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*) from payment_allocations', 3),
('allocations / tenant1', '33333333-3333-3333-3333-333333333331', 'authenticated', 'select count(*) from payment_allocations', 3),
('allocations / tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from payment_allocations', 1),
('allocations / tenant3', '33333333-3333-3333-3333-333333333333', 'authenticated', 'select count(*) from payment_allocations', 2),

-- ============ issues (admin | owns | rents) ================================
('issues      / admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from issues', 3),
('issues      / ownerA ', '22222222-2222-2222-2222-222222222221', 'authenticated', 'select count(*) from issues', 2),
('issues      / ownerB ', '22222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*) from issues', 2),
('issues      / tenant1', '33333333-3333-3333-3333-333333333331', 'authenticated', 'select count(*) from issues', 1),
('issues      / tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from issues', 1),
('issues      / tenant3', '33333333-3333-3333-3333-333333333333', 'authenticated', 'select count(*) from issues', 1),

-- ============ documents (admin | via bail ou bien) =========================
('documents   / admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from documents', 3),
('documents   / ownerA ', '22222222-2222-2222-2222-222222222221', 'authenticated', 'select count(*) from documents', 2),
('documents   / ownerB ', '22222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*) from documents', 2),
('documents   / tenant1', '33333333-3333-3333-3333-333333333331', 'authenticated', 'select count(*) from documents', 1),
('documents   / tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from documents', 1),
('documents   / tenant3', '33333333-3333-3333-3333-333333333333', 'authenticated', 'select count(*) from documents', 1),

-- ============ profiles (soi | admin | ses locataires) ======================
('profiles    / admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from profiles', 6),
('profiles    / ownerA ', '22222222-2222-2222-2222-222222222221', 'authenticated', 'select count(*) from profiles', 3),
('profiles    / ownerB ', '22222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*) from profiles', 3),
('profiles    / tenant1', '33333333-3333-3333-3333-333333333331', 'authenticated', 'select count(*) from profiles', 1),
('profiles    / tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from profiles', 1),
('profiles    / tenant3', '33333333-3333-3333-3333-333333333333', 'authenticated', 'select count(*) from profiles', 1),

-- ============ PUBLIC — public_listings (annonces, tous rôles = 2) ==========
('listings    / anon   ', null,                                   'anon',          'select count(*) from public_listings', 2),
('listings    / admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from public_listings', 2),
('listings    / tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from public_listings', 2),

-- ============ PUBLIC — property_photos (public = photos des biens en annonce)
-- Photos du seed : P1(1, privée) P2(2, publique) P5(1, publique) = 4 au total.
('photos      / admin  ', '11111111-1111-1111-1111-111111111111', 'authenticated', 'select count(*) from property_photos', 4),
('photos      / ownerB ', '22222222-2222-2222-2222-222222222222', 'authenticated', 'select count(*) from property_photos', 3),
('photos      / tenant2', '33333333-3333-3333-3333-333333333332', 'authenticated', 'select count(*) from property_photos', 3),
('photos      / anon   ', null,                                   'anon',          'select count(*) from property_photos', 3);

-- ---------------------------------------------------------------------------
-- Exécution : boucle sur les cas, compte réel vs attendu, PASS / FAIL.
-- Un cas qui lève une erreur (ex : accès refusé) est reporté en ERROR sans
-- interrompre le reste (bloc EXCEPTION = sous-transaction).
-- ---------------------------------------------------------------------------
do $$
declare
  r        record;
  v_actual integer;
  v_total  integer := 0;
  v_passed integer := 0;
begin
  raise notice ' ';
  raise notice '================= TEST RLS — régie immobilière =================';

  for r in select * from rls_tests order by ord loop
    v_total := v_total + 1;
    begin
      v_actual := public.rls_count(r.sub, r.role, r.sql);
      if v_actual = r.expected then
        v_passed := v_passed + 1;
        raise notice 'PASS | % | attendu=%  obtenu=%', r.label, r.expected, v_actual;
      else
        raise warning 'FAIL | % | attendu=%  obtenu=%', r.label, r.expected, v_actual;
      end if;
    exception when others then
      reset role; -- garantit le retour à postgres après une erreur
      raise warning 'ERR  | % | %', r.label, sqlerrm;
    end;
  end loop;

  raise notice '----------------------------------------------------------------';
  if v_passed = v_total then
    raise notice 'RÉSULTAT : %/% ✅ TOUS LES TESTS PASSENT', v_passed, v_total;
  else
    raise warning 'RÉSULTAT : %/% — % ÉCHEC(S) ❌', v_passed, v_total, v_total - v_passed;
  end if;
  raise notice '================================================================';
end $$;

-- ---------------------------------------------------------------------------
-- Nettoyage
-- ---------------------------------------------------------------------------
drop table if exists rls_tests;
drop function if exists public.rls_count(uuid, text, text);

commit;
