-- =============================================================================
-- Fonction validate_payment — validation atomique d'un paiement + allocations
--
-- Appelée UNIQUEMENT par la Server Action validatePayment (via service_role,
-- après requireAdmin()). Le corps d'une fonction PL/pgSQL s'exécute dans une
-- seule transaction : soit tout réussit, soit rien n'est écrit.
--
-- p_allocations : jsonb [{"rent_charge_id":"uuid","amount":123.45}, ...]
--   - fourni   -> allocations explicites (plafonds vérifiés par check_allocation)
--   - null     -> auto-allocation FIFO sur les échéances les plus anciennes
--                 non soldées (gère le paiement partiel)
-- =============================================================================

create or replace function public.validate_payment(
  p_payment_id   uuid,
  p_validated_by uuid,
  p_allocations  jsonb default null
)
returns public.payments
language plpgsql
as $$
declare
  v_payment   public.payments;
  v_lease     uuid;
  v_remaining numeric(12,2);
  v_alloc     jsonb;
  v_charge    record;
  v_charge_remaining numeric(12,2);
  v_to_alloc  numeric(12,2);
begin
  -- Verrouille le paiement le temps de la transaction
  select * into v_payment from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Paiement introuvable (%)', p_payment_id;
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Paiement déjà traité (statut : %)', v_payment.status;
  end if;

  v_lease := v_payment.lease_id;
  v_remaining := v_payment.amount;

  if p_allocations is not null then
    -- ---- Allocations explicites ------------------------------------------
    for v_alloc in select * from jsonb_array_elements(p_allocations)
    loop
      -- l'échéance doit appartenir au même bail et être active
      perform 1 from public.rent_charges c
      where c.id = (v_alloc->>'rent_charge_id')::uuid
        and c.lease_id = v_lease
        and c.status = 'active'
        and c.deleted_at is null;
      if not found then
        raise exception 'Échéance % invalide pour ce bail', v_alloc->>'rent_charge_id';
      end if;

      -- le trigger check_allocation vérifie les plafonds (paiement + échéance)
      insert into public.payment_allocations (payment_id, rent_charge_id, amount)
      values (p_payment_id,
              (v_alloc->>'rent_charge_id')::uuid,
              (v_alloc->>'amount')::numeric);
    end loop;
  else
    -- ---- Auto-allocation FIFO --------------------------------------------
    for v_charge in
      select c.id,
             c.amount
               - coalesce((select sum(a.amount)
                           from public.payment_allocations a
                           where a.rent_charge_id = c.id), 0) as remaining
      from public.rent_charges c
      where c.lease_id = v_lease
        and c.status = 'active'
        and c.deleted_at is null
      order by c.due_date asc
    loop
      exit when v_remaining <= 0;
      v_charge_remaining := v_charge.remaining;
      if v_charge_remaining <= 0 then
        continue; -- échéance déjà soldée
      end if;

      v_to_alloc := least(v_remaining, v_charge_remaining);
      insert into public.payment_allocations (payment_id, rent_charge_id, amount)
      values (p_payment_id, v_charge.id, v_to_alloc);

      v_remaining := v_remaining - v_to_alloc;
    end loop;
    -- v_remaining > 0 ici = trop-perçu (avance) : laissé non alloué, visible
    -- comme crédit (payment.amount - somme des allocations).
  end if;

  -- ---- Validation du paiement --------------------------------------------
  update public.payments
  set status = 'validated',
      validated_by = p_validated_by,
      validated_at = now()
  where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$$;

-- Cette fonction ne doit être appelable QUE par le serveur (service_role).
revoke all on function public.validate_payment(uuid, uuid, jsonb) from public;
revoke all on function public.validate_payment(uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.validate_payment(uuid, uuid, jsonb) to service_role;
