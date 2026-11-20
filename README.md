# Pace — voice coding

Talk to Claude out loud and have it build things: in files kept in your browser, or as commits to your GitHub repo. It can run JavaScript to check its work, search the web, and check or update your Lifeline. Single `index.html`, no build step, no dependencies. Works in Chrome (desktop or Android).

## Use it
1. Open the page (GitHub Pages URL on a phone; HTTPS is required for the microphone).
2. Tap **⚙️ Settings**, paste your Anthropic API key, and tap **Save**. The key stays in that browser only and is sent only to `api.anthropic.com`. Without a key, Pace just transcribes.
3. **Hands-free** (default): tap **Start conversation**. Speak, pause, and Claude answers out loud as its reply streams in, then Pace listens again. Tap while Claude is talking or working to interrupt; say "stop" (or tap) to end.
4. **Hold to talk**: switch modes with the button at the top, then hold the big button (or the spacebar) while you speak.

Code in replies is shown on screen but not read aloud. **Clear** also starts a fresh conversation.

**Effort** (in Settings) trades speed for depth. **Auto** (the default) uses Low for plain chat, so replies come quickly, and Medium when a repo is connected. Use High or Extra high for heavier coding. Effort stays the same for a whole conversation, because changing it mid-conversation would throw away the prompt cache.

**Voice** (in Settings): Pace picks the most natural voice your device has. Pick another, change the speed, and tap **Test voice** to hear it. In Chrome the "Google" voices sound best, and in Edge the "Natural" ones. On iPhone, download an Enhanced or Premium voice in Settings → Accessibility → Spoken Content → Voices → English.

**Chats:** every conversation is saved in this browser (up to 50), encrypted. With a passcode set, chats lock along with your keys. Tap the clock icon to reopen one and carry on where you left off. **Clear** (✎) starts a new chat and keeps the old one. Forgetting your passcode erases the chats, because they can't be decrypted without it.

**Mic trouble:** under the mic button, Pace shows "Starting the mic…", then "Go ahead, I'm listening…" once it actually hears audio, and "Hearing you…" when you speak. If the mic never starts, or hears nothing twice in a row, it says so. On iPhone, use Safari.

## Building without a repo
With no repo connected, Claude works on a small set of files kept in this browser. Ask for something like "make a snake game" or "write a palindrome checker and test it". The transcript shows each step, and the **folder icon** at the top opens the files. HTML files have **Preview**, which runs the page inside Pace in a sandbox with no network access. Every file has **Download**.

The files stay in this browser across reloads and chats, until you tap **Delete all files**. They aren't encrypted by the passcode, so don't keep secrets in them.

## Running code and web search
These work with or without a repo:
- **run_javascript**: Claude runs standalone JavaScript in a Web Worker and gets back the console output, return value and errors. It uses this to test logic and fix what fails before telling you it's done. The worker has no DOM and no access to Pace or your keys. It inherits Pace's network rules, so it can't reach other sites, and it is stopped after 5 seconds. It can't run your repo's program; use `check_build` for that.
- **Web search**: Claude can look up docs or current facts. Searches cost $10 per 1,000, with at most 5 per step. To turn web search off, set `ENABLE_WEB_SEARCH = false` near the top of the script in `index.html`.

## Dictating code (C++ and others)
Say code the way you'd read it out: "for int i equals zero, i less than count, i plus plus", "vector of unique pointer to Enemy", "member camel case max speed". Claude turns spoken symbols into code ("colon colon" is `::`, "arrow" is `->`, "ampersand" is `&`) and fixes common mishearings ("in" for `int`, "see out" for `cout`, "otto" for `auto`). It writes the code into the file you're working on, not just into the chat.

**Language for new code** (⚙️ Settings) picks the default: Auto (the repo's language, else JavaScript), C++, JavaScript or Python. With C++:
- **With a repo connected,** Claude compiles with `check_build` and fixes errors before saying it's done.
- **Without a repo,** Claude writes `.cpp` and `.h` files in the browser workspace, but Pace can't compile C++ itself, so Claude says the code hasn't been compiled. Download the files and build them yourself, or connect a repo.

## Lifeline
In ⚙️ Settings → **Lifeline**, paste the URL of Lifeline's MCP server and, if it needs one, a token. Then ask things like "what should I work on next?", "what's on my calendar this afternoon?" or "log an hour on Pace". The transcript shows each Lifeline call (📅).

- **The server must be reachable over the internet** (HTTPS, Streamable HTTP or SSE). Anthropic's servers make the calls through the MCP connector, so a server that only runs on your computer won't work. Servers that sign in with OAuth need you to get an access token first and paste it here. Pace doesn't refresh it, so paste a new one when it expires.
- **What Claude may do:** read tools (overview, what now, events, projects, goals, time tracked, docs) are always on. **Let Claude add and update things** turns on logging time, clocks, ticking to-dos, creating and updating events, projects and docs. Claude says what it will change and waits for your "yes". Deleting, archiving and rule changes are never enabled.
- **Privacy:** the token is stored like your other keys (encrypted with the passcode, if you set one) and included in the setup link for another device. It's sent only to api.anthropic.com, which passes it to the Lifeline server.

Changing the repo, Lifeline URL or the write switch starts a new conversation, because Claude's tools change.

## Install it like an app
- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. It gets the Pace icon and opens full screen.
- **Android / desktop Chrome:** menu → **Install app** (or "Add to Home screen").

Each install keeps its own saved keys. To copy your setup instead of pasting keys again: on the device that's set up, open ⚙️ Settings → **Send to another device**. Scan the QR code with the other device's camera, open the link, type the 10-character code shown next to the QR, and tap **Set up this device**.
- The link carries your keys and settings encrypted with that code (AES-256, PBKDF2). It works for 30 minutes, and the encrypted part sits after `#`, which browsers never send to any server.
- On iPhone the link opens in Safari, but a Home Screen app keeps its own storage. Tap **Copy link** on the setup screen, open the Home Screen app, and paste it under ⚙️ Settings → **Set up from another device**.
- Custom coding conventions longer than a QR code can hold are left out; copy those by hand.

## Keeping it yours
The page itself is public (GitHub Pages can't password-protect a site on a personal account), but it's useless to anyone else: your API key and GitHub token live only in your own browser, so visitors would have to bring their own. It's also marked `noindex` so search engines skip it.

Built-in protections, with or without a passcode:
- The page loads nothing from other sites, and a Content Security Policy only lets it talk to `api.anthropic.com` and `api.github.com`, so even injected code couldn't send your keys anywhere else. The only addition for running code is `worker-src blob:`, and Claude's code is placed in the worker's source, so the page never needs `unsafe-eval`.
- Code Claude runs (Web Worker) and pages it previews (sandboxed frame without `allow-same-origin`) can't read Pace's storage, where your keys are.
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
