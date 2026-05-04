# Setup

How to run the atlas locally for development and how to deploy it to
GitHub Pages.

## Run it locally

The site is a static page with no build step, but it must be served
over HTTP — opening `index.html` directly via `file://` will fail
because ES modules require an HTTP origin.

The simplest way, using Python (already installed on macOS):

```
cd ~/Documents/GitHub/world-atlas
python3 -m http.server 8000
```

Open <http://localhost:8000> in your browser. To stop the server,
press `Ctrl+C` in the terminal.

If you prefer Node:

```
npx serve .
```

## Deploy to GitHub Pages

After your first commit and push, enable GitHub Pages on the repo:

1. Go to <https://github.com/JumpingPie/world-atlas>.
2. Click **Settings** (top tab on the repo page).
3. In the left sidebar, click **Pages**.
4. Under **Build and deployment**, set:
   - **Source**: Deploy from a branch
   - **Branch**: `main`, folder `/ (root)`
5. Click **Save**.

GitHub will build and deploy the site. After 1–3 minutes it'll be live
at:

<https://jumpingpie.github.io/world-atlas/>

The Pages settings page shows a green check and the URL once it's live.
Subsequent pushes to `main` redeploy automatically — no manual step.

## Commit and push (via GitHub Desktop)

1. Open GitHub Desktop. It should already show the `world-atlas` repo
   with a list of changed files in the left pane.
2. At the bottom-left there's a commit message area. Type a short
   summary (e.g. "Section 1: project skeleton and base map").
3. Click **Commit to main**.
4. Click **Push origin** at the top.

Refresh the GitHub repo page in your browser to confirm the files
appeared.

## AI features (Ollama)

The atlas optionally calls a local Ollama instance for timeline
summaries and country comparisons. If you don't run Ollama, the rest of
the atlas works normally — AI features are disabled gracefully.

If you do run it, two things matter:

1. **Run Ollama with the model loaded**:
   ```
   ollama serve
   ollama pull gemma3:12b
   ```

2. **Allow the deployed site to talk to Ollama** by setting
   `OLLAMA_ORIGINS` before launching:
   ```
   OLLAMA_ORIGINS="https://jumpingpie.github.io,http://localhost:*" ollama serve
   ```

   Without this, Ollama rejects requests from `*.github.io` due to CORS.
   When running the site locally via `python3 -m http.server`, the
   `http://localhost:*` origin already allows it.

You can change the configured endpoint and model from a settings panel
in the app (added in a later section). Defaults are `localhost:11434`
and `gemma3:12b`.
