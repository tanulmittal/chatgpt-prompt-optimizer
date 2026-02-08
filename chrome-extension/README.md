# Prompt Optimizer (Chrome Extension)

This extension runs on `chatgpt.com` and rewrites your message into a clearer, structured prompt when you click Optimize.

## What it does

- Detects the active ChatGPT input box
- Adds an `Optimize` button beside the Send button on `chatgpt.com`
- Optimizes only when you click the `Optimize` button
- Uses OpenRouter AI backend with model `x-ai/grok-4.1-fast`
- Uses local rule-based optimization only when AI backend is disabled
- Lets you choose optimization strength (`Light`, `Balanced`, `Strict`)

## Install locally

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select and upload

## Configure

1. Click the Prompt Optimizer extension icon.
2. Turn on `Use AI backend` to use OpenRouter.
3. Paste your OpenRouter API key in `OpenRouter API key`.
4. Keep model fixed as `x-ai/grok-4.1-fast`.

## Use on ChatGPT

1. Type your draft prompt in ChatGPT.
2. Click `Optimize` (button shown near Send).
3. Review the rewritten prompt.
4. Click Send.

## Notes

- API key is stored in `chrome.storage.local` (local browser profile storage).
- If OpenRouter fails while AI backend is enabled, the input is left unchanged and an error toast is shown.
- If your prompt is already strongly structured, changes may be minimal.
