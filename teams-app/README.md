# Teams App Manifest

After completing Azure Bot registration (task 1.6), fill in `manifest.json`:

| Placeholder | Where to find it |
|---|---|
| `REPLACE_WITH_TEAMS_APP_GUID` | Generate one: `uuidgen` |
| `REPLACE_WITH_BOT_APP_ID` | Azure Portal → your Bot resource → Configuration → Microsoft App ID |
| `REPLACE_WITH_DEPLOY_DOMAIN` | Your Vercel production domain (e.g. `teams-legal-os.vercel.app`) |

## Icon assets

Add two PNG files in this directory:

- `color.png` — 192x192, full-color icon
- `outline.png` — 32x32, transparent outline

## Package for sideloading

```bash
cd teams-app
zip legal-ops.zip manifest.json color.png outline.png
```

Upload `legal-ops.zip` via Teams Admin Center → Manage apps → Upload, or sideload to your own Teams client via Apps → Manage your apps → Upload an app.
