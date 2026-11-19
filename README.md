# Pace — voice coding

Talk to Claude out loud. Single `index.html`, no build step, no dependencies. Works in Chrome (desktop or Android).

## Use it
1. Open the page (GitHub Pages URL on a phone; HTTPS is required for the microphone).
2. Tap **⚙️ API key**, paste your Anthropic API key, and tap **Save**. The key stays in that browser only and is sent only to `api.anthropic.com`. Without a key, Pace just transcribes.
3. **Hands-free** (default): tap **Start conversation**. Speak, pause, and Claude answers out loud, then Pace listens again. Tap while Claude is talking to interrupt; say "stop" (or tap) to end.
4. **Hold to talk**: switch modes with the button at the top, then hold the big button (or the spacebar) while you speak.

Code Claude writes is shown on screen but not read aloud. **Clear** also starts a fresh conversation.

## GitHub Pages
Settings → Pages → Build and deployment → Source: **Deploy from a branch** → pick the branch that holds `index.html`, folder `/ (root)` → Save.
After about a minute the site is at `https://<your-username>.github.io/<repo-name>/`.
