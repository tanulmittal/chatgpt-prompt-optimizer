(function () {
  "use strict";

  var MODEL = "x-ai/grok-4.1-fast";
  var OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

  function storageLocalGet(defaults) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(defaults, function (result) {
        resolve(result || defaults || {});
      });
    });
  }

  function cleanText(text) {
    return String(text || "").replace(/\s+$/g, "").trim();
  }

  function buildSystemPrompt(strength) {
    var profile = "balanced";
    if (strength === "light") profile = "light";
    if (strength === "strict") profile = "strict";

    var rules = [
      "You are Prompt Optimizer.",
      "Rewrite the user's raw prompt into a stronger prompt for ChatGPT.",
      "Preserve intent, facts, and language of the original prompt.",
      "Do not answer the task itself.",
      "Output only the optimized prompt text, with no explanation or markdown fences.",
      "Use this structure when useful: Task, Context, Requirements, Output format.",
      "Remove ambiguity and add concise constraints only when implied by user intent."
    ];

    if (profile === "light") {
      rules.push("Make minimal edits. Keep it very close to the original phrasing.");
    } else if (profile === "strict") {
      rules.push("Make strong edits for clarity, specificity, and testable output requirements.");
      rules.push("If missing critical details, include up to 3 short clarifying questions at the end.");
    } else {
      rules.push("Balance clarity and brevity.");
      rules.push("If needed, include up to 2 short clarifying questions at the end.");
    }

    return rules.join("\n");
  }

  function normalizeAssistantContent(content) {
    if (Array.isArray(content)) {
      return content.map(function (item) {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (item.text) return item.text;
        if (item.type === "text" && item.content) return item.content;
        return "";
      }).join("\n");
    }

    return String(content || "");
  }

  async function openRouterChatCompletion(apiKey, payload) {
    var response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "https://chatgpt.com",
        "X-Title": "Prompt Optimizer Chrome Extension"
      },
      body: JSON.stringify(payload)
    });

    var data = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      var message = data && data.error && data.error.message
        ? data.error.message
        : ("OpenRouter request failed (" + response.status + ")");
      throw new Error(message);
    }

    var assistant = data
      && data.choices
      && data.choices[0]
      && data.choices[0].message;

    if (!assistant) {
      throw new Error("OpenRouter returned no assistant message.");
    }

    return {
      content: cleanText(normalizeAssistantContent(assistant.content)),
      reasoningDetails: assistant.reasoning_details
    };
  }

  async function optimizeWithOpenRouter(inputText, strength, apiKey) {
    var systemPrompt = buildSystemPrompt(strength);

    var first = await openRouterChatCompletion(apiKey, {
      model: MODEL,
      reasoning: { enabled: true },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: inputText
        }
      ]
    });

    if (!first.content) {
      throw new Error("OpenRouter returned an empty optimization response.");
    }

    var finalOptimized = first.content;

    if (typeof first.reasoningDetails !== "undefined") {
      try {
        var secondMessages = [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: inputText
          },
          {
            role: "assistant",
            content: first.content,
            reasoning_details: first.reasoningDetails
          },
          {
            role: "user",
            content: "Return the final optimized prompt text only."
          }
        ];

        var second = await openRouterChatCompletion(apiKey, {
          model: MODEL,
          temperature: 0.2,
          messages: secondMessages
        });

        if (second.content) {
          finalOptimized = second.content;
        }
      } catch (_ignoredSecondPassError) {
        finalOptimized = first.content;
      }
    }

    return finalOptimized;
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || message.type !== "PROMPT_OPTIMIZE") return;

    (async function () {
      var payload = message.payload || {};
      var inputText = cleanText(payload.text || "");
      var strength = payload.strength || "balanced";

      if (!inputText) {
        sendResponse({ ok: false, error: "Empty input text." });
        return;
      }

      var local = await storageLocalGet({
        useAiBackend: true,
        openRouterApiKey: ""
      });

      if (!local.useAiBackend) {
        sendResponse({ ok: false, error: "AI backend disabled in settings." });
        return;
      }

      var apiKey = cleanText(local.openRouterApiKey || "");
      if (!apiKey) {
        sendResponse({ ok: false, error: "Missing OpenRouter API key." });
        return;
      }

      try {
        var optimized = await optimizeWithOpenRouter(inputText, strength, apiKey);
        sendResponse({ ok: true, optimized: optimized, model: MODEL });
      } catch (error) {
        sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
      }
    })();

    return true;
  });
})();
