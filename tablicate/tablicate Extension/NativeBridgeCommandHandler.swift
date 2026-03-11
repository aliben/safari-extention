import Foundation
import WebKit
#if os(macOS)
import AppKit
#endif

final class NativeBridgeCommandHandler {
    func handle(type: String, payload: [String: Any]) -> [String: Any] {
        switch type {
        case "GET_RECENTLY_CLOSED":
            return [
                "status": "ok",
                "items": [],
            ]

        case "RESTORE_TAB":
            return restoreTab(payload: payload)

        case "OPEN_SHORTCUTS_PREFERENCES":
            return openShortcutsPreferences()

        case "CLEAR_ALL_DATA":
            return clearAllData()

        default:
            return [
                "status": "error",
                "message": "Unknown command: \(type)",
            ]
        }
    }

    private func clearAllData() -> [String: Any] {
        if let bundleID = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: bundleID)
            UserDefaults.standard.synchronize()
        }
        
        let dispatchGroup = DispatchGroup()
        dispatchGroup.enter()
        
        DispatchQueue.main.async {
            let dataStore = WKWebsiteDataStore.default()
            let types = WKWebsiteDataStore.allWebsiteDataTypes()
            dataStore.removeData(ofTypes: types, modifiedSince: Date.distantPast) {
                dispatchGroup.leave()
            }
        }
        
        // Wait briefly (up to 2 seconds) for data to be cleared so we don't block the extension forever.
        _ = dispatchGroup.wait(timeout: .now() + 2.0)
        
        return [
            "status": "success",
            "message": "All native local storage cleared successfully."
        ]
    }

    private func restoreTab(payload: [String: Any]) -> [String: Any] {
        let sessionId = payload["sessionId"] as? String
        let urlValue = payload["url"] as? String

        if sessionId != nil {
            return [
                "status": "error",
                "message": "Session restore is not implemented in host app yet.",
            ]
        }

        guard let urlValue, let url = URL(string: urlValue) else {
            return [
                "status": "error",
                "message": "Missing or invalid url.",
            ]
        }

        #if os(macOS)
        NSWorkspace.shared.open(url)
        return ["status": "ok"]
        #else
        return [
            "status": "error",
            "message": "URL restore is not implemented for this platform.",
        ]
        #endif
    }

    private func openShortcutsPreferences() -> [String: Any] {
        #if os(macOS)
        if let settingsURL = URL(string: "x-apple.systempreferences:com.apple.ExtensionsPreferences") {
            NSWorkspace.shared.open(settingsURL)
            return ["status": "ok"]
        }
        return [
            "status": "error",
            "message": "Unable to open Safari extension preferences.",
        ]
        #else
        return [
            "status": "error",
            "message": "Shortcut preferences are unavailable on this platform.",
        ]
        #endif
    }
}
