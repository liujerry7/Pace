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

Built-in protections, with or without a passcode:
- The page loads nothing from other sites, and a Content Security Policy only lets it talk to `api.anthropic.com` and `api.github.com`, so even injected code couldn't send your keys anywhere else.
- Claude's replies are drawn as plain text, never as HTML.
- Claude never sees your keys; it only asks Pace to run tools.
- Saved keys are never shown again in Settings (only their last 4 characters).
- Pace refuses to run inside another site's frame.

**Without a passcode**, the keys sit unencrypted in this browser's storage. That's fine on a device only you use with its own lock screen, but anyone using your unlocked browser could use Pace or dig the keys out.

**With a passcode** (Settings), the keys are stored encrypted (AES-256, key derived with PBKDF2 at 600,000 rounds). Pace asks for the passcode when it opens and again after 15 minutes in the background; **Lock now** locks it right away. Use 6+ characters; a few random words is strongest, because someone who copies your browser's storage could try short passcodes offline.

**If you forget the passcode**, there's no recovery and no back door: tap *Forgot it? Erase saved keys* (twice) and paste them in again. Erasing only deletes, so it doesn't help anyone else get in. Anthropic shows a key only once, so you may need to make a new one in the Console (and delete the old one).

**If a key ever leaks**, delete it in the Anthropic Console and the token on GitHub; both stop working at once. Give the GitHub token an expiry date.

To hide the page from everyone else entirely, host it on Cloudflare Pages behind **Cloudflare Access** (free for personal use), which asks for a one-time code sent to your email before the page loads at all.

## Coding in a GitHub repo
In **⚙️ Settings → Code in a GitHub repo**, fill in:

- **Repo**: `owner/name`, e.g. `liujerry7/Pace`.
- **Work branch**: where Claude commits (default `pace`). If it doesn't exist, Pace creates it from the default branch on the first change. Pace refuses to commit to the default branch, even if you type its name here, unless you tick **Allow commits straight to the default branch**.
- **Token**: a GitHub fine-grained personal access token. Create one at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → *Generate new token*: pick **Only select repositories** → your repo, and under **Repository permissions** set **Contents: Read and write**. It's stored only in this browser and sent only to `api.github.com`.

Then just ask: "add a dark mode toggle to the settings page." Claude lists and reads files, edits them, and commits each change; the transcript shows each step, and a link to the branch appears when it's done. Review and merge from GitHub (open a pull request from the work branch).

**Compiling:** Claude can't run your program, but it can compile it. A repo with `.github/workflows/pace-build.yml` builds every push to the work branch on GitHub Actions and writes the result (pass/fail plus compiler errors) to `status.json` on a `<branch>-builds` branch. Pace's `check_build` tool waits for that file, so Claude finishes a set of changes, builds, fixes errors, and only then says it's done. It needs no extra token permissions. `PlaygroundTopDown2D` has one (Visual Studio 2026, Debug x64, checking out the private Jumble engine with a read-only deploy key stored as the `JUMBLE_DEPLOY_KEY` secret); copy and adapt it for other repos. Without one, build it yourself to check.

**More repos later:** change **Repository** in Settings (recent ones are suggested as you type). The same token works if it can reach that repo: on GitHub, open the token, *Edit*, and add the repo under **Only select repositories**. The token's value doesn't change, so there's nothing to paste again.

**Coding conventions:** Settings → *Coding conventions* holds your naming, class-design and clang-format rules (copied from your Lifeline docs). Claude follows them in code it writes and, when you ask for something that breaks them, writes the conforming version and says so in a sentence. A repo's own `CLAUDE.md`, `CONVENTIONS.md` or `.clang-format` wins. Edit the text freely; *Reset to the Lifeline version* brings back the original.

## GitHub Pages
Settings → Pages → Build and deployment → Source: **Deploy from a branch** → branch `main`, folder `/ (root)` → Save.
After about a minute the site is at `https://<your-username>.github.io/<repo-name>/`.
