/**
 * Sync short daily notes to a Google Sheet via Apps Script web app.
 * Config is stored in localStorage only (never committed).
 */
window.DailyNotesSheet = (function () {
    const CONFIG_KEY = "gadmin-daily-notes-sheet-config";

    function loadConfig() {
        try {
            const raw = localStorage.getItem(CONFIG_KEY);
            const cfg = raw ? JSON.parse(raw) : {};
            return {
                enabled: !!cfg.enabled,
                webAppUrl: (cfg.webAppUrl || "").trim(),
                token: (cfg.token || "").trim(),
            };
        } catch {
            return { enabled: false, webAppUrl: "", token: "" };
        }
    }

    function saveConfig(cfg) {
        localStorage.setItem(
            CONFIG_KEY,
            JSON.stringify({
                enabled: !!cfg.enabled,
                webAppUrl: (cfg.webAppUrl || "").trim(),
                token: (cfg.token || "").trim(),
            })
        );
    }

    function isReady() {
        const c = loadConfig();
        return c.enabled && c.webAppUrl && c.token;
    }

    async function request(payload) {
        const cfg = loadConfig();
        const url = cfg.webAppUrl;
        const body = { ...payload, token: cfg.token };

        const res = await fetch(url, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Sync failed");
        return data;
    }

    async function testConnection() {
        return request({ action: "ping" });
    }

    async function syncEntry(entry, dayKey, event) {
        if (entry.form !== "short") return { skipped: true };
        if (!isReady()) return { skipped: true };

        const payload = {
            action: event === "delete" ? "delete" : event === "create" ? "create" : "update",
            id: entry.id,
            day: dayKey,
            content: entry.content || "",
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt || entry.createdAt,
            charCount: (entry.content || "").length,
        };

        const result = await request(payload);
        return { ok: true, result };
    }

    function bindSettingsUI() {
        const panel = document.getElementById("sheet-settings");
        if (!panel) return;

        const enabledEl = document.getElementById("sheet-enabled");
        const urlEl = document.getElementById("sheet-url");
        const tokenEl = document.getElementById("sheet-token");
        const statusEl = document.getElementById("sheet-status");
        const saveBtn = document.getElementById("sheet-save");
        const testBtn = document.getElementById("sheet-test");

        function applyToForm() {
            const cfg = loadConfig();
            enabledEl.checked = cfg.enabled;
            urlEl.value = cfg.webAppUrl;
            tokenEl.value = cfg.token;
        }

        function setStatus(msg, type) {
            statusEl.textContent = msg;
            statusEl.className = "sheet-status" + (type ? ` sheet-status-${type}` : "");
        }

        saveBtn.addEventListener("click", () => {
            saveConfig({
                enabled: enabledEl.checked,
                webAppUrl: urlEl.value,
                token: tokenEl.value,
            });
            setStatus("Settings saved locally.", "ok");
        });

        testBtn.addEventListener("click", async () => {
            saveConfig({
                enabled: true,
                webAppUrl: urlEl.value,
                token: tokenEl.value,
            });
            setStatus("Testing connection…", "");
            try {
                await testConnection();
                setStatus("Connected — sheet is ready.", "ok");
            } catch (e) {
                setStatus(`Connection failed: ${e.message}`, "error");
            }
        });

        applyToForm();
    }

    return {
        loadConfig,
        saveConfig,
        isReady,
        syncEntry,
        testConnection,
        bindSettingsUI,
    };
})();
