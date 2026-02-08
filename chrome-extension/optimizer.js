(function () {
  "use strict";

  var DEFAULT_SETTINGS = {
    enabled: true,
    autoOptimizeOnSend: false,
    strength: "balanced",
    showToast: true
  };

  function normalize(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/\t/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function dedupe(arr) {
    var out = [];
    var seen = new Set();
    for (var i = 0; i < arr.length; i += 1) {
      var item = arr[i];
      if (!item) continue;
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    return out;
  }

  function looksStructured(text) {
    var markers = ["task:", "context:", "requirements:", "output format:", "constraints:"];
    var lower = text.toLowerCase();
    var hits = 0;

    for (var i = 0; i < markers.length; i += 1) {
      if (lower.indexOf(markers[i]) !== -1) hits += 1;
    }

    return hits >= 2;
  }

  function extractOutputHint(text) {
    var lower = text.toLowerCase();

    if (/\bjson\b/.test(lower)) return "Return valid JSON only.";
    if (/\btable\b/.test(lower)) return "Use a compact markdown table.";
    if (/\bbullet/.test(lower) || /\blist\b/.test(lower)) return "Use concise bullet points.";
    if (/\bstep[- ]?by[- ]?step\b/.test(lower)) return "Use numbered steps.";
    if (/\bemail\b/.test(lower)) return "Write as a polished email draft.";

    return "Start with the direct answer, then add brief supporting details.";
  }

  function extractConstraints(lines, text) {
    var lower = text.toLowerCase();
    var constraints = [];

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (!line) continue;

      if (/\bmust\b|\bshould\b|\bdon't\b|\bdo not\b|\bavoid\b|\bexactly\b/i.test(line)) {
        constraints.push(line.replace(/^[\-*\d.\s]+/, ""));
      }
    }

    if (/\bbrief\b|\bconcise\b|\bshort\b/.test(lower)) constraints.push("Keep the response concise.");
    if (/\bdetailed\b|\bdeep\b|\bcomprehensive\b/.test(lower)) constraints.push("Include detailed reasoning where useful.");
    if (/\bprofessional\b/.test(lower)) constraints.push("Use a professional tone.");

    return dedupe(constraints).slice(0, 5);
  }

  function splitTaskAndContext(lines) {
    if (lines.length === 1) {
      return {
        task: lines[0],
        context: []
      };
    }

    var task = lines[0];
    var context = lines.slice(1).filter(Boolean).slice(0, 6);

    return {
      task: task,
      context: context
    };
  }

  function optimizePrompt(raw, options) {
    var settings = options || {};
    var strength = settings.strength || "balanced";
    var force = !!settings.force;
    var clean = normalize(raw);

    if (!clean) return clean;
    if (!force && clean.length < 12) return clean;
    if (!force && looksStructured(clean)) return clean;

    var lines = clean.split("\n").map(function (line) {
      return line.trim();
    }).filter(Boolean);

    if (!lines.length) return clean;

    var split = splitTaskAndContext(lines);
    var constraints = extractConstraints(lines, clean);
    var outputHint = extractOutputHint(clean);

    var requirements = [
      "Answer directly and accurately.",
      "State assumptions when required information is missing."
    ];

    if (strength === "light") {
      requirements.push("If critical context is missing, ask one concise clarification question.");
    } else if (strength === "strict") {
      requirements.push("If key details are missing, ask up to three clarifying questions before finalizing.");
      requirements.push("Avoid generic advice; make the response specific to the task.");
    } else {
      requirements.push("If key details are missing, ask up to two clarifying questions before finalizing.");
    }

    requirements = dedupe(requirements.concat(constraints));

    var parts = [];
    parts.push("Task:\n" + split.task);

    if (split.context.length) {
      parts.push("Context:\n- " + split.context.join("\n- "));
    }

    parts.push("Requirements:\n- " + requirements.join("\n- "));
    parts.push("Output format:\n- " + outputHint);

    return parts.join("\n\n");
  }

  window.PromptOptimizer = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    optimizePrompt: optimizePrompt
  };
})();
