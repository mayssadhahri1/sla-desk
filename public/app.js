// Interface web de SLA Desk : appelle l'API REST et affiche tableau de bord, tickets et détails

const $ = (id) => document.getElementById(id);

const LABELS = {
  priority: { critical: "Critique", high: "Haute", medium: "Moyenne", low: "Basse" },
  status: { open: "Ouvert", in_progress: "En cours", resolved: "Résolu", closed: "Fermé" },
  category: { bug: "Bug", access: "Accès", billing: "Facturation", feature: "Évolution", other: "Autre" },
  role: { admin: "Administrateur", agent: "Agent", client: "Client" },
  sla: { ok: "Dans les délais", at_risk: "À risque", breached: "Dépassé", met: "Respecté" },
};

const state = { token: null, user: null, page: 1, pageSize: 10, total: 0, agents: [] };

// ---------- Utilitaires ----------

// Échappe le texte avant insertion dans le HTML (protection contre l'injection de code)
function esc(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function badge(kind, value) {
  const prefix = kind === "priority" ? "p" : kind === "status" ? "s" : "sla";
  return `<span class="badge ${prefix}-${value}">${esc(LABELS[kind][value])}</span>`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// « 2 h 15 restantes » ou « dépassé de 40 min »
function formatRemaining(minutes) {
  const abs = Math.abs(minutes);
  const text = abs >= 1440 ? `${Math.floor(abs / 1440)} j ${Math.floor((abs % 1440) / 60)} h`
    : abs >= 60 ? `${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, "0")}`
    : `${abs} min`;
  return minutes >= 0 ? `${text} restantes` : `dépassé de ${text}`;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2500);
}

// Le stockage du navigateur peut être indisponible : on protège chaque accès
const storage = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* ignoré */ } },
  remove(key) { try { sessionStorage.removeItem(key); } catch { /* ignoré */ } },
};

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && state.token) {
    logout();
    throw new Error("Session expirée, reconnectez-vous.");
  }
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Erreur inattendue");
  return data;
}

const isStaff = () => state.user && state.user.role !== "client";

// ---------- Connexion ----------

async function login(email, password) {
  const { token, user } = await api("/auth/login", { method: "POST", body: { email, password } });
  state.token = token;
  state.user = user;
  storage.set("sla-desk-token", token);
  await startApp();
}

function logout() {
  state.token = null;
  state.user = null;
  storage.remove("sla-desk-token");
  $("app-view").hidden = true;
  $("drawer").hidden = true;
  $("login-view").hidden = false;
}

async function startApp() {
  $("login-view").hidden = true;
  $("app-view").hidden = false;
  $("user-badge").innerHTML = `${esc(state.user.name)} · <strong>${esc(LABELS.role[state.user.role])}</strong>`;
  if (isStaff()) state.agents = await api("/users/agents");
  await refresh();
}

async function refresh() {
  await Promise.all([loadStats(), loadTickets()]);
}

// ---------- Tableau de bord ----------

function bars(container, entries, labels) {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  container.innerHTML = entries.length
    ? entries.map(([key, value]) => `
        <div class="bar-row"><span>${esc(labels ? labels[key] : key)}</span>
          <div class="bar"><span style="width:${(100 * value) / max}%"></span></div><b>${value}</b></div>`).join("")
    : '<p class="empty">Aucun ticket en cours.</p>';
}

async function loadStats() {
  const s = await api("/stats");
  const pct = (v) => (v === null ? "—" : `${v} %`);
  $("kpis").innerHTML = `
    <div class="kpi"><span>Tickets actifs</span><strong>${s.active}</strong><small>sur ${s.total} au total</small></div>
    <div class="kpi ko"><span>SLA dépassés</span><strong>${s.breached}</strong><small>tickets actifs</small></div>
    <div class="kpi risk"><span>À risque</span><strong>${s.atRisk}</strong><small>plus de 75 % du délai</small></div>
    <div class="kpi ok"><span>Réponse à temps</span><strong>${pct(s.responseCompliance)}</strong><small>objectif de 1re réponse</small></div>
    <div class="kpi ok"><span>Résolution à temps</span><strong>${pct(s.resolutionCompliance)}</strong><small>tickets résolus</small></div>
    <div class="kpi"><span>Résolution moyenne</span><strong>${s.avgResolutionHours ?? "—"}${s.avgResolutionHours !== null ? " h" : ""}</strong><small>depuis l'ouverture</small></div>`;
  bars($("chart-priority"), Object.entries(s.byPriority).reverse(), LABELS.priority);
  bars($("chart-status"), Object.entries(s.byStatus), LABELS.status);
  bars($("chart-workload"), s.workload.map((w) => [w.agent, w.active]));
}

// ---------- Liste des tickets ----------

async function loadTickets() {
  const params = new URLSearchParams({ page: state.page, pageSize: state.pageSize });
  if ($("f-status").value) params.set("status", $("f-status").value);
  if ($("f-priority").value) params.set("priority", $("f-priority").value);
  if ($("f-search").value.trim()) params.set("search", $("f-search").value.trim());

  const { items, total } = await api(`/tickets?${params}`);
  state.total = total;
  $("ticket-rows").innerHTML = items.length
    ? items.map((t) => {
        const active = t.status === "open" || t.status === "in_progress";
        const target = t.firstResponseAt ? t.sla.resolution : t.sla.response;
        const hint = active && target.remainingMinutes !== null ? `<span class="sub">${formatRemaining(target.remainingMinutes)}</span>` : "";
        return `
          <tr data-id="${t.id}">
            <td>#${t.id}</td>
            <td><span class="subject">${esc(t.title)}</span><span class="sub">${esc(LABELS.category[t.category])} · ${formatDate(t.createdAt)}</span></td>
            <td>${badge("priority", t.priority)}</td>
            <td>${badge("status", t.status)}</td>
            <td>${esc(t.requesterName)}</td>
            <td>${t.assigneeName ? esc(t.assigneeName) : '<span class="sub">Non affecté</span>'}</td>
            <td>${badge("sla", t.sla.overall)}${hint}</td>
          </tr>`;
      }).join("")
    : '<tr><td colspan="7" class="empty">Aucun ticket ne correspond à ces filtres.</td></tr>';

  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  $("page-info").textContent = `Page ${state.page} / ${pages} · ${total} ticket(s)`;
  $("prev").disabled = state.page <= 1;
  $("next").disabled = state.page >= pages;
}

// ---------- Détail d'un ticket ----------

function slaBlock(title, target, start) {
  const colors = { ok: "var(--ok)", met: "var(--ok)", at_risk: "var(--risk)", breached: "var(--ko)" };
  const totalMs = Date.parse(target.dueAt) - Date.parse(start);
  const ratio = target.remainingMinutes === null ? 1 : Math.min(1, Math.max(0, 1 - (target.remainingMinutes * 60000) / totalMs));
  const when = target.remainingMinutes === null ? `Échéance : ${formatDate(target.dueAt)}` : formatRemaining(target.remainingMinutes);
  return `
    <div class="sla-item">
      <span>${title}</span> ${badge("sla", target.state)}
      <div class="progress"><i style="width:${Math.round(ratio * 100)}%;background:${colors[target.state]}"></i></div>
      <div class="when">${esc(when)}</div>
    </div>`;
}

async function openTicket(id) {
  const t = await api(`/tickets/${id}`);
  const assign = isStaff() && t.status !== "closed"
    ? `<select id="d-assignee" ${state.user.role === "agent" ? "data-agent" : ""}>
         <option value="">Non affecté</option>
         ${state.agents.map((a) => `<option value="${a.id}" ${a.id === t.assigneeId ? "selected" : ""}
           ${state.user.role === "agent" && a.id !== state.user.id ? "disabled" : ""}>${esc(a.name)}</option>`).join("")}
       </select>`
    : "";

  $("drawer-content").innerHTML = `
    <div class="d-head">
      <h2>#${t.id} · ${esc(t.title)}</h2>
      <div class="d-meta">${badge("priority", t.priority)} ${badge("status", t.status)}
        <span class="badge s-closed">${esc(LABELS.category[t.category])}</span></div>
    </div>
    <div class="card"><p class="d-desc">${esc(t.description)}</p>
      <p class="sub">Ouvert par <b>${esc(t.requesterName)}</b> le ${formatDate(t.createdAt)} · Agent : <b>${esc(t.assigneeName ?? "non affecté")}</b></p></div>
    <div class="card"><h2>Engagements SLA</h2><div class="sla-box">
      ${slaBlock("Première réponse", t.sla.response, t.createdAt)}
      ${slaBlock("Résolution", t.sla.resolution, t.createdAt)}
    </div></div>
    ${t.actions.length || assign ? `<div class="card"><h2>Actions</h2><div class="d-actions">
      ${t.actions.map((a) => `<button class="btn btn-ghost btn-sm" data-status="${a.to}">${esc(a.label)}</button>`).join("")}
      ${assign}</div></div>` : ""}
    <div class="card"><h2>Échanges</h2>
      <div class="thread">${t.comments.length ? t.comments.map((c) => `
        <div class="msg ${c.authorRole !== "client" ? "staff" : ""} ${c.internal ? "internal" : ""}">
          <header><b>${esc(c.authorName)}${c.internal ? " · note interne" : ""}</b><span>${formatDate(c.createdAt)}</span></header>
          <p>${esc(c.body)}</p></div>`).join("") : '<p class="empty">Aucun message pour l\'instant.</p>'}</div>
      ${t.status !== "closed" ? `<form id="comment-form" class="stack">
        <textarea id="comment-body" rows="3" placeholder="Écrire une réponse…" required></textarea>
        <div class="actions">
          ${isStaff() ? '<label class="check"><input type="checkbox" id="comment-internal" /> Note interne (invisible pour le client)</label>' : ""}
          <button class="btn btn-primary btn-sm" type="submit">Envoyer</button></div>
      </form>` : ""}
    </div>
    <div class="card"><h2>Historique</h2><ul class="timeline">
      ${t.events.map((e) => `<li><span>${formatDate(e.createdAt)}</span><span><b>${esc(e.actorName)}</b> — ${esc(e.detail)}</span></li>`).join("")}
    </ul></div>`;

  $("drawer").hidden = false;
  $("drawer").dataset.id = t.id;
}

async function afterChange(id, message) {
  toast(message);
  await Promise.all([openTicket(id), refresh()]);
}

// ---------- Événements ----------

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").hidden = true;
  try {
    await login($("login-email").value, $("login-password").value);
  } catch (err) {
    $("login-error").textContent = err.message;
    $("login-error").hidden = false;
  }
});

document.querySelectorAll("[data-demo]").forEach((btn) =>
  btn.addEventListener("click", () => {
    $("login-email").value = btn.dataset.demo;
    $("login-password").value = "Demo1234!";
  }),
);

$("logout").addEventListener("click", logout);

let searchTimer;
$("f-search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.page = 1; loadTickets(); }, 300);
});
["f-status", "f-priority"].forEach((id) => $(id).addEventListener("change", () => { state.page = 1; loadTickets(); }));
$("prev").addEventListener("click", () => { state.page -= 1; loadTickets(); });
$("next").addEventListener("click", () => { state.page += 1; loadTickets(); });

$("ticket-rows").addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-id]");
  if (row) openTicket(row.dataset.id).catch((err) => toast(err.message));
});

$("drawer-close").addEventListener("click", () => ($("drawer").hidden = true));
$("drawer").addEventListener("click", (e) => { if (e.target === $("drawer")) $("drawer").hidden = true; });

// Délégation d'événements dans le panneau (son contenu est régénéré à chaque ouverture)
$("drawer-content").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-status]");
  if (!btn) return;
  const id = $("drawer").dataset.id;
  try {
    await api(`/tickets/${id}/status`, { method: "PATCH", body: { status: btn.dataset.status } });
    await afterChange(id, "Statut mis à jour");
  } catch (err) { toast(err.message); }
});

$("drawer-content").addEventListener("change", async (e) => {
  if (e.target.id !== "d-assignee") return;
  const id = $("drawer").dataset.id;
  try {
    await api(`/tickets/${id}/assignee`, { method: "PATCH", body: { assigneeId: e.target.value ? Number(e.target.value) : null } });
    await afterChange(id, "Affectation mise à jour");
  } catch (err) { toast(err.message); openTicket(id); }
});

$("drawer-content").addEventListener("submit", async (e) => {
  if (e.target.id !== "comment-form") return;
  e.preventDefault();
  const id = $("drawer").dataset.id;
  try {
    await api(`/tickets/${id}/comments`, {
      method: "POST",
      body: { body: $("comment-body").value, internal: $("comment-internal")?.checked ?? false },
    });
    await afterChange(id, "Message envoyé");
  } catch (err) { toast(err.message); }
});

$("new-ticket").addEventListener("click", () => {
  $("ticket-form").reset();
  $("ticket-error").hidden = true;
  $("ticket-dialog").showModal();
});
$("ticket-cancel").addEventListener("click", () => $("ticket-dialog").close());
$("ticket-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const t = await api("/tickets", {
      method: "POST",
      body: {
        title: $("t-title").value,
        description: $("t-description").value,
        priority: $("t-priority").value,
        category: $("t-category").value,
      },
    });
    $("ticket-dialog").close();
    await refresh();
    await openTicket(t.id);
    toast("Ticket créé");
  } catch (err) {
    $("ticket-error").textContent = err.message;
    $("ticket-error").hidden = false;
  }
});

// ---------- Démarrage : reprise de session si un jeton existe ----------

(async () => {
  const saved = storage.get("sla-desk-token");
  if (saved) {
    state.token = saved;
    try {
      state.user = await api("/auth/me");
      await startApp();
      return;
    } catch {
      logout();
    }
  }
  $("login-view").hidden = false;
})();
