//
//  ViewController.swift
//  tablicate
//
//  Created by MAC on 3/1/26.
//

import Cocoa
import SafariServices
import WebKit

let extensionBundleIdentifier = "com.tablicate.Extension"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show(\(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show(\(state.isEnabled), false)")
                }
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String else { return }

        if body == "open-preferences" {
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
                DispatchQueue.main.async {
                    NSApplication.shared.terminate(nil)
                }
            }
        } else if body == "clear-storage" {
            clearExtensionStorage()
        }
    }

    // MARK: – Clear all extension storage (web data)

    private func clearExtensionStorage() {
        let allTypes = WKWebsiteDataStore.allWebsiteDataTypes()

        // Fetch all WebKit data records and look for ones that belong to
        // the safari-web-extension:// origin (extension background / popup pages).
        WKWebsiteDataStore.default().fetchDataRecords(ofTypes: allTypes) { [weak self] records in
            guard let self else { return }

            // Filter for the extension's own origin records first.
            let extensionRecords = records.filter {
                $0.displayName.contains("safari-web-extension") ||
                $0.displayName.contains(extensionBundleIdentifier) ||
                $0.displayName.lowercased().contains("tablicate")
            }

            // If we found extension-specific records, remove just those;
            // otherwise fall back to removing all website data in this store.
            let toRemove = extensionRecords.isEmpty ? records : extensionRecords

            WKWebsiteDataStore.default().removeData(ofTypes: allTypes, for: toRemove) {
                let clearedCount = toRemove.count

                DispatchQueue.main.async {
                    let msg: String
                    if clearedCount > 0 {
                        msg = "\\u2713 Cleared \\(clearedCount) storage record(s). Open the extension popup and sign in again."
                    } else {
                        msg = "\\u2713 No cached records found. Open the extension popup, tap \\'Clear All Data\\' to fully reset."
                    }
                    self.webView.evaluateJavaScript("onClearStorageResult(true, '\(msg)')")
                }
            }
        }
    }

}
