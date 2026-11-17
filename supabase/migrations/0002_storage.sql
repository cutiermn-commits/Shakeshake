-- Private buckets + policies (ARCHITECTURE §3, CLAUDE.md rule 6). Paths are "<user_id>/<file>".
-- Size limits keep us inside the 1 GB Free-plan storage (VERIFIED: supabase.com/pricing, 2026-11-17).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('meal-photos', 'meal-photos', false, 300000, array['image/jpeg', 'image/webp']),
  ('avatars', 'avatars', false, 150000, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Owner can write/read/delete inside their own folder.
create policy "own files: insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());
create policy "own files: select" on storage.objects for select to authenticated
  using (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: update" on storage.objects for update to authenticated
  using (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: delete" on storage.objects for delete to authenticated
  using (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);

-- Friends may read a meal photo only if they can see the meal log that references it
-- (meal_logs RLS is applied inside the subquery: visibility, consent, blocks, hidden).
create policy "friends: meal photos" on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and exists (select 1 from public.meal_logs m where m.photo_path = storage.objects.name));

-- Friends may read avatars.
create policy "friends: avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.are_friends(auth.uid(), ((storage.foldername(name))[1])::uuid));
