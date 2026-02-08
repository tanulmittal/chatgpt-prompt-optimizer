# Prompt Optimizer Chrome Extension

A Chrome extension that rewrites raw ChatGPT input into a clearer, higher-quality prompt before you send it.

## Highlights

- Adds an **Optimize** button next to ChatGPT's send button
- Optimizes **only when you click Optimize**
- AI optimization via OpenRouter (`x-ai/grok-4.1-fast`)
- Optional local rule-based optimization when AI backend is disabled
- Configurable optimization strength: `Light`, `Balanced`, `Strict`
- In-page status toasts for success/error feedback

## Demo Flow

1. Type your draft in ChatGPT.
2. Click **Optimize**.
3. Review replaced text in the input box.
4. Click **Send**.

## Project Structure

```text
chrome-extension/
  manifest.json
  background.js
  content.js
  optimizer.js
  popup.html
  popup.js
  popup.css
```

## Installation (Local / Unpacked)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `chrome-extension` folder from this repo.

## Configuration

1. Click the extension icon in Chrome.
2. Configure:
- `Enable extension`
- `Optimization strength`
- `Use AI backend`
- `OpenRouter API key`
- `Show in-page toast`

### OpenRouter Setup

- Get an API key from OpenRouter.
- Paste it into **OpenRouter API key** in the extension popup.
- Current model in code: `x-ai/grok-4.1-fast`.

## Behavior Notes

- If `Use AI backend` is ON and API/model call fails, input remains unchanged and an error toast is shown.
- If `Use AI backend` is OFF, local rule-based optimizer is used.
- API key is stored in `chrome.storage.local` (your browser profile on your machine).

## Publish to GitHub

1. Push this repo to GitHub.
2. Add screenshots/GIFs in a `docs/` folder and link them here.
3. (Optional) Add license and contribution guidelines.

## Troubleshooting

- **Optimize button not visible:** Refresh ChatGPT tab and ensure extension is enabled.
- **No optimization output:** Verify API key and OpenRouter model access.
- **Changes not reflected after code edits:** Reload extension in `chrome://extensions` and refresh ChatGPT.

## Development

- Manifest version: MV3
- Content script target: `https://chatgpt.com/*`
- Background worker handles OpenRouter API calls.
