const app = document.querySelector('#app');
const authDialog = document.querySelector('#auth-dialog');
const authForm = document.querySelector('#auth-form');
const headerActions = document.querySelector('#header-actions');
const menuToggle = document.querySelector('#menu-toggle');
const routeNames = { '/': 'Главная', '/support': 'Поддержка', '/faq': 'FAQ', '/profile': 'Профиль', '/admin': 'Админ-панель' };
let currentUser = null;
let authMode = 'login';
let adminPageNumber = 1;
let adminSearch = '';
let toastTimeout;
let pendingDownload = false;

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const dateText = (value) => value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(value)) : '—';

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Не удалось выполнить запрос.');
  return payload;
}

function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function linkButton(href, label, className = 'button button-yellow') {
  return `<a class="${className}" href="${href}">${label}</a>`;
}

function homePage() {
  const features = [
    ['01', 'Твой визуал', 'Настраивай атмосферу игры и собирай собственный стиль.'],
    ['02', 'Чистый клиент', 'Лёгкий мод без лишнего шума. Только то, ради чего ты здесь.'],
    ['03', 'UID-профиль', 'Привяжи аккаунт один раз и управляй своим игровым UID.'],
  ];
  return `<div class="container">
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow"><span class="status-dot"></span> ВИЗУАЛЬНЫЙ МОД ДЛЯ MINECRAFT</div>
        <h1>Играй<br><span class="accent">по-своему.</span></h1>
        <p class="hero-description">jvxVisual добавляет игре характер. Настрой свой визуальный опыт и возвращайся в мир, который ощущается по-новому.</p>
        <div class="hero-actions">${linkButton('/download', 'Скачать <span aria-hidden="true">↓</span>', 'button button-yellow download-button')}<button class="button button-outline" type="button" data-open-auth="register">Создать аккаунт <span aria-hidden="true">↗</span></button></div>
        <div class="version-note"><span class="status-dot"></span> Поддерживаемая версия <strong>Minecraft 1.21.11</strong></div>
      </div>
      <div class="hero-art" aria-label="Графический знак jvxVisual"><div class="art-halo"></div><div class="visual-mark"><span>jv</span></div><div class="art-caption"><strong>01 / VISUAL MOD</strong>MINECRAFT · 1.21.11</div></div>
      <div class="scroll-cue">ПРОКРУТИ, ЧТОБЫ УЗНАТЬ БОЛЬШЕ</div>
    </section>
    <div class="ticker" aria-hidden="true"><div class="ticker-track">${Array.from({ length: 2 }, () => '<span>JVXVISUAL</span><span>✳</span><span>MINECRAFT 1.21.11</span><span>✳</span><span>СОЗДАН ДЛЯ ТВОЕЙ ИГРЫ</span><span>✳</span>').join('')}</div></div>
    <section class="section" id="features">
      <div class="section-heading reveal"><div><div class="section-kicker">МЕНЬШЕ ШУМА · БОЛЬШЕ СТИЛЯ</div><h2>Игра выглядит<br>как твоя.</h2></div><p>Детали, которые собирают новый взгляд на привычный мир Minecraft.</p></div>
      <div class="feature-grid">${features.map(([number, title, copy]) => `<article class="feature reveal"><span class="feature-index">${number} / 03</span><h3>${title}</h3><p>${copy}</p><span class="feature-line" aria-hidden="true"></span></article>`).join('')}</div>
    </section>
    <section class="section" style="padding-top:0"><div class="download-band reveal"><div><h2>Твой следующий заход начинается здесь.</h2><p>jvxVisual для Minecraft 1.21.11 · установи и запусти.</p></div>${linkButton('/download', 'Скачать мод <span aria-hidden="true">↓</span>')}</div></section>
  </div>`;
}

function supportPage() {
  const contacts = [
    ['TELEGRAM', 't.me/jvxVisual', 'https://t.me/jvxVisual', 'Написать в Telegram'],
    ['DISCORD', 'dsc.gg/jvxvisual', 'https://dsc.gg/jvxvisual', 'Зайти в Discord'],
    ['ПОЧТА', 'jvxvisual@gmail.com', 'mailto:jvxvisual@gmail.com', 'Отправить письмо'],
  ];
  return `<div class="container page-shell"><header class="page-heading"><div class="section-kicker">МЫ НА СВЯЗИ</div><h1>Поддержка.</h1><p>Вопрос по установке, аккаунту или UID? Выбери удобный канал и напиши нам.</p></header><div class="contact-grid">${contacts.map(([label, title, href, copy]) => `<a class="contact-card reveal" href="${href}"${label !== 'ПОЧТА' ? ' target="_blank" rel="noopener noreferrer"' : ''}><span class="contact-label">${label}</span><strong>${title}</strong><span>${copy} <span aria-hidden="true">↗</span></span></a>`).join('')}</div></div>`;
}

function faqPage() {
  const questions = [
    ['Что такое jvxVisual?', 'jvxVisual — визуальный мод для Minecraft. Он помогает настроить впечатление от игры и использует UID-аккаунт для проверки статуса доступа.'],
    ['Как установить мод?', 'Установи совместимый загрузчик Fabric для Minecraft 1.21.11, скачай файл мода и помести jvxVisual.jar в папку mods. Затем запусти профиль Fabric.'],
    ['Как привязать UID?', 'Создай аккаунт на сайте, открой профиль и скопируй UID. Вставь его в соответствующее поле мода в Minecraft 1.21.11.'],
    ['Что делать, если аккаунт заблокирован?', 'Причина и срок блокировки отображаются после входа. Если считаешь блокировку ошибочной, напиши в Telegram или Discord и укажи свой UID.'],
    ['Почему UID не меняется?', 'UID закреплён за аккаунтом и связан с устройством и сетью для защиты от обхода блокировок. Если совпадение ошибочное, попроси модератора проверить привязку.'],
    ['Какие версии Minecraft поддерживаются?', 'Сейчас сайт и загрузка рассчитаны на Minecraft 1.21.11. Для других версий совместимость не обещается.'],
    ['Как мод проверяет UID?', 'Мод периодически обращается к публичному API проверки. Если UID заблокирован, мод должен очистить его и отключить функции до успешной проверки активного UID.'],
    ['Как связаться с поддержкой?', 'Напиши нам в Telegram @jvxVisual, зайди на Discord-сервер или отправь письмо на jvxvisual@gmail.com.'],
  ];
  return `<div class="container page-shell"><header class="page-heading"><div class="section-kicker">КОРОТКО И ПО ДЕЛУ</div><h1>Есть вопросы?</h1><p>Ответы про мод, установку и аккаунт.</p></header><div class="faq-list">${questions.map(([question, answer]) => `<details class="faq-item reveal"><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div></div>`;
}

function banPage(ban) {
  const expiration = ban?.expires_at ? `Блокировка действует до ${escapeHtml(new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(ban.expires_at)))}.` : 'Блокировка бессрочная.';
  return `<div class="container"><section class="ban-screen"><div class="eyebrow"><span class="status-dot" style="background:var(--pink);box-shadow:0 0 13px rgba(255,79,163,.75)"></span> ДОСТУП ОГРАНИЧЕН</div><h1>Аккаунт заблокирован.</h1><p>Вход выполнен, но профиль и скачивание мода недоступны.</p><div class="ban-reason"><strong>Причина:</strong><br>${escapeHtml(ban?.reason || 'Причина не указана.')}</div><p>${expiration}</p><p>Если считаешь это решением ошибочным, напиши в <a href="https://t.me/jvxVisual" target="_blank" rel="noopener noreferrer" style="color:var(--yellow)">поддержку</a>.</p><button class="button button-quiet" type="button" data-logout>Выйти из аккаунта</button></section></div>`;
}

function profilePage(user) {
  return `<div class="container page-shell"><header class="page-heading"><div class="section-kicker">ЛИЧНЫЙ КАБИНЕТ</div><h1>Твой профиль.</h1><p>Управляй аккаунтом и используй UID в моде.</p></header><div class="profile-layout"><section class="profile-panel"><div class="profile-title"><div class="avatar">${escapeHtml(user.username.slice(0, 2).toUpperCase())}</div><div><h2>${escapeHtml(user.username)}</h2><p>${escapeHtml(user.email)}</p></div></div><div class="profile-data"><div class="data-item"><span>UID</span><div class="uid-box"><strong class="uid-value" id="profile-uid">${escapeHtml(user.uid)}</strong><button class="copy-button" type="button" data-copy-uid aria-label="Скопировать UID" title="Скопировать UID">⧉</button></div></div><div class="data-item"><span>Статус</span><div><span class="status-pill"><span class="status-dot"></span>Активен</span></div></div><div class="data-item"><span>Email</span><strong>${escapeHtml(user.email)}</strong></div><div class="data-item"><span>Роль</span><strong>${escapeHtml(user.role)}</strong></div><div class="data-item"><span>Дата регистрации</span><strong>${dateText(user.created_at)}</strong></div><div class="data-item"><span>Последний вход</span><strong>${dateText(user.last_login)}</strong></div></div></section><aside class="profile-side"><h3>Подключи мод</h3><p>Вставь этот UID в мод jvxVisual в Minecraft 1.21.11. UID проверяется автоматически при запуске игры.</p>${linkButton('/download', 'Скачать мод <span aria-hidden="true">↓</span>')}${user.role !== 'user' ? `<p style="margin:20px 0 0"><a href="/admin" data-route style="color:var(--pink)">Открыть панель модерации ↗</a></p>` : ''}</aside></div></div>`;
}

function adminPage() {
  return `<div class="container page-shell"><header class="page-heading"><div class="section-kicker">УПРАВЛЕНИЕ ДОСТУПОМ</div><h1>Админ-панель.</h1><p>Пользователи, блокировки и действия модераторов.</p></header><div class="admin-toolbar"><form class="search-form" id="admin-search"><input name="search" value="${escapeHtml(adminSearch)}" maxlength="100" placeholder="Ник, email или UID" aria-label="Поиск пользователя"><button class="button button-yellow button-small" type="submit">Найти</button></form><span class="section-kicker">ДОСТУП: ${escapeHtml(currentUser.role.toUpperCase())}</span></div><div class="admin-tabs"><button class="admin-tab is-active" data-admin-tab="users">Пользователи</button><button class="admin-tab" data-admin-tab="bans">История банов</button><button class="admin-tab" data-admin-tab="logs">Логи действий</button></div><div id="admin-content"><div class="loading-state">Загружаем список пользователей…</div></div><form class="admin-panel admin-form" id="ban-form"><div class="field"><span>UID пользователя</span><input name="uid" id="ban-uid" pattern="[A-Za-z0-9]{8}" maxlength="8" required placeholder="ABC12345"></div><label class="field"><span>Причина блокировки</span><input name="reason" minlength="3" maxlength="1000" required placeholder="Укажи причину"></label><label class="field"><span>До (необязательно)</span><input name="expiresAt" type="datetime-local"></label><button class="button button-pink" type="submit">Заблокировать</button></form></div>`;
}

function updateHeader() {
  if (!currentUser) {
    headerActions.innerHTML = '<button class="button button-quiet" type="button" data-open-auth="login">Войти</button><button class="button button-small button-yellow" type="button" data-open-auth="register">Создать аккаунт</button>';
    return;
  }
  const adminLink = currentUser.role !== 'user' ? '<a class="button button-quiet button-small" href="/admin" data-route>Админ</a>' : '';
  headerActions.innerHTML = `${adminLink}<a class="button button-quiet button-small" href="/profile" data-route><span class="status-dot"></span>${escapeHtml(currentUser.username)}</a><button class="button button-small button-yellow" type="button" data-logout>Выйти</button>`;
}

function setActiveNavigation(path) {
  document.querySelectorAll('.main-nav [data-route]').forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === path));
  document.title = `${routeNames[path] || 'Страница'} — jvxVisual`;
  document.querySelector('.main-nav').classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}

async function render() {
  const path = window.location.pathname;
  setActiveNavigation(path);
  if (path === '/profile') {
    if (!currentUser) {
      app.innerHTML = '<div class="container page-shell"><div class="empty-state">Войдите в аккаунт, чтобы открыть профиль.</div></div>';
      openAuth('login');
      return;
    }
    try {
      const payload = await request('/api/profile');
      app.innerHTML = payload.banned ? banPage(payload.ban) : profilePage(payload.user);
    } catch (error) {
      app.innerHTML = `<div class="container page-shell"><div class="empty-state">${escapeHtml(error.message)}</div></div>`;
    }
  } else if (path === '/admin') {
    if (!currentUser) {
      app.innerHTML = '<div class="container page-shell"><div class="empty-state">Войдите с учётной записью модератора.</div></div>';
      openAuth('login');
      return;
    }
    if (currentUser.role === 'user') {
      app.innerHTML = '<div class="container page-shell"><div class="empty-state">Админ-панель доступна только модераторам.</div></div>';
      return;
    }
    app.innerHTML = adminPage();
    await loadAdminUsers();
  } else {
    const pages = { '/': homePage, '/support': supportPage, '/faq': faqPage };
    app.innerHTML = (pages[path] || homePage)();
    observeReveals();
  }
}

function observeReveals() {
  const elements = document.querySelectorAll('.reveal:not(.is-visible)');
  if (!('IntersectionObserver' in window)) {
    elements.forEach((element) => element.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  elements.forEach((element, index) => {
    element.style.transitionDelay = `${Math.min(index % 3, 2) * 80}ms`;
    observer.observe(element);
  });
}

function openAuth(mode) {
  authMode = mode;
  const registering = mode === 'register';
  document.querySelector('#auth-title').textContent = registering ? 'Создай аккаунт' : 'С возвращением';
  document.querySelector('#auth-copy').textContent = registering ? 'Твой UID будет готов сразу после регистрации.' : 'Войди, чтобы открыть профиль.';
  document.querySelector('#register-username-field').hidden = !registering;
  document.querySelector('#register-email-field').hidden = !registering;
  document.querySelector('[name="login"]').closest('.field').hidden = registering;
  document.querySelector('#auth-submit').innerHTML = registering ? 'Зарегистрироваться <span aria-hidden="true">↗</span>' : 'Войти в аккаунт <span aria-hidden="true">↗</span>';
  document.querySelector('#auth-switch').innerHTML = registering ? 'Уже есть аккаунт? <span>Войти</span>' : 'Нет аккаунта? <span>Зарегистрироваться</span>';
  document.querySelector('#auth-error').textContent = '';
  if (!authDialog.open) authDialog.showModal();
}

async function loadAdminUsers() {
  const target = document.querySelector('#admin-content');
  if (!target) return;
  target.innerHTML = '<div class="loading-state">Загружаем список пользователей…</div>';
  try {
    const payload = await request(`/api/admin/users?search=${encodeURIComponent(adminSearch)}&page=${adminPageNumber}`);
    const rows = payload.users.map((user) => `<tr><td>${escapeHtml(user.username)}</td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.uid)}</td><td>${escapeHtml(user.role)}</td><td>${user.banned ? '<span class="status-pill status-banned"><span class="status-dot"></span>Бан</span>' : 'Активен'}</td><td><div class="table-actions">${user.banned ? `<button class="mini-button unban-action" data-unban="${escapeHtml(user.uid)}">Разбанить</button>` : `<button class="mini-button ban-action" data-select-ban="${escapeHtml(user.uid)}">Забанить</button>`}<button class="mini-button" data-links="${escapeHtml(user.uid)}">Привязки</button></div></td></tr>`).join('');
    target.innerHTML = `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Ник</th><th>Email</th><th>UID</th><th>Роль</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Пользователи не найдены.</td></tr>'}</tbody></table></div><div class="pagination"><button class="mini-button" data-page="${Math.max(1, payload.page - 1)}" ${payload.page <= 1 ? 'disabled' : ''}>← Назад</button><span>Страница ${payload.page} из ${payload.pages} · ${payload.total} аккаунтов</span><button class="mini-button" data-page="${Math.min(payload.pages, payload.page + 1)}" ${payload.page >= payload.pages ? 'disabled' : ''}>Далее →</button></div>`;
  } catch (error) {
    target.innerHTML = `<div class="empty-state error-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadAdminHistory(tab) {
  const target = document.querySelector('#admin-content');
  target.innerHTML = '<div class="loading-state">Загружаем историю…</div>';
  try {
    const key = tab === 'bans' ? 'bans' : 'logs';
    const payload = await request(`/api/admin/${key}`);
    if (tab === 'bans') {
      const rows = payload.bans.map((ban) => `<tr><td>${escapeHtml(ban.target_username || '—')}</td><td>${escapeHtml(ban.uid)}</td><td>${escapeHtml(ban.moderator_username || '—')}</td><td>${escapeHtml(ban.reason)}</td><td>${dateText(ban.created_at)}</td><td>${ban.expires_at ? dateText(ban.expires_at) : 'Бессрочно'}</td><td>${ban.active ? 'Активен' : ban.expired ? 'Истёк' : 'Снят'}</td></tr>`).join('');
      target.innerHTML = `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Пользователь</th><th>UID</th><th>Модератор</th><th>Причина</th><th>Дата</th><th>Срок</th><th>Статус</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Записей пока нет.</td></tr>'}</tbody></table></div>`;
    } else {
      const rows = payload.logs.map((log) => `<tr><td>${escapeHtml(log.moderator_username || '—')}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.target_uid || '—')}</td><td>${escapeHtml(JSON.stringify(log.details))}</td><td>${dateText(log.created_at)}</td></tr>`).join('');
      target.innerHTML = `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Модератор</th><th>Действие</th><th>UID</th><th>Детали</th><th>Дата</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Записей пока нет.</td></tr>'}</tbody></table></div>`;
    }
  } catch (error) {
    target.innerHTML = `<div class="empty-state error-state">${escapeHtml(error.message)}</div>`;
  }
}

async function refreshSession() {
  try {
    const { user } = await request('/api/auth/me');
    currentUser = user;
  } catch {
    currentUser = null;
  }
  updateHeader();
}

document.addEventListener('click', async (event) => {
  const downloadLink = event.target.closest('a[href="/download"]');
  if (downloadLink) {
    if (currentUser?.ban) {
      event.preventDefault();
      history.pushState({}, '', '/profile');
      await render();
      return;
    }
    if (!currentUser) {
      event.preventDefault();
      pendingDownload = true;
      openAuth('login');
      return;
    }
  }
  const route = event.target.closest('[data-route]');
  if (route && route.origin === window.location.origin) {
    event.preventDefault();
    const destination = route.pathname;
    if (destination === '/profile' && currentUser?.ban) {
      history.pushState({}, '', destination);
      app.innerHTML = banPage(currentUser.ban);
      setActiveNavigation(destination);
      return;
    }
    history.pushState({}, '', destination);
    await render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const openButton = event.target.closest('[data-open-auth]');
  if (openButton) openAuth(openButton.dataset.openAuth);
  if (event.target.closest('[data-close-dialog]')) {
    pendingDownload = false;
    authDialog.close();
  }
  if (event.target.closest('#auth-switch')) openAuth(authMode === 'login' ? 'register' : 'login');
  if (event.target.closest('[data-copy-uid]')) {
    const uid = document.querySelector('#profile-uid')?.textContent;
    if (uid) navigator.clipboard.writeText(uid).then(() => notify('UID скопирован.')).catch(() => notify('Не удалось скопировать UID.'));
  }
  if (event.target.closest('[data-logout]')) {
    await request('/api/auth/logout', { method: 'POST' }).catch(() => {});
    currentUser = null;
    updateHeader();
    history.pushState({}, '', '/');
    await render();
    notify('Вы вышли из аккаунта.');
  }
  if (event.target.closest('#menu-toggle')) {
    const opened = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(opened));
    document.querySelector('.main-nav').classList.toggle('is-open', opened);
  }
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) { adminPageNumber = Number(pageButton.dataset.page); await loadAdminUsers(); }
  const tabButton = event.target.closest('[data-admin-tab]');
  if (tabButton) {
    document.querySelectorAll('.admin-tab').forEach((button) => button.classList.toggle('is-active', button === tabButton));
    if (tabButton.dataset.adminTab === 'users') await loadAdminUsers();
    else await loadAdminHistory(tabButton.dataset.adminTab);
  }
  const selectBan = event.target.closest('[data-select-ban]');
  if (selectBan) {
    document.querySelector('#ban-uid').value = selectBan.dataset.selectBan;
    document.querySelector('#ban-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.querySelector('#ban-form [name="reason"]').focus();
  }
  const unbanButton = event.target.closest('[data-unban]');
  if (unbanButton) {
    try {
      await request(`/api/admin/bans/${encodeURIComponent(unbanButton.dataset.unban)}`, { method: 'DELETE' });
      notify('Блокировка снята.');
      await loadAdminUsers();
    } catch (error) { notify(error.message); }
  }
  const linksButton = event.target.closest('[data-links]');
  if (linksButton) {
    try {
      const payload = await request(`/api/admin/links/${encodeURIComponent(linksButton.dataset.links)}`);
      if (!payload.links.length) { notify('Привязок не найдено.'); return; }
      const list = payload.links.map((link, index) => `${index + 1}. ${link.type === 'ip' ? 'IP' : 'Устройство'}: ${link.hash}`).join('\n');
      const choice = window.prompt(`Привязки UID ${linksButton.dataset.links}:\n${list}\n\nВведи номер привязки для удаления.`);
      if (choice === null) return;
      const selectedLink = payload.links[Number.parseInt(choice, 10) - 1];
      if (!selectedLink) { notify('Укажи номер привязки из списка.'); return; }
      if (!window.confirm(`Удалить привязку ${selectedLink.type === 'ip' ? 'IP' : 'устройства'} для UID ${linksButton.dataset.links}?`)) return;
      await request('/api/admin/unlink', { method: 'POST', body: JSON.stringify({ uid: linksButton.dataset.links, type: selectedLink.type, hash: selectedLink.hash }) });
      notify('Привязка удалена.');
    } catch (error) { notify(error.message); }
  }
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(authForm);
  const errorBox = document.querySelector('#auth-error');
  errorBox.textContent = '';
  const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const body = authMode === 'register'
    ? { username: form.get('username'), email: form.get('email'), password: form.get('password') }
    : { login: form.get('login'), password: form.get('password') };
  try {
    const payload = await request(endpoint, { method: 'POST', body: JSON.stringify(body) });
    authDialog.close();
    authForm.reset();
    await refreshSession();
    if (payload.banned || currentUser?.ban) {
      pendingDownload = false;
      history.pushState({}, '', '/profile');
      await render();
      notify('Аккаунт заблокирован. Причина показана на экране.');
    } else {
      await render();
      notify(authMode === 'register' ? 'Аккаунт создан. UID доступен в профиле.' : 'Вы вошли в аккаунт.');
      if (pendingDownload) {
        pendingDownload = false;
        window.location.assign('/download');
      }
    }
  } catch (error) { errorBox.textContent = error.message; }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'admin-search') {
    event.preventDefault();
    adminSearch = new FormData(event.target).get('search').trim();
    adminPageNumber = 1;
    await loadAdminUsers();
    return;
  }
  if (event.target.id === 'ban-form') {
    event.preventDefault();
    const formElement = event.target;
    const form = new FormData(formElement);
    const expiresAt = form.get('expiresAt');
    try {
      await request('/api/admin/bans', {
        method: 'POST',
        body: JSON.stringify({ uid: form.get('uid'), reason: form.get('reason'), expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }),
      });
      formElement.reset();
      notify('Пользователь заблокирован.');
      await loadAdminUsers();
    } catch (error) { notify(error.message); }
  }
});

authDialog.addEventListener('cancel', () => { pendingDownload = false; });
window.addEventListener('popstate', render);
let parallaxFramePending = false;
window.addEventListener('scroll', () => {
  if (parallaxFramePending) return;
  parallaxFramePending = true;
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--scroll-offset', `${window.scrollY * 0.08}px`);
    parallaxFramePending = false;
  });
}, { passive: true });
refreshSession().then(render);