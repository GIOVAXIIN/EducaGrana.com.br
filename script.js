const STORAGE_KEY = "educagrana-local-v1";
const STORAGE_OWNER_KEY = `${STORAGE_KEY}:owner`;
const CATEGORIES = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Assinaturas", "Outros"];
const PAYMENTS = ["Pix", "Dinheiro", "Débito", "Crédito", "Boleto"];
const FREQUENCIES = ["Mensal", "Quinzenal", "Semanal", "Anual"];
const CATEGORY_MARKS = { Moradia: "⌂", Alimentação: "＋", Transporte: "↗", Saúde: "+", Educação: "▤", Lazer: "○", Assinaturas: "↻", Outros: "·" };
const EMPTY_STATE = { expenses: [], cards: [], incomes: [], theme: "light" };

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return structuredClone(EMPTY_STATE);
    return {
      expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
      cards: Array.isArray(saved.cards) ? saved.cards : [],
      incomes: Array.isArray(saved.incomes) ? saved.incomes : [],
      theme: saved.theme === "dark" ? "dark" : "light"
    };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

let state = loadState();
let toastTimer;
let calculatorMode = "installment";
const dialog = document.querySelector("#record-dialog");
const recordForm = document.querySelector("#record-form");
const authDialog = document.querySelector("#auth-dialog");
const authForm = document.querySelector("#auth-form");
const authNotice = document.querySelector("#auth-notice");
let supabaseClient = null;
let authUser = null;
let cloudReady = false;
let cloudLoading = false;
let cloudSaveTimer = 0;
let authMode = "login";
let authSetupError = "";

const supabaseConfig = window.EDUCAGRANA_SUPABASE_CONFIG || {};
if (supabaseConfig.url && supabaseConfig.anonKey) {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabaseClient = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch {
    authSetupError = "Não foi possível carregar o serviço de contas. Verifique sua conexão.";
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (authUser) localStorage.setItem(STORAGE_OWNER_KEY, authUser.id);
    if (cloudReady && !cloudLoading) scheduleCloudSave();
    return true;
  } catch {
    showToast("Não foi possível salvar. Verifique o espaço disponível neste navegador.");
    return false;
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function setAuthNotice(message, kind = "info") {
  authNotice.textContent = message;
  authNotice.dataset.kind = kind;
  authNotice.hidden = !message;
}

function setAuthMode(mode) {
  authMode = mode;
  const resetMode = mode === "forgot";
  const updateMode = mode === "update";
  const copy = {
    login: ["Entrar na sua conta", "Acesse seus dados sincronizados.", "Entrar"],
    signup: ["Criar sua conta", "Seus dados serão sincronizados entre dispositivos.", "Criar conta"],
    forgot: ["Recuperar senha", "Enviaremos um link de redefinição para seu e-mail.", "Enviar link"],
    update: ["Definir nova senha", "Escolha uma nova senha para sua conta.", "Salvar senha"]
  }[mode];
  document.querySelector("#auth-title").textContent = copy[0];
  document.querySelector("#auth-description").textContent = copy[1];
  document.querySelector("#auth-submit").textContent = copy[2];
  document.querySelector("#auth-password-field").hidden = resetMode;
  document.querySelector("#auth-password").required = !resetMode;
  document.querySelector("#auth-password").autocomplete = mode === "signup" || updateMode ? "new-password" : "current-password";
  document.querySelector("#auth-forgot").hidden = mode !== "login";
  document.querySelector("#auth-mode-toggle").hidden = resetMode || updateMode;
  document.querySelector("#auth-mode-toggle").textContent = mode === "signup" ? "Já tem conta? Entrar" : "Criar conta";
  setAuthNotice("");
}

function updateAccountUI() {
  const connected = Boolean(authUser);
  document.querySelector("#account-label").textContent = connected ? "Conta" : "Entrar";
  document.querySelector("#account-toggle").setAttribute("aria-label", connected ? "Abrir conta" : "Entrar na conta");
  document.querySelector("#account-badge").textContent = connected ? "NUVEM" : "LOCAL";
  document.querySelector("#account-status").textContent = connected
    ? `Conectado como ${authUser.email}.`
    : supabaseClient
      ? "Entre ou crie uma conta para sincronizar seu progresso entre dispositivos."
      : "A conta na nuvem ainda precisa ser configurada. O app continua salvando localmente.";
  document.querySelector("#storage-description").textContent = connected
    ? "Seus registros são sincronizados com sua conta e mantidos em cópia neste navegador."
    : "Sem uma conta conectada, os registros ficam apenas neste navegador.";
  document.querySelector("#account-open").hidden = connected;
  document.querySelector("#account-signout").hidden = !connected;
}

function openAccountDialog() {
  if (authUser) {
    showView("settings");
    document.querySelector("#account-settings").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  setAuthMode("login");
  authDialog.showModal();
  authForm.querySelectorAll("input, .auth-links button, #auth-submit").forEach((control) => {
    control.disabled = !supabaseClient;
  });
  if (!supabaseClient) {
    setAuthNotice(authSetupError || "Para ativar contas, configure o projeto Supabase e supabase-config.js.", "warning");
    return;
  }
  document.querySelector("#auth-email").focus();
}

document.querySelector("#account-toggle").addEventListener("click", openAccountDialog);
document.querySelector("#account-open").addEventListener("click", openAccountDialog);
document.querySelector("#auth-mode-toggle").addEventListener("click", () => setAuthMode(authMode === "signup" ? "login" : "signup"));
document.querySelector("#auth-forgot").addEventListener("click", () => setAuthMode("forgot"));
authDialog.addEventListener("click", (event) => {
  if (event.target === authDialog || event.target.closest("[data-auth-close]")) authDialog.close();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authForm.reportValidity()) return;
  if (!supabaseClient) {
    setAuthNotice(authSetupError || "Configure supabase-config.js e as políticas SQL antes de ativar contas.", "warning");
    return;
  }

  const submitButton = document.querySelector("#auth-submit");
  const email = document.querySelector("#auth-email").value.trim();
  const password = document.querySelector("#auth-password").value;
  submitButton.disabled = true;
  setAuthNotice("");
  try {
    let result;
    if (authMode === "login") {
      result = await supabaseClient.auth.signInWithPassword({ email, password });
    } else if (authMode === "signup") {
      result = await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    } else if (authMode === "forgot") {
      result = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    } else {
      result = await supabaseClient.auth.updateUser({ password });
    }

    if (result.error) {
      setAuthNotice(result.error.message, "warning");
      return;
    }
    if (authMode === "signup" && !result.data.session) {
      setAuthNotice("Confira seu e-mail e confirme a conta para continuar.");
      return;
    }
    if (authMode === "forgot") {
      setAuthNotice("Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
      return;
    }
    if (authMode === "update") showToast("Senha atualizada.");
    else showToast(authMode === "signup" ? "Conta criada." : "Login concluído.");
    authDialog.close();
  } catch {
    setAuthNotice("Não foi possível concluir a solicitação. Tente novamente.", "warning");
  } finally {
    submitButton.disabled = false;
  }
});

async function signOut() {
  if (!supabaseClient || !authUser) return;
  await writeCloudProgress();
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showToast("Não foi possível sair da conta.");
    return;
  }
  window.clearTimeout(cloudSaveTimer);
  authUser = null;
  cloudReady = false;
  state = structuredClone(EMPTY_STATE);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_OWNER_KEY);
  renderAll();
  updateAccountUI();
  setSyncStatus("Você saiu. Seu progresso permanece na conta.");
  showToast("Sessão encerrada.");
}

document.querySelector("#account-signout").addEventListener("click", signOut);

function monthlyIncome(income) {
  const amount = Number(income.amount) || 0;
  if (!income.active) return 0;
  if (income.frequency === "Quinzenal") return amount * 2;
  if (income.frequency === "Semanal") return amount * 52 / 12;
  if (income.frequency === "Anual") return amount / 12;
  return amount;
}

function normalizeCloudState(value) {
  return {
    expenses: Array.isArray(value?.expenses) ? value.expenses : [],
    cards: Array.isArray(value?.cards) ? value.cards : [],
    incomes: Array.isArray(value?.incomes) ? value.incomes : [],
    theme: value?.theme === "dark" ? "dark" : "light"
  };
}

function hasSavedRecords(value) {
  return value.expenses.length > 0 || value.cards.length > 0 || value.incomes.length > 0;
}

function mergePendingState(remote, local) {
  const mergeRecords = (remoteRecords, localRecords) => {
    const records = [...remoteRecords];
    const ids = new Set(records.map((record) => record.id));
    localRecords.forEach((record) => {
      if (!ids.has(record.id)) records.push(record);
    });
    return records;
  };
  return {
    expenses: mergeRecords(remote.expenses, local.expenses),
    cards: mergeRecords(remote.cards, local.cards),
    incomes: mergeRecords(remote.incomes, local.incomes),
    theme: remote.theme || local.theme
  };
}

function setSyncStatus(message) {
  document.querySelector("#sync-status").textContent = message;
}

async function writeCloudProgress() {
  if (!supabaseClient || !authUser || !cloudReady) return;
  setSyncStatus("Sincronizando progresso…");
  const { error } = await supabaseClient.from("finance_progress").upsert({
    user_id: authUser.id,
    data: state,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) {
    setSyncStatus("Não foi possível sincronizar. Os dados continuam salvos neste navegador.");
    return;
  }
  setSyncStatus("Progresso sincronizado com sua conta.");
}

function scheduleCloudSave() {
  if (!cloudReady || !authUser) return;
  window.clearTimeout(cloudSaveTimer);
  setSyncStatus("Sincronização pendente…");
  cloudSaveTimer = window.setTimeout(() => { void writeCloudProgress(); }, 700);
}

async function applyAuthSession(session) {
  const user = session?.user;
  if (!user) {
    if (authUser || localStorage.getItem(STORAGE_OWNER_KEY)) {
      authUser = null;
      cloudReady = false;
      cloudLoading = true;
      window.clearTimeout(cloudSaveTimer);
      state = structuredClone(EMPTY_STATE);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_OWNER_KEY);
      cloudLoading = false;
      renderAll();
    }
    updateAccountUI();
    setSyncStatus("Conecte sua conta para sincronizar o progresso.");
    return;
  }
  if (cloudReady && authUser?.id === user.id) return;

  authUser = user;
  cloudReady = false;
  cloudLoading = true;
  updateAccountUI();
  setSyncStatus("Carregando seu progresso…");

  const localOwner = localStorage.getItem(STORAGE_OWNER_KEY);
  const cachedState = localOwner && localOwner !== user.id ? structuredClone(EMPTY_STATE) : loadState();
  const { data, error } = await supabaseClient
    .from("finance_progress")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    cloudLoading = false;
    setSyncStatus("Falha ao carregar a nuvem. Seus dados locais foram mantidos.");
    showToast("Não foi possível carregar o progresso da conta.");
    return;
  }

  let shouldUpload = false;
  if (data?.data) {
    const remoteState = normalizeCloudState(data.data);
    const hasAnonymousLocalData = !localOwner && hasSavedRecords(cachedState);
    state = hasAnonymousLocalData ? mergePendingState(remoteState, cachedState) : remoteState;
    shouldUpload = hasAnonymousLocalData;
  } else {
    state = cachedState;
    shouldUpload = hasSavedRecords(cachedState);
  }

  localStorage.setItem(STORAGE_OWNER_KEY, user.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  cloudLoading = false;
  cloudReady = true;
  renderAll();
  updateAccountUI();
  setSyncStatus(data ? "Progresso carregado da sua conta." : "Conta conectada. Seu progresso será salvo na nuvem.");
  if (shouldUpload) scheduleCloudSave();
}

async function initializeCloudAuth() {
  if (!supabaseClient) {
    updateAccountUI();
    setSyncStatus(authSetupError || "Seus registros ficam neste navegador até configurar uma conta.");
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    setSyncStatus("Não foi possível verificar sua sessão. Tente entrar novamente.");
    return;
  }
  await applyAuthSession(data.session);
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      setAuthMode("update");
      authDialog.showModal();
      setAuthNotice("Defina uma nova senha para sua conta.");
    }
    window.setTimeout(() => { void applyAuthSession(session); }, 0);
  });
  window.addEventListener("online", scheduleCloudSave);
}

function activeMonthExpenses() {
  const currentMonth = monthKey();
  return state.expenses.filter((expense) => expense.date?.slice(0, 7) === currentMonth);
}

function showView(name) {
  document.querySelectorAll("[data-page]").forEach((view) => {
    const visible = view.dataset.page === name;
    view.hidden = !visible;
    view.classList.toggle("is-visible", visible);
  });
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === name));
  if (name === "income") renderIncomeCalendar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
document.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => openRecordDialog(button.dataset.open)));

document.querySelector("#theme-toggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  persist();
});

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function renderDashboard() {
  const expenses = activeMonthExpenses();
  const expenseTotal = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const incomeTotal = state.incomes.reduce((sum, item) => sum + monthlyIncome(item), 0);
  const limitTotal = state.cards.reduce((sum, item) => sum + (Number(item.limit) || 0), 0);
  document.querySelector("#metric-income").textContent = money(incomeTotal);
  document.querySelector("#metric-expenses").textContent = money(expenseTotal);
  document.querySelector("#metric-balance").textContent = money(incomeTotal - expenseTotal);
  document.querySelector("#metric-limits").textContent = money(limitTotal);
  document.querySelector("#expense-count").textContent = `${expenses.length} ${expenses.length === 1 ? "lançamento" : "lançamentos"} neste mês`;
  document.querySelector("#card-count").textContent = `${state.cards.length} ${state.cards.length === 1 ? "cartão cadastrado" : "cartões cadastrados"}`;
  renderCategories(expenses);
  renderMonthlyChart();
  const insight = !state.expenses.length && !state.incomes.length
    ? "Adicione sua primeira receita ou gasto para começar a visualizar seu mês."
    : incomeTotal - expenseTotal < 0
      ? "Seus gastos registrados superam as receitas previstas neste mês. Revise as categorias e datas."
      : expenseTotal === 0
        ? "Ainda não há gastos neste mês. Registre despesas para acompanhar a evolução do saldo."
        : "Os dados do painel refletem somente os registros salvos neste navegador.";
  document.querySelector("#insight-text").textContent = insight;
}

function renderCategories(expenses) {
  const container = document.querySelector("#category-breakdown");
  const totals = new Map();
  expenses.forEach((expense) => totals.set(expense.category, (totals.get(expense.category) || 0) + (Number(expense.amount) || 0)));
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">Sem gastos registrados neste mês.</div>';
    return;
  }
  const max = Math.max(...rows.map((row) => row[1]), 1);
  container.innerHTML = rows.slice(0, 5).map(([category, value]) => `
    <div class="category-row"><span class="category-name">${escapeHTML(category)}</span><span class="category-track"><span class="category-fill" style="display:block;width:${Math.max(4, value / max * 100)}%"></span></span><strong class="category-value">${money(value)}</strong></div>
  `).join("");
}

function renderMonthlyChart() {
  const container = document.querySelector("#monthly-chart");
  const months = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - offset);
    months.push({ key: monthKey(date), label: monthLabel(date), date });
  }
  const values = months.map((month) => state.expenses.filter((expense) => expense.date?.slice(0, 7) === month.key).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0));
  const max = Math.max(...values, 1);
  container.innerHTML = months.map((month, index) => `
    <div class="month-column"><span class="month-value">${values[index] ? money(values[index]) : ""}</span><div class="month-bar-wrap"><span class="month-bar" style="height:${values[index] ? Math.max(5, values[index] / max * 100) : 2}%"></span></div><span class="month-label">${escapeHTML(month.label)}</span></div>
  `).join("");
}

function renderExpenseFilters() {
  const select = document.querySelector("#category-filter");
  const current = select.value;
  select.innerHTML = '<option value="">Todas as categorias</option>' + CATEGORIES.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("");
  select.value = current;
}

function renderExpenses() {
  const list = document.querySelector("#expense-list");
  const query = document.querySelector("#expense-search").value.trim().toLocaleLowerCase("pt-BR");
  const category = document.querySelector("#category-filter").value;
  const period = document.querySelector("#period-filter").value;
  const now = new Date();
  const thisMonth = monthKey(now);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = monthKey(previous);
  const rows = [...state.expenses].filter((item) => {
    const matchesQuery = `${item.description} ${item.category} ${item.payment}`.toLocaleLowerCase("pt-BR").includes(query);
    const matchesCategory = !category || item.category === category;
    const month = item.date?.slice(0, 7);
    const matchesPeriod = period === "all" || (period === "month" && month === thisMonth) || (period === "last-month" && month === previousMonth);
    return matchesQuery && matchesCategory && matchesPeriod;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">${state.expenses.length ? "Nenhum gasto corresponde aos filtros." : "Nenhum gasto por aqui. Registre sua primeira despesa."}</div>`;
    return;
  }
  list.innerHTML = rows.map((item) => `
    <article class="record-row" data-record="expense">
      <div class="record-primary"><span class="record-icon" aria-hidden="true">${CATEGORY_MARKS[item.category] || "·"}</span><div><div class="record-title">${escapeHTML(item.description)}</div><div class="record-subtitle">${escapeHTML(item.payment || "Sem forma de pagamento")}${item.recurring ? " · Recorrente" : ""}</div></div></div>
      <span class="record-muted">${escapeHTML(item.category)}</span><span class="record-muted">${formatDate(item.date)}</span><strong class="record-value">${money(item.amount)}</strong>
      <span class="row-actions"><button class="row-action" type="button" data-action="edit" data-type="expense" data-id="${escapeHTML(item.id)}" aria-label="Editar gasto" title="Editar">✎</button><button class="row-action delete" type="button" data-action="delete" data-type="expense" data-id="${escapeHTML(item.id)}" aria-label="Excluir gasto" title="Excluir">×</button></span>
    </article>`).join("");
}

function renderCards() {
  const total = state.cards.reduce((sum, card) => sum + (Number(card.limit) || 0), 0);
  document.querySelector("#cards-total-limit").textContent = money(total);
  document.querySelector("#cards-total-count").textContent = `${state.cards.length} ${state.cards.length === 1 ? "cartão" : "cartões"}`;
  const list = document.querySelector("#card-list");
  if (!state.cards.length) {
    list.innerHTML = '<div class="empty-state">Nenhum cartão cadastrado. Adicione um para acompanhar limite e datas.</div>';
    return;
  }
  list.innerHTML = state.cards.map((card) => `
    <article class="credit-card"><div class="credit-card-top"><span class="credit-brand">${escapeHTML(card.brand || "CARTÃO")}</span><span class="row-actions"><button class="row-action" type="button" data-action="edit" data-type="card" data-id="${escapeHTML(card.id)}" aria-label="Editar cartão" title="Editar">✎</button><button class="row-action delete" type="button" data-action="delete" data-type="card" data-id="${escapeHTML(card.id)}" aria-label="Excluir cartão" title="Excluir">×</button></span></div><p class="credit-card-name">${escapeHTML(card.name)}</p><div class="credit-card-foot"><div><small>LIMITE</small><strong>${money(card.limit)}</strong></div><div><small>FECHA / VENCE</small><strong>Dia ${escapeHTML(card.closingDay)} / ${escapeHTML(card.dueDay)}</strong></div><div><small>JUROS AO MÊS</small><strong>${Number(card.interestRate || 0).toLocaleString("pt-BR")}%</strong></div></div></article>`).join("");
}

function renderIncomes() {
  const total = state.incomes.reduce((sum, income) => sum + monthlyIncome(income), 0);
  document.querySelector("#income-total").textContent = money(total);
  const list = document.querySelector("#income-list");
  if (!state.incomes.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma receita cadastrada. Inclua uma fonte de renda para planejar os recebimentos.</div>';
    return;
  }
  list.innerHTML = state.incomes.map((income) => `
    <article class="record-row income-row"><div class="record-primary"><span class="record-icon" aria-hidden="true">↗</span><div><div class="record-title">${escapeHTML(income.name)}</div><div class="record-subtitle">${escapeHTML(income.frequency)} · Dia ${escapeHTML(income.day)}</div></div></div><span class="status-pill${income.active ? "" : " is-off"}">${income.active ? "Ativa" : "Pausada"}</span><span class="record-muted">Mensal previsto</span><strong class="record-value">${money(monthlyIncome(income))}</strong><span class="row-actions"><button class="row-action" type="button" data-action="toggle" data-type="income" data-id="${escapeHTML(income.id)}" aria-label="Ativar ou pausar receita" title="Ativar ou pausar">◷</button><button class="row-action" type="button" data-action="edit" data-type="income" data-id="${escapeHTML(income.id)}" aria-label="Editar receita" title="Editar">✎</button><button class="row-action delete" type="button" data-action="delete" data-type="income" data-id="${escapeHTML(income.id)}" aria-label="Excluir receita" title="Excluir">×</button></span></article>`).join("");
}

function renderIncomeCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(today);
  document.querySelector("#calendar-title").textContent = `Recebimentos · ${monthName}`;
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let blank = 0; blank < firstWeekday; blank += 1) days.push('<div class="calendar-day" aria-hidden="true"></div>');
  for (let day = 1; day <= totalDays; day += 1) {
    const due = state.incomes.filter((income) => income.active && Number(income.day) === day);
    days.push(`<div class="calendar-day${due.length ? " is-payday" : ""}"><span>${day}</span>${due.length ? `<small>${due.length} ${due.length === 1 ? "receita" : "receitas"}</small>` : ""}</div>`);
  }
  document.querySelector("#income-calendar").innerHTML = days.join("");
}

function renderAll() {
  applyTheme();
  renderExpenseFilters();
  renderDashboard();
  renderExpenses();
  renderCards();
  renderIncomes();
  renderIncomeCalendar();
}

function optionList(items, selected) {
  return items.map((item) => `<option value="${escapeHTML(item)}"${item === selected ? " selected" : ""}>${escapeHTML(item)}</option>`).join("");
}

function getRecord(type, id) {
  const collection = type === "expense" ? state.expenses : type === "card" ? state.cards : state.incomes;
  return collection.find((item) => item.id === id);
}

function openRecordDialog(type, id = "") {
  const existing = id ? getRecord(type, id) : null;
  const isEdit = Boolean(existing);
  const heading = type === "expense" ? `${isEdit ? "Editar" : "Novo"} gasto` : type === "card" ? `${isEdit ? "Editar" : "Novo"} cartão` : `${isEdit ? "Editar" : "Nova"} receita`;
  const closeButton = '<button class="dialog-close" type="button" data-dialog-close aria-label="Fechar">×</button>';
  let fields = "";
  if (type === "expense") {
    fields = `
      <label class="field"><span>Descrição</span><input name="description" required maxlength="80" placeholder="Ex.: Mercado" value="${escapeHTML(existing?.description || "")}"></label>
      <div class="field-row"><label class="field"><span>Valor (R$)</span><input name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00" value="${existing ? Number(existing.amount) : ""}"></label><label class="field"><span>Data</span><input name="date" type="date" required value="${escapeHTML(existing?.date || localDateValue())}"></label></div>
      <label class="field"><span>Categoria</span><select name="category" required>${optionList(CATEGORIES, existing?.category || "Alimentação")}</select></label>
      <fieldset class="field"><legend>Forma de pagamento</legend><div class="choice-row">${PAYMENTS.map((payment) => `<label><input type="radio" name="payment" value="${payment}"${(existing?.payment || "Pix") === payment ? " checked" : ""}>${payment}</label>`).join("")}</div></fieldset>
      <label class="choice-row"><input type="checkbox" name="recurring"${existing?.recurring ? " checked" : ""}>Despesa recorrente</label>`;
  } else if (type === "card") {
    const brands = ["Visa", "Mastercard", "Elo", "Amex", "Outra"];
    fields = `
      <label class="field"><span>Nome do cartão</span><input name="name" required maxlength="40" placeholder="Ex.: Cartão principal" value="${escapeHTML(existing?.name || "")}"></label>
      <label class="field"><span>Bandeira</span><select name="brand">${optionList(brands, existing?.brand || "Visa")}</select></label>
      <div class="field-row"><label class="field"><span>Limite (R$)</span><input name="limit" type="number" min="0" step="0.01" required value="${existing ? Number(existing.limit) : ""}"></label><label class="field"><span>Juros mensal (%)</span><input name="interestRate" type="number" min="0" step="0.01" value="${existing ? Number(existing.interestRate) : 0}"></label></div>
      <div class="field-row"><label class="field"><span>Dia de fechamento</span><input name="closingDay" type="number" min="1" max="31" required value="${escapeHTML(existing?.closingDay || 10)}"></label><label class="field"><span>Dia de vencimento</span><input name="dueDay" type="number" min="1" max="31" required value="${escapeHTML(existing?.dueDay || 17)}"></label></div>`;
  } else {
    fields = `
      <label class="field"><span>Fonte de renda</span><input name="name" required maxlength="60" placeholder="Ex.: Salário" value="${escapeHTML(existing?.name || "")}"></label>
      <div class="field-row"><label class="field"><span>Valor por recebimento (R$)</span><input name="amount" type="number" min="0.01" step="0.01" required value="${existing ? Number(existing.amount) : ""}"></label><label class="field"><span>Dia do recebimento</span><input name="day" type="number" min="1" max="31" required value="${escapeHTML(existing?.day || 5)}"></label></div>
      <label class="field"><span>Frequência</span><select name="frequency">${optionList(FREQUENCIES, existing?.frequency || "Mensal")}</select></label>
      ${isEdit ? `<label class="choice-row"><input type="checkbox" name="active"${existing.active ? " checked" : ""}>Receita ativa</label>` : ""}`;
  }
  recordForm.dataset.type = type;
  recordForm.dataset.editId = existing?.id || "";
  recordForm.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">EDUCAGRANA</p><h2>${heading}</h2><p>O registro ficará salvo neste navegador.</p></div>${closeButton}</div>${fields}<div class="dialog-actions"><button class="button button-outline" type="button" data-dialog-close>Cancelar</button><button class="button button-primary" type="submit">Salvar</button></div>`;
  dialog.showModal();
  recordForm.querySelector("input:not([type=radio]):not([type=checkbox]), select")?.focus();
}

recordForm.addEventListener("click", (event) => {
  if (event.target.closest("[data-dialog-close]")) dialog.close();
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

recordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!recordForm.reportValidity()) return;
  const type = recordForm.dataset.type;
  const editId = recordForm.dataset.editId;
  const values = new FormData(recordForm);
  const record = { id: editId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`) };
  if (type === "expense") Object.assign(record, { description: String(values.get("description")).trim(), amount: Number(values.get("amount")), date: values.get("date"), category: values.get("category"), payment: values.get("payment"), recurring: values.has("recurring") });
  if (type === "card") Object.assign(record, { name: String(values.get("name")).trim(), brand: values.get("brand"), limit: Number(values.get("limit")), interestRate: Number(values.get("interestRate")) || 0, closingDay: Number(values.get("closingDay")), dueDay: Number(values.get("dueDay")) });
  if (type === "income") Object.assign(record, { name: String(values.get("name")).trim(), amount: Number(values.get("amount")), day: Number(values.get("day")), frequency: values.get("frequency"), active: editId ? values.has("active") : true });
  const collection = type === "expense" ? state.expenses : type === "card" ? state.cards : state.incomes;
  if (editId) {
    const index = collection.findIndex((item) => item.id === editId);
    if (index !== -1) collection[index] = record;
  } else collection.unshift(record);
  persist();
  renderAll();
  dialog.close();
  showToast(editId ? "Alterações salvas." : "Registro adicionado.");
});

for (const listId of ["expense-list", "card-list", "income-list"]) {
  document.querySelector(`#${listId}`).addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, type, id } = button.dataset;
    if (action === "edit") openRecordDialog(type, id);
    if (action === "delete") {
      if (!window.confirm("Excluir este registro? Esta ação não pode ser desfeita.")) return;
      const collection = type === "expense" ? state.expenses : type === "card" ? state.cards : state.incomes;
      const index = collection.findIndex((item) => item.id === id);
      if (index !== -1) collection.splice(index, 1);
      persist();
      renderAll();
      showToast("Registro excluído.");
    }
    if (action === "toggle") {
      const income = getRecord("income", id);
      if (income) income.active = !income.active;
      persist();
      renderAll();
    }
  });
}

for (const id of ["expense-search", "category-filter", "period-filter"]) {
  document.querySelector(`#${id}`).addEventListener(id === "expense-search" ? "input" : "change", renderExpenses);
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportExpensesCSV() {
  const columns = ["Descrição", "Valor", "Data", "Categoria", "Forma de pagamento", "Recorrente"];
  const rows = state.expenses.map((item) => [item.description, Number(item.amount).toFixed(2), item.date, item.category, item.payment, item.recurring ? "Sim" : "Não"]);
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  downloadFile("educagrana-gastos.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

document.querySelector("#report-csv").addEventListener("click", exportExpensesCSV);
document.querySelector("#expenses-csv").addEventListener("click", exportExpensesCSV);

function exportBackup() {
  downloadFile("educagrana-dados.json", JSON.stringify(state, null, 2), "application/json");
}

document.querySelector("#backup-json").addEventListener("click", exportBackup);
document.querySelector("#restore-json").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!imported || !Array.isArray(imported.expenses) || !Array.isArray(imported.cards) || !Array.isArray(imported.incomes)) throw new Error("Formato inválido");
    if (!window.confirm("Importar esta cópia substituirá os dados atuais deste navegador. Continuar?")) return;
    state = { expenses: imported.expenses, cards: imported.cards, incomes: imported.incomes, theme: imported.theme === "dark" ? "dark" : "light" };
    persist();
    renderAll();
    showToast("Cópia importada.");
  } catch {
    showToast("Não foi possível importar. Escolha uma cópia EducaGrana válida.");
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#clear-data").addEventListener("click", () => {
  if (!window.confirm("Apagar todos os gastos, cartões e receitas salvos neste navegador? Esta ação não pode ser desfeita.")) return;
  state = structuredClone(EMPTY_STATE);
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
  showToast("Dados locais apagados.");
});

for (const button of document.querySelectorAll("[data-calc-mode]")) {
  button.addEventListener("click", () => {
    calculatorMode = button.dataset.calcMode;
    document.querySelectorAll("[data-calc-mode]").forEach((item) => item.classList.toggle("is-selected", item === button));
    document.querySelector("#term-label").textContent = calculatorMode === "installment" ? "Parcelas" : "Meses";
    document.querySelector("#calculator-result").innerHTML = '<span class="result-mark" aria-hidden="true">÷</span><p>Preencha os dados e clique em calcular.</p>';
  });
}

document.querySelector("#calculator-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const values = new FormData(event.currentTarget);
  const principal = Number(values.get("amount"));
  const rate = Number(values.get("rate")) / 100;
  const periods = Number(values.get("term"));
  if (!(principal > 0 && periods > 0 && rate >= 0)) return;
  let total;
  let installment = 0;
  if (calculatorMode === "installment") {
    installment = rate === 0 ? principal / periods : principal * rate / (1 - Math.pow(1 + rate, -periods));
    total = installment * periods;
  } else total = principal * Math.pow(1 + rate, periods);
  const interest = total - principal;
  const result = document.querySelector("#calculator-result");
  result.innerHTML = `<span class="result-mark" aria-hidden="true">＝</span><p>${calculatorMode === "installment" ? "Valor estimado por parcela" : "Total estimado ao final"}</p><strong class="result-total">${money(calculatorMode === "installment" ? installment : total)}</strong><div class="result-breakdown"><div class="result-line"><span>Valor inicial</span><strong>${money(principal)}</strong></div><div class="result-line"><span>Juros estimados</span><strong>${money(interest)}</strong></div><div class="result-line"><span>Total estimado</span><strong>${money(total)}</strong></div></div>`;
});

async function initialize() {
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  await initializeCloudAuth();
  renderAll();
  showView("dashboard");
}

initialize();
