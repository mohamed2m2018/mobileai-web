const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["twm_endpoint", "twm_key"], (st) => {
  $("endpoint").value = st.twm_endpoint || "";
  $("key").value = st.twm_key || "";
});

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    twm_endpoint: $("endpoint").value.trim(),
    twm_key: $("key").value.trim(),
  });
  const ok = $("saved");
  ok.style.display = "inline";
  setTimeout(() => (ok.style.display = "none"), 2000);
});
