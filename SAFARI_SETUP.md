# Safari Extension + Native Bridge Setup

This folder contains the Safari-targeted Web Extension codebase.

## 1) Create the Safari host app in Xcode

1. Open Xcode.
2. Choose **File → New → Project**.
3. Select **Safari Extension App**.
4. Set product name (example: `TablicateSafari`) and bundle id prefix.
5. Choose your Team and signing settings.
6. When prompted, point the extension source to this folder:
   - `Safari extention/`

This generates:
- a Safari Web Extension target (loads this folder)
- a host app target (required for App Store/TestFlight and native bridge)

## 2) Build and run on macOS Safari

1. In Xcode, select the macOS host app scheme.
2. Run the app once (creates the extension registration).
3. Open Safari → Settings → Extensions.
4. Enable your `Tablicate` extension.

## 3) Run on iOS/iPadOS Safari

1. Select an iOS/iPadOS simulator/device scheme.
2. Run the host app.
3. On device: Settings → Safari → Extensions → enable the extension.

## 4) Native bridge contract (for parity fallbacks)

Host-side scaffold files are available in:
- `Safari extention/native-host-template/`

The extension sends native messages (when available) with this envelope:

```json
{
  "type": "GET_RECENTLY_CLOSED | RESTORE_TAB | OPEN_SHORTCUTS_PREFERENCES",
  "payload": { ... },
  "source": "tablicate-safari-extension",
  "version": 1
}
```

Expected responses:

```json
{ "status": "ok", "items": [] }
```
or
```json
{ "status": "ok" }
```
or
```json
{ "status": "error", "message": "..." }
```

### Implement these handlers in the host app/native layer

- `GET_RECENTLY_CLOSED` → return recently closed items in extension format
- `RESTORE_TAB` → restore by `sessionId` when possible, else by `url`
- `OPEN_SHORTCUTS_PREFERENCES` → open Safari preference pane for extensions if possible

Use `native-host-template/README.md` for the exact Xcode wiring steps.

## 5) Configurable native app id

Default native app id expected by extension: `com.tablicate.host`

Override from extension storage (optional):
- key: `nativeBridgeAppId`
- scope: `chrome.storage.sync`

## 6) Current fallback behavior

- `recentlyClosed` search: tries WebExtension `sessions` API first, then native bridge.
- `RESTORE_TAB`: tries `sessions.restore`, then `tabs.create(url)`, then native bridge.
- Manage shortcuts button: requests native bridge first; otherwise shows Safari Settings guidance.

## 7) Debug tips

- Safari Web Extension logs: Safari Web Inspector → extension service worker.
- Host app logs: Xcode console.
- If native bridge unavailable, extension gracefully falls back and shows user guidance.
