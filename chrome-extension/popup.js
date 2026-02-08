(function () {
  "use strict";

  var syncDefaults = {
    enabled: true,
    strength: "balanced",
    showToast: true
  };

  var localDefaults = {
    useAiBackend: true,
    openRouterApiKey: ""
  };

  var syncFields = {
    enabled: document.getElementById("enabled"),
    strength: document.getElementById("strength"),
    showToast: document.getElementById("showToast")
  };

  var localFields = {
    useAiBackend: document.getElementById("useAiBackend"),
    openRouterApiKey: document.getElementById("openRouterApiKey")
  };

  var savedLabel = document.getElementById("saved");

  function showSaved(text) {
    savedLabel.textContent = text;
    window.clearTimeout(showSaved._timer);
    showSaved._timer = window.setTimeout(function () {
      savedLabel.textContent = "";
    }, 1100);
  }

  function persistSync() {
    var next = {
      enabled: syncFields.enabled.checked,
      strength: syncFields.strength.value,
      showToast: syncFields.showToast.checked
    };

    chrome.storage.sync.set(next, function () {
      showSaved("Saved settings");
    });
  }

  function persistLocal() {
    var next = {
      useAiBackend: localFields.useAiBackend.checked,
      openRouterApiKey: String(localFields.openRouterApiKey.value || "").trim()
    };

    chrome.storage.local.set(next, function () {
      showSaved("Saved key/backend");
    });
  }

  function bindEvents() {
    Object.keys(syncFields).forEach(function (key) {
      syncFields[key].addEventListener("change", persistSync);
    });

    localFields.useAiBackend.addEventListener("change", persistLocal);
    localFields.openRouterApiKey.addEventListener("change", persistLocal);
    localFields.openRouterApiKey.addEventListener("blur", persistLocal);
  }

  function hydrate() {
    chrome.storage.sync.get(syncDefaults, function (syncValues) {
      var values = Object.assign({}, syncDefaults, syncValues || {});
      syncFields.enabled.checked = !!values.enabled;
      syncFields.strength.value = values.strength || "balanced";
      syncFields.showToast.checked = !!values.showToast;
    });

    chrome.storage.local.get(localDefaults, function (localValues) {
      var values = Object.assign({}, localDefaults, localValues || {});
      localFields.useAiBackend.checked = !!values.useAiBackend;
      localFields.openRouterApiKey.value = values.openRouterApiKey || "";
    });
  }

  bindEvents();
  hydrate();
})();
