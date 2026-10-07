-- AxiaMeetings — database integrity report (READ-ONLY: only SELECT statements).
--
-- Lists the rows that would block the next migration (unique keys, missing foreign keys,
-- cross-meeting links) so the owner can decide what to keep. Nothing is changed.
--
-- Run (Postgres on Windows, from Git Bash or PowerShell):
--   psql -U postgres -d axiameetingforall -f scripts/db/integrity-report.sql > integrity-report.txt
-- or through Docker (no local psql needed):
--   docker run --rm -i postgres:17 psql "postgresql://postgres:PASSWORD@host.docker.internal:5432/axiameetingforall" < scripts/db/integrity-report.sql > integrity-report.txt
--
-- Every section prints a title, then the offending rows (empty = nothing to fix).

\pset pager off
\pset footer on

\echo '=== 0. Row counts ==='
SELECT 'users' AS table_name, count(*) FROM users
UNION ALL SELECT 'companies', count(*) FROM companies
UNION ALL SELECT 'meetings', count(*) FROM meetings
UNION ALL SELECT 'meetings_participants', count(*) FROM meetings_participants
UNION ALL SELECT 'meetings_votes', count(*) FROM meetings_votes
UNION ALL SELECT 'meetings_invitations', count(*) FROM meetings_invitations
UNION ALL SELECT 'meetings_attendances', count(*) FROM meetings_attendances
UNION ALL SELECT 'newsletters', count(*) FROM newsletters
UNION ALL SELECT 'companies_admins_login', count(*) FROM companies_admins_login
ORDER BY 1;

-- ---------------------------------------------------------------- duplicates

\echo ''
\echo '=== 1. Users sharing the same email (case-insensitive) ==='
SELECT lower(trim(u.email)) AS email, u.id, u.username, u.fullname, u.role, u.company_id, c.name AS company
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
WHERE u.email IS NOT NULL AND lower(trim(u.email)) IN (
    SELECT lower(trim(email)) FROM users WHERE email IS NOT NULL
    GROUP BY lower(trim(email)) HAVING count(*) > 1
)
ORDER BY 1, u.id;

\echo ''
\echo '=== 2. Users sharing the same username ==='
SELECT u.username, u.id, u.email, u.fullname, u.role, u.company_id
FROM users u
WHERE u.username IS NOT NULL AND u.username IN (
    SELECT username FROM users WHERE username IS NOT NULL GROUP BY username HAVING count(*) > 1
)
ORDER BY 1, u.id;

\echo ''
\echo '=== 3. Users without email, username, password or role ==='
SELECT id, fullname, email, username, role, company_id,
       (password IS NULL) AS no_password
FROM users
WHERE email IS NULL OR username IS NULL OR password IS NULL OR role IS NULL
ORDER BY id;

\echo ''
\echo '=== 4. Same email invited twice to the same meeting ==='
SELECT p.meeting_id, m.subject, lower(trim(p.email)) AS email, p.id AS participant_id,
       (SELECT count(*) FROM meetings_votes v WHERE v.meetings_participant_id = p.id) AS votes,
       (SELECT string_agg(i.status::text, ',') FROM meetings_invitations i WHERE i.meetings_participant_id = p.id) AS invitations
FROM meetings_participants p
JOIN meetings m ON m.id = p.meeting_id
WHERE (p.meeting_id, lower(trim(p.email))) IN (
    SELECT meeting_id, lower(trim(email)) FROM meetings_participants
    GROUP BY meeting_id, lower(trim(email)) HAVING count(*) > 1
)
ORDER BY p.meeting_id, 3, p.id;

\echo ''
\echo '=== 5. Same join token used by more than one participant ==='
SELECT token, count(*) AS uses, array_agg(id ORDER BY id) AS participant_ids
FROM meetings_participants GROUP BY token HAVING count(*) > 1;

\echo ''
\echo '=== 6. Several votes from the same participant on the same agenda point ==='
SELECT v.point_id, pt.point, v.meetings_participant_id, p.email,
       array_agg(v.id || ':' || v.vote::text ORDER BY v.id) AS votes_id_and_value
FROM meetings_votes v
JOIN meetings_points pt ON pt.id = v.point_id
LEFT JOIN meetings_participants p ON p.id = v.meetings_participant_id
GROUP BY v.point_id, pt.point, v.meetings_participant_id, p.email
HAVING count(*) > 1
ORDER BY v.point_id, v.meetings_participant_id;

\echo ''
\echo '=== 7. Several invitation rows for the same participant ==='
SELECT meetings_participant_id, meeting_id, array_agg(id || ':' || status::text ORDER BY id) AS rows
FROM meetings_invitations GROUP BY meetings_participant_id, meeting_id HAVING count(*) > 1
ORDER BY 2, 1;

\echo ''
\echo '=== 8. Several attendance rows for the same participant ==='
SELECT meetings_participant_id, meeting_id,
       array_agg(id || ':' || meetings_attendances_status::text ORDER BY id) AS rows
FROM meetings_attendances GROUP BY meetings_participant_id, meeting_id HAVING count(*) > 1
ORDER BY 2, 1;

\echo ''
\echo '=== 9. Newsletter emails registered more than once ==='
SELECT lower(trim(email)) AS email, count(*), array_agg(id ORDER BY id) AS ids
FROM newsletters GROUP BY lower(trim(email)) HAVING count(*) > 1 ORDER BY 1;

\echo ''
\echo '=== 10. Several external-login rows for the same admin and company ==='
SELECT user_id, company_id, array_agg(id ORDER BY id) AS ids
FROM companies_admins_login GROUP BY user_id, company_id HAVING count(*) > 1;

-- ------------------------------------------------- broken / missing links

\echo ''
\echo '=== 11. Meetings whose creator or editor user no longer exists ==='
SELECT m.id, m.subject, m.company_id, m.creator_id, m.editor_id,
       (cu.id IS NULL) AS creator_missing, (eu.id IS NULL) AS editor_missing
FROM meetings m
LEFT JOIN users cu ON cu.id = m.creator_id
LEFT JOIN users eu ON eu.id = m.editor_id
WHERE cu.id IS NULL OR eu.id IS NULL
ORDER BY m.id;

\echo ''
\echo '=== 12. Chat sessions linked to a user that no longer exists ==='
SELECT s.id, s.user_id, s.created_at
FROM chat_sessions s LEFT JOIN users u ON u.id = s.user_id
WHERE s.user_id IS NOT NULL AND u.id IS NULL ORDER BY s.id;

\echo ''
\echo '=== 13. Signup requests pointing to a missing pack or company ==='
SELECT r.id, r.email, r.status, r.pack_id, (pk.id IS NULL) AS pack_missing,
       r.provisioned_company_id, (r.provisioned_company_id IS NOT NULL AND c.id IS NULL) AS company_missing
FROM signup_requests r
LEFT JOIN packs pk ON pk.id = r.pack_id
LEFT JOIN companies c ON c.id = r.provisioned_company_id
WHERE pk.id IS NULL OR (r.provisioned_company_id IS NOT NULL AND c.id IS NULL)
ORDER BY r.id;

\echo ''
\echo '=== 14. Votes linking an agenda point of one meeting with a participant of another ==='
SELECT v.id AS vote_id, pt.meeting_id AS point_meeting, p.meeting_id AS participant_meeting,
       v.point_id, v.meetings_participant_id
FROM meetings_votes v
JOIN meetings_points pt ON pt.id = v.point_id
JOIN meetings_participants p ON p.id = v.meetings_participant_id
WHERE pt.meeting_id <> p.meeting_id ORDER BY v.id;

\echo ''
\echo '=== 15. Invitations / attendances / turn requests whose meeting differs from the participant meeting ==='
SELECT 'invitation' AS kind, i.id, i.meeting_id, p.meeting_id AS participant_meeting
FROM meetings_invitations i JOIN meetings_participants p ON p.id = i.meetings_participant_id
WHERE i.meeting_id <> p.meeting_id
UNION ALL
SELECT 'attendance', a.id, a.meeting_id, p.meeting_id
FROM meetings_attendances a JOIN meetings_participants p ON p.id = a.meetings_participant_id
WHERE a.meeting_id <> p.meeting_id
UNION ALL
SELECT 'turn_request', t.id, t.meeting_id, p.meeting_id
FROM meetings_turn_requests t JOIN meetings_participants p ON p.id = t.meetings_participant_id
WHERE t.meeting_id <> p.meeting_id
ORDER BY 1, 2;

\echo ''
\echo '=== 16. ADMIN / PARTICIPANT users without a company (cannot log in any more) ==='
SELECT id, fullname, email, username, role FROM users
WHERE role IN ('ADMIN', 'PARTICIPANT') AND company_id IS NULL ORDER BY id;

-- ------------------------------------------------------------ data quality

\echo ''
\echo '=== 17. Meetings whose date/time text cannot be read as a date ==='
SELECT id, subject, date, time FROM meetings
WHERE date !~ '^\d{4}-\d{2}-\d{2}$' OR time !~ '^\d{2}:\d{2}(:\d{2})?$'
ORDER BY id;

\echo ''
\echo '=== 18. Document links that are not uploaded files or https ==='
SELECT d.id, d.meeting_id, d.file_title, d.file_path FROM meetings_documents d
WHERE d.file_path NOT LIKE '/api/files/%' AND d.file_path NOT LIKE '/uploads/%'
  AND d.file_path NOT LIKE 'https://%'
ORDER BY d.id;

\echo ''
\echo '=== 19. Prisma migrations recorded in this database ==='
SELECT migration_name, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back
FROM _prisma_migrations ORDER BY started_at;

\echo ''
\echo '=== End of report ==='
