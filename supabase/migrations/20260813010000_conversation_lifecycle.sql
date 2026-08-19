-- =============================================================================
-- Cycle de vie des conversations et signalements
--
-- - message_threads.status : open / closed / archived.
--     Un fil non « open » n'accepte plus AUCUN message (admin compris),
--     mais reste lisible par ses participants.
-- - issues : ajout du statut 'archived'.
--
-- Seul l'admin change ces statuts (Server Actions requireAdmin).
-- =============================================================================

-- --- Fils de discussion ------------------------------------------------------
alter table public.message_threads
  add column if not exists status text not null default 'open'
    check (status in ('open', 'closed', 'archived'));

-- Le fil est-il ouvert ? (SECURITY DEFINER : lisible depuis les policies)
create or replace function public.is_thread_open(p_thread_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread_id and t.status = 'open'
  )
$$;

-- Blocage de l'écriture sur un fil clôturé/archivé.
-- On supprime le bypass admin sur l'INSERT : personne ne peut écrire sur un fil
-- non ouvert. (L'admin garde la lecture via messages_select, et reste
-- participant donc peut écrire sur un fil ouvert.)
drop policy if exists "messages_admin_all" on public.messages;
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_thread_participant(thread_id)
  and public.is_thread_open(thread_id)
);

-- --- Signalements : statut 'archived' ---------------------------------------
alter table public.issues drop constraint if exists issues_status_check;
alter table public.issues add constraint issues_status_check
  check (status in ('open', 'in_progress', 'resolved', 'closed', 'archived'));
