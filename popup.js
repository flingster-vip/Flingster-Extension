const WORKER_URL = "https://flingster-auth.adityabhakta2020.workers.dev";

const COOKIE_NAME  = "Member";
const COOKIE_DOMAIN = ".flingster.com";
const EXPIRATION_ALARM = "flingster-session-expiration";
const EXPIRATION_KEY = "sessionExpiresAt";
const passwordInput = document.getElementById("passwordInput");
const toggleVis     = document.getElementById("toggleVis");
const rememberCheck = document.getElementById("rememberCheck");
const authBtn       = document.getElementById("authBtn");
const clearBtn      = document.getElementById("clearBtn");
const messageEl     = document.getElementById("message");
const messageText   = document.getElementById("messageText");
const statusPill    = document.getElementById("statusPill");
const statusText    = document.getElementById("statusText");
const cookieInfo    = document.getElementById("cookieInfo");
const expireDisplay = document.getElementById("expireDisplay");

document.addEventListener("DOMContentLoaded", async () => {
  const saved = await getSaved();
  if (saved) {
    passwordInput.value = saved;
    rememberCheck.checked = true;
  }
  const existing = await getCookie();
  if (existing) {
    setStatus("active", "Active");
    showCookieInfo("(existing)");
  }
  passwordInput.focus();
});

toggleVis.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  toggleVis.querySelector("svg").style.opacity = isHidden ? "0.4" : "1";
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") authBtn.click();
});

authBtn.addEventListener("click", async () => {
  const password = passwordInput.value.trim();
  if (!password) {
    showMessage("error", "Please enter your password.");
    return;
  }

  setLoading(true);
  clearMessage();
  setStatus("idle", "Fetching…");

  let data;
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Authentication failed");
    }
  } catch (err) {
    showMessage("error", err.message || "Network error — check your connection.");
    setStatus("idle", "Idle");
    setLoading(false);
    return;
  }
  if (rememberCheck.checked) {
    await chrome.storage.local.set({ savedPassword: password });
  } else {
    await chrome.storage.local.remove("savedPassword");
  }
  const expiresMs = parseExpireToMs(data.expire);
  try {
    await chrome.cookies.set({
      url:            "https://flingster.com",
      domain:         COOKIE_DOMAIN,
      name:           COOKIE_NAME,
      value:          data.token,
      path:           "/",
      secure:         true,
      sameSite:       "no_restriction",
      expirationDate: expiresMs ? expiresMs / 1000 : undefined,
    });
  } catch (err) {
    showMessage("error", "Token received but cookie set failed: " + err.message);
    setLoading(false);
    return;
  }

  if (expiresMs) {
    await chrome.storage.local.set({ [EXPIRATION_KEY]: expiresMs });
    chrome.alarms.create(EXPIRATION_ALARM, { when: expiresMs });
  } else {
    await chrome.storage.local.remove(EXPIRATION_KEY);
    await chrome.alarms.clear(EXPIRATION_ALARM);
  }

  setLoading(false);
  setStatus("active", "Active");
  showMessage("success", "Cookie set! Your session is now active on Flingster.");
  showCookieInfo(data.expire);
});

clearBtn.addEventListener("click", async () => {
  await chrome.cookies.remove({ url: "https://flingster.com", name: COOKIE_NAME });
  await chrome.cookies.remove({ url: "https://www.flingster.com", name: COOKIE_NAME });
  await chrome.storage.local.remove(["savedPassword", EXPIRATION_KEY]);
  await chrome.alarms.clear(EXPIRATION_ALARM);
  passwordInput.value = "";
  rememberCheck.checked = false;
  cookieInfo.classList.remove("visible");
  setStatus("idle", "Idle");
  showMessage("success", "Session cleared. Cookie removed.");
});

function setLoading(on) {
  authBtn.disabled = on;
  authBtn.classList.toggle("loading", on);
}

function setStatus(type, label) {
  statusPill.className = "status-pill" + (type === "active" ? " active" : "");
  statusText.textContent = label;
}

function showMessage(type, text) {
  messageEl.className = "message " + type;
  messageText.textContent = text;
  messageEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearMessage() {
  messageEl.className = "message";
}

function showCookieInfo(expire) {
  cookieInfo.classList.add("visible");
  expireDisplay.textContent = expire || "—";
}

async function getSaved() {
  const result = await chrome.storage.local.get("savedPassword");
  return result.savedPassword || null;
}

async function getCookie() {
  try {
    const cookie = await chrome.cookies.get({ url: "https://flingster.com", name: COOKIE_NAME });
    return cookie ? cookie.value : null;
  } catch {
    return null;
  }
}

function parseExpireToMs(str) {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length < 3) return null;
  const [dd, mm, yyyy, HH = "00", min = "00", ss = "00"] = parts;
  const d = new Date(`${yyyy}-${mm}-${dd}T${HH}:${min}:${ss}`);
  return isNaN(d) ? null : d.getTime();
}
