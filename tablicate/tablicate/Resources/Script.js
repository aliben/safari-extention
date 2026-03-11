function show(enabled, useSettingsInsteadOfPreferences) {
    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('state-on')[0].innerText = "tablicate’s extension is currently on. You can turn it off in the Extensions section of Safari Settings.";
        document.getElementsByClassName('state-off')[0].innerText = "tablicate’s extension is currently off. You can turn it on in the Extensions section of Safari Settings.";
        document.getElementsByClassName('state-unknown')[0].innerText = "You can turn on tablicate’s extension in the Extensions section of Safari Settings.";
        document.getElementsByClassName('open-preferences')[0].innerText = "Quit and Open Safari Settings…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);

// ── Clear Extension Storage ────────────────────────────────────────────────
const clearBtn        = document.querySelector("button.clear-storage");
const confirmBtn      = document.querySelector("button.clear-storage-confirm");
const cancelBtn       = document.querySelector("button.clear-storage-cancel");
const clearStatus     = document.querySelector("p.clear-status");

clearBtn.addEventListener("click", () => {
    clearBtn.style.display    = "none";
    confirmBtn.style.display  = "";
    cancelBtn.style.display   = "";
    clearStatus.textContent   = "All saved tabs, bookmarks, login session and encryption keys will be erased.";
    clearStatus.className     = "clear-status warn";
});

cancelBtn.addEventListener("click", () => {
    confirmBtn.style.display  = "none";
    cancelBtn.style.display   = "none";
    clearBtn.style.display    = "";
    clearStatus.textContent   = "";
    clearStatus.className     = "clear-status";
});

confirmBtn.addEventListener("click", () => {
    confirmBtn.disabled      = true;
    cancelBtn.disabled       = true;
    clearStatus.textContent  = "Clearing\u2026";
    clearStatus.className    = "clear-status";
    webkit.messageHandlers.controller.postMessage("clear-storage");
});

// Called back by Swift after the clear operation completes
function onClearStorageResult(success, message) {
    confirmBtn.style.display  = "none";
    cancelBtn.style.display   = "none";
    confirmBtn.disabled       = false;
    cancelBtn.disabled        = false;
    clearBtn.style.display    = "";
    clearStatus.textContent   = message;
    clearStatus.className     = "clear-status " + (success ? "success" : "error");
    setTimeout(() => {
        clearStatus.textContent = "";
        clearStatus.className   = "clear-status";
    }, 4000);
}
