-- chat 服务数据层建表脚本（幂等，可重复执行）
-- 三张表：会话 / 消息 / 线索（LEAD），见 docs/ai-chat-plan.md §4

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  status text DEFAULT 'active',          -- active|ended
  ip text, user_agent text, referrer text,
  turn_count int DEFAULT 0,
  end_reason text
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES chat_sessions(id),
  created_at timestamptz DEFAULT now(),
  role text,                             -- user|assistant|ask_user|ask_answer|system
  content text,
  raw jsonb
);
CREATE TABLE IF NOT EXISTS chat_leads (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES chat_sessions(id),
  created_at timestamptz DEFAULT now(),
  jd_title text, match_level text,       -- high|mid|low
  summary text, concerns jsonb, jd_digest text
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_leads_created ON chat_leads(created_at DESC);
