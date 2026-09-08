/* 简历问答 · 管理后台（A5）
 * 原生 ES Module 单页，无构建、无外部依赖、离线可用。
 * 消费契约（鉴权一律请求头 x-admin-token）：
 *   GET /chat/api/admin/sessions?limit&offset&q&hasLead
 *   GET /chat/api/admin/sessions/:id
 *   GET /chat/api/admin/leads?limit
 *   GET /chat/api/admin/stats
 *   GET /chat/api/admin/export   （JSONL，fetch+blob 下载）
 */

/* ---------------- 常量与状态 ---------------- */

const API_BASE = '/chat/api/admin';
const TOKEN_KEY = 'chatAdminToken';
const PAGE_SIZE = 20;
const LEADS_LIMIT = 500;

const state = {
  tab: 'sessions',          // sessions | leads | stats（详情是 sessions 的子视图）
  sessions: {
    q: '', hasLead: false, offset: 0, limit: PAGE_SIZE,
    total: 0, items: null, loading: false, error: '',
  },
  leads: { items: null, loading: false, error: '', filter: 'all' },
  stats: null,              // { total, active, with_lead, match, daily } 或 { loading, error }
  detail: null,             // { id, loading, error, data:{session,messages,leads} }
};

/* ---------------- DOM 快捷引用 ---------------- */

const $ = (id) => document.getElementById(id);
const el = {
  overlay: $('login-overlay'), loginForm: $('login-card'), loginMsg: $('login-msg'),
  tokenInput: $('token-input'), tokenState: $('token-state'), logoutBtn: $('logout-btn'),
  exportBtn: $('export-btn'),
  sessionsBody: $('sessions-body'), sessionsEmpty: $('sessions-empty'),
  searchInput: $('search-input'), searchBtn: $('search-btn'),
  hasLeadCheck: $('haslead-check'), refreshBtn: $('refresh-btn'),
  pageInfo: $('page-info'), pagePrev: $('page-prev'), pageNext: $('page-next'),
  viewSessions: $('view-sessions'), viewDetail: $('view-detail'),
  viewLeads: $('view-leads'), viewStats: $('view-stats'),
  backBtn: $('back-btn'), detailBadges: $('detail-badges'), detailMeta: $('detail-meta'),
  transcript: $('transcript'), detailLeads: $('detail-leads'),
  leadsBody: $('leads-body'), leadsEmpty: $('leads-empty'), leadsCount: $('leads-count'),
  leadFilter: $('lead-filter'),
  statsCards: $('stats-cards'), matchDist: $('match-dist'), dailyChart: $('daily-chart'),
  toast: $('toast'),
};

/* ---------------- 令牌与登录遮罩 ---------------- */

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function updateTokenState() {
  const has = Boolean(getToken());
  el.tokenState.classList.toggle('on', has);
  el.tokenState.classList.toggle('off', !has);
  el.tokenState.innerHTML = `<span class="st-dot"></span>${has ? '已授权' : '未授权'}`;
  el.logoutBtn.hidden = !has;
}

/** 弹出登录遮罩；并发调用复用同一个等待 Promise。resolve(新token)。 */
let pendingAsk = null;
let tokenResolve = null;

function askToken(reason) {
  if (pendingAsk) {
    if (reason) el.loginMsg.textContent = reason;
    return pendingAsk;
  }
  if (reason) el.loginMsg.textContent = reason;
  el.tokenInput.value = '';
  el.overlay.hidden = false;
  requestAnimationFrame(() => el.tokenInput.focus());
  pendingAsk = new Promise((resolve) => { tokenResolve = resolve; });
  return pendingAsk.finally(() => { pendingAsk = null; });
}

/* ---------------- API 封装 ---------------- */

function buildUrl(path, params) {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val === '' || val === null || val === undefined || val === false) continue;
      url.searchParams.set(key, String(val));
    }
  }
  return url;
}

/** 统一鉴权 fetch（带 x-admin-token；401 → 清令牌重弹密码，返回 null 由调用方决定是否重试）。 */
async function authFetch(url) {
  const token = getToken() || await askToken('请输入管理密码');
  let res;
  try {
    res = await fetch(url, { headers: { 'x-admin-token': token } });
  } catch {
    throw new Error('网络错误：无法连接 chat 服务');
  }
  if (res.status === 401) {
    setToken('');
    updateTokenState();
    await askToken('密码不正确，请重新输入');
    return null;
  }
  return res;
}

/** api()：authFetch 之上 401 自动重试 + 解析 JSON。 */
async function api(path, params) {
  const url = buildUrl(path, params);
  for (;;) {
    const res = await authFetch(url);
    if (res === null) continue;
    if (!res.ok) throw new Error(`请求失败（HTTP ${res.status}）`);
    return res.json();
  }
}

/* ---------------- 工具函数 ---------------- */

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function absTime(iso) {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return String(iso ?? '—');
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function relTime(iso) {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return String(iso ?? '—');
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return '刚刚';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return absTime(iso).slice(0, 10);
}

/** 相对时间 + 悬浮绝对时间 */
function timeCell(iso) {
  if (!iso) return '<span class="dim">—</span>';
  return `<span title="${esc(absTime(iso))}">${esc(relTime(iso))}</span>`;
}

const MATCH_LABEL = { high: '高匹配', mid: '中匹配', low: '低匹配' };

function matchBadge(level) {
  const lv = String(level ?? '').toLowerCase();
  const cls = lv === 'high' || lv === 'mid' || lv === 'low' ? lv : 'low';
  const label = MATCH_LABEL[lv] || (level ? String(level) : '未知');
  return `<span class="badge badge-${cls}">${esc(label)}</span>`;
}

/** concerns 为 jsonb：兼容数组 / JSON 字符串 / 空 */
function toConcerns(raw) {
  if (Array.isArray(raw)) return raw.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
    } catch { /* 按原文展示 */ }
    return [raw];
  }
  return [];
}

/** ask_user 消息 content 兼容纯文本与 JSON（{question,options,allowCustom}） */
function parseAskContent(content) {
  const text = String(content ?? '').trim();
  if (!text.startsWith('{')) return null;
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj.question === 'string') return obj;
  } catch { /* 落回原文展示 */ }
  return null;
}

let toastTimer = null;
function toast(message, type = 'info') {
  el.toast.textContent = message;
  el.toast.dataset.type = type;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3400);
}

/* ---------------- 视图切换 ---------------- */

const VIEW_IDS = { sessions: 'view-sessions', detail: 'view-detail', leads: 'view-leads', stats: 'view-stats' };

function showView(view) {
  for (const [name, id] of Object.entries(VIEW_IDS)) {
    $(id).hidden = (name !== view);
  }
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  showView(tab);
  if (tab === 'sessions') loadSessions();
  else if (tab === 'leads') loadLeads();
  else if (tab === 'stats') loadStats();
}

/* ---------------- 会话列表 ---------------- */

async function loadSessions() {
  const s = state.sessions;
  s.loading = true; s.error = '';
  renderSessions();
  try {
    const data = await api(`${API_BASE}/sessions`, {
      limit: s.limit,
      offset: s.offset,
      q: s.q,
      hasLead: s.hasLead ? 'true' : '',
    });
    s.items = Array.isArray(data.items) ? data.items : [];
    s.total = Number(data.total ?? s.items.length) || 0;
  } catch (err) {
    s.items = null; s.error = err.message;
  }
  s.loading = false;
  renderSessions();
}

function renderSessions() {
  const s = state.sessions;
  if (s.loading) {
    el.sessionsBody.innerHTML = '';
    el.sessionsEmpty.hidden = false;
    el.sessionsEmpty.innerHTML = '加载中…';
  } else if (s.error) {
    el.sessionsBody.innerHTML = '';
    el.sessionsEmpty.hidden = false;
    el.sessionsEmpty.innerHTML = `<span class="empty-err">加载失败：${esc(s.error)}</span>`;
  } else if (!s.items || s.items.length === 0) {
    el.sessionsBody.innerHTML = '';
    el.sessionsEmpty.hidden = false;
    el.sessionsEmpty.textContent = '暂无会话记录';
  } else {
    el.sessionsEmpty.hidden = true;
    el.sessionsBody.innerHTML = s.items.map((row) => `
      <tr class="rowlink" data-id="${esc(row.id)}">
        <td class="nowrap">${timeCell(row.created_at)}</td>
        <td class="nowrap dim" title="${esc(row.ua || '')}">${esc(row.ip || '—')}</td>
        <td class="num">${Number(row.turn_count ?? 0)}</td>
        <td class="nowrap">${row.has_lead
          ? '<span class="dot"></span>有'
          : '<span class="dot off"></span><span class="dim">无</span>'}</td>
        <td>${row.lead_summary
          ? `<span class="ellip" title="${esc(row.lead_summary)}">${esc(row.lead_summary)}</span>`
          : '<span class="dim">—</span>'}</td>
        <td class="nowrap"><span class="link">详情 ›</span></td>
      </tr>`).join('');
  }

  const from = s.total === 0 ? 0 : s.offset + 1;
  const to = Math.min(s.offset + s.limit, s.total);
  el.pageInfo.textContent = `共 ${s.total} 条 · 第 ${from}–${to} 条`;
  el.pagePrev.disabled = s.loading || s.offset <= 0;
  el.pageNext.disabled = s.loading || s.offset + s.limit >= s.total;
}

/* ---------------- 会话详情 ---------------- */

async function openDetail(id) {
  state.detail = { id, loading: true, error: '', data: null };
  showView('detail');
  renderDetail();
  try {
    const data = await api(`${API_BASE}/sessions/${encodeURIComponent(id)}`);
    state.detail = { id, loading: false, error: '', data };
  } catch (err) {
    state.detail = { id, loading: false, error: err.message, data: null };
  }
  renderDetail();
}

function messageHtml(msg) {
  const content = msg.content ?? '';
  const meta = `<div class="meta"><b>${esc(roleName(msg.role))}</b> · ${timeCell(msg.created_at)}</div>`;

  if (msg.role === 'user') {
    return `<div class="msg msg-user"><div class="bubble">${esc(content)}</div>${meta}</div>`;
  }
  if (msg.role === 'ask_answer') {
    return `<div class="msg msg-user">
      <div class="bubble">${esc(content)}</div>
      <div class="meta"><b>访客</b><span class="msg-role-tag">访客回答</span> · ${timeCell(msg.created_at)}</div>
    </div>`;
  }
  if (msg.role === 'ask_user') {
    const ask = parseAskContent(content);
    const options = ask && Array.isArray(ask.options) && ask.options.length
      ? `<div class="ask-opts">${ask.options.map((o) => `<span class="ask-opt">${esc(o)}</span>`).join('')}</div>`
      : '';
    const q = ask ? ask.question : content;
    return `<div class="msg msg-ask">
      <div class="meta"><b>AI 提问</b> · ${timeCell(msg.created_at)}</div>
      <div class="ask-card"><span class="ask-q">${esc(q)}</span>${options}</div>
    </div>`;
  }
  if (msg.role === 'system') {
    return `<div class="msg msg-system"><div class="bubble">${esc(content)}</div></div>`;
  }
  /* assistant 及未知角色统一按 AI 气泡 */
  return `<div class="msg msg-ai">${meta}<div class="bubble">${esc(content)}</div></div>`;
}

function roleName(role) {
  const map = { user: '访客', assistant: 'AI', ask_user: 'AI 提问', ask_answer: '访客回答', system: '系统' };
  return map[role] || role || '消息';
}

function leadCardHtml(lead) {
  const concerns = toConcerns(lead.concerns);
  return `<div class="lead-card">
    <div class="lead-head">
      <span class="lead-title" title="${esc(lead.jd_title || '')}">${esc(lead.jd_title || '未命名岗位')}</span>
      ${matchBadge(lead.match_level)}
    </div>
    ${lead.summary ? `<div class="lead-sum">${esc(lead.summary)}</div>` : ''}
    ${concerns.length ? `<ul class="concern-list">${concerns.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    ${lead.jd_digest ? `<div class="lead-digest">${esc(lead.jd_digest)}</div>` : ''}
    <div class="lead-time" title="${esc(absTime(lead.created_at))}">线索产生于 ${esc(relTime(lead.created_at))}</div>
  </div>`;
}

function renderDetail() {
  const d = state.detail;
  if (!d) return;

  if (d.loading) {
    el.detailBadges.innerHTML = '';
    el.detailMeta.innerHTML = '';
    el.transcript.innerHTML = '<div class="empty">加载中…</div>';
    el.detailLeads.innerHTML = '';
    return;
  }
  if (d.error) {
    el.detailBadges.innerHTML = '';
    el.detailMeta.innerHTML = '';
    el.transcript.innerHTML = `<div class="empty"><span class="empty-err">加载失败：${esc(d.error)}</span></div>`;
    el.detailLeads.innerHTML = '';
    return;
  }

  const { session = {}, messages = [], leads = [] } = d.data || {};

  /* 头部徽章 + 元信息 */
  const isActive = session.status === 'active';
  el.detailBadges.innerHTML = `
    ${isActive ? '<span class="badge badge-high">进行中</span>' : '<span class="badge badge-low">已结束</span>'}
    <span class="badge badge-blue">${Number(session.turn_count ?? 0)} 轮</span>
    ${leads.length ? `<span class="badge badge-high">线索 ${leads.length} 条</span>` : ''}`;

  const ua = session.user_agent ?? session.ua ?? '';
  el.detailMeta.innerHTML = `
    <span>ID <b title="${esc(session.id ?? '')}">${esc(String(session.id ?? '').slice(0, 8))}…</b></span>
    <span>创建 <b title="${esc(absTime(session.created_at))}">${esc(absTime(session.created_at))}</b></span>
    <span>IP <b>${esc(session.ip || '—')}</b></span>
    ${session.ended_at ? `<span>结束 <b title="${esc(absTime(session.ended_at))}">${esc(relTime(session.ended_at))}</b></span>` : ''}
    ${session.end_reason ? `<span>结束原因 <b>${esc(session.end_reason)}</b></span>` : ''}
    ${ua ? `<span class="meta-full" title="${esc(ua)}">UA ${esc(ua)}</span>` : ''}
    ${session.referrer ? `<span class="meta-full">来源 ${esc(session.referrer)}</span>` : ''}`;

  /* transcript */
  el.transcript.innerHTML = messages.length
    ? messages.map(messageHtml).join('')
    : '<div class="empty">该会话暂无消息</div>';
  el.transcript.scrollTop = el.transcript.scrollHeight;

  /* lead 卡片 */
  el.detailLeads.innerHTML = leads.length
    ? leads.map(leadCardHtml).join('')
    : '<div class="lead-card dim" style="text-align:center">该会话暂无 JD 线索</div>';
}

/* ---------------- 线索 ---------------- */

async function loadLeads() {
  const s = state.leads;
  s.loading = true; s.error = '';
  renderLeads();
  try {
    const data = await api(`${API_BASE}/leads`, { limit: LEADS_LIMIT });
    s.items = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    s.items = null; s.error = err.message;
  }
  s.loading = false;
  renderLeads();
}

function renderLeads() {
  const s = state.leads;
  if (s.loading) {
    el.leadsBody.innerHTML = '';
    el.leadsEmpty.hidden = false;
    el.leadsEmpty.textContent = '加载中…';
  } else if (s.error) {
    el.leadsBody.innerHTML = '';
    el.leadsEmpty.hidden = false;
    el.leadsEmpty.innerHTML = `<span class="empty-err">加载失败：${esc(s.error)}</span>`;
  } else {
    const all = s.items || [];
    const filtered = s.filter === 'all'
      ? all
      : all.filter((l) => String(l.match_level ?? '').toLowerCase() === s.filter);
    if (filtered.length === 0) {
      el.leadsBody.innerHTML = '';
      el.leadsEmpty.hidden = false;
      el.leadsEmpty.textContent = all.length === 0 ? '暂无线索记录' : '当前筛选下暂无线索';
    } else {
      el.leadsEmpty.hidden = true;
      el.leadsBody.innerHTML = filtered.map((lead) => `
        <tr class="rowlink" data-sid="${esc(lead.session_id)}" title="查看所属会话">
          <td class="nowrap">${timeCell(lead.created_at)}</td>
          <td><span class="ellip" style="max-width:180px" title="${esc(lead.jd_title || '')}">${esc(lead.jd_title || '未命名岗位')}</span></td>
          <td class="nowrap">${matchBadge(lead.match_level)}</td>
          <td>${lead.summary ? `<span class="ellip" title="${esc(lead.summary)}">${esc(lead.summary)}</span>` : '<span class="dim">—</span>'}</td>
          <td class="nowrap"><span class="link">会话 ›</span></td>
        </tr>`).join('');
    }
    el.leadsCount.textContent = s.loading ? '' : `共 ${all.length} 条${s.filter !== 'all' ? ` · 筛选后 ${s.items ? s.items.filter((l) => String(l.match_level ?? '').toLowerCase() === s.filter).length : 0} 条` : ''}`;
  }
}

/* ---------------- 概览 ---------------- */

async function loadStats() {
  state.stats = { loading: true, error: '' };
  renderStats();
  try {
    state.stats = { loading: false, error: '', data: await api(`${API_BASE}/stats`) };
  } catch (err) {
    state.stats = { loading: false, error: err.message };
  }
  renderStats();
}

function renderStats() {
  const s = state.stats;
  if (!s) return;
  if (s.loading) {
    el.statsCards.innerHTML = '<div class="stat-card"><div class="num">…</div><div class="lbl">加载中</div></div>';
    el.matchDist.innerHTML = '';
    el.dailyChart.innerHTML = '';
    return;
  }
  if (s.error) {
    el.statsCards.innerHTML = `<div class="stat-card"><div class="lbl empty-err">加载失败：${esc(s.error)}</div></div>`;
    el.matchDist.innerHTML = '';
    el.dailyChart.innerHTML = '';
    return;
  }

  const d = s.data || {};
  const card = (num, lbl) => `<div class="stat-card"><div class="num">${Number(num ?? 0)}</div><div class="lbl">${esc(lbl)}</div></div>`;
  el.statsCards.innerHTML =
    card(d.total, '会话总数') +
    card(d.active, '进行中') +
    card(d.with_lead, '含 JD 线索');

  /* 匹配分布 */
  const m = d.match || {};
  const rows = [
    { key: 'high', label: '高匹配', color: 'var(--green)' },
    { key: 'mid', label: '中匹配', color: 'var(--yellow)' },
    { key: 'low', label: '低匹配', color: 'var(--gray)' },
  ];
  const maxMatch = Math.max(...rows.map((r) => Number(m[r.key]) || 0), 1);
  el.matchDist.innerHTML = rows.map((r) => {
    const v = Number(m[r.key]) || 0;
    const width = v === 0 ? 0 : Math.max((v / maxMatch) * 100, 2);
    return `<div class="match-row">
      <span class="m-lbl">${r.label}</span>
      <div class="m-track"><div class="m-fill" style="width:${width}%;background:${r.color}"></div></div>
      <span class="m-val">${v}</span>
    </div>`;
  }).join('');

  /* 近 7 日条形图（纯 div 宽度） */
  const daily = Array.isArray(d.daily) ? d.daily : [];
  const maxDaily = Math.max(...daily.map((x) => Number(x.count) || 0), 1);
  el.dailyChart.innerHTML = daily.length ? daily.map((row) => {
    const v = Number(row.count) || 0;
    const width = v === 0 ? 0 : Math.max((v / maxDaily) * 100, 2);
    const day = String(row.day ?? '');
    return `<div class="chart-row" title="${esc(day)}：${v} 个会话">
      <span class="chart-day">${esc(day.length >= 10 ? day.slice(5, 10) : day)}</span>
      <div class="chart-track"><div class="chart-bar${v === 0 ? ' zero' : ''}" style="width:${width}%"></div></div>
      <span class="chart-val">${v}</span>
    </div>`;
  }).join('') : '<div class="empty" style="padding:16px">暂无数据</div>';
}

/* ---------------- 导出（fetch + blob，自定义头带不上 <a href>） ---------------- */

async function exportJsonl() {
  el.exportBtn.disabled = true;
  try {
    const res = await authFetch(`${API_BASE}/export`);
    if (res === null) return; // 401：已重弹密码，放弃本次导出
    if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`);

    const blob = await res.blob();
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = `chat-export-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.jsonl`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    toast(`已开始下载 ${name}`, 'ok');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    el.exportBtn.disabled = false;
  }
}

/* ---------------- 事件绑定与启动 ---------------- */

function bindEvents() {
  /* 登录表单 */
  el.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const token = el.tokenInput.value.trim();
    if (!token) { el.loginMsg.textContent = '密码不能为空'; return; }
    setToken(token);
    updateTokenState();
    el.overlay.hidden = true;
    el.loginMsg.textContent = '';
    if (tokenResolve) { const resolve = tokenResolve; tokenResolve = null; resolve(token); }
  });

  /* 退出：清令牌并清空已渲染数据，重新要求登录 */
  el.logoutBtn.addEventListener('click', () => {
    setToken('');
    updateTokenState();
    state.sessions.items = null;
    state.leads.items = null;
    state.stats = null;
    state.detail = null;
    renderSessions(); renderLeads(); renderStats();
    toast('已退出登录');
    askToken('请输入管理密码').then(() => setTab(state.tab));
  });

  /* Tab 导航 */
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  /* 会话列表：搜索 / 筛选 / 刷新 / 分页 */
  const doSearch = () => {
    state.sessions.q = el.searchInput.value.trim();
    state.sessions.offset = 0;
    loadSessions();
  };
  el.searchBtn.addEventListener('click', doSearch);
  el.searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  el.hasLeadCheck.addEventListener('change', () => {
    state.sessions.hasLead = el.hasLeadCheck.checked;
    state.sessions.offset = 0;
    loadSessions();
  });
  el.refreshBtn.addEventListener('click', loadSessions);
  el.pagePrev.addEventListener('click', () => {
    state.sessions.offset = Math.max(0, state.sessions.offset - state.sessions.limit);
    loadSessions();
  });
  el.pageNext.addEventListener('click', () => {
    state.sessions.offset += state.sessions.limit;
    loadSessions();
  });

  /* 行点击进详情（事件委托） */
  el.sessionsBody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openDetail(tr.dataset.id);
  });

  /* 详情返回 */
  el.backBtn.addEventListener('click', () => showView('sessions'));

  /* 线索：match 筛选 + 行点击跳所属会话 */
  el.leadFilter.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-match]');
    if (!btn) return;
    state.leads.filter = btn.dataset.match;
    el.leadFilter.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    renderLeads();
  });
  el.leadsBody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-sid]');
    if (tr && tr.dataset.sid) openDetail(tr.dataset.sid);
  });

  /* 导出 */
  el.exportBtn.addEventListener('click', exportJsonl);
}

function init() {
  bindEvents();
  updateTokenState();
  setTab('sessions');   // 无令牌时首个请求会触发登录遮罩
}

init();
