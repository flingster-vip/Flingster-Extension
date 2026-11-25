const WORKER_URL = "https://flingster-auth.adityabhakta2020.workers.dev";

const COOKIE_NAME  = "Member";
const COOKIE_DOMAIN = ".flingster.com";
const EXPIRATION_ALARM = "flingster-session-expiration";
const EXPIRATION_KEY = "sessionExpiresAt";
const PENDING_START_KEY = "pendingStartAt";

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

let countdownTimer = null;

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

  // Resume a countdown if the popup was closed while waiting
  const stored = await chrome.storage.local.get(PENDING_START_KEY);
  const pendingStart = stored[PENDING_START_KEY];
  if (pendingStart && pendingStart > Date.now()) {
    startCountdown(pendingStart);
  } else if (pendingStart) {
    await chrome.storage.local.remove(PENDING_START_KEY);
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
  // Block attempts while a countdown is running
  if (countdownTimer) return;

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
      const err = new Error(data.error || "Authentication failed");
      err.status = res.status;
      err.start = data.start;
      throw err;
    }
  } catch (err) {
    setLoading(false);

    if (err.status === 425) {
      const startMs = err.start ? Date.parse(err.start) : NaN;
      if (!isNaN(startMs) && startMs > Date.now()) {
        await chrome.storage.local.set({ [PENDING_START_KEY]: startMs });
        startCountdown(startMs);
        return;
      }
      showMessage(
        "error",
        "Your access window has started, but the token hasn't been issued yet. Please try again shortly."
      );
      setStatus("idle", "Idle");
      return;
    }

    showMessage("error", err.message || "Network error — check your connection.");
    setStatus("idle", "Idle");
    return;
  }

  await chrome.storage.local.remove(PENDING_START_KEY);

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
  await chrome.storage.local.remove(["savedPassword", EXPIRATION_KEY, PENDING_START_KEY]);
  await chrome.alarms.clear(EXPIRATION_ALARM);
  stopCountdown();
  passwordInput.value = "";
  rememberCheck.checked = false;
  cookieInfo.classList.remove("visible");
  setStatus("idle", "Idle");
  showMessage("success", "Session cleared. Cookie removed.");
});

/* ---------- Countdown ---------- */

function startCountdown(startMs) {
  stopCountdown();
  authBtn.disabled = true;

  const tick = async () => {
    const remaining = startMs - Date.now();
    if (remaining <= 0) {
      stopCountdown();
      await chrome.storage.local.remove(PENDING_START_KEY);
      setStatus("idle", "Idle");
      showMessage("success", "Access is now open. You can log in.");
      return;
    }
    setStatus("idle", "Waiting…");
    showMessage("error", "Access not active yet. Starts in " + formatDuration(remaining));
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  authBtn.disabled = false;
  authBtn.classList.remove("loading");
}

function formatDuration(ms) {
  const total = Math.ceil(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return (d > 0 ? d + "d " : "") + `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/* ---------- UI helpers ---------- */

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
