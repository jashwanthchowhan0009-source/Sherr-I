// Sherr I — phone app (PWA). Talks to /api/chat and turns "actions" into tap-to-do cards.
const $ = (s, el = document) => el.querySelector(s);
const feed = $("#feed");
const input = $("#input");

// ------------------------------------------------------------------ storage
const store = {
  get(k, d) { try { const v = localStorage.getItem("sherr:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("sherr:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const D = {
  chat: "M4 6.5c0-1.4 1.1-2.5 2.5-2.5h11c1.4 0 2.5 1.1 2.5 2.5v7c0 1.4-1.1 2.5-2.5 2.5H10l-4.5 3.6V16H6.5C5.1 16 4 14.9 4 13.5z",
  mail: "M3.5 6.5h17v11h-17z M3.8 7l8.2 6.2L20.2 7",
  phone: "M6.6 3.8l2.6.4 1.2 3.4-1.8 1.4a11 11 0 0 0 6.4 6.4l1.4-1.8 3.4 1.2.4 2.6c-.3 1.2-1.4 2-2.7 1.9C10.3 18.6 5.4 13.7 4.7 6.5c-.1-1.3.7-2.4 1.9-2.7z",
  person: "M12 12.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6",
  plane: "M2.8 13.2l6.8-1.6 4.9-7c.5-.8 1.8-.5 1.8.5l-.9 5.7 4.3-1.1c1-.3 1.7.8 1 1.5L19 13.6l-9.1 2.6-3.7 2.6.9-3.5z",
  train: "M7 3.5h10c1.4 0 2.5 1.1 2.5 2.5v8.5c0 1.4-1.1 2.5-2.5 2.5H7c-1.4 0-2.5-1.1-2.5-2.5V6c0-1.4 1.1-2.5 2.5-2.5z M4.6 10.5h14.8 M8.5 14.2h.01 M15.5 14.2h.01 M8 17l-2 3.5 M16 17l2 3.5",
  bus: "M5.5 4.5h13c.6 0 1 .4 1 1V17h-15V5.5c0-.6.4-1 1-1z M4.5 11h15 M7.5 20v-3 M16.5 20v-3 M8 14h.01 M16 14h.01",
  bed: "M3 18V7 M3 14h18v4 M21 14v-2.5c0-1.4-1.1-2.5-2.5-2.5H11v5 M7 12.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z",
  spark: "M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5z M18.5 16.5c.2 1.3.9 2 2.2 2.2-1.3.2-2 .9-2.2 2.2-.2-1.3-.9-2-2.2-2.2 1.3-.2 2-.9 2.2-2.2z",
  image: "M4 5.5h16v13H4z M4 15.5l4.5-4 3.5 3 3-2.5 5 4 M15.5 10.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z",
  video: "M4 8.5h16v10H4z M4 8.5l2.2-4h3.4L7.4 8.5 M11 8.5l2.2-4h3.4l-2.2 4 M10.5 11.5v4l3.5-2z",
  alarm: "M12 20.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M12 10v3.6l2.4 1.4 M4.5 5.5l2.5-2 M19.5 5.5l-2.5-2",
  bag: "M5.5 8h13l-1 12h-11z M9 8V6.5a3 3 0 0 1 6 0V8",
};
const doodle = (k) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "doodle"); s.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", D[k]); s.append(path);
  return s;
};

const POWER_GROUPS = [
  ["Talk", [
    ["whatsapp", "chat", "WhatsApp", "Writes the message, opens your WhatsApp. You tap send."],
    ["sms", "mail", "SMS", "From your own SIM."],
    ["call", "phone", "Calls", "Calls saved people with one tap."],
    ["contacts", "person", "Contacts", "Remembers numbers you tell it, on this phone only."],
  ]],
  ["Travel", [
    ["flights", "plane", "Flights", "MakeMyTrip, Google Flights"],
    ["trains", "train", "Trains", "ConfirmTkt / ixigo, IRCTC"],
    ["buses", "bus", "Buses", "redBus"],
    ["hotels", "bed", "Hotels", "MakeMyTrip, Booking.com, Google Hotels"],
  ]],
  ["AI", [
    ["models", "spark", "Claude · GPT · Gemini", "Ask any of them by name for a second opinion."],
    ["images", "image", "Images", "Creates pictures from a sentence."],
    ["videos", "video", "Higgsfield video", "Writes a pro video prompt, opens Higgsfield."],
  ]],
  ["Everyday", [
    ["reminders", "alarm", "Reminders", "Rings in the app + adds to Google Calendar."],
    ["apps", "bag", "Apps & shopping", "Amazon, Flipkart, Swiggy, Zomato, Uber, Maps, YouTube"],
  ]],
];
const ALL = POWER_GROUPS.flatMap(([, list]) => list.map((p) => p[0]));

let profile = store.get("profile", null);
let powers = store.get("powers", ALL);
let contacts = store.get("contacts", []);
let history = store.get("history", []); // [{role, content, actions?}]
let reminders = store.get("reminders", []);
let invite = store.get("invite", "");
let inviteNeeded = false;
let busy = false;

// ------------------------------------------------------------------- splash
(function splash() {
  const el = $("#splash");
  const seen = (() => { try { return sessionStorage.getItem("sherr:splash"); } catch { return null; } })();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hide = () => { el.classList.add("gone"); setTimeout(() => el.remove(), 600); };
  if (seen) return el.remove();
  try { sessionStorage.setItem("sherr:splash", "1"); } catch { /* ignore */ }
  el.addEventListener("click", hide);
  setTimeout(hide, reduce ? 500 : 3100);
})();

// ------------------------------------------------------------------ helpers
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid.nodeType ? kid : String(kid));
  return e;
};
const scrollDown = () => requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
const fmtTime = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const openUrl = (url) => { const a = h("a", { href: url, target: "_blank", rel: "noopener" }); document.body.append(a); a.click(); a.remove(); };
const canPick = () => "contacts" in navigator && "ContactsManager" in window;

function normalizePhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
function saveContact(name, phone) {
  const p = normalizePhone(phone);
  if (!name || !p) return;
  contacts = contacts.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
  contacts.push({ name, phone: p });
  store.set("contacts", contacts);
}
function linkFor(type, phone, text) {
  const p = normalizePhone(phone);
  if (type === "whatsapp") return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (type === "sms") return `sms:${p ? "+" + p : ""}?body=${encodeURIComponent(text)}`;
  return p ? `tel:+${p}` : null;
}

// ------------------------------------------------------------------- render
function hideWelcome() { $("#welcome")?.remove(); }

function addRow(role, content, actions = []) {
  hideWelcome();
  const row = role === "user"
    ? h("div", { class: "row me" }, h("div", { class: "bubble" }, content))
    : h("div", { class: "row sherr" }, h("div", { class: "bubble" }, content));
  feed.append(row);
  if (actions.length) feed.append(h("div", { class: "cards" }, actions.map(renderAction).filter(Boolean)));
  scrollDown();
}

function renderAction(a) {
  switch (a.type) {
    case "whatsapp":
    case "sms": {
      const label = a.type === "whatsapp" ? "WhatsApp" : "SMS";
      let phone = a.phone;
      const box = h("textarea", { "aria-label": `${label} message` }); box.value = a.text || "";
      const send = h("button", { class: "btn go", type: "button" }, a.type === "whatsapp" ? "Send on WhatsApp" : "Send SMS");
      const status = h("span", { class: "note" });
      send.addEventListener("click", () => {
        openUrl(linkFor(a.type, phone, box.value));
        send.className = "btn done"; send.textContent = "✓ Opened " + label;
      });
      const pick = canPick() && !phone ? h("button", { class: "btn soft", type: "button", onclick: async () => {
        try {
          const [c] = await navigator.contacts.select(["name", "tel"], { multiple: false });
          if (c?.tel?.[0]) { phone = c.tel[0]; saveContact(a.to || c.name?.[0], phone); status.textContent = `To ${c.name?.[0] || phone}`; }
        } catch { /* cancelled */ }
      } }, "Pick contact") : null;
      return h("div", { class: "card" },
        h("div", { class: "kicker ask" }, "Needs your tap · " + label),
        h("h3", {}, a.to ? `To ${a.to}` : "Choose who in " + label),
        box, h("div", { class: "btns" }, send, pick), status,
        !phone ? h("div", { class: "note" }, a.type === "whatsapp" ? "No number saved, WhatsApp will ask you to pick the chat." : "Add the number in your SMS app.") : null);
    }
    case "call": {
      const btn = h("button", { class: "btn go", type: "button", onclick: () => { openUrl(a.url); btn.className = "btn done"; btn.textContent = "✓ Calling"; } }, `Call ${a.to || ""}`.trim());
      return h("div", { class: "card" }, h("div", { class: "kicker ask" }, "Needs your tap · Call"), h("h3", {}, a.to || "+" + a.phone), h("div", { class: "btns" }, btn));
    }
    case "links":
      return h("div", { class: "card" },
        h("div", { class: "kicker" }, "Ready"),
        h("h3", {}, a.title), a.detail ? h("div", { class: "sub" }, a.detail) : null,
        h("div", { class: "links" }, (a.links || []).map((l) => h("a", { href: l.url, target: "_blank", rel: "noopener" }, l.label))));
    case "reminder":
      return h("div", { class: "card" },
        h("div", { class: "kicker" }, "Reminder set"),
        h("h3", {}, a.text), h("div", { class: "sub" }, fmtTime(a.at)),
        a.calendarUrl ? h("div", { class: "btns" }, h("a", { class: "btn soft", href: a.calendarUrl, target: "_blank", rel: "noopener" }, "Add to Google Calendar")) : null);
    case "answer":
      return h("div", { class: "card" }, h("div", { class: "kicker" }, `${a.model} says`), h("div", { class: "answer" }, a.text));
    case "image":
      return h("div", { class: "card" }, h("div", { class: "kicker" }, "Image"),
        h("img", { class: "gen", src: a.src, alt: a.prompt || "Generated image" }),
        h("div", { class: "btns" }, h("a", { class: "btn soft", href: a.src, download: "sherr-i.png" }, "Save")));
    case "copy_open": {
      const btn = h("button", { class: "btn go", type: "button", onclick: async () => {
        try { await navigator.clipboard.writeText(a.text); } catch { /* still open */ }
        openUrl(a.url); btn.textContent = "✓ Copied, paste it in Higgsfield";
      } }, "Copy prompt & open Higgsfield");
      return h("div", { class: "card" }, h("div", { class: "kicker" }, a.title), h("div", { class: "prompt" }, a.text), h("div", { class: "btns" }, btn));
    }
    case "save_contact":
      return h("div", { class: "card" }, h("div", { class: "kicker" }, "Saved on this phone"), h("h3", {}, `${a.name} · +${a.phone}`));
    default:
      return null;
  }
}

function applyActions(actions) {
  for (const a of actions) {
    if (a.type === "save_contact") saveContact(a.name, a.phone);
    if (a.type === "reminder") {
      reminders.push({ text: a.text, at: a.at, done: false });
      store.set("reminders", reminders);
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    }
  }
}

// ---------------------------------------------------------------- talking
async function send(text) {
  text = (text || "").trim();
  if (!text || busy) return;
  if (!profile) return openOnboard();
  busy = true; $("#sendBtn").disabled = true;
  input.value = ""; autoGrow();
  history.push({ role: "user", content: text });
  addRow("user", text);
  const typing = h("div", { class: "row sherr" },
    h("div", { class: "bubble typing", "aria-label": "Sherr I is thinking" }, h("span"), h("span"), h("span")));
  feed.append(typing); scrollDown();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(invite ? { "x-sherr-invite": invite } : {}) },
      body: JSON.stringify({
        messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
        profile, powers, contacts,
      }),
    });
    const data = await res.json().catch(() => ({}));
    typing.remove();
    if (res.status === 401 && data.error === "invite_required") {
      history.pop(); store.set("history", history);
      inviteNeeded = true; openOnboard("That invite code didn't work. Check it and try again.");
      return;
    }
    const reply = data.reply || "Kuch gadbad ho gayi, phir try karo 🙏";
    const actions = Array.isArray(data.actions) ? data.actions : [];
    applyActions(actions);
    history.push({ role: "assistant", content: reply, actions });
    store.set("history", history.slice(-80));
    addRow("assistant", reply, actions);
  } catch {
    typing.remove();
    addRow("assistant", "Internet nahi mil raha. Connection check karke phir bhejo.");
  } finally {
    busy = false; $("#sendBtn").disabled = false;
  }
}

function autoGrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
input.addEventListener("input", autoGrow);
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); send(input.value); } });
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });

// voice in
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
$("#micBtn").addEventListener("click", () => {
  if (!SR) { input.placeholder = "Voice needs Chrome on Android. Type instead."; input.focus(); return; }
  const rec = new SR();
  rec.lang = { Hindi: "hi-IN", Telugu: "te-IN", Tamil: "ta-IN" }[profile?.language] || "en-IN";
  rec.interimResults = true;
  const btn = $("#micBtn"); btn.classList.add("live");
  let said = "";
  rec.onresult = (e) => { said = Array.from(e.results).map((r) => r[0].transcript).join(" "); input.value = said; autoGrow(); };
  rec.onend = () => { btn.classList.remove("live"); if (said.trim()) send(said); };
  rec.onerror = () => btn.classList.remove("live");
  rec.start();
});

// ------------------------------------------------------------------ powers
function renderPowers() {
  $("#powerCount").textContent = powers.length;
  const list = $("#powerList"); list.replaceChildren();
  for (const [group, items] of POWER_GROUPS) {
    list.append(h("div", { class: "group" }, h("h4", {}, group), items.map(([id, ico, name, desc]) => {
      const cb = h("input", { type: "checkbox", id: "p-" + id, "aria-label": name });
      cb.checked = powers.includes(id);
      cb.addEventListener("change", () => {
        powers = cb.checked ? [...new Set([...powers, id])] : powers.filter((p) => p !== id);
        store.set("powers", powers); $("#powerCount").textContent = powers.length;
      });
      return h("div", { class: "power" }, doodle(ico),
        h("div", { class: "txt" }, h("b", {}, name), h("small", {}, desc)),
        h("label", { class: "switch" }, cb, h("span")));
    })));
  }
}
const sheet = (id, open) => { $(id).hidden = !open; };
$("#powersBtn").addEventListener("click", () => sheet("#powers", true));
$("#powers").addEventListener("click", (e) => { if (e.target.id === "powers" || e.target.closest("[data-close]")) sheet("#powers", false); });
$("#editProfile").addEventListener("click", () => { sheet("#powers", false); openOnboard(); });
$("#clearChat").addEventListener("click", () => { history = []; store.set("history", []); location.reload(); });

// -------------------------------------------------------------- onboarding
function openOnboard(err) {
  $("#obName").value = profile?.name || "";
  $("#obLang").value = profile?.language || "Hinglish";
  $("#obInvite").value = invite || "";
  $("#inviteRow").hidden = !inviteNeeded;
  $("#obErr").hidden = !err; $("#obErr").textContent = err || "";
  sheet("#onboard", true);
  setTimeout(() => $("#obName").focus(), 50);
}
$("#obForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#obName").value.trim();
  if (!name) { $("#obErr").hidden = false; $("#obErr").textContent = "Enter your name"; return; }
  profile = { name, language: $("#obLang").value };
  store.set("profile", profile);
  if (inviteNeeded) { invite = $("#obInvite").value.trim().toUpperCase(); store.set("invite", invite); }
  sheet("#onboard", false);
  greet();
});

// ------------------------------------------------------------------- start
const EXAMPLES = [
  ["chat", "Papa ko WhatsApp: 8 baje tak ghar aa jaunga"],
  ["train", "Kal Anantapur se Hyderabad ki train"],
  ["bed", "Goa mein 2 nights ke liye hotel, ₹3000 tak"],
  ["spark", "Ask Claude: best laptop under ₹60k for coding?"],
  ["image", "Make an image of a white tiger in Hyderabad rain"],
  ["alarm", "Remind me to call Amma at 7 pm"],
];
function greet() {
  const tasks = $("#tasks");
  if (!tasks) return;
  const p = $("#welcome p");
  if (profile?.name) p.textContent = `Namaste ${profile.name}. Tell it what you need, like you'd text a friend.`;
  tasks.replaceChildren(...EXAMPLES.map(([icon, t]) => h("button", { class: "task", type: "button", onclick: () => send(t) }, doodle(icon), h("span", {}, t))));
}

// ------------------------------------------------------------------- theme
let theme = store.get("theme", "system");
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme; else root.dataset.theme = theme;
  const dark = theme === "dark" || (theme === "system" && darkMQ.matches);
  root.dataset.resolved = dark ? "dark" : "light";
  $("#themeColor")?.setAttribute("content", dark ? "#0b0b0b" : "#ffffff");
  document.querySelectorAll("[data-theme-opt]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeOpt === theme)));
}
document.querySelectorAll("[data-theme-opt]").forEach((b) => b.addEventListener("click", () => { theme = b.dataset.themeOpt; store.set("theme", theme); applyTheme(); }));
darkMQ.addEventListener?.("change", applyTheme);
applyTheme();

function checkReminders() {
  let changed = false;
  for (const r of reminders) {
    if (!r.done && new Date(r.at) <= new Date()) {
      r.done = true; changed = true;
      addRow("assistant", "⏰ " + r.text);
      if ("Notification" in window && Notification.permission === "granted") {
        try { new Notification("Sherr I", { body: r.text, icon: "/icons/icon-192.png" }); } catch { /* ignore */ }
      }
      navigator.vibrate?.([200, 100, 200]);
    }
  }
  if (changed) store.set("reminders", reminders.filter((r) => !r.done || Date.now() - new Date(r.at) < 864e5));
}

renderPowers();
for (const m of history) addRow(m.role, m.content, m.actions || []);
greet();
setInterval(checkReminders, 20_000); checkReminders();
fetch("/api/chat").then((r) => r.json()).then((s) => { inviteNeeded = !!s.invite && !invite; if (!profile) setTimeout(openOnboard, history.length ? 0 : 3200); }).catch(() => { if (!profile) setTimeout(openOnboard, 3200); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
