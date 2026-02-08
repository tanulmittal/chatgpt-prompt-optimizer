(function () {
  "use strict";

  var INLINE_BUTTON_ID = "prompt-optimizer-inline-button";

  var fallbackSettings = {
    enabled: true,
    autoOptimizeOnSend: false,
    strength: "balanced",
    showToast: true,
    useAiBackend: true,
    openRouterApiKey: ""
  };

  var settings = Object.assign({}, fallbackSettings);
  var state = {
    lastOptimizedFingerprint: "",
    lastOptimizationAt: 0,
    optimizing: false,
    bypassSendInterception: false,
    lastModel: "",
    lastFailureMessage: "",
    mountTimer: null
  };

  function mergeDefaultSettings() {
    if (window.PromptOptimizer && window.PromptOptimizer.DEFAULT_SETTINGS) {
      settings = Object.assign({}, window.PromptOptimizer.DEFAULT_SETTINGS, settings);
      if (typeof settings.useAiBackend === "undefined") settings.useAiBackend = true;
      if (typeof settings.openRouterApiKey === "undefined") settings.openRouterApiKey = "";
    }
  }

  function loadSettings() {
    if (!chrome.storage) return;

    if (chrome.storage.sync) {
      var syncDefaults = {
        enabled: true,
        autoOptimizeOnSend: false,
        strength: "balanced",
        showToast: true
      };
      chrome.storage.sync.get(syncDefaults, function (result) {
        settings = Object.assign({}, settings, result || {});
        scheduleMountOptimizeButton();
      });
    }

    if (chrome.storage.local) {
      var localDefaults = {
        useAiBackend: true,
        openRouterApiKey: ""
      };
      chrome.storage.local.get(localDefaults, function (result) {
        settings = Object.assign({}, settings, result || {});
      });
    }
  }

  function listenStorageUpdates() {
    if (!chrome.storage || !chrome.storage.onChanged) return;

    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== "sync" && areaName !== "local") return;

      Object.keys(changes || {}).forEach(function (key) {
        settings[key] = changes[key].newValue;
      });

      scheduleMountOptimizeButton();
    });
  }

  function isTextarea(el) {
    return !!el && el.tagName === "TEXTAREA";
  }

  function isContentEditablePrompt(el) {
    if (!el || !el.isContentEditable) return false;
    if (el.id === "prompt-textarea") return true;
    if (el.getAttribute("role") === "textbox") return true;
    if (el.getAttribute("data-lexical-editor") === "true") return true;
    return false;
  }

  function isChatTextarea(el) {
    if (!isTextarea(el)) return false;
    if (el.id === "prompt-textarea") return true;
    if (el.closest("form")) return true;
    return false;
  }

  function isChatComposer(el) {
    return isChatTextarea(el) || isContentEditablePrompt(el);
  }

  function getComposerFromSelection() {
    if (!window.getSelection) return null;
    var selection = window.getSelection();
    if (!selection || !selection.anchorNode) return null;

    var node = selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
    if (!node || !node.closest) return null;

    var match = node.closest(
      "textarea#prompt-textarea, #prompt-textarea, [contenteditable='true'][role='textbox'], [contenteditable='true'][data-lexical-editor='true']"
    );
    return isChatComposer(match) ? match : null;
  }

  function getComposerFromSendButton() {
    var sendButton = getSendButton();
    if (!sendButton || !sendButton.closest) return null;
    var form = sendButton.closest("form");
    if (!form || !form.querySelector) return null;

    var fromForm = form.querySelector(
      "textarea#prompt-textarea, #prompt-textarea[contenteditable='true'], [contenteditable='true'][role='textbox'], [contenteditable='true'][data-lexical-editor='true']"
    );
    return isChatComposer(fromForm) ? fromForm : null;
  }

  function getActiveChatComposer() {
    var active = document.activeElement;
    if (isChatComposer(active)) return active;

    var fromSelection = getComposerFromSelection();
    if (fromSelection) return fromSelection;

    var selectors = [
      "textarea#prompt-textarea",
      "form textarea",
      "main textarea",
      "#prompt-textarea[contenteditable='true']",
      "form #prompt-textarea[contenteditable='true']",
      "main [contenteditable='true'][role='textbox']",
      "main [contenteditable='true'][data-lexical-editor='true']",
      "form [contenteditable='true'][role='textbox']",
      "form [contenteditable='true'][data-lexical-editor='true']"
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var found = document.querySelector(selectors[i]);
      if (isChatComposer(found)) return found;
    }

    var fromSendButton = getComposerFromSendButton();
    if (fromSendButton) return fromSendButton;

    return null;
  }

  function getSendButton() {
    var selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send message"]',
      'button[aria-label="Send prompt"]'
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var button = document.querySelector(selectors[i]);
      if (button) return button;
    }

    return null;
  }

  function getComposerValue(composer) {
    if (!composer) return "";
    if (isTextarea(composer)) return composer.value || "";
    return composer.innerText || composer.textContent || "";
  }

  function setNativeComposerValue(composer, value) {
    if (isTextarea(composer)) {
      var descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(composer, value);
      } else {
        composer.value = value;
      }

      composer.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (typeof composer.focus === "function") composer.focus();

    var wroteViaExecCommand = false;
    try {
      if (window.getSelection && document.createRange && document.execCommand) {
        var selection = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);
        wroteViaExecCommand = !!document.execCommand("insertText", false, value);
      }
    } catch (_execError) {
      wroteViaExecCommand = false;
    }

    if (!wroteViaExecCommand) {
      if ("innerText" in composer) {
        composer.innerText = value;
      } else {
        composer.textContent = value;
      }
    }

    try {
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value
      }));
    } catch (_error) {
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    }

    composer.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getComposerForm(composer) {
    if (!composer) return null;
    if (composer.form) return composer.form;
    if (composer.closest) return composer.closest("form");
    return null;
  }

  function ensureToastContainer() {
    var existing = document.getElementById("prompt-optimizer-toast");
    if (existing) return existing;

    var toast = document.createElement("div");
    toast.id = "prompt-optimizer-toast";
    toast.style.position = "fixed";
    toast.style.right = "16px";
    toast.style.bottom = "16px";
    toast.style.padding = "8px 12px";
    toast.style.borderRadius = "8px";
    toast.style.background = "rgba(16, 18, 27, 0.92)";
    toast.style.color = "#f5f5f5";
    toast.style.fontSize = "12px";
    toast.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    toast.style.zIndex = "2147483647";
    toast.style.opacity = "0";
    toast.style.transition = "opacity 160ms ease";
    toast.style.pointerEvents = "none";

    (document.body || document.documentElement).appendChild(toast);
    return toast;
  }

  function showToast(message, duration) {
    if (!settings.showToast) return;

    var toast = ensureToastContainer();
    toast.textContent = message;
    toast.style.opacity = "1";

    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      toast.style.opacity = "0";
    }, typeof duration === "number" ? duration : 1400);
  }

  function runtimeOptimize(text, strength) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({
        type: "PROMPT_OPTIMIZE",
        payload: {
          text: text,
          strength: strength
        }
      }, function (response) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || "Runtime messaging failed." });
          return;
        }

        resolve(response || { ok: false, error: "No response from background worker." });
      });
    });
  }

  async function optimizeCurrentPrompt(options) {
    var opts = options || {};
    var respectAutoSetting = !!opts.respectAutoSetting;
    var forceRewrite = !!opts.force;
    state.lastFailureMessage = "";

    if (!settings.enabled) {
      state.lastFailureMessage = "Extension is disabled.";
      return false;
    }
    if (respectAutoSetting && !settings.autoOptimizeOnSend) {
      state.lastFailureMessage = "Auto optimize is disabled.";
      return false;
    }
    if (!window.PromptOptimizer || typeof window.PromptOptimizer.optimizePrompt !== "function") {
      state.lastFailureMessage = "Optimizer is not loaded.";
      return false;
    }

    var composer = getActiveChatComposer();
    if (!composer) {
      state.lastFailureMessage = "Could not find ChatGPT input box.";
      return false;
    }

    var current = getComposerValue(composer).trim();
    if (!current) {
      state.lastFailureMessage = "Input is empty.";
      return false;
    }

    var now = Date.now();
    if (!forceRewrite && now - state.lastOptimizationAt < 250) return false;

    var fingerprint = current + "::" + settings.strength;
    if (!forceRewrite && fingerprint === state.lastOptimizedFingerprint) return false;

    var optimized = "";

    if (settings.useAiBackend) {
      var ai = await runtimeOptimize(current, settings.strength);
      if (ai && ai.ok && ai.optimized) {
        optimized = String(ai.optimized).trim();
        state.lastModel = ai.model || "x-ai/grok-4.1-fast";
      } else {
        var aiReason = ai && ai.error ? String(ai.error) : "Unknown AI backend error.";
        state.lastFailureMessage = "AI optimization failed: " + aiReason;
        return false;
      }
    } else {
      optimized = window.PromptOptimizer.optimizePrompt(current, {
        strength: settings.strength,
        force: forceRewrite
      });
    }

    if (forceRewrite && optimized === current) {
      optimized = window.PromptOptimizer.optimizePrompt(current, {
        strength: settings.strength,
        force: true
      });
    }

    if (!optimized || optimized === current) return false;

    setNativeComposerValue(composer, optimized);
    state.lastOptimizationAt = now;
    state.lastOptimizedFingerprint = optimized + "::" + settings.strength;

    if (settings.useAiBackend && state.lastModel) {
      showToast("Prompt optimized (AI: " + state.lastModel + ")");
    } else {
      showToast("Prompt optimized (local " + settings.strength + ")");
    }

    return true;
  }

  function isSendButton(target) {
    if (!target || !target.closest) return false;

    return !!target.closest(
      'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label="Send prompt"]'
    );
  }

  function sendAfterOptimization() {
    var composer = getActiveChatComposer();
    var form = getComposerForm(composer);
    var sendButton = getSendButton();

    state.bypassSendInterception = true;

    if (sendButton && !sendButton.disabled) {
      sendButton.click();
    } else if (form) {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.submit();
      }
    }

    window.setTimeout(function () {
      state.bypassSendInterception = false;
    }, 0);
  }

  function setButtonLoading(button, loading) {
    if (!button) return;

    button.disabled = !!loading;
    button.dataset.optimizing = loading ? "1" : "0";
    button.textContent = loading ? "Optimizing..." : "Optimize";
    button.style.opacity = loading ? "0.8" : "1";
    button.style.cursor = loading ? "progress" : "pointer";
  }

  function styleOptimizeButton(button) {
    button.id = INLINE_BUTTON_ID;
    button.type = "button";
    button.textContent = "Optimize";
    button.setAttribute("aria-label", "Optimize prompt");
    button.style.height = "32px";
    button.style.padding = "0 12px";
    button.style.borderRadius = "999px";
    button.style.border = "1px solid rgba(148, 163, 184, 0.5)";
    button.style.background = "rgba(15, 23, 42, 0.06)";
    button.style.color = "#0f172a";
    button.style.fontSize = "12px";
    button.style.fontWeight = "600";
    button.style.lineHeight = "1";
    button.style.marginRight = "8px";
    button.style.cursor = "pointer";
    button.style.transition = "all 120ms ease";

    button.addEventListener("mouseenter", function () {
      button.style.background = "rgba(15, 23, 42, 0.12)";
    });

    button.addEventListener("mouseleave", function () {
      button.style.background = "rgba(15, 23, 42, 0.06)";
    });

    button.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (state.optimizing) return;

      state.optimizing = true;
      setButtonLoading(button, true);

      try {
        var changed = await optimizeCurrentPrompt({ respectAutoSetting: false, force: true });
        if (!changed) {
          showToast(state.lastFailureMessage || "No optimization needed", 2200);
        }
      } finally {
        state.optimizing = false;
        setButtonLoading(button, false);
      }
    });
  }

  function removeInlineButton() {
    var existing = document.getElementById(INLINE_BUTTON_ID);
    if (existing) existing.remove();
  }

  function mountOptimizeButton() {
    if (!settings.enabled) {
      removeInlineButton();
      return;
    }

    var sendButton = getSendButton();
    if (!sendButton || !sendButton.parentElement) return;

    var parent = sendButton.parentElement;
    var existing = document.getElementById(INLINE_BUTTON_ID);

    if (existing && existing.parentElement === parent) return;
    if (existing && existing.parentElement !== parent) existing.remove();

    var button = document.createElement("button");
    styleOptimizeButton(button);
    parent.insertBefore(button, sendButton);
  }

  function scheduleMountOptimizeButton() {
    window.clearTimeout(state.mountTimer);
    state.mountTimer = window.setTimeout(mountOptimizeButton, 80);
  }

  function startUiObserver() {
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function () {
      scheduleMountOptimizeButton();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  mergeDefaultSettings();
  loadSettings();
  listenStorageUpdates();

  startUiObserver();
  scheduleMountOptimizeButton();

  document.addEventListener("focusin", scheduleMountOptimizeButton, true);
})();
