# Pace — voice coding

Talk to Claude out loud, and have it change code in your GitHub repo. Single `index.html`, no build step, no dependencies. Works in Chrome (desktop or Android).

## Use it
1. Open the page (GitHub Pages URL on a phone; HTTPS is required for the microphone).
2. Tap **⚙️ Settings**, paste your Anthropic API key, and tap **Save**. The key stays in that browser only and is sent only to `api.anthropic.com`. Without a key, Pace just transcribes.
3. **Hands-free** (default): tap **Start conversation**. Speak, pause, and Claude answers out loud as its reply streams in, then Pace listens again. Tap while Claude is talking or working to interrupt; say "stop" (or tap) to end.
4. **Hold to talk**: switch modes with the button at the top, then hold the big button (or the spacebar) while you speak.

Code in replies is shown on screen but not read aloud. **Clear** also starts a fresh conversation.

**Effort** (in Settings) trades speed for depth: Medium is the default; use High or Extra high for heavier coding.

## Install it like an app
- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. It gets the Pace icon and opens full screen.
- **Android / desktop Chrome:** menu → **Install app** (or "Add to Home screen").

Each install keeps its own saved keys, so paste your key once more inside the installed app.

## Keeping it yours
The page itself is public (GitHub Pages can't password-protect a site on a personal account), but it's useless to anyone else: your API key and GitHub token live only in your own browser, so visitors would have to bring their own. It's also marked `noindex` so search engines skip it.

For your own devices, set a **passcode** in Settings. Your key and token are then stored encrypted, and Pace asks for the passcode each time it opens (**Lock now** locks it right away).

To hide the page from everyone else entirely, host it on Cloudflare Pages behind **Cloudflare Access** (free for personal use), which asks for a one-time code sent to your email before the page loads at all.

## Coding in a GitHub repo
In **⚙️ Settings → Code in a GitHub repo**, fill in:

- **Repo**: `owner/name`, e.g. `liujerry7/Pace`.
- **Work branch**: where Claude commits (default `pace`). If it doesn't exist, Pace creates it from the default branch on the first change. Claude never commits to your default branch unless you name it here.
- **Token**: a GitHub fine-grained personal access token. Create one at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → *Generate new token*: pick **Only select repositories** → your repo, and under **Repository permissions** set **Contents: Read and write**. It's stored only in this browser and sent only to `api.github.com`.

Then just ask: "add a dark mode toggle to the settings page." Claude lists and reads files, edits them, and commits each change; the transcript shows each step, and a link to the branch appears when it's done. Review and merge from GitHub (open a pull request from the work branch).

## GitHub Pages
Settings → Pages → Build and deployment → Source: **Deploy from a branch** → branch `main`, folder `/ (root)` → Save.
After about a minute the site is at `https://<your-username>.github.io/<repo-name>/`.
