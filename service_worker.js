const EXPIRATION_ALARM = "flingster-session-expiration";
const EXPIRATION_KEY = "sessionExpiresAt";
const FLINGSTER_URLS = [
  "https://flingster.com/*",
  "https://www.flingster.com/*",
];

chrome.runtime.onInstalled.addListener(() => {
  void scheduleExpiration();
});

chrome.runtime.onStartup.addListener(() => {
  void scheduleExpiration();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EXPIRATION_ALARM) {
    void refreshExpiredSession();
  }
});

async function scheduleExpiration() {
  const stored = await chrome.storage.local.get(EXPIRATION_KEY);
  const expirationAt = stored[EXPIRATION_KEY];

  if (typeof expirationAt !== "number" || !Number.isFinite(expirationAt)) {
    await chrome.alarms.clear(EXPIRATION_ALARM);
    return;
  }

  if (expirationAt <= Date.now()) {
    await refreshExpiredSession();
    return;
  }

  chrome.alarms.create(EXPIRATION_ALARM, { when: expirationAt });
}

async function refreshExpiredSession() {
  const stored = await chrome.storage.local.get(EXPIRATION_KEY);
  const expirationAt = stored[EXPIRATION_KEY];

  if (typeof expirationAt !== "number" || !Number.isFinite(expirationAt)) {
    await chrome.alarms.clear(EXPIRATION_ALARM);
    return;
  }

  if (Date.now() < expirationAt) {
    chrome.alarms.create(EXPIRATION_ALARM, { when: expirationAt });
    return;
  }

  const tabs = await chrome.tabs.query({ url: FLINGSTER_URLS });
  await Promise.all(tabs.map((tab) => chrome.tabs.reload(tab.id)));
  await chrome.storage.local.remove(EXPIRATION_KEY);
  await chrome.alarms.clear(EXPIRATION_ALARM);
}
