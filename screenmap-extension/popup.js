const $ = (id) => document.getElementById(id);

function hostOf(url) {
  try { return new URL(url).host; } catch { return ""; }
}

function render(st) {
  const configured = !!(st.twm_endpoint && st.twm_key);
  const recording = !!st.twm_recording;
  const btn = $("toggle");

  $("setupBtn").style.display = configured ? "none" : "block";
  if (!configured) {
    $("status").innerHTML =
      '<span class="warn">Not set up yet.</span> One-time: in your dashboard click <b>Connect extension</b>, OR tap <b>Set up manually</b> below to paste your project key.';
    btn.disabled = true;
    btn.textContent = "Start recording";
    btn.className = "primary";
    $("count").textContent = "";
    return;
  }

  btn.disabled = false;
  $("status").innerHTML = recording
    ? "Recording. Browse your site — a red bar shows on every page. Click Finish (bar) or Stop here when done."
    : '<span class="ok">Connected</span> to ' + hostOf(st.twm_endpoint) + ". Open your site and click Start.";
  btn.textContent = recording ? "Stop recording" : "Start recording";
  btn.className = recording ? "stop" : "primary";

  const m = st.twm_map || { screens: {}, edges: [] };
  const s = Object.keys(m.screens || {}).length;
  const e = (m.edges || []).length;
  $("count").textContent = recording ? `${s} screen${s === 1 ? "" : "s"} · ${e} link${e === 1 ? "" : "s"}` : "";
}

function load() {
  chrome.storage.local.get(["twm_recording", "twm_endpoint", "twm_key", "twm_map"], render);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

$("toggle").addEventListener("click", async () => {
  const st = await chrome.storage.local.get(["twm_recording", "twm_endpoint", "twm_key"]);
  if (!st.twm_endpoint || !st.twm_key) return;
  const tab = await activeTab();
  if (st.twm_recording) {
    await chrome.storage.local.set({ twm_recording: false });
    try { if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "TWM_STOP" }); } catch {}
  } else {
    // Lock recording to THIS tab's site only. Other open tabs (YouTube, Gemini, …)
    // must not be captured. The content script gates on twm_origin.
    let origin = "";
    try { origin = new URL(tab.url).origin; } catch {}
    if (!/^https?:\/\//.test(origin)) {
      alert("Open your website in this tab first, then click Start recording.");
      return;
    }
    chrome.runtime.sendMessage({ type: "TWM_POST", endpoint: st.twm_endpoint, key: st.twm_key, map: { screens: {}, edges: [] }, reset: true });
    await chrome.storage.local.set({ twm_map: { screens: {}, edges: [] }, twm_last: null, twm_click: null, twm_origin: origin, twm_recording: true });
    try { if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "TWM_START" }); } catch {}
  }
  load();
});

$("setup").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("setupBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((c, area) => { if (area === "local") load(); });
load();
