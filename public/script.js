// Inkwell frontend, connected to the Express REST API (see server.js).
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CATS = { Technology: "💻", Lifestyle: "🌿", Education: "🎓", Travel: "✈️", Other: "✨" };
const user = () => load("session", null); // { name, email, token }
const words = (t) => t.split(/\s+/).filter(Boolean).length;
const mins = (t) => Math.max(1, Math.ceil(words(t) / 200));
const initials = (n) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
document.documentElement.dataset.theme = load("theme", "light");

// One helper for every call to the backend.
async function api(path, method = "GET", body) {
  const u = user();
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json", ...(u?.token ? { Authorization: "Bearer " + u.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error("Cannot reach the server. Start it with: npm start"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && u) { localStorage.removeItem("session"); location.href = "login.html"; }
    throw new Error(data.error || `Server error (${res.status}). Open the app at http://localhost:3000`);
  }
  return data;
}

function toast(m, t = "ok") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("aria-live", "polite"); document.body.append(box); }
  const d = document.createElement("div"); d.className = "toast " + t; d.textContent = m; box.append(d);
  setTimeout(() => d.remove(), 2800);
}

function nav() {
  const u = user(), page = document.body.dataset.page;
  const on = (p) => (page === p ? "link on" : "link");
  $("#nav").innerHTML = `<a class="logo" href="index.html">Inkwell</a><nav aria-label="Main"><ul>
    <li><a class="${on("home")}" href="index.html">Home</a></li>
    ${u ? `<li><a class="${on("dashboard")}" href="dashboard.html">Dashboard</a></li><li><a class="${on("create")}" href="create-blog.html">Write</a></li>
    <li><span class="av" title="${esc(u.name)}">${esc(initials(u.name))}</span></li><li><button class="btn sm ghost" id="logout">Log out</button></li>`
      : `<li><a class="${on("login")}" href="login.html">Log in</a></li><li><a class="btn sm" href="register.html">Register</a></li>`}
    <li><button class="icon" id="theme" aria-label="Toggle dark mode">${document.documentElement.dataset.theme === "dark" ? "☀️" : "🌙"}</button></li>
  </ul></nav>`;
  $("#theme").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; save("theme", t); nav(); };
  const lo = $("#logout"); if (lo) lo.onclick = () => { localStorage.removeItem("session"); location.href = "index.html"; };
  $$("[data-eye]").forEach((b) => (b.onclick = () => { const i = $("#" + b.dataset.eye); i.type = i.type === "password" ? "text" : "password"; b.textContent = i.type === "password" ? "Show" : "Hide"; }));
}

const showErr = (m) => { const el = $("#msg"); el.textContent = m; el.className = "msg err"; };
const need = () => { if (!user()) { location.href = "login.html"; return false; } return true; };

const card = (p) => `<article class="post" data-id="${p.id}" tabindex="0" role="button" aria-label="Read ${esc(p.title)}">
  <div class="cover" data-cat="${esc(p.category)}"><span>${CATS[p.category] || "✨"}</span>${esc(p.category)}</div>
  <div class="body"><h3>${esc(p.title)}</h3><p>${esc(p.content.replace(/\n+/g, " ").slice(0, 110))}…</p>
  <div class="foot"><span class="av">${esc(initials(p.author))}</span><span class="who">${esc(p.author)}<small>${p.date} · ${mins(p.content)} min read</small></span><span class="likes">♥ ${p.likes}</span></div></div></article>`;

const pages = {
  async home() {
    let all = [], q = "", cat = "All", sort = "new";
    try { all = await api("/posts"); }
    catch (e) { $("#posts").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const render = () => {
      let list = all.filter((p) => (cat === "All" || p.category === cat) && (p.title + p.content).toLowerCase().includes(q));
      list = sort === "liked" ? list.sort((a, b) => b.likes - a.likes) : list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      $("#count").textContent = `${list.length} ${list.length === 1 ? "post" : "posts"}`;
      $("#posts").innerHTML = list.map(card).join("") || `<div class="empty">No posts match your search. Try a different word or category.</div>`;
      $("#chips").innerHTML = ["All", ...Object.keys(CATS)].map((c) => `<button class="chip ${c === cat ? "on" : ""}" data-c="${c}">${c}</button>`).join("");
    };
    const open = (e) => { const a = e.target.closest(".post"); if (a) location.href = "post.html?id=" + a.dataset.id; };
    $("#q").oninput = (e) => { q = e.target.value.toLowerCase(); render(); };
    $("#sort").onchange = (e) => { sort = e.target.value; render(); };
    $("#chips").onclick = (e) => { if (e.target.dataset.c) { cat = e.target.dataset.c; render(); } };
    $("#posts").onclick = open;
    $("#posts").onkeydown = (e) => { if (e.key === "Enter") open(e); };
    render();
  },

  // Individual blog details page: post.html?id=<post id>
  async post() {
    const id = new URLSearchParams(location.search).get("id"), u = user(), box = $("#detail");
    let p;
    try { p = await api("/posts/" + encodeURIComponent(id)); }
    catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)} <a href="index.html" style="color:var(--brand);font-weight:700">Back to Home</a></div>`; return; }
    document.title = p.title + " | Inkwell";
    const draw = () => {
      box.innerHTML = `<article class="card detail"><div class="cover" data-cat="${esc(p.category)}"><span>${CATS[p.category] || "✨"}</span>${esc(p.category)}</div><div class="inner">
        <a href="index.html" class="meta">← Back to all posts</a>
        <h1>${esc(p.title)}</h1><p class="meta">By ${esc(p.author)} · ${p.date} · ${mins(p.content)} min read${p.status === "draft" ? " · Draft" : ""}</p>
        <div class="bar"><button class="btn sm ${p.liked ? "" : "ghost"}" id="like">♥ ${p.liked ? "Liked" : "Like"} (${p.likes})</button>${p.mine ? `<a class="btn sm ghost" href="create-blog.html?edit=${p.id}">Edit</a>` : ""}</div>
        <div class="content">${p.content.split(/\n+/).map((x) => `<p>${esc(x)}</p>`).join("")}</div>
        <h3 style="margin:24px 0 8px">Comments (${p.comments.length})</h3>
        ${p.comments.map((c) => `<div class="cm"><strong>${esc(c.name)}</strong> <small>${c.date}</small><br>${esc(c.text)}</div>`).join("") || `<p class="meta">No comments yet.</p>`}
        ${u && p.status === "published" ? `<label for="ctext">Add a comment</label><textarea id="ctext" style="min-height:80px"></textarea><div class="actions"><button class="btn sm" id="post">Post comment</button></div>`
          : u ? "" : `<p class="alt"><a href="login.html">Log in</a> to like or comment.</p>`}</div></article>`;
      $("#like").onclick = async () => {
        if (!u) return toast("Log in to like posts.", "err");
        try { p = await api(`/posts/${id}/like`, "POST"); draw(); } catch (e) { toast(e.message, "err"); }
      };
      const pb = $("#post");
      if (pb) pb.onclick = async () => {
        const text = $("#ctext").value.trim(); if (text.length < 2) return toast("Write a comment first.", "err");
        try { p = await api(`/posts/${id}/comments`, "POST", { text }); draw(); toast("Comment posted."); } catch (e) { toast(e.message, "err"); }
      };
    };
    draw();
  },

  register() {
    $("#password").oninput = (e) => {
      const v = e.target.value; let s = 0;
      if (v.length >= 6) s++; if (v.length >= 10) s++; if (/\d/.test(v) && /[a-z]/i.test(v)) s++; if (/[^a-z0-9]/i.test(v) || (/[A-Z]/.test(v) && /[a-z]/.test(v))) s++;
      $("#bar").style.width = s * 25 + "%"; $("#bar").style.background = ["#dc2626", "#dc2626", "#f59e0b", "#10b981", "#059669"][s];
      $("#strength").textContent = v ? ["Too weak", "Weak", "Fair", "Good", "Strong"][s] : "Use 6 or more characters.";
    };
    $("#regForm").onsubmit = async (e) => {
      e.preventDefault();
      const name = $("#name").value.trim(), email = $("#email").value.trim(), password = $("#password").value;
      if (!name || !email || !password) return showErr("Fill in every field.");
      if (!/^\S+@\S+\.\S+$/.test(email)) return showErr("Enter a valid email address.");
      if (password.length < 6) return showErr("Password must be at least 6 characters.");
      if (password !== $("#confirm").value) return showErr("Passwords do not match.");
      try {
        await api("/register", "POST", { name, email, password });
        toast("Account created. Please log in."); setTimeout(() => (location.href = "login.html"), 900);
      } catch (err) { showErr(err.message); }
    };
  },

  login() {
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const email = $("#email").value.trim(), password = $("#password").value;
      if (!email || !password) return showErr("Enter your email and password.");
      try {
        const r = await api("/login", "POST", { email, password });
        save("session", { name: r.user.name, email: r.user.email, token: r.token });
        location.href = "dashboard.html";
      } catch (err) { showErr(err.message); }
    };
  },

  async dashboard() {
    if (!need()) return;
    const u = user(); let term = "", mine = [];
    $("#hello").textContent = `Hello, ${u.name.split(" ")[0]}`;
    const draw = () => {
      const pub = mine.filter((p) => p.status === "published");
      $("#sPosts").textContent = pub.length; $("#sDrafts").textContent = mine.length - pub.length;
      $("#sLikes").textContent = mine.reduce((n, p) => n + p.likes, 0);
      $("#sCom").textContent = mine.reduce((n, p) => n + p.comments.length, 0);
      $("#sWords").textContent = mine.reduce((n, p) => n + words(p.content), 0);
      const list = mine.filter((p) => p.title.toLowerCase().includes(term));
      $("#mine").innerHTML = list.map((p) => `<div class="card row"><div><a href="post.html?id=${p.id}"><strong>${esc(p.title)}</strong></a><br>
        <span class="tag ${p.status === "published" ? "live" : "draft"}">${p.status === "published" ? "Published" : "Draft"}</span><span class="tag">${esc(p.category)}</span>
        <span class="meta">${p.date} · ♥ ${p.likes} · ${p.comments.length} comments</span></div>
        <div class="actions" style="margin:0"><a class="btn sm ghost" href="create-blog.html?edit=${p.id}">Edit</a>
        <button class="btn sm ghost" data-a="toggle" data-id="${p.id}">${p.status === "published" ? "Unpublish" : "Publish"}</button>
        <button class="btn sm danger" data-a="del" data-id="${p.id}">Delete</button></div></div>`).join("")
        || `<div class="empty">${mine.length ? "No blogs match your search." : "You have not written anything yet."} <a href="create-blog.html" style="color:var(--brand);font-weight:700">Write your first blog</a></div>`;
    };
    const refresh = async () => { try { mine = await api("/posts/mine"); } catch (e) { toast(e.message, "err"); } draw(); };
    $("#find").oninput = (e) => { term = e.target.value.toLowerCase(); draw(); };
    $("#mine").onclick = async (e) => {
      const { a, id } = e.target.dataset; if (!a) return;
      try {
        if (a === "del" && confirm("Delete this blog? This cannot be undone.")) { await api(`/posts/${id}`, "DELETE"); toast("Blog deleted."); }
        if (a === "toggle") {
          const p = mine.find((x) => x.id == id), status = p.status === "published" ? "draft" : "published";
          await api(`/posts/${id}`, "PUT", { status }); toast(status === "published" ? "Published." : "Moved to drafts.");
        }
      } catch (err) { toast(err.message, "err"); }
      refresh();
    };
    refresh();
  },

  async create() {
    if (!need()) return;
    const editId = new URLSearchParams(location.search).get("edit");
    let existing = null;
    if (editId) { try { existing = (await api("/posts/mine")).find((p) => p.id == editId) || null; } catch { /* handled by api() */ } }
    const stat = () => ($("#stat").textContent = `${words($("#content").value)} words · ${mins($("#content").value)} min read`);
    if (existing) { $("#head").textContent = "Edit your blog"; $("#title").value = existing.title; $("#category").value = existing.category; $("#content").value = existing.content; stat(); }
    $("#content").oninput = stat;
    const submit = async (status) => {
      const title = $("#title").value.trim(), content = $("#content").value.trim(), category = $("#category").value;
      if (title.length < 3) return showErr("Add a title of at least 3 characters.");
      if (content.length < 30) return showErr("Write at least 30 characters of content.");
      try {
        if (existing) await api(`/posts/${existing.id}`, "PUT", { title, category, content, status });
        else await api("/posts", "POST", { title, category, content, status });
        toast(status === "published" ? "Blog published." : "Draft saved.");
        setTimeout(() => (location.href = "dashboard.html"), 700);
      } catch (e) { showErr(e.message); }
    };
    $("#pub").onclick = () => submit("published");
    $("#draft").onclick = () => submit("draft");
  },
};

nav();
pages[document.body.dataset.page]?.();
