const STORAGE_KEY = "educagrana-data-v1";
const CATEGORIES = ["Alimentação", "Moradia", "Transporte", "Saúde", "Educação", "Lazer", "Compras", "Contas", "Outros"];
const DEFAULT_DATA = { transactions: [], cards: [], theme: "dark", hideValues: false };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const state = loadState();
let activeView = "dashboard";
let searchTerm = "";
let supabaseClient = null;
let currentUser = null;
let cloudSyncReady = false;
let cloudSaveTimer = null;
let cloudSaveQueue = Promise.resolve();
let authSessionVersion = 0;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return { ...DEFAULT_DATA, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch (error) {
    console.error("Não foi possível ler os dados salvos.", error);
    return { ...DEFAULT_DATA };
  }
}

function saveState() {
  try {
    const storageKey = currentUser ? `${STORAGE_KEY}:user:${currentUser.id}` : STORAGE_KEY;
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.error("Não foi possível salvar os dados.", error);
    toast("Não foi possível salvar. Verifique o espaço disponível no navegador.");
    return;
  }
  if (currentUser && cloudSyncReady) {
    window.clearTimeout(cloudSaveTimer);
    cloudSaveTimer = window.setTimeout(() => {
      cloudSaveQueue = cloudSaveQueue.then(() => syncStateToCloud()).catch((error) => {
        console.error("Não foi possível sincronizar os dados com sua conta.", error);
        toast("Alterações salvas neste dispositivo, mas a sincronização falhou.");
      });
    }, 500);
  }
}

function setState(data) {
  state.transactions = Array.isArray(data?.transactions) ? data.transactions : [];
  state.cards = Array.isArray(data?.cards) ? data.cards : [];
  state.theme = data?.theme === "light" ? "light" : "dark";
  state.hideValues = Boolean(data?.hideValues);
}

function getGuestData() {
  return loadState();
}

async function syncStateToCloud() {
  if (!supabaseClient || !currentUser || !cloudSyncReady) return;
  const { error } = await supabaseClient
    .from("educagrana_data")
    .upsert({ user_id: currentUser.id, data: { ...state } }, { onConflict: "user_id" });
  if (error) throw error;
}

function storageHasFinanceData(data) {
  return data.transactions.length > 0 || data.cards.length > 0;
}

function authErrorMessage(error) {
  const message = String(error?.message || "");
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar.";
  if (/user already registered/i.test(message)) return "Este e-mail já tem uma conta. Entre ou use a recuperação de senha.";
  if (/password should be at least/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/network|fetch/i.test(message)) return "Não foi possível conectar. Verifique sua internet e tente novamente.";
  return `Não foi possível concluir o acesso: ${message || "erro desconhecido"}`;
}

async function applyAuthSession(session) {
  const version = ++authSessionVersion;
  const nextUser = session?.user || null;
  const previousId = currentUser?.id || null;
  const nextId = nextUser?.id || null;
  if (previousId === nextId) {
    updateAccountButton();
    return;
  }

  cloudSyncReady = false;
  window.clearTimeout(cloudSaveTimer);
  currentUser = nextUser;
  if (!currentUser) {
    setState(getGuestData());
    render();
    updateAccountButton();
    return;
  }

  const cached = readUserCache(currentUser.id);
  setState(cached || { ...DEFAULT_DATA });
  render();
  updateAccountButton();
  const guestData = getGuestData();
  const { data, error } = await supabaseClient
    .from("educagrana_data")
    .select("data")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (version !== authSessionVersion) return;
  if (error) {
    console.error("Falha ao carregar os dados da conta.", error);
    toast("Não foi possível carregar seus dados da nuvem. Verifique as instruções de configuração.");
    return;
  }
  if (data?.data && typeof data.data === "object") {
    setState(data.data);
  } else {
    const initialData = cached || guestData;
    setState(initialData);
    if (storageHasFinanceData(initialData)) {
      toast("Seus lançamentos deste navegador foram adicionados à sua conta.");
    }
  }
  cloudSyncReady = true;
  saveState();
  render();
}

function readUserCache(userId) {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}:user:${userId}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? { ...DEFAULT_DATA, ...parsed } : null;
  } catch (error) {
    console.error("Não foi possível ler o cache da conta.", error);
    return null;
  }
}

function updateAccountButton() {
  const button = document.querySelector("#account-button");
  if (!button) return;
  if (currentUser) {
    button.textContent = currentUser.email || "Minha conta";
    button.dataset.action = "open-account";
    button.title = "Ver conta e sair";
    button.classList.add("signed-in");
  } else {
    button.textContent = "Entrar";
    button.dataset.action = "open-auth";
    button.title = "Criar conta ou entrar";
    button.classList.remove("signed-in");
  }
}

function initializeAuth() {
  const config = window.EDUCAGRANA_SUPABASE_CONFIG;
  if (!window.supabase?.createClient || !config?.url || !config?.anonKey) {
    updateAccountButton();
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        applyAuthSession(session).catch((error) => {
          console.error("Falha ao atualizar a sessão.", error);
          toast("Não foi possível carregar sua conta.");
        });
      }, 0);
    });
  } catch (error) {
    console.error("Não foi possível iniciar a autenticação.", error);
    toast("A configuração do Supabase está inválida.");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentTransactions(type) {
  return state.transactions.filter((item) => item.type === type && item.date.slice(0, 7) === monthKey());
}

function sum(items) {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

function formatMoney(value) {
  return state.hideValues ? "R$ ••••" : money.format(value);
}

function statCard(label, value, icon, tone, note = "") {
  return `<article class="stat-card"><div><p class="stat-label">${label}</p><p class="stat-value">${value}</p>${note ? `<p class="stat-note">${note}</p>` : ""}</div><span class="stat-icon ${tone}" aria-hidden="true">${icon}</span></article>`;
}

function pageHeading(title, description, actions = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p class="subtitle">${description}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector("#theme-icon").textContent = state.theme === "dark" ? "☼" : "☾";
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  document.querySelectorAll("[data-view]").forEach((button) => {
    const selected = button.dataset.view === activeView;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const views = {
    dashboard: renderDashboard,
    expenses: () => renderTransactions("expense"),
    income: () => renderTransactions("income"),
    cards: renderCards,
    settings: renderSettings
  };
  document.querySelector("#main-content").innerHTML = (views[activeView] || renderDashboard)();
}

function renderDashboard() {
  const income = sum(currentTransactions("income"));
  const expenses = sum(currentTransactions("expense"));
  const availableLimit = sum(state.cards.map((card) => ({ amount: card.limit })));
  const categories = CATEGORIES.map((category) => ({
    category,
    total: sum(currentTransactions("expense").filter((item) => item.category === category))
  })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
  const maxCategory = Math.max(1, ...categories.map((item) => item.total));
  const bars = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const key = monthKey(date);
    const total = sum(state.transactions.filter((item) => item.type === "expense" && item.date.slice(0, 7) === key));
    const height = total ? Math.max(7, total / Math.max(1, expenses, total) * 100) : 3;
    return `<div class="chart-column"><span class="chart-amount">${total ? formatMoney(total) : ""}</span><div class="chart-bar" style="height:${height}%"></div><span>${new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date)}</span></div>`;
  }).join("");
  const categoryContent = categories.length
    ? `<div class="category-list">${categories.slice(0, 6).map((item) => `<div class="category-row"><span class="category-name">${escapeHtml(item.category)}</span><div class="progress-track"><div class="progress-fill" style="width:${Math.max(4, item.total / maxCategory * 100)}%"></div></div><span class="category-amount">${formatMoney(item.total)}</span></div>`).join("")}</div>`
    : `<div class="empty-state">Nenhum gasto registrado neste mês</div>`;
  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const recentContent = recent.length ? `<div class="transaction-list">${recent.map(transactionRow).join("")}</div>` : `<div class="empty-state">Seus lançamentos recentes aparecerão aqui.</div>`;
  return `${pageHeading("Painel Financeiro", "Visão geral das suas finanças este mês", `<button class="button" data-action="export">↓ &nbsp;Baixar relatório</button><button class="button primary" data-action="new-expense">＋ &nbsp;Adicionar gasto</button>`)}
    <section class="stats-grid" aria-label="Resumo financeiro">
      ${statCard("Receita Mensal", formatMoney(income), "▣", "green")}
      ${statCard("Gastos do Mês", formatMoney(expenses), "↘", "red")}
      ${statCard("Saldo", formatMoney(income - expenses), "↗", "teal")}
      ${statCard("Limite Total", formatMoney(availableLimit), "▭", "", `${state.cards.length} cartão(ões)`)}
    </section>
    <section class="dashboard-panels">
      <article class="panel"><h2>Gastos por Categoria</h2>${categoryContent}</article>
      <article class="panel"><h2>Evolução Mensal</h2><div class="chart" aria-label="Gastos dos últimos seis meses">${bars}</div></article>
    </section>
    <article class="panel insight-panel"><div class="insight-header"><div class="insight-title"><span class="stat-icon">✦</span><div><h2>Análise das finanças</h2><p class="subtitle">Dicas rápidas com base nos seus lançamentos</p></div></div><button class="button" data-action="analyze">Analisar</button></div><p class="insight-copy" id="insight-copy">Confira seus dados e receba um resumo financeiro simples.</p></article>
    <section class="panel" style="margin-top:16px"><h2>Lançamentos recentes</h2>${recentContent}</section>`;
}

function renderTransactions(type) {
  const isExpense = type === "expense";
  const title = isExpense ? "Gastos" : "Receitas";
  const label = isExpense ? "gasto" : "receita";
  const filtered = state.transactions.filter((item) => item.type === type && `${item.description} ${item.category} ${item.date}`.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  const emptyState = isExpense
    ? "Nenhum gasto registrado. Adicione seu primeiro gasto para começar."
    : "Nenhuma receita registrada. Adicione sua primeira receita para começar.";
  const rows = filtered.length ? filtered.map(transactionRow).join("") : `<div class="empty-state">${emptyState}</div>`;
  return `${pageHeading(title, isExpense ? "Acompanhe para onde seu dinheiro está indo." : "Registre e acompanhe suas entradas de dinheiro.", `<button class="button primary" data-action="new-${label}">＋ &nbsp;Adicionar ${label}</button>`)}
    <section class="toolbar"><label class="search-field"><span class="sr-only">Buscar lançamentos</span><input type="search" id="transaction-search" placeholder="Buscar lançamento..." value="${escapeHtml(searchTerm)}"></label><button class="button" data-action="export">↓ &nbsp;Baixar relatório</button></section>
    <section class="transaction-list">${rows}</section>`;
}

function transactionRow(item) {
  const expense = item.type === "expense";
  const card = item.cardId ? state.cards.find((entry) => entry.id === item.cardId) : null;
  return `<article class="transaction"><div class="transaction-main"><span class="transaction-symbol">${expense ? "↘" : "↗"}</span><div><p class="transaction-name">${escapeHtml(item.description)}</p><p class="transaction-meta">${escapeHtml(item.category)} · ${dateFormat.format(new Date(`${item.date}T12:00:00`))}${card ? ` · ${escapeHtml(card.name)}` : ""}</p></div></div><div class="transaction-side"><span class="transaction-amount ${expense ? "expense" : "income"}">${expense ? "−" : "+"} ${formatMoney(Number(item.amount))}</span>${activeView !== "dashboard" ? `<button class="mini-action" data-action="delete-transaction" data-id="${escapeHtml(item.id)}" aria-label="Excluir ${escapeHtml(item.description)}" title="Excluir lançamento">×</button>` : ""}</div></article>`;
}

function renderCards() {
  const cards = state.cards.length
    ? `<div class="card-grid">${state.cards.map((card) => `<article><div class="bank-card"><div class="bank-card-top"><span>${escapeHtml(card.name)}</span><span class="card-brand">${escapeHtml(card.brand || "CARD")}</span></div><p class="card-limit-label">Limite total</p><p class="card-limit">${formatMoney(Number(card.limit))}</p><div class="bank-card-bottom"><span>Vencimento dia ${escapeHtml(card.dueDay)}</span><span>•••• ${escapeHtml(card.lastDigits || "0000")}</span></div></div><div class="card-row-actions"><button class="mini-action" data-action="delete-card" data-id="${escapeHtml(card.id)}" aria-label="Excluir cartão ${escapeHtml(card.name)}">Excluir cartão</button></div></article>`).join("")}</div>`
    : `<div class="empty-state">Você ainda não cadastrou nenhum cartão.</div>`;
  const limit = sum(state.cards.map((card) => ({ amount: card.limit })));
  return `${pageHeading("Cartões", "Tenha seus limites organizados em um só lugar.", `<button class="button primary" data-action="new-card">＋ &nbsp;Adicionar cartão</button>`)}<section class="stats-grid" style="margin-bottom:18px">${statCard("Limite total", formatMoney(limit), "▭", "")}${statCard("Cartões cadastrados", String(state.cards.length), "▣", "teal")}</section>${cards}`;
}

function renderSettings() {
  return `${pageHeading("Ajustes", "Personalize sua experiência no EducaGrana.")}
    <section class="settings-grid">
      <article class="setting-card"><h2>Aparência</h2><p>Escolha como o EducaGrana aparece no seu dispositivo.</p><div class="setting-row"><span>Tema escuro</span><button class="switch" data-action="toggle-theme" role="switch" aria-label="Tema escuro" aria-checked="${state.theme === "dark"}"></button></div></article>
      <article class="setting-card"><h2>Privacidade</h2><p>Oculte os valores financeiros na tela quando quiser mais privacidade.</p><div class="setting-row"><span>Ocultar valores</span><button class="switch" data-action="toggle-values" role="switch" aria-label="Ocultar valores" aria-checked="${state.hideValues}"></button></div></article>
      <article class="setting-card"><h2>Conta e sincronização</h2><p>${currentUser ? `Conectado como ${escapeHtml(currentUser.email || "sua conta")}. Seus dados são sincronizados com sua conta.` : "Entre ou crie uma conta para sincronizar seus dados entre dispositivos."}</p><div class="setting-row"><span>Estado</span><span>${currentUser ? "Sincronização ativada" : supabaseClient ? "Não conectado" : "Configuração pendente"}</span></div><button class="button" data-action="${currentUser ? "open-account" : "open-auth"}">${currentUser ? "Gerenciar conta" : "Criar conta ou entrar"}</button></article>
      <article class="setting-card"><h2>Seus dados</h2><p>${currentUser ? "Uma cópia também fica salva neste navegador para acesso mais rápido." : "Seus lançamentos estão salvos localmente neste navegador."}</p><div class="setting-row"><span>Lançamentos</span><span>${state.transactions.length}</span></div><div class="setting-row"><span>Cartões</span><span>${state.cards.length}</span></div><button class="button danger" data-action="clear-data">Apagar todos os dados</button></article>
      <article class="setting-card"><h2>EducaGrana</h2><p>Uma forma simples e prática de aprender a cuidar melhor do seu dinheiro.</p><div class="setting-row"><span>Versão</span><span>1.0</span></div></article>
    </section>`;
}

function toast(message) {
  const root = document.querySelector("#toast-root");
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  root.append(item);
  window.setTimeout(() => item.remove(), 3400);
}

function openModal(title, body, onSubmit) {
  const root = document.querySelector("#dialog-root");
  root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button></div><form id="modal-form"><div class="modal-body">${body}</div><div class="modal-footer"><button class="button" type="button" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">Salvar</button></div></form></section></div>`;
  root.querySelector("#modal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSubmit(formData);
  });
  root.querySelector(".modal-backdrop").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  root.querySelector("input, select")?.focus();
}

function closeModal() {
  document.querySelector("#dialog-root").innerHTML = "";
}

function openAuthModal(mode = "login") {
  const configured = Boolean(supabaseClient);
  const root = document.querySelector("#dialog-root");
  root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${mode === "signup" ? "Crie sua conta" : "Entre no EducaGrana"}</h2><button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button></div><div class="auth-content">
    ${configured ? "" : `<div class="setup-notice"><strong>Configuração necessária</strong><p>Para ativar o login, preencha a URL e a chave pública do seu projeto no arquivo <code>supabase-config.js</code> e configure o banco conforme o README.</p></div>`}
    <button class="button google-button" type="button" data-action="google-login" ${configured ? "" : "disabled"}><span class="google-g" aria-hidden="true">G</span>Continuar com Google</button>
    <div class="auth-divider"><span>ou use seu e-mail</span></div>
    <form id="auth-form"><div class="modal-body">
      <div class="field"><label for="auth-email">E-mail</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="voce@exemplo.com" required ${configured ? "" : "disabled"}></div>
      <div class="field"><label for="auth-password">Senha</label><input id="auth-password" name="password" type="password" minlength="6" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" placeholder="Mínimo de 6 caracteres" required ${configured ? "" : "disabled"}></div>
      <p class="auth-feedback" id="auth-feedback" role="status"></p>
    </div><div class="modal-footer"><button class="button primary" type="submit" ${configured ? "" : "disabled"}>${mode === "signup" ? "Criar conta" : "Entrar"}</button></div></form>
    <button class="auth-mode-toggle" type="button" data-action="toggle-auth-mode" data-mode="${mode}">${mode === "signup" ? "Já tem uma conta? Entrar" : "Ainda não tem conta? Criar conta"}</button>
  </div></section></div>`;
  root.querySelector(".modal-backdrop").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  root.querySelector("#auth-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));
    const operation = mode === "signup"
      ? supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
      : supabaseClient.auth.signInWithPassword({ email, password });
    operation.then(({ data, error }) => {
      const feedback = root.querySelector("#auth-feedback");
      if (error) {
        feedback.textContent = authErrorMessage(error);
        return;
      }
      if (mode === "signup" && !data.session) {
        feedback.textContent = "Conta criada. Confira sua caixa de entrada para confirmar o e-mail.";
        return;
      }
      closeModal();
      toast(mode === "signup" ? "Conta criada com sucesso." : "Login realizado com sucesso.");
    }).catch((error) => {
      console.error("Erro ao autenticar por e-mail.", error);
      root.querySelector("#auth-feedback").textContent = authErrorMessage(error);
    });
  });
  root.querySelector("#auth-email")?.focus();
}

async function signInWithGoogle() {
  if (!supabaseClient) {
    toast("Configure o Supabase para ativar o login.");
    return;
  }
  if (location.protocol === "file:") {
    toast("Abra o app em um endereço web seguro (HTTPS) para entrar com Google.");
    return;
  }
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname }
  });
  if (error) {
    console.error("Falha ao iniciar o login do Google.", error);
    toast(authErrorMessage(error));
  }
}

function openAccountModal() {
  const root = document.querySelector("#dialog-root");
  root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">Sua conta</h2><button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button></div><div class="modal-body"><p class="subtitle">Conectado como <strong>${escapeHtml(currentUser?.email || "usuário")}</strong>. Seus dados financeiros são sincronizados nesta conta.</p></div><div class="modal-footer"><button class="button danger" data-action="sign-out">Sair da conta</button></div></section></div>`;
  root.querySelector(".modal-backdrop").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
}

async function signOut() {
  if (!supabaseClient) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveQueue = cloudSaveQueue.then(() => syncStateToCloud());
  try {
    await cloudSaveQueue;
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    closeModal();
    toast("Você saiu da sua conta.");
  } catch (error) {
    console.error("Não foi possível sair da conta com segurança.", error);
    toast(authErrorMessage(error));
  }
}

async function shareApp() {
  const isLocalAddress = location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (isLocalAddress) {
    toast("Publique o app em uma hospedagem para compartilhar um link que outras pessoas possam abrir.");
    return;
  }
  const shareData = { title: "EducaGrana", text: "Organize suas finanças com o EducaGrana.", url: location.href };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(location.href);
      toast("Link do app copiado para compartilhar.");
    } else {
      const input = document.createElement("textarea");
      input.value = location.href;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("O navegador não permitiu copiar o link.");
      toast("Link do app copiado para compartilhar.");
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error("Não foi possível compartilhar o app.", error);
    toast("Não foi possível compartilhar o link neste navegador.");
  }
}

function transactionModal(type) {
  const isExpense = type === "expense";
  const today = new Date().toISOString().slice(0, 10);
  const options = CATEGORIES.map((category) => `<option>${category}</option>`).join("");
  const cardField = isExpense && state.cards.length ? `<div class="field full"><label for="entry-card">Cartão (opcional)</label><select id="entry-card" name="cardId"><option value="">Sem cartão</option>${state.cards.map((card) => `<option value="${escapeHtml(card.id)}">${escapeHtml(card.name)}</option>`).join("")}</select></div>` : "";
  openModal(isExpense ? "Adicionar gasto" : "Adicionar receita", `<div class="form-grid">
    <div class="field full"><label for="entry-description">Descrição</label><input id="entry-description" name="description" maxlength="70" placeholder="${isExpense ? "Ex.: Mercado" : "Ex.: Salário"}" required></div>
    <div class="field"><label for="entry-amount">Valor (R$)</label><input id="entry-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required></div>
    <div class="field"><label for="entry-date">Data</label><input id="entry-date" name="date" type="date" value="${today}" required></div>
    <div class="field full"><label for="entry-category">Categoria</label><select id="entry-category" name="category">${options}</select></div>${cardField}
  </div>`, (form) => {
    const amount = Number(form.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Informe um valor maior que zero.");
      return;
    }
    state.transactions.push({
      id: crypto.randomUUID(),
      type,
      description: String(form.get("description")).trim(),
      amount,
      date: String(form.get("date")),
      category: String(form.get("category")),
      cardId: String(form.get("cardId") || "")
    });
    saveState();
    closeModal();
    render();
    toast(isExpense ? "Gasto adicionado com sucesso." : "Receita adicionada com sucesso.");
  });
}

function cardModal() {
  openModal("Adicionar cartão", `<div class="form-grid">
    <div class="field full"><label for="card-name">Nome do cartão</label><input id="card-name" name="name" maxlength="40" placeholder="Ex.: Cartão principal" required></div>
    <div class="field"><label for="card-limit">Limite total (R$)</label><input id="card-limit" name="limit" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" required></div>
    <div class="field"><label for="card-due">Dia de vencimento</label><input id="card-due" name="dueDay" type="number" min="1" max="31" placeholder="10" required></div>
    <div class="field"><label for="card-brand">Bandeira (opcional)</label><input id="card-brand" name="brand" maxlength="20" placeholder="Ex.: Visa"></div>
    <div class="field"><label for="card-digits">Final do cartão (opcional)</label><input id="card-digits" name="lastDigits" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="1234"></div>
  </div>`, (form) => {
    const dueDay = Number(form.get("dueDay"));
    const limit = Number(form.get("limit"));
    if (!Number.isFinite(limit) || limit < 0 || dueDay < 1 || dueDay > 31) {
      toast("Confira o limite e o dia de vencimento.");
      return;
    }
    state.cards.push({
      id: crypto.randomUUID(),
      name: String(form.get("name")).trim(),
      limit,
      dueDay,
      brand: String(form.get("brand")).trim(),
      lastDigits: String(form.get("lastDigits")).trim()
    });
    saveState();
    closeModal();
    render();
    toast("Cartão adicionado com sucesso.");
  });
}

function analyzeSpending() {
  const expenses = currentTransactions("expense");
  const income = sum(currentTransactions("income"));
  const total = sum(expenses);
  const root = document.querySelector("#insight-copy");
  if (!expenses.length) {
    root.textContent = "Adicione alguns gastos para acompanhar suas categorias e receber dicas mais úteis.";
    return;
  }
  const top = CATEGORIES.map((category) => ({ category, total: sum(expenses.filter((item) => item.category === category)) })).sort((a, b) => b.total - a.total)[0];
  const balance = income - total;
  root.textContent = `${top.category} é sua categoria com maior gasto neste mês (${formatMoney(top.total)}). ${income ? `Seu saldo do mês é ${formatMoney(balance)}.` : "Cadastre suas receitas para comparar entradas e saídas."} ${total > income && income ? "Se puder, revise seus gastos para que fiquem dentro da sua renda." : "Continue acompanhando seus lançamentos para manter tudo sob controle."}`;
}

function exportReport() {
  const rows = [["Tipo", "Descrição", "Categoria", "Data", "Valor (R$)", "Cartão"]];
  for (const item of state.transactions) {
    const card = state.cards.find((entry) => entry.id === item.cardId);
    rows.push([item.type === "expense" ? "Gasto" : "Receita", item.description, item.category, item.date, Number(item.amount).toFixed(2), card?.name || ""]);
  }
  const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `educagrana-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Relatório baixado.");
}

function handleAction(action, element) {
  if (action === "new-expense") transactionModal("expense");
  if (action === "new-receita") transactionModal("income");
  if (action === "new-gasto") transactionModal("expense");
  if (action === "new-card") cardModal();
  if (action === "export") exportReport();
  if (action === "analyze") analyzeSpending();
  if (action === "close-modal") closeModal();
  if (action === "open-auth") openAuthModal();
  if (action === "open-account") openAccountModal();
  if (action === "toggle-auth-mode") openAuthModal(element.dataset.mode === "signup" ? "login" : "signup");
  if (action === "google-login") signInWithGoogle().catch((error) => {
    console.error("Falha ao iniciar o login do Google.", error);
    toast(authErrorMessage(error));
  });
  if (action === "sign-out") signOut();
  if (action === "toggle-theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    saveState();
    render();
  }
  if (action === "toggle-values") {
    state.hideValues = !state.hideValues;
    saveState();
    render();
  }
  if (action === "clear-data" && window.confirm("Tem certeza que deseja apagar todos os lançamentos e cartões deste navegador? Esta ação não pode ser desfeita.")) {
    state.transactions = [];
    state.cards = [];
    saveState();
    render();
    toast("Seus dados foram apagados.");
  }
  if (action === "delete-transaction") {
    const transaction = state.transactions.find((item) => item.id === element.dataset.id);
    if (transaction && window.confirm(`Excluir "${transaction.description}"?`)) {
      state.transactions = state.transactions.filter((item) => item.id !== transaction.id);
      saveState();
      render();
      toast("Lançamento excluído.");
    }
  }
  if (action === "delete-card") {
    const card = state.cards.find((item) => item.id === element.dataset.id);
    if (card && window.confirm(`Excluir o cartão "${card.name}"? Os gastos associados continuarão salvos.`)) {
      state.cards = state.cards.filter((item) => item.id !== card.id);
      saveState();
      render();
      toast("Cartão excluído.");
    }
  }
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    activeView = viewButton.dataset.view;
    searchTerm = "";
    render();
    document.querySelector("#main-content").focus({ preventScroll: true });
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) handleAction(actionButton.dataset.action, actionButton);
});

document.addEventListener("input", (event) => {
  if (event.target.id === "transaction-search") {
    const position = event.target.selectionStart;
    searchTerm = event.target.value;
    const main = document.querySelector("#main-content");
    const scroll = main.scrollTop;
    main.innerHTML = renderTransactions(activeView === "income" ? "income" : "expense");
    const input = document.querySelector("#transaction-search");
    input.focus();
    input.setSelectionRange(position, position);
    main.scrollTop = scroll;
  }
});

document.querySelector("#theme-toggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveState();
  render();
});

document.querySelector("#share-app").addEventListener("click", shareApp);
render();
initializeAuth();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.error("Falha ao registrar modo offline.", error));
  });
}
