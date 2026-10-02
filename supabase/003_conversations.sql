-- Historique des conversations du chatbot. Les tours y sont ecrits par le workflow
-- Chat_Essai_RAG et relus au tour suivant pour etre reinjectes dans le prompt.
--
-- Une ligne par demi-tour : la question du visiteur, puis la reponse du modele.
-- Le rattachement a une session vient du Chat Trigger, donc chaque visiteur a son
-- propre fil.
--
-- Volontairement sans cleaning automatique : une table de conversation qui grossit
-- sans fin est un sujet de maintenance. On vide a la main quand elle pese, ou on
-- passe a une retention en base si le volume devient reel.
create table if not exists conversations (
  id         bigserial primary key,
  session_id text,
  role       text,
  contenu    text,
  ts         timestamptz not null default now()
);

create index if not exists conversations_session_ts_idx
  on conversations (session_id, ts desc);

-- Verification
select count(*) as tours, count(distinct session_id) as sessions, min(ts) as premier, max(ts) as dernier
from conversations;