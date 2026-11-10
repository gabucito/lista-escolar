CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 display_name text NOT NULL, password_hash text NOT NULL, verified boolean NOT NULL DEFAULT true,
 preferences jsonb NOT NULL DEFAULT '{"layout":"columns","paper":"LETTER","color":true}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.admins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE,
 password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.sessions (
 token_hash text PRIMARY KEY, user_id uuid REFERENCES app.users ON DELETE CASCADE,
 admin_id uuid REFERENCES app.admins ON DELETE CASCADE,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
 CHECK (num_nonnulls(user_id,admin_id) = 1)
);
CREATE TABLE IF NOT EXISTS app.lists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid REFERENCES app.users ON DELETE SET NULL,
 creator_id uuid REFERENCES app.users ON DELETE SET NULL,
 visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
 archived boolean NOT NULL DEFAULT false, hidden boolean NOT NULL DEFAULT false,
 comments_enabled boolean NOT NULL DEFAULT true,
 draft jsonb NOT NULL DEFAULT '{}', draft_revision bigint NOT NULL DEFAULT 1,
 current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 CHECK (owner_id IS NOT NULL OR (archived AND visibility = 'public' AND current_version > 0) OR deleted_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS app.versions (
 list_id uuid NOT NULL REFERENCES app.lists ON DELETE CASCADE,
 number integer NOT NULL CHECK (number > 0), content jsonb NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(), published_by uuid REFERENCES app.users ON DELETE SET NULL,
 PRIMARY KEY (list_id,number)
);
CREATE TABLE IF NOT EXISTS app.grants (
 list_id uuid NOT NULL REFERENCES app.lists ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES app.users ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('viewer','editor')), PRIMARY KEY (list_id,user_id)
);
CREATE TABLE IF NOT EXISTS app.invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 list_id uuid NOT NULL REFERENCES app.lists ON DELETE CASCADE,
 email text NOT NULL, role text NOT NULL CHECK (role IN ('viewer','editor')),
 invited_by uuid REFERENCES app.users ON DELETE SET NULL,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days', accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.request_links (
 list_id uuid PRIMARY KEY REFERENCES app.lists ON DELETE CASCADE,
 token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.access_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), list_id uuid NOT NULL REFERENCES app.lists ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES app.users ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (list_id,user_id)
);
CREATE TABLE IF NOT EXISTS app.transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), list_id uuid NOT NULL REFERENCES app.lists ON DELETE CASCADE,
 sender_id uuid REFERENCES app.users ON DELETE SET NULL,
 recipient_id uuid NOT NULL REFERENCES app.users ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','canceled')),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_transfer ON app.transfers(list_id) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS app.votes (
 list_id uuid NOT NULL, version integer NOT NULL,
 user_id uuid NOT NULL REFERENCES app.users ON DELETE CASCADE,
 PRIMARY KEY (list_id,version,user_id), FOREIGN KEY (list_id,version) REFERENCES app.versions ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS app.comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), list_id uuid NOT NULL, version integer NOT NULL,
 user_id uuid REFERENCES app.users ON DELETE SET NULL, body text NOT NULL,
 deleted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (list_id,version) REFERENCES app.versions ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS app.follows (
 list_id uuid NOT NULL REFERENCES app.lists ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES app.users ON DELETE CASCADE, PRIMARY KEY (list_id,user_id)
);
CREATE TABLE IF NOT EXISTS app.progress (
 user_id uuid NOT NULL REFERENCES app.users ON DELETE CASCADE,
 list_id uuid NOT NULL, version integer NOT NULL, items jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id,list_id,version),
 FOREIGN KEY (list_id,version) REFERENCES app.versions ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS app.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), list_id uuid NOT NULL, version integer NOT NULL,
 user_id uuid NOT NULL REFERENCES app.users ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'local' CHECK (status IN ('local','pending','sent','canceled','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (list_id,version,user_id),
 FOREIGN KEY (list_id,version) REFERENCES app.versions ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS app.reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), list_id uuid REFERENCES app.lists ON DELETE CASCADE,
 version integer NOT NULL, comment_id uuid REFERENCES app.comments ON DELETE SET NULL,
 user_id uuid REFERENCES app.users ON DELETE SET NULL,
 kind text NOT NULL DEFAULT 'content' CHECK (kind IN ('content','privacy')),
 reason text NOT NULL, evidence jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
 outcome text, note text, created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS app.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid, action text NOT NULL, entity_id uuid, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, grade text NOT NULL,
 content jsonb NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.school_aliases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), canonical_name text NOT NULL,
 alias text NOT NULL, comuna text NOT NULL DEFAULT '', region text NOT NULL DEFAULT '',
 UNIQUE (alias,comuna,region)
);
CREATE TABLE IF NOT EXISTS app.requests (
 actor_id uuid NOT NULL REFERENCES app.users ON DELETE CASCADE,
 list_id uuid NOT NULL REFERENCES app.lists ON DELETE CASCADE,
 operation text NOT NULL, request_id uuid NOT NULL, payload jsonb NOT NULL, response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (actor_id,list_id,operation,request_id)
);
CREATE TABLE IF NOT EXISTS app.imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app.users ON DELETE CASCADE,
 list_id uuid NOT NULL REFERENCES app.lists ON DELETE CASCADE,
 revision bigint NOT NULL, sheets jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE TABLE IF NOT EXISTS app.assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid REFERENCES app.users ON DELETE SET NULL,
 data bytea NOT NULL, content_type text NOT NULL DEFAULT 'image/png', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS list_owner_idx ON app.lists(owner_id);
CREATE INDEX IF NOT EXISTS grants_user_idx ON app.grants(user_id);
CREATE INDEX IF NOT EXISTS comments_version_idx ON app.comments(list_id,version,created_at);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON app.invitations(email);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON app.sessions(expires_at);
CREATE INDEX IF NOT EXISTS reports_state_idx ON app.reports(status,created_at);

-- Neutral starting points, deliberately labeled as suggestions to adapt.
INSERT INTO app.templates(id,name,grade,content)
SELECT template.id::uuid,template.name,template.grade,
 jsonb_build_object('school','','class_name',template.grade,'school_year',extract(year FROM current_date)::integer,
  'comuna','','region','','logo_id','','instructions','Plantilla orientativa: revisa y adapta cada útil a las indicaciones de tu colegio.',
  'items',(SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'catalog_id',i.id::text,'name',i.name,
   'quantity',item.quantity,'unit',item.unit,'category',c.name,'note','','attributes','{}'::jsonb) ORDER BY item.position)
   FROM (VALUES
    ('manual:lapiz-grafito','2','unidad',1),('manual:goma-borrar','1','unidad',2),
    ('manual:lapices-colores-12','1','caja',3),('manual:pegamento-barra','2','unidad',4),
    ('manual:carpeta','1','unidad',5)
   ) AS item(key,quantity,unit,position)
   JOIN catalog.items i ON i.canonical_key=item.key JOIN catalog.categories c ON c.id=i.category_id))
FROM (VALUES
 ('a0000000-0000-4000-8000-000000000001','Primeros pasos · materiales básicos','Educación parvularia'),
 ('a0000000-0000-4000-8000-000000000002','Mi primer año · materiales básicos','1° básico'),
 ('a0000000-0000-4000-8000-000000000003','Listos para aprender · materiales básicos','3° básico')
) AS template(id,name,grade)
ON CONFLICT(id) DO NOTHING;
