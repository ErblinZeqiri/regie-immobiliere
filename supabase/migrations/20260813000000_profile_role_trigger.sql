-- =============================================================================
-- Ajuste protect_profile_role : autorise les changements de rôle initiés côté
-- serveur de confiance (service_role, où auth.uid() est NULL — ex. Server Action
-- admin qui crée un propriétaire/locataire), tout en continuant de bloquer un
-- utilisateur connecté non-admin qui tenterait de modifier son propre rôle.
-- =============================================================================

create or replace function public.protect_profile_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null   -- opérations service_role : uid NULL = confiance
     and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le rôle';
  end if;
  return new;
end;
$$;
