-- =============================================================================
-- Régie immobilière — données de test (seed)
-- À exécuter APRÈS la migration de schéma.
--   supabase db reset      (rejoue migrations + seed.sql)
--   ou : psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Mot de passe de TOUS les comptes : password123
-- (haché via crypt() de pgcrypto ; si crypt() n'est pas trouvé, préfixe par
--  extensions.crypt / extensions.gen_salt selon ton installation Supabase.)
-- =============================================================================
--
-- LÉGENDE DES UUID
-- ----------------------------------------------------------------------------
-- ADMIN      11111111-1111-1111-1111-111111111111  admin@regie.test
-- OWNER A    22222222-2222-2222-2222-222222222221  ownerA@regie.test
-- OWNER B    22222222-2222-2222-2222-222222222222  ownerB@regie.test
-- TENANT 1   33333333-3333-3333-3333-333333333331  tenant1@regie.test
-- TENANT 2   33333333-3333-3333-3333-333333333332  tenant2@regie.test
-- TENANT 3   33333333-3333-3333-3333-333333333333  tenant3@regie.test
--
-- BIENS
--   P1 a0000000-…-0001  FER-001  Owner A          LOUÉ par Tenant 1
--   P2 a0000000-…-0002  FER-002  Owner A          LIBRE + PUBLIC (annonce)
--   P3 a0000000-…-0003  FER-003  Owner B          LOUÉ par Tenant 2
--   P4 a0000000-…-0004  FER-004  INDIVISION A+B   LOUÉ par Tenant 3
--   P5 a0000000-…-0005  FER-005  Owner B          LIBRE + PUBLIC (annonce)
--
-- BAUX
--   L1 b0000000-…-0001  P1 / Tenant 1   loyer 300 + charges 50
--   L2 b0000000-…-0002  P3 / Tenant 2   loyer 350 + charges 40
--   L3 b0000000-…-0003  P4 / Tenant 3   loyer 400 + charges 60
--
-- Échéances : juin / juillet / août 2026 pour chaque bail.
-- Paiements : validés, un PENDING (L2 juillet), un PARTIEL (L1 août 150/300).
-- =============================================================================

begin;

-- --- On désactive temporairement les triggers qui gênent le seed ------------
-- protect_profile_role empêcherait le changement de rôle (auth.uid() est null
-- pendant le seed) ; les triggers d'audit ajouteraient du bruit dans audit_logs.
-- (On NE touche PAS à on_auth_user_created : il crée automatiquement les
--  profils quand on insère dans auth.users.)
alter table public.profiles   disable trigger trg_protect_profile_role;
alter table public.properties disable trigger trg_audit_properties;
alter table public.leases     disable trigger trg_audit_leases;
alter table public.rent_charges disable trigger trg_audit_charges;
alter table public.payments   disable trigger trg_audit_payments;
alter table public.payment_allocations disable trigger trg_audit_allocations;
alter table public.issues     disable trigger trg_audit_issues;
alter table public.documents  disable trigger trg_audit_documents;

-- =============================================================================
-- 1. COMPTES (auth.users) — le trigger handle_new_user crée les profils
-- =============================================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'admin@regie.test',   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Régie"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222221', 'authenticated', 'authenticated',
   'ownerA@regie.test',  crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Agron Krasniqi (Owner A)"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'ownerB@regie.test',  crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Blerta Gashi (Owner B)"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333331', 'authenticated', 'authenticated',
   'tenant1@regie.test', crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Driton Berisha (Tenant 1)"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333332', 'authenticated', 'authenticated',
   'tenant2@regie.test', crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Elira Hoxha (Tenant 2)"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'tenant3@regie.test', crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Faton Rexhepi (Tenant 3)"}', '', '', '', '');

-- Identités (permet la connexion email/password sous GoTrue)
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
from auth.users u
where u.id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  '33333333-3333-3333-3333-333333333332',
  '33333333-3333-3333-3333-333333333333'
);

-- =============================================================================
-- 2. PROFILS — on fixe le rôle et les infos (profils déjà créés par le trigger)
-- =============================================================================
update public.profiles set role='admin', phone='+383 44 000 001', preferred_language='sq'
  where id='11111111-1111-1111-1111-111111111111';
update public.profiles set role='owner', phone='+41 79 000 002', preferred_language='de'
  where id='22222222-2222-2222-2222-222222222221';  -- diaspora Suisse
update public.profiles set role='owner', phone='+49 151 000 003', preferred_language='de'
  where id='22222222-2222-2222-2222-222222222222';  -- diaspora Allemagne
update public.profiles set role='tenant', phone='+383 44 000 011', preferred_language='sq'
  where id='33333333-3333-3333-3333-333333333331';
update public.profiles set role='tenant', phone='+383 44 000 012', preferred_language='sq'
  where id='33333333-3333-3333-3333-333333333332';
update public.profiles set role='tenant', phone='+383 44 000 013', preferred_language='sq'
  where id='33333333-3333-3333-3333-333333333333';

-- =============================================================================
-- 3. BIENS
-- =============================================================================
insert into public.properties (id, reference, title, description, address, city, type, surface, rooms, floor, status, is_public, owner_id)
values
  ('a0000000-0000-0000-0000-000000000001', 'FER-001', 'Appartement 2 pièces centre',
   'Proche du centre de Ferizaj, rénové.', 'Rr. Dëshmorët e Kombit 12', 'Ferizaj', 'apartment', 55.00, 2, 3,
   'rented', false, '22222222-2222-2222-2222-222222222221'),

  ('a0000000-0000-0000-0000-000000000002', 'FER-002', 'Studio lumineux',
   'Studio idéal étudiant, disponible immédiatement.', 'Rr. Rexhep Bislimi 4', 'Ferizaj', 'apartment', 32.00, 1, 1,
   'available', true, '22222222-2222-2222-2222-222222222221'),

  ('a0000000-0000-0000-0000-000000000003', 'FER-003', 'Appartement 3 pièces',
   'Grand appartement familial avec balcon.', 'Rr. Adem Jashari 27', 'Ferizaj', 'apartment', 78.00, 3, 5,
   'rented', false, '22222222-2222-2222-2222-222222222222'),

  ('a0000000-0000-0000-0000-000000000004', 'FER-004', 'Maison en indivision',
   'Bien détenu en indivision (héritage).', 'Rr. Ismail Qemali 9', 'Ferizaj', 'house', 120.00, 4, 0,
   'rented', false, '22222222-2222-2222-2222-222222222221'),  -- owner_id = contact (Owner A)

  ('a0000000-0000-0000-0000-000000000005', 'FER-005', 'Appartement neuf à louer',
   'Construction récente, disponible.', 'Rr. Enver Topalli 15', 'Ferizaj', 'apartment', 64.00, 2, 2,
   'available', true, '22222222-2222-2222-2222-222222222222');

-- Indivision sur P4 : Owner A 50% + Owner B 50%
insert into public.property_owners (id, property_id, owner_id, share)
values
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222221', 50.00),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 50.00);

-- Photos (P2 et P5 publiques → visibles par anon ; P1 privée → NON visible par anon)
insert into public.property_photos (id, property_id, file_url, sort_order, is_cover)
values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'photos/fer-001-1.jpg', 0, true),   -- privée
  ('e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'photos/fer-002-1.jpg', 0, true),   -- publique
  ('e1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'photos/fer-002-2.jpg', 1, false),  -- publique
  ('e1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'photos/fer-005-1.jpg', 0, true);   -- publique

-- =============================================================================
-- 4. BAUX
-- =============================================================================
insert into public.leases (id, property_id, tenant_id, start_date, end_date, rent_amount, charges_amount, deposit_amount, status)
values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333331',
   '2026-01-01', null, 300.00, 50.00, 600.00, 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333332',
   '2025-09-01', null, 350.00, 40.00, 700.00, 'active'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333',
   '2026-03-01', null, 400.00, 60.00, 800.00, 'active');

-- =============================================================================
-- 5. ÉCHÉANCES (rent_charges) — juin / juillet / août 2026
-- =============================================================================
insert into public.rent_charges (id, lease_id, due_date, period, label, amount, type)
values
  -- L1 (300)
  ('c0000000-0000-0000-0000-000000000101', 'b0000000-0000-0000-0000-000000000001', '2026-06-05', '2026-06-01', 'Loyer Juin 2026',    300.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000102', 'b0000000-0000-0000-0000-000000000001', '2026-07-05', '2026-07-01', 'Loyer Juillet 2026', 300.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000103', 'b0000000-0000-0000-0000-000000000001', '2026-08-05', '2026-08-01', 'Loyer Août 2026',    300.00, 'rent'),
  -- L2 (350)
  ('c0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000002', '2026-06-05', '2026-06-01', 'Loyer Juin 2026',    350.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000202', 'b0000000-0000-0000-0000-000000000002', '2026-07-05', '2026-07-01', 'Loyer Juillet 2026', 350.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000203', 'b0000000-0000-0000-0000-000000000002', '2026-08-05', '2026-08-01', 'Loyer Août 2026',    350.00, 'rent'),
  -- L3 (400)
  ('c0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000003', '2026-06-05', '2026-06-01', 'Loyer Juin 2026',    400.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000302', 'b0000000-0000-0000-0000-000000000003', '2026-07-05', '2026-07-01', 'Loyer Juillet 2026', 400.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000303', 'b0000000-0000-0000-0000-000000000003', '2026-08-05', '2026-08-01', 'Loyer Août 2026',    400.00, 'rent');

-- =============================================================================
-- 6. PAIEMENTS
--   L1 : juin OK, juillet OK, août PARTIEL (150/300)
--   L2 : juin OK, juillet EN ATTENTE (déclaré par le locataire, pas validé)
--   L3 : juin OK, juillet OK  (août non payé)
-- =============================================================================
insert into public.payments (id, lease_id, amount, payment_date, method, reference, status, validated_by, validated_at)
values
  ('d0000000-0000-0000-0000-000000000101', 'b0000000-0000-0000-0000-000000000001', 300.00, '2026-06-03', 'bank_transfer', 'VIR-L1-06', 'validated', '11111111-1111-1111-1111-111111111111', now()),
  ('d0000000-0000-0000-0000-000000000102', 'b0000000-0000-0000-0000-000000000001', 300.00, '2026-07-04', 'bank_transfer', 'VIR-L1-07', 'validated', '11111111-1111-1111-1111-111111111111', now()),
  ('d0000000-0000-0000-0000-000000000103', 'b0000000-0000-0000-0000-000000000001', 150.00, '2026-08-04', 'bank_transfer', 'VIR-L1-08', 'validated', '11111111-1111-1111-1111-111111111111', now()),  -- PARTIEL
  ('d0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000002', 350.00, '2026-06-02', 'bank_transfer', 'VIR-L2-06', 'validated', '11111111-1111-1111-1111-111111111111', now()),
  ('d0000000-0000-0000-0000-000000000202', 'b0000000-0000-0000-0000-000000000002', 350.00, '2026-07-06', 'bank_transfer', 'VIR-L2-07', 'pending',   null, null),  -- EN ATTENTE
  ('d0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000003', 400.00, '2026-06-01', 'cash',          null,        'validated', '11111111-1111-1111-1111-111111111111', now()),
  ('d0000000-0000-0000-0000-000000000302', 'b0000000-0000-0000-0000-000000000003', 400.00, '2026-07-03', 'bank_transfer', 'VIR-L3-07', 'validated', '11111111-1111-1111-1111-111111111111', now());

-- Allocations paiement -> échéance (la pending L2-07 n'est pas allouée)
insert into public.payment_allocations (id, payment_id, rent_charge_id, amount)
values
  ('a1000000-0000-0000-0000-000000000101', 'd0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000101', 300.00),
  ('a1000000-0000-0000-0000-000000000102', 'd0000000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000102', 300.00),
  ('a1000000-0000-0000-0000-000000000103', 'd0000000-0000-0000-0000-000000000103', 'c0000000-0000-0000-0000-000000000103', 150.00),  -- PARTIEL : reste 150 dû
  ('a1000000-0000-0000-0000-000000000201', 'd0000000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000201', 350.00),
  ('a1000000-0000-0000-0000-000000000301', 'd0000000-0000-0000-0000-000000000301', 'c0000000-0000-0000-0000-000000000301', 400.00),
  ('a1000000-0000-0000-0000-000000000302', 'd0000000-0000-0000-0000-000000000302', 'c0000000-0000-0000-0000-000000000302', 400.00);

-- =============================================================================
-- 7. SIGNALEMENTS
-- =============================================================================
insert into public.issues (id, property_id, lease_id, created_by, title, description, status, priority)
values
  ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333331', 'Fuite sous l''évier', 'Fuite d''eau sous l''évier de la cuisine.', 'open', 'high'),
  ('70000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003',
   '33333333-3333-3333-3333-333333333333', 'Chauffage en panne', 'Le radiateur du salon ne chauffe plus.', 'in_progress', 'urgent'),
  ('70000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333332', 'Volet bloqué', 'Le volet de la chambre est bloqué.', 'open', 'low');

insert into public.issue_photos (id, issue_id, file_url)
values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'issues/heating-1.jpg');

-- =============================================================================
-- 8. DOCUMENTS
-- =============================================================================
insert into public.documents (id, property_id, lease_id, uploaded_by, type, name, file_url)
values
  ('80000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'lease_contract', 'Contrat de bail — FER-001', 'docs/lease-fer001.pdf'),
  ('80000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', 'inventory', 'État des lieux — FER-004', 'docs/inventory-fer004.pdf'),
  ('80000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 'receipt', 'Quittance Juin 2026 — FER-003', 'docs/receipt-fer003-06.pdf');

-- =============================================================================
-- 9. MESSAGERIE
--   Fil 1 : Admin <-> Tenant 1 (à propos de P1/L1)
--   Fil 2 : Admin <-> Owner A  (à propos de P4/L3, indivision)
-- =============================================================================
insert into public.message_threads (id, property_id, lease_id, subject)
values
  ('90000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Fuite cuisine — suivi'),
  ('90000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', 'Travaux chauffage FER-004');

insert into public.thread_participants (id, thread_id, profile_id)
values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'), -- admin
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333331'), -- tenant 1
  ('91000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111'), -- admin
  ('91000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222221'); -- owner A

insert into public.messages (id, thread_id, sender_id, content)
values
  ('92000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333331', 'Bonjour, la fuite s''aggrave.'),
  ('92000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Un plombier passe demain matin.'),
  ('92000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Devis chauffage reçu, je vous l''envoie.'),
  ('92000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222221', 'Merci, validez si le montant est correct.');

-- --- Réactivation des triggers ----------------------------------------------
alter table public.profiles   enable trigger trg_protect_profile_role;
alter table public.properties enable trigger trg_audit_properties;
alter table public.leases     enable trigger trg_audit_leases;
alter table public.rent_charges enable trigger trg_audit_charges;
alter table public.payments   enable trigger trg_audit_payments;
alter table public.payment_allocations enable trigger trg_audit_allocations;
alter table public.issues     enable trigger trg_audit_issues;
alter table public.documents  enable trigger trg_audit_documents;

commit;

-- =============================================================================
-- COMMENT TESTER LA RLS
-- =============================================================================
-- La RLS se teste en simulant un utilisateur connecté. Dans psql, ouvre une
-- transaction, prends le rôle "authenticated" et injecte le claim JWT "sub"
-- (c'est ce que lit auth.uid()).
--
-- ---- En tant que OWNER A (ne doit voir que P1, P2, P4) ----------------------
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222221"}';
--   select reference, title from properties order by reference;   -- FER-001, 002, 004
--   rollback;
--
-- ---- En tant que TENANT 1 (ne doit voir que P1 + son bail L1) ---------------
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333331"}';
--   select reference from properties;                 -- FER-001 uniquement
--   select id, rent_amount from leases;               -- L1 uniquement
--   select label, amount from rent_charges;           -- échéances de L1 uniquement
--   rollback;
--
-- ---- En tant que ADMIN (voit tout) -----------------------------------------
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
--   select count(*) from properties;                  -- 5
--   select count(*) from payments;                    -- 7
--   rollback;
--
-- ---- En tant que PUBLIC / anon (annonces uniquement) -----------------------
--   begin;
--   set local role anon;
--   select reference, title from public_listings order by reference;  -- FER-002, FER-005
--   select count(*) from property_photos;             -- 3 (photos des biens publics)
--   -- select * from properties;   -- DOIT échouer / renvoyer 0 ligne (pas d'accès direct)
--   rollback;
-- =============================================================================
