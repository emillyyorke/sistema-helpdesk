/* ===== HelpDesk frontend ===== */
const API = window.API_URL;
let token = localStorage.getItem("hd_token");
let me = JSON.parse(localStorage.getItem("hd_me") || "null");

/* ---------- API helper ---------- */
let _activeRequests = 0;
function _showLoader() {
  _activeRequests++;
  let el = document.getElementById("topLoader");
  if (!el) {
    el = document.createElement("div");
    el.id = "topLoader";
    el.className = "top-loader";
    document.body.appendChild(el);
  }
  el.classList.add("show");
}
function _hideLoader() {
  _activeRequests = Math.max(0, _activeRequests - 1);
  if (_activeRequests === 0) {
    const el = document.getElementById("topLoader");
    if (el) el.classList.remove("show");
  }
}

async function api(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && token) headers.Authorization = "Bearer " + token;
  _showLoader();
  try {
    const res = await fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "Erro na requisição");
    return data;
  } finally {
    _hideLoader();
  }
}

/* ---------- AUTH ---------- */
function clearAuthFields() {
  ["loginEmail","loginPass","regName","regEmail","regPass"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  ["loginErr","regErr"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
}

function switchTab(t) {
  document.getElementById("tabLogin").classList.toggle("active", t === "login");
  document.getElementById("tabReg").classList.toggle("active", t === "reg");
  document.getElementById("formLogin").style.display = t === "login" ? "" : "none";
  document.getElementById("formReg").style.display = t === "reg" ? "" : "none";
  clearAuthFields();
}

async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPass").value;
  try {
    const r = await api("/auth/login", { method: "POST", body: { email, password }, auth: false });
    saveSession(r);
  } catch (e) {
    document.getElementById("loginErr").textContent = e.message;
  }
}

async function doRegister() {
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPass").value;
  try {
    const r = await api("/auth/register", { method: "POST", body: { name, email, password }, auth: false });
    saveSession(r);
  } catch (e) {
    document.getElementById("regErr").textContent = e.message;
  }
}

function saveSession(r) {
  token = r.access_token;
  me = r.user;
  localStorage.setItem("hd_token", token);
  localStorage.setItem("hd_me", JSON.stringify(me));
  clearAuthFields();
  showApp();
}

function logout() {
  localStorage.removeItem("hd_token");
  localStorage.removeItem("hd_me");
  token = null; me = null;
  document.getElementById("app").style.display = "none";
  document.getElementById("auth").style.display = "";
  clearAuthFields();
}

function isStaff() { return me && (me.role === "analista" || me.role === "admin"); }
function isAdmin() { return me && me.role === "admin"; }

let solicitanteTab = "abertos";

async function showApp() {
  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "";
  document.getElementById("userName").textContent = me.name;
  document.getElementById("userRole").textContent = me.role;
  // Visibilidade por papel
  document.getElementById("btnNewKb").style.display = isStaff() ? "" : "none";
  document.querySelector('[data-page="users"]').style.display = isAdmin() ? "" : "none";
  document.querySelector('[data-page="dashboard"]').style.display = isStaff() ? "" : "none";
  document.getElementById("filterAssignee").style.display = isStaff() ? "" : "none";

  // Solicitante: troca toolbar de filtros por 2 tabs (Em aberto / Encerrados)
  if (!isStaff()) {
    document.getElementById("filterStatus").style.display = "none";
    document.getElementById("filterPri").style.display = "none";
    document.getElementById("filterCat").style.display = "none";
    if (!document.getElementById("solicTabs")) {
      const tabs = document.createElement("div");
      tabs.id = "solicTabs";
      tabs.style.cssText = "display:flex;gap:8px;margin-bottom:18px";
      tabs.innerHTML = `
        <button id="tabAbertos" class="btn-primary" onclick="setSolicTab('abertos')">Em aberto</button>
        <button id="tabEncerrados" class="btn-ghost" onclick="setSolicTab('encerrados')">Encerrados</button>
      `;
      const toolbar = document.querySelector("#page-tickets .toolbar");
      toolbar.parentNode.insertBefore(tabs, toolbar);
    }
    // Page header com texto mais pessoal
    const ph = document.querySelector("#page-tickets .page-header div");
    ph.querySelector("h2").textContent = "Meus chamados";
    ph.querySelector("p").textContent = "Acompanhe seus chamados em aberto e encerrados";
  }

  // Popular o filtro de assignee com a equipe
  if (isStaff()) {
    try {
      const staff = await api("/users/staff");
      const sel = document.getElementById("filterAssignee");
      sel.innerHTML = `<option value="">Todos atribuídos</option><option value="0">Sem atribuição</option>` +
        staff.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join("");
    } catch {}
  }
  navigate(isStaff() ? "dashboard" : "tickets");
}

function setSolicTab(tab) {
  solicitanteTab = tab;
  document.getElementById("tabAbertos").className = tab === "abertos" ? "btn-primary" : "btn-ghost";
  document.getElementById("tabEncerrados").className = tab === "encerrados" ? "btn-primary" : "btn-ghost";
  loadTickets();
}

/* ---------- NAV ---------- */
function replayAnim(el) {
  if (!el) return;
  el.classList.remove("page-anim");
  void el.offsetWidth;
  el.classList.add("page-anim");
}

function toggleDrawer() {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("drawerOverlay");
  const open = !sb.classList.contains("open");
  sb.classList.toggle("open", open);
  ov.classList.toggle("show", open);
  document.body.style.overflow = open ? "hidden" : "";
}

function closeDrawer() {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("drawerOverlay");
  sb.classList.remove("open");
  ov.classList.remove("show");
  document.body.style.overflow = "";
}

function navigate(page) {
  document.querySelectorAll(".nav-item").forEach(n =>
    n.classList.toggle("active", n.dataset.page === page));
  ["dashboard", "tickets", "kb", "users"].forEach(p =>
    document.getElementById("page-" + p).style.display = p === page ? "" : "none");
  replayAnim(document.getElementById("page-" + page));
  closeDrawer();
  if (page === "dashboard") loadDashboard();
  if (page === "tickets") loadTickets();
  if (page === "kb") loadArticles();
  if (page === "users") loadUsers();
}

/* ---------- DASHBOARD ---------- */
async function loadDashboard() {
  try {
    const stats = await api("/tickets/stats");
    document.getElementById("statsBox").innerHTML = `
      <div class="stat-card purple"><div class="lbl">Total</div><div class="val">${stats.total}</div></div>
      <div class="stat-card blue"><div class="lbl">Abertos</div><div class="val">${stats.by_status.aberto}</div></div>
      <div class="stat-card pink"><div class="lbl">Em andamento</div><div class="val">${stats.by_status.em_andamento}</div></div>
      <div class="stat-card green"><div class="lbl">Resolvidos</div><div class="val">${stats.by_status.resolvido}</div></div>
      <div class="stat-card" style="border-color:${stats.overdue>0?'#ff6b8a':''}"><div class="lbl" style="color:${stats.overdue>0?'#ff6b8a':''}">⚠️ Atrasados (SLA)</div><div class="val" style="color:${stats.overdue>0?'#ff6b8a':'var(--ok)'}">${stats.overdue || 0}</div></div>`;
    const recent = (await api("/tickets")).slice(0, 5);
    const target = document.getElementById("recentTickets");
    if (!recent.length) { target.innerHTML = `<div class="empty"><div class="big">📭</div>Nenhum chamado ainda</div>`; return; }
    target.innerHTML = `<table><thead><tr><th>Protocolo</th><th>Título</th><th>Status</th><th>Prioridade</th><th>Aberto</th></tr></thead>
      <tbody>${recent.map(t => `<tr class="row-click" onclick="openTicketDetail(${t.id})">
        <td><b style="color:var(--lilac-600)">${esc(t.protocol)}</b></td><td>${esc(t.title)}</td>
        <td><span class="badge st-${t.status}">${humanStatus(t.status)}</span></td>
        <td><span class="badge pri-${t.priority}">${t.priority}</span></td>
        <td>${fmt(t.created_at)}</td></tr>`).join("")}</tbody></table>`;
    replayAnim(document.getElementById("page-dashboard"));
  } catch (e) { console.error(e); }
}

/* ---------- TICKETS ---------- */
async function loadTickets() {
  const params = new URLSearchParams();
  const q = document.getElementById("searchT").value.trim();
  const s = document.getElementById("filterStatus").value;
  const p = document.getElementById("filterPri").value;
  const c = document.getElementById("filterCat").value;
  const a = document.getElementById("filterAssignee").value;
  if (q) params.set("q", q);
  if (s) params.set("status", s);
  if (p) params.set("priority", p);
  if (c) params.set("category", c);
  if (a !== "") params.set("assignee_id", a);
  try {
    let list = await api("/tickets?" + params.toString());
    // Solicitante: aplica filtro da aba (Em aberto / Encerrados)
    if (!isStaff()) {
      const open = ["aberto","em_andamento","aguardando"];
      list = list.filter(t => solicitanteTab === "abertos"
        ? open.includes(t.status)
        : !open.includes(t.status));
    }
    const body = document.getElementById("ticketsBody");
    if (!list.length) { body.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="big">📭</div>Nenhum chamado encontrado</div></td></tr>`; return; }
    body.innerHTML = list.map(t => {
      const open = ["aberto","em_andamento","aguardando"].includes(t.status);
      const overdue = open && t.due_at && new Date(t.due_at + (t.due_at.endsWith("Z")?"":"Z")) < new Date();
      return `<tr class="row-click" onclick="openTicketDetail(${t.id})">
      <td><b style="color:var(--lilac-600)">${esc(t.protocol)}</b></td>
      <td>${esc(t.title)}</td>
      <td>${esc(t.category)}</td>
      <td><span class="badge pri-${t.priority}">${t.priority}</span></td>
      <td><span class="badge st-${t.status}">${humanStatus(t.status)}</span>${overdue ? ' <span class="badge" style="background:#ffe7ec;color:#c43757" title="SLA estourado">⚠️ Atrasado</span>' : ''}</td>
      <td>${esc(t.requester.name)}</td>
      <td>${t.assignee ? esc(t.assignee.name) : "—"}</td>
      <td>${fmt(t.created_at)}</td>
    </tr>`;}).join("");
    replayAnim(document.getElementById("page-tickets"));
  } catch (e) { console.error(e); }
}

async function openTicketModal() {
  // Apenas staff pode atribuir na criação
  const assignField = document.getElementById("tAssign").closest(".field");
  if (isStaff()) {
    assignField.style.display = "";
    try {
      const staff = await api("/users/staff");
      const sel = document.getElementById("tAssign");
      sel.innerHTML = `<option value="">— Não atribuir —</option>` +
        staff.map(u => `<option value="${u.id}">${esc(u.name)} (${u.role})</option>`).join("");
    } catch {}
  } else {
    assignField.style.display = "none";
  }
  document.getElementById("tTitle").value = "";
  document.getElementById("tDesc").value = "";
  document.getElementById("tErr").textContent = "";
  document.getElementById("modalTicket").classList.add("show");
}

async function createTicket() {
  const body = {
    title: document.getElementById("tTitle").value.trim(),
    description: document.getElementById("tDesc").value.trim(),
    category: document.getElementById("tCat").value,
    priority: document.getElementById("tPri").value,
  };
  const a = document.getElementById("tAssign").value;
  if (a) body.assignee_id = parseInt(a);
  try {
    await api("/tickets", { method: "POST", body });
    closeModal("modalTicket");
    loadTickets(); loadDashboard();
  } catch (e) {
    document.getElementById("tErr").textContent = e.message;
  }
}

async function openTicketDetail(id) {
  try {
    const t = await api("/tickets/" + id);
    const staff = isAdmin() ? await api("/users/staff").catch(() => []) : [];
    const closed = (t.status === "resolvido" || t.status === "fechado");
    const c = document.getElementById("detailContent");
    c.innerHTML = `
      <button class="close" onclick="closeModal('modalDetail')">×</button>
      <div style="font-size:13px;color:var(--muted);font-weight:700">PROTOCOLO</div>
      <h3 style="margin:2px 0 4px;font-size:20px;color:var(--lilac-600)">${esc(t.protocol)}</h3>
      <h3 style="margin:0 0 14px">${esc(t.title)}</h3>
      <div style="margin-bottom:14px">
        <span class="badge st-${t.status}">${humanStatus(t.status)}</span>
        <span class="badge pri-${t.priority}">${t.priority}</span>
        <span class="badge" style="background:var(--blue-50);color:var(--blue-500)">${esc(t.category)}</span>
      </div>
      <p style="white-space:pre-wrap;background:var(--lilac-50);padding:14px;border-radius:10px">${esc(t.description)}</p>

      ${t.resolution ? `
        <div style="background:#e1f7ed;border-left:4px solid var(--ok);padding:14px 16px;border-radius:10px;margin-top:14px">
          <div style="font-size:12px;color:#1f7a52;font-weight:700;text-transform:uppercase;margin-bottom:4px">✅ Resolução</div>
          <div style="white-space:pre-wrap;color:#1f7a52">${esc(t.resolution)}</div>
        </div>` : ""}

      <div class="grid-2" style="margin-top:14px">
        <div><small style="color:var(--muted)">Solicitante</small><br><b>${esc(t.requester.name)}</b></div>
        <div><small style="color:var(--muted)">Atribuído</small><br>
          <b>${t.assignee ? esc(t.assignee.name) : "—"}</b>
          ${isStaff() && !t.assignee && !closed ? `<button class="btn-primary" style="margin-left:10px;padding:6px 12px;font-size:12px" onclick="assignToMe(${t.id})">Designar a mim</button>` : ""}
        </div>
        <div><small style="color:var(--muted)">Aberto em</small><br>${fmt(t.created_at)}</div>
        <div><small style="color:var(--muted)">${closed ? "Finalizado em" : "Última atualização"}</small><br>${fmt(t.resolved_at || t.updated_at)}</div>
        ${t.due_at && !closed ? `<div style="grid-column:1/-1;background:${new Date(t.due_at+(t.due_at.endsWith('Z')?'':'Z'))<new Date()?'#ffe7ec':'#fff5e1'};border-radius:10px;padding:10px 14px"><small style="color:var(--muted)">⏱️ Prazo SLA</small><br><b style="color:${new Date(t.due_at+(t.due_at.endsWith('Z')?'':'Z'))<new Date()?'#c43757':'#a26a00'}">${fmt(t.due_at)}${new Date(t.due_at+(t.due_at.endsWith('Z')?'':'Z'))<new Date()?' (atrasado)':''}</b></div>` : ""}
      </div>

      ${isAdmin() || (isStaff() && !closed && t.assignee) ? `
      <h4 style="margin-top:22px">Ações do atendimento${closed ? ' <small style="color:var(--muted);font-weight:400">(admin — chamado finalizado)</small>' : ''}</h4>
      <div class="grid-2">
        <div><label>Status</label>
          <select id="dStatus">
            ${(isAdmin() ? ["aberto","em_andamento","aguardando","resolvido","fechado"] : ["aberto","em_andamento","aguardando"]).map(s =>
              `<option value="${s}" ${t.status===s?"selected":""}>${humanStatus(s)}</option>`).join("")}
          </select>
        </div>
        <div><label>Prioridade</label>
          <select id="dPri">
            ${["baixa","media","alta","critica"].map(p =>
              `<option value="${p}" ${t.priority===p?"selected":""}>${p}</option>`).join("")}
          </select>
        </div>
        ${isAdmin() ? `
        <div><label>Repassar / atribuir (admin)</label>
          <select id="dAssign">
            <option value="">— Ninguém —</option>
            ${staff.map(u => `<option value="${u.id}" ${t.assignee && t.assignee.id===u.id ? "selected":""}>${esc(u.name)}</option>`).join("")}
          </select>
        </div>` : `<div></div>`}
        <div style="display:flex;align-items:flex-end">
          <button class="btn-primary" style="width:100%" onclick="updateTicket(${t.id})">Salvar alterações</button>
        </div>
      </div>

      ${!closed ? `
      <div style="background:var(--pink-50);border-radius:12px;padding:16px;margin-top:18px">
        <h4 style="margin:0 0 10px;color:var(--pink-500)">Finalizar chamado</h4>
        <p style="font-size:13px;color:var(--ink-soft);margin:0 0 10px">
          Descreva como o problema foi resolvido. Esse texto fica registrado no chamado e visível pro solicitante.
        </p>
        <textarea id="dResolution" rows="3" placeholder="Ex: Reinstalado driver da impressora e validado teste de impressão com o usuário."></textarea>
        <button class="btn-pink" style="width:100%;margin-top:10px;background:linear-gradient(135deg,var(--pink-500),var(--lilac-400));color:#fff" onclick="resolveTicket(${t.id})">✓ Finalizar chamado</button>
      </div>` : ""}

      ${isAdmin() ? `<button class="btn-danger" style="margin-top:14px;width:100%" onclick="deleteTicket(${t.id})">Excluir chamado (admin)</button>` : ""}
      ` : ""}

      <h4 style="margin-top:22px">Comentários</h4>
      <div>${t.comments.length ? t.comments.map(c => `
        <div class="comment">
          <div class="meta"><b>${esc(c.author.name)}</b> • ${fmt(c.created_at)}</div>
          <div style="white-space:pre-wrap">${esc(c.body)}</div>
        </div>`).join("") : '<p style="color:var(--muted);font-size:13px">Sem comentários ainda.</p>'}</div>
      ${(!closed || isAdmin()) ? `
      <div class="field" style="margin-top:10px"><textarea id="dComment" rows="3" placeholder="Escreva um comentário..."></textarea></div>
      <button class="btn-primary" onclick="addComment(${t.id})">Comentar</button>` : ""}

      <h4 style="margin-top:22px">Histórico</h4>
      <div class="timeline">${t.history.map(h => `
        <div class="timeline-item">
          <div class="meta">${fmt(h.created_at)} • ${esc(h.actor.name)}</div>
          <div class="text">${esc(h.action)}</div>
        </div>`).join("")}</div>
    `;
    document.getElementById("modalDetail").classList.add("show");
  } catch (e) { alert(e.message); }
}

async function resolveTicket(id) {
  const resolution = document.getElementById("dResolution").value.trim();
  if (resolution.length < 3) {
    alert("O comentário de resolução é obrigatório (mínimo 3 caracteres).");
    return;
  }
  if (!confirm("Finalizar este chamado?")) return;
  try {
    await api(`/tickets/${id}/resolve`, { method: "POST", body: { resolution } });
    closeModal("modalDetail");
    loadTickets(); loadDashboard();
  } catch (e) { alert(e.message); }
}

async function updateTicket(id) {
  const body = {
    status: document.getElementById("dStatus").value,
    priority: document.getElementById("dPri").value,
  };
  // Apenas admin vê o dropdown de atribuir
  const dAssign = document.getElementById("dAssign");
  if (dAssign) {
    const a = dAssign.value;
    body.assignee_id = a ? parseInt(a) : null;
  }
  try {
    await api("/tickets/" + id, { method: "PATCH", body });
    closeModal("modalDetail");
    loadTickets(); loadDashboard();
  } catch (e) { alert(e.message); }
}

async function deleteTicket(id) {
  if (!confirm("Excluir este chamado permanentemente?")) return;
  try {
    await api("/tickets/" + id, { method: "DELETE" });
    closeModal("modalDetail");
    loadTickets(); loadDashboard();
  } catch (e) { alert(e.message); }
}

async function assignToMe(id) {
  try {
    await api("/tickets/" + id, { method: "PATCH", body: { assignee_id: me.id, status: "em_andamento" } });
    openTicketDetail(id);
    loadTickets(); loadDashboard();
  } catch (e) { alert(e.message); }
}

async function addComment(id) {
  const body = document.getElementById("dComment").value.trim();
  if (!body) return;
  try {
    await api(`/tickets/${id}/comments`, { method: "POST", body: { body } });
    openTicketDetail(id);
  } catch (e) { alert(e.message); }
}

/* ---------- KB ---------- */
async function loadArticles() {
  const q = document.getElementById("searchKb").value.trim();
  const list = await api("/articles" + (q ? "?q=" + encodeURIComponent(q) : ""));
  const box = document.getElementById("kbList");
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="big">📚</div>Nenhum artigo ainda</div>`;
    replayAnim(document.getElementById("page-kb"));
    return;
  }
  box.innerHTML = list.map(a => `
    <div class="kb-card" onclick="openArticle(${a.id})">
      <h4>${esc(a.title)}</h4>
      <p>${esc(a.body)}</p>
      <span class="tag">${esc(a.category)}</span>
    </div>`).join("");
  replayAnim(document.getElementById("page-kb"));
}

function openKbModal() {
  document.getElementById("kTitle").value = "";
  document.getElementById("kCat").value = "";
  document.getElementById("kBody").value = "";
  document.getElementById("kLinks").value = "";
  document.getElementById("kFiles").value = "";
  document.getElementById("kErr").textContent = "";
  document.getElementById("modalKb").classList.add("show");
}

async function createArticle() {
  const body = {
    title: document.getElementById("kTitle").value.trim(),
    category: document.getElementById("kCat").value.trim(),
    body: document.getElementById("kBody").value.trim(),
    links: document.getElementById("kLinks").value.trim() || null,
  };
  try {
    const created = await api("/articles", { method: "POST", body });
    // Upload de arquivos, se houver
    const files = document.getElementById("kFiles").files;
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`${API}/articles/${created.id}/attachments`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`${f.name}: ${err.detail || "erro no upload"}`);
      }
    }
    closeModal("modalKb");
    loadArticles();
  } catch (e) { document.getElementById("kErr").textContent = e.message; }
}

function formatBytes(b) {
  if (b < 1024) return b + " B";
  if (b < 1024*1024) return (b/1024).toFixed(1) + " KB";
  return (b/(1024*1024)).toFixed(1) + " MB";
}

function fileIcon(mime) {
  if (!mime) return "📎";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("zip") || mime.includes("compressed")) return "🗜️";
  if (mime.includes("msword") || mime.includes("officedocument")) return "📝";
  if (mime.includes("executable") || mime.includes("msdownload")) return "⚙️";
  return "📎";
}

async function openArticle(id) {
  const a = await api("/articles/" + id);

  // Links úteis
  let linksHtml = "";
  if (a.links && a.links.trim()) {
    const urls = a.links.split("\n").map(s => s.trim()).filter(Boolean);
    if (urls.length) {
      linksHtml = `
        <h4 style="margin:22px 0 10px">🔗 Links úteis</h4>
        <ul style="padding-left:20px;margin:0">
          ${urls.map(u => `<li style="margin-bottom:6px"><a href="${esc(u)}" target="_blank" rel="noopener" style="color:var(--lilac-600);word-break:break-all">${esc(u)}</a></li>`).join("")}
        </ul>`;
    }
  }

  // Anexos
  let filesHtml = "";
  if (a.attachments && a.attachments.length) {
    filesHtml = `
      <h4 style="margin:22px 0 10px">📎 Arquivos anexados</h4>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${a.attachments.map(f => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--lilac-50);border-radius:10px">
            <span style="font-size:22px">${fileIcon(f.mime_type)}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.original_name)}</div>
              <div style="font-size:11px;color:var(--muted)">${formatBytes(f.size)} • ${fmt(f.created_at)}</div>
            </div>
            <a class="btn-primary" style="padding:8px 14px;font-size:13px;text-decoration:none" href="${API}/uploads/${esc(f.stored_name)}" target="_blank" download="${esc(f.original_name)}">Baixar</a>
            ${isStaff() ? `<button class="btn-danger" style="padding:8px 10px" onclick="deleteAttachment(${f.id}, ${a.id})" title="Excluir anexo">🗑️</button>` : ""}
          </div>`).join("")}
      </div>`;
  }

  document.getElementById("kbViewContent").innerHTML = `
    <button class="close" onclick="closeModal('modalKbView')">×</button>
    <span class="tag">${esc(a.category)}</span>
    <h3 style="margin-top:10px">${esc(a.title)}</h3>
    <div style="color:var(--muted);font-size:12px;margin-bottom:14px">Por ${esc(a.author.name)} • ${fmt(a.updated_at)}</div>
    <div style="white-space:pre-wrap;line-height:1.6">${esc(a.body)}</div>
    ${linksHtml}
    ${filesHtml}
    ${isStaff() ? `<button class="btn-danger" style="margin-top:22px;width:100%" onclick="deleteArticle(${a.id})">Excluir artigo</button>` : ""}
  `;
  document.getElementById("modalKbView").classList.add("show");
}

async function deleteAttachment(attId, articleId) {
  if (!confirm("Excluir este anexo?")) return;
  try {
    await api("/attachments/" + attId, { method: "DELETE" });
    openArticle(articleId);
  } catch (e) { alert(e.message); }
}

async function deleteArticle(id) {
  if (!confirm("Excluir este artigo? Os arquivos anexados também serão removidos.")) return;
  await api("/articles/" + id, { method: "DELETE" });
  closeModal("modalKbView");
  loadArticles();
}

/* ---------- USERS (admin) ---------- */
async function loadUsers() {
  if (!isAdmin()) return;
  const list = await api("/users/with-stats");
  const roles = ["solicitante", "analista", "admin"];
  document.getElementById("usersBody").innerHTML = list.map(u => {
    const isMe = u.id === me.id;
    return `<tr>
      <td><b>${esc(u.name)}</b>${isMe ? ' <span style="color:var(--lilac-600);font-size:11px">(você)</span>' : ''}</td>
      <td>${esc(u.email)}</td>
      <td>
        <select onchange="changeRole(${u.id}, this.value)" ${isMe?'disabled':''}>
          ${roles.map(r => `<option value="${r}" ${u.role===r?'selected':''}>${r}</option>`).join("")}
        </select>
      </td>
      <td>${u.opened_count}</td>
      <td><b style="color:${u.assigned_open>0?'var(--pink-500)':'var(--muted)'}">${u.assigned_open}</b></td>
      <td>${u.assigned_total}</td>
      <td>
        <button class="btn-ghost" onclick="viewUserQueue(${u.id})" title="Ver caixa">👁️</button>
        ${isMe ? '' : `<button class="btn-danger" onclick="deleteUser(${u.id})" title="Excluir">🗑️</button>`}
      </td>
    </tr>`;
  }).join("");
  replayAnim(document.getElementById("page-users"));
}

async function changeRole(id, role) {
  try {
    await api(`/users/${id}/role?role=${role}`, { method: "PATCH" });
    loadUsers();
  } catch (e) { alert(e.message); loadUsers(); }
}

async function deleteUser(id) {
  if (!confirm("Excluir este usuário? Os chamados dele serão mantidos.")) return;
  try {
    await api("/users/" + id, { method: "DELETE" });
    loadUsers();
  } catch (e) { alert(e.message); }
}

function viewUserQueue(userId) {
  // Vai pra página de chamados já filtrando pela caixa do usuário
  navigate("tickets");
  setTimeout(() => {
    document.getElementById("filterAssignee").value = userId;
    loadTickets();
  }, 50);
}

/* ---------- PASSWORD / NOVO USUÁRIO ---------- */
function openPasswordModal() {
  ["pwdCurrent","pwdNew","pwdConfirm"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("pwdErr").textContent = "";
  document.getElementById("modalPwd").classList.add("show");
}

async function changePassword() {
  const current = document.getElementById("pwdCurrent").value;
  const next = document.getElementById("pwdNew").value;
  const confirm = document.getElementById("pwdConfirm").value;
  const err = document.getElementById("pwdErr");
  if (next.length < 6) { err.textContent = "A nova senha precisa ter pelo menos 6 caracteres."; return; }
  if (next !== confirm) { err.textContent = "A confirmação não confere."; return; }
  try {
    await api("/auth/change-password", { method: "POST", body: { current_password: current, new_password: next } });
    closeModal("modalPwd");
    alert("Senha alterada com sucesso.");
  } catch (e) { err.textContent = e.message; }
}

function openNewUserModal() {
  ["nuName","nuEmail","nuPass"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("nuRole").value = "solicitante";
  document.getElementById("nuErr").textContent = "";
  document.getElementById("modalNewUser").classList.add("show");
}

async function adminCreateUser() {
  const body = {
    name: document.getElementById("nuName").value.trim(),
    email: document.getElementById("nuEmail").value.trim(),
    password: document.getElementById("nuPass").value,
    role: document.getElementById("nuRole").value,
  };
  try {
    await api("/users", { method: "POST", body });
    closeModal("modalNewUser");
    loadUsers();
  } catch (e) { document.getElementById("nuErr").textContent = e.message; }
}

/* ---------- HELPERS ---------- */
function closeModal(id) { document.getElementById(id).classList.remove("show"); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmt(ts) {
  if (!ts) return "";
  // Backend envia datetimes em UTC sem o sufixo 'Z'. Força a interpretação como UTC
  // pra que o navegador converta corretamente pro fuso local (ex: America/Sao_Paulo).
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts) ? ts : ts + "Z";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function humanStatus(s) { return ({ aberto: "Aberto", em_andamento: "Em andamento", aguardando: "Aguardando", resolvido: "Resolvido", fechado: "Fechado" })[s] || s; }

document.querySelectorAll(".modal-bg").forEach(bg => {
  bg.addEventListener("click", e => { if (e.target === bg) bg.classList.remove("show"); });
});

/* ---------- INIT ---------- */
if (token && me) {
  api("/auth/me").then(u => { me = u; localStorage.setItem("hd_me", JSON.stringify(u)); showApp(); }).catch(() => logout());
}
