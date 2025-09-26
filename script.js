/* =========================
   Super JS for Auth + Todos
   ========================= */

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const storage = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
  del(key) { localStorage.removeItem(key); }
};

const KEYS = Object.freeze({
  USERS: "app_users_v1",
  CURRENT: "app_current_user_v1",
  TODOS_NS: "todos__" // + email
});

const toast = (msg, type = "info") => {
  let el = $("#app-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-toast";
    el.style.cssText = `
      position:fixed;inset-inline:0;bottom:18px;margin:auto;max-width:600px;
      background:rgba(17,24,39,.9);color:#fff;padding:12px 16px;border-radius:12px;
      border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(8px);
      font:600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      box-shadow:0 10px 30px rgba(2,6,23,.35);opacity:0;transform:translateY(8px);
      transition:opacity .2s ease, transform .2s ease;z-index:9999;text-align:center
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = type === "error" ? "rgba(185, 28, 28,.92)"
                        : type === "success" ? "rgba(22,163,74,.92)"
                        : "rgba(17,24,39,.92)";
  requestAnimationFrame(() => { el.style.opacity = 1; el.style.transform = "translateY(0)"; });
  setTimeout(() => { el.style.opacity = 0; el.style.transform = "translateY(8px)"; }, 1800);
};

/* ---------- Auth Layer ---------- */
class AuthService {
  static all() { return storage.get(KEYS.USERS, []); }
  static saveAll(users) { storage.set(KEYS.USERS, users); }
  static byEmail(email) { return this.all().find(u => u.email === email) || null; }

  static register({ firstName, lastName, email, password }) {
    email = email.trim().toLowerCase();
    const users = this.all();
    if (users.some(u => u.email === email)) throw new Error("Email already exists");
    const user = { id: uid(), firstName, lastName, email, password };
    users.push(user);
    this.saveAll(users);
    storage.set(KEYS.CURRENT, user);
    // create empty todos namespace for new user
    storage.set(KEYS.TODOS_NS + email, []);
    return user;
  }

  static login(email, password) {
    email = email.trim().toLowerCase();
    const user = this.byEmail(email);
    if (!user || user.password !== password) throw new Error("Invalid credentials or user doesn't exist");
    storage.set(KEYS.CURRENT, user);
    // ensure namespace exists
    if (!storage.get(KEYS.TODOS_NS + email)) storage.set(KEYS.TODOS_NS + email, []);
    return user;
  }

  static current() { return storage.get(KEYS.CURRENT); }
  static logout() { storage.del(KEYS.CURRENT); }
}

/* ---------- Todos Layer ---------- */
class TodoItem {
  constructor(text) {
    this.id = uid();
    this.text = text;
    this.completed = false;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }
}
class TodoStore {
  constructor(email) {
    this.key = KEYS.TODOS_NS + email.toLowerCase();
    this.items = storage.get(this.key, []);
  }
  _persist() { storage.set(this.key, this.items); }
  list({ filter = "all", sort = "new" } = {}) {
    let arr = [...this.items];
    if (filter === "active") arr = arr.filter(t => !t.completed);
    if (filter === "done") arr = arr.filter(t => t.completed);
    if (sort === "new") arr.sort((a,b) => b.createdAt - a.createdAt);
    if (sort === "old") arr.sort((a,b) => a.createdAt - b.createdAt);
    return arr;
  }
  add(text) {
    const item = new TodoItem(text.trim());
    this.items.push(item); this._persist(); return item;
  }
  toggle(id) {
    const t = this.items.find(x => x.id === id); if (!t) return;
    t.completed = !t.completed; t.updatedAt = Date.now(); this._persist();
  }
  update(id, text) {
    const t = this.items.find(x => x.id === id); if (!t) return;
    t.text = text.trim(); t.updatedAt = Date.now(); this._persist();
  }
  remove(id) { this.items = this.items.filter(x => x.id !== id); this._persist(); }
  clearCompleted() { this.items = this.items.filter(x => !x.completed); this._persist(); }
}

/* ---------- Page Routers ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Login Page
  if ($("#loginForm")) {
    const form = $("#loginForm");
    const msg = $("#loginMessage");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("#loginEmail").value.trim();
      const password = $("#loginPassword").value.trim();
      if (!email || !password) {
        msg.textContent = "Please enter both fields."; msg.className = "message error"; return;
      }
      try {
        AuthService.login(email, password);
        location.href = "home.html";
      } catch (err) {
        msg.textContent = /exist/i.test(err.message) ? "User not found. Please register first." : err.message;
        msg.className = "message error";
      }
    });
  }

  // Register Page
  if ($("#registerForm")) {
    const form = $("#registerForm");
    const msg = $("#registerMessage");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const firstName = $("#firstName").value.trim();
      const lastName  = $("#lastName").value.trim();
      const email     = $("#registerEmail").value.trim();
      const password  = $("#registerPassword").value.trim();

      if (!firstName || !lastName || !email || !password) {
        msg.textContent = "All fields are required."; msg.className = "message error"; return;
      }
      try {
        AuthService.register({ firstName, lastName, email, password });
        location.href = "home.html"; // auto login + redirect
      } catch (err) {
        msg.textContent = err.message; msg.className = "message error";
      }
    });
  }

  // Home Page
  if ($("#taskList")) {
    const user = AuthService.current();
    if (!user) { location.href = "login.html"; return; }

    $("#username").textContent = user.firstName || user.email.split("@")[0];
    const store = new TodoStore(user.email);

    /* ---- UI Elements ---- */
    const input = $("#taskInput");
    const addBtn = $("#addTask");
    const listEl = $("#taskList");
    const message = $("#homeMessage");

    // Optional: tiny filter/sort bar
    const toolbar = $(".toolbar");
    const filterWrap = document.createElement("div");
    filterWrap.className = "actions";
    filterWrap.innerHTML = `
      <button class="ghost" id="flt-all">All</button>
      <button class="ghost" id="flt-active">Active</button>
      <button class="ghost" id="flt-done">Done</button>
      <button class="secondary" id="clear-done">Clear Done</button>
    `;
    toolbar.appendChild(filterWrap);

    let state = { filter: "all", sort: "new" };

    /* ---- Render ---- */
    const render = () => {
      const items = store.list(state);
      listEl.innerHTML = "";
      if (!items.length) {
        message.textContent = "No tasks yet — add your first task!";
        message.className = "message";
        return;
      }
      message.textContent = "";

      for (const t of items) {
        const li = document.createElement("li");
        if (t.completed) li.classList.add("completed");
        li.dataset.id = t.id;

        const textWrap = document.createElement("div");
        textWrap.className = "todo-text";

        const span = document.createElement("span");
        span.textContent = t.text; // safe
        span.setAttribute("role", "textbox");
        span.tabIndex = 0;
        span.dataset.editable = "true";
        span.title = "Click to edit";

        if (t.completed) {
          const badge = document.createElement("span");
          badge.className = "badge"; badge.textContent = "Done";
          textWrap.append(span, badge);
        } else {
          textWrap.append(span);
        }

        const controls = document.createElement("div");
        controls.className = "controls";
        controls.innerHTML = `
          <button class="control complete" title="Toggle">✔</button>
          <button class="control edit" title="Edit">✏</button>
          <button class="control delete" title="Delete">🗑</button>
        `;

        li.append(textWrap, controls);
        listEl.appendChild(li);
      }
    };

    render();

    /* ---- Actions ---- */
    const addTask = () => {
      const val = input.value.trim();
      if (!val) { toast("Type something first", "error"); return; }
      store.add(val);
      input.value = "";
      render();
      toast("Task added ✅", "success");
    };

    addBtn.addEventListener("click", addTask);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addTask();
      if (e.key === "Escape") input.blur();
    });

    // Event delegation for list controls + inline edit
    listEl.addEventListener("click", (e) => {
      const li = e.target.closest("li"); if (!li) return;
      const id = li.dataset.id;

      if (e.target.classList.contains("complete")) {
        store.toggle(id); render();
      } else if (e.target.classList.contains("delete")) {
        store.remove(id); render();
        toast("Task deleted", "success");
      } else if (e.target.classList.contains("edit")) {
        const span = li.querySelector('[data-editable]');
        startInlineEdit(span, id);
      }
    });

    listEl.addEventListener("dblclick", (e) => {
      const span = e.target.closest('[data-editable]');
      if (!span) return;
      const li = span.closest("li");
      startInlineEdit(span, li.dataset.id);
    });

    function startInlineEdit(span, id) {
      if (!span) return;
      const original = span.textContent;
      span.contentEditable = "true";
      span.focus();
      // place caret at end
      document.getSelection().collapse(span, span.childNodes.length);

      const finish = (commit) => {
        span.contentEditable = "false";
        span.removeEventListener("keydown", onKey);
        span.removeEventListener("blur", onBlur);
        const next = span.textContent.trim();
        if (commit) {
          if (!next) { span.textContent = original; toast("Task cannot be empty", "error"); return; }
          if (next !== original) { store.update(id, next); toast("Task updated ✍️", "success"); }
        } else {
          span.textContent = original;
        }
        render();
      };
      const onKey = (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { finish(false); }
      };
      const onBlur = () => finish(true);

      span.addEventListener("keydown", onKey);
      span.addEventListener("blur", onBlur);
    }

    // Filters
    $("#flt-all").addEventListener("click", () => { state.filter = "all"; render(); });
    $("#flt-active").addEventListener("click", () => { state.filter = "active"; render(); });
    $("#flt-done").addEventListener("click", () => { state.filter = "done"; render(); });
    $("#clear-done").addEventListener("click", () => { store.clearCompleted(); render(); toast("Cleared completed", "success"); });

    // Logout
    $("#logout").addEventListener("click", () => {
      AuthService.logout();
      location.href = "login.html";
    });

    // Keyboard shortcuts: Ctrl+N = focus input, Ctrl+Enter = add
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === "n") { e.preventDefault(); input.focus(); }
      if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); addTask(); }
    });
  }
});
