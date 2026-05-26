(function () {
    const STORAGE_KEY = "gadmin-daily-notes-v1";
    const TWEET_MAX = 280;

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const roughInput = $("#rough-input");
    const dayPicker = $("#day-picker");
    const shortList = $("#short-feed");
    const longList = $("#long-feed");
    const voiceBtn = $("#voice-btn");
    const voiceStatus = $("#voice-status");
    const modalOverlay = $("#modal-overlay");
    const modalTitle = $("#modal-title");
    const modalText = $("#modal-text");
    const modalConfirm = $("#modal-confirm");
    const modalCancel = $("#modal-cancel");

    let currentDay = todayKey();
    let modalMode = null;
    let modalEntryId = null;
    let recognition = null;
    let listening = false;

    function todayKey() {
        return formatDayKey(new Date());
    }

    function formatDayKey(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function parseDayKey(key) {
        const [y, m, d] = key.split("-").map(Number);
        return new Date(y, m - 1, d);
    }

    function uuid() {
        return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function loadStore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { days: {} };
        } catch {
            return { days: {} };
        }
    }

    function saveStore(store) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }

    function getDayEntries(store, dayKey) {
        if (!store.days[dayKey]) {
            store.days[dayKey] = { entries: [] };
        }
        return store.days[dayKey].entries;
    }

    function classifyContent(text, forceForm) {
        if (forceForm === "short" || forceForm === "long") return forceForm;
        const trimmed = text.trim();
        const paragraphs = trimmed.split(/\n\s*\n/).filter(Boolean);
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (trimmed.length <= TWEET_MAX && paragraphs.length <= 1 && wordCount <= 50) {
            return "short";
        }
        return "long";
    }

    function extractTitle(text) {
        const first = text.trim().split(/\n/)[0] || "Untitled thought";
        if (first.length <= 80) return first;
        return first.slice(0, 77) + "…";
    }

    function splitBulkChunks(text) {
        const trimmed = text.trim();
        if (!trimmed) return [];
        const blocks = trimmed.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
        if (blocks.length <= 1) return [trimmed];
        return blocks;
    }

    function getSelectedForm() {
        const picked = document.querySelector('input[name="form-pick"]:checked');
        return picked ? picked.value : "auto";
    }

    function addVersion(entry, content, action) {
        entry.versions.push({
            content,
            at: new Date().toISOString(),
            action,
        });
        entry.updatedAt = new Date().toISOString();
    }

    function createEntry(content, form) {
        const now = new Date().toISOString();
        return {
            id: uuid(),
            content: content.trim(),
            form,
            createdAt: now,
            updatedAt: now,
            versions: [{ content: content.trim(), at: now, action: "create" }],
        };
    }

    function persistEntryFields(entry, dayKey) {
        const store = loadStore();
        const entries = getDayEntries(store, dayKey);
        const idx = entries.findIndex((e) => e.id === entry.id);
        if (idx === -1) return;
        entries[idx].sheetSync = entry.sheetSync;
        entries[idx].sheetSyncError = entry.sheetSyncError;
        saveStore(store);
    }

    async function pushShortToSheet(entry, dayKey, event) {
        if (!window.DailyNotesSheet?.isReady() || entry.form !== "short") return;

        entry.sheetSync = "pending";
        persistEntryFields(entry, dayKey);
        render();

        try {
            await DailyNotesSheet.syncEntry(entry, dayKey, event);
            entry.sheetSync = "ok";
            delete entry.sheetSyncError;
        } catch (err) {
            entry.sheetSync = "error";
            entry.sheetSyncError = err.message || "Sync failed";
        }
        persistEntryFields(entry, dayKey);
        render();
    }

    function captureThought() {
        const text = roughInput.value.trim();
        if (!text) return;

        const store = loadStore();
        const entries = getDayEntries(store, currentDay);
        const forceForm = getSelectedForm();
        const chunks = splitBulkChunks(text);
        const newShort = [];

        chunks.forEach((chunk) => {
            const form = classifyContent(chunk, forceForm === "auto" ? null : forceForm);
            const entry = createEntry(chunk, form);
            entries.push(entry);
            if (form === "short") newShort.push(entry);
        });

        saveStore(store);
        roughInput.value = "";
        render();
        newShort.forEach((entry) => pushShortToSheet(entry, currentDay, "create"));
    }

    function deleteEntry(id) {
        if (!confirm("Delete this thought? History will be lost.")) return;
        const store = loadStore();
        const entries = getDayEntries(store, currentDay);
        const idx = entries.findIndex((e) => e.id === id);
        if (idx === -1) return;
        const entry = entries[idx];
        if (entry.form === "short") pushShortToSheet(entry, currentDay, "delete");
        entries.splice(idx, 1);
        saveStore(store);
        render();
    }

    function moveEntry(id, direction) {
        const store = loadStore();
        const entries = getDayEntries(store, currentDay);
        const form = entries.find((e) => e.id === id)?.form;
        if (!form) return;

        const sameForm = entries.filter((e) => e.form === form);
        const idx = sameForm.findIndex((e) => e.id === id);
        const swapIdx = idx + direction;
        if (swapIdx < 0 || swapIdx >= sameForm.length) return;

        const a = sameForm[idx];
        const b = sameForm[swapIdx];
        const globalA = entries.indexOf(a);
        const globalB = entries.indexOf(b);
        [entries[globalA], entries[globalB]] = [entries[globalB], entries[globalA]];
        saveStore(store);
        render();
    }

    function reorderByDrag(dragId, targetId, form) {
        if (dragId === targetId) return;
        const store = loadStore();
        const entries = getDayEntries(store, currentDay);
        const subset = entries.filter((e) => e.form === form);
        const from = subset.findIndex((e) => e.id === dragId);
        const to = subset.findIndex((e) => e.id === targetId);
        if (from < 0 || to < 0) return;

        const [moved] = subset.splice(from, 1);
        subset.splice(to, 0, moved);

        const other = entries.filter((e) => e.form !== form);
        store.days[currentDay].entries = form === "short" ? [...subset, ...other] : [...other, ...subset];
        saveStore(store);
        render();
    }

    function openModal(mode, entryId, title, placeholder) {
        modalMode = mode;
        modalEntryId = entryId;
        modalTitle.textContent = title;
        modalText.value = "";
        modalText.placeholder = placeholder;
        if (mode === "edit") {
            const store = loadStore();
            const entry = getDayEntries(store, currentDay).find((e) => e.id === entryId);
            if (entry) modalText.value = entry.content;
        }
        modalOverlay.classList.remove("hidden");
        modalText.focus();
    }

    function closeModal() {
        modalOverlay.classList.add("hidden");
        modalMode = null;
        modalEntryId = null;
    }

    function confirmModal() {
        const text = modalText.value.trim();
        if (!text) return;

        const store = loadStore();
        const entries = getDayEntries(store, currentDay);
        const entry = entries.find((e) => e.id === modalEntryId);
        if (!entry) return closeModal();

        if (modalMode === "append") {
            entry.content = entry.content.trimEnd() + "\n\n" + text;
            addVersion(entry, text, "append");
        } else if (modalMode === "edit") {
            entry.versions.push({
                content: entry.content,
                at: new Date().toISOString(),
                action: "edit",
            });
            entry.content = text;
            entry.updatedAt = new Date().toISOString();
        }

        saveStore(store);
        closeModal();
        render();
        if (entry.form === "short") pushShortToSheet(entry, currentDay, "update");
    }

    function sheetBadgeHtml(entry) {
        if (entry.form !== "short" || !window.DailyNotesSheet?.isReady()) return "";
        if (entry.sheetSync === "pending") {
            return '<span class="sheet-badge pending">Sheet…</span>';
        }
        if (entry.sheetSync === "error") {
            const tip = escapeHtml(entry.sheetSyncError || "Sync failed");
            return `<span class="sheet-badge error" title="${tip}">Sheet ✕</span>`;
        }
        if (entry.sheetSync === "ok") {
            return '<span class="sheet-badge ok" title="Synced to Google Sheet">Sheet ✓</span>';
        }
        return "";
    }

    function formatTime(iso) {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    function formatDateLabel(dayKey) {
        const d = parseDayKey(dayKey);
        const today = todayKey();
        if (dayKey === today) return "Today";
        const yesterday = formatDayKey(new Date(Date.now() - 86400000));
        if (dayKey === yesterday) return "Yesterday";
        return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }

    function renderVersionHistory(entry) {
        if (entry.versions.length <= 1) return "";
        const items = [...entry.versions]
            .reverse()
            .map((v) => {
                const snippet = v.content.length > 120 ? v.content.slice(0, 117) + "…" : v.content;
                return `<li>
                    <span class="version-action">${v.action}</span>
                    · <time datetime="${v.at}">${formatTime(v.at)}</time>
                    <span class="version-snippet">${escapeHtml(snippet)}</span>
                </li>`;
            })
            .join("");
        return `<details class="version-panel">
            <summary>${entry.versions.length} timestamped versions</summary>
            <ul class="version-list">${items}</ul>
        </details>`;
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function entryActionsHtml(entry) {
        return `<div class="entry-actions">
            <span class="drag-handle" draggable="true" title="Drag to reorder" data-drag-id="${entry.id}" data-form="${entry.form}">⠿</span>
            <button type="button" class="btn btn-icon move-up" data-id="${entry.id}" title="Move up">↑</button>
            <button type="button" class="btn btn-icon move-down" data-id="${entry.id}" title="Move down">↓</button>
            <button type="button" class="btn append-btn" data-id="${entry.id}">Append</button>
            <button type="button" class="btn edit-btn" data-id="${entry.id}">Edit</button>
            <button type="button" class="btn btn-danger delete-btn" data-id="${entry.id}">Delete</button>
        </div>`;
    }

    function renderEntry(entry) {
        const meta = `<div class="entry-meta">
            <time datetime="${entry.createdAt}">${formatTime(entry.createdAt)}</time>
            ${entry.updatedAt !== entry.createdAt ? `<span>· edited ${formatTime(entry.updatedAt)}</span>` : ""}
            ${sheetBadgeHtml(entry)}
        </div>`;
        const versions = renderVersionHistory(entry);
        const actions = entryActionsHtml(entry);

        if (entry.form === "short") {
            const len = entry.content.length;
            return `<li class="entry-short" data-id="${entry.id}" data-form="short">
                ${meta}
                <div class="entry-body">${escapeHtml(entry.content)}</div>
                <div class="char-badge">${len} / ${TWEET_MAX}</div>
                ${versions}
                ${actions}
            </li>`;
        }

        const title = extractTitle(entry.content);
        const body = entry.content.includes("\n")
            ? entry.content.split("\n").slice(1).join("\n").trim() || entry.content
            : entry.content;

        return `<li class="entry-long" data-id="${entry.id}" data-form="long">
            ${meta}
            <h3 class="entry-title">${escapeHtml(title)}</h3>
            <div class="entry-body">${escapeHtml(body)}</div>
            ${versions}
            ${actions}
        </li>`;
    }

    function render() {
        const store = loadStore();
        const entries = getDayEntries(store, currentDay);
        const shorts = entries.filter((e) => e.form === "short");
        const longs = entries.filter((e) => e.form === "long");

        shortList.innerHTML = shorts.map(renderEntry).join("");
        longList.innerHTML = longs.map(renderEntry).join("");

        shortList.classList.toggle("empty", shorts.length === 0);
        longList.classList.toggle("empty", longs.length === 0);

        const label = formatDateLabel(currentDay);
        $("#day-label").textContent = label;
        const inline = $("#day-label-inline");
        if (inline) inline.textContent = label === "Today" ? "today" : label.toLowerCase();
        dayPicker.value = currentDay;

        bindEntryEvents();
    }

    let dragId = null;

    function bindEntryEvents() {
        $$(".delete-btn").forEach((btn) => {
            btn.onclick = () => deleteEntry(btn.dataset.id);
        });
        $$(".move-up").forEach((btn) => {
            btn.onclick = () => moveEntry(btn.dataset.id, -1);
        });
        $$(".move-down").forEach((btn) => {
            btn.onclick = () => moveEntry(btn.dataset.id, 1);
        });
        $$(".append-btn").forEach((btn) => {
            btn.onclick = () =>
                openModal("append", btn.dataset.id, "Append to this thought", "Add more — saved as a new timestamped version…");
        });
        $$(".edit-btn").forEach((btn) => {
            btn.onclick = () =>
                openModal("edit", btn.dataset.id, "Edit thought", "Revise the full text…");
        });

        $$(".entry-short, .entry-long").forEach((card) => {
            card.addEventListener("dragover", (e) => {
                e.preventDefault();
                if (dragId && card.dataset.form === document.querySelector(`[data-id="${dragId}"]`)?.dataset.form) {
                    card.classList.add("drag-over");
                }
            });
            card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
            card.addEventListener("drop", (e) => {
                e.preventDefault();
                card.classList.remove("drag-over");
                if (dragId) reorderByDrag(dragId, card.dataset.id, card.dataset.form);
                dragId = null;
            });
        });

        $$(".drag-handle").forEach((handle) => {
            handle.addEventListener("dragstart", (e) => {
                dragId = handle.dataset.dragId;
                e.dataTransfer.effectAllowed = "move";
                const card = handle.closest(".entry-short, .entry-long");
                if (card) card.classList.add("dragging");
            });
            handle.addEventListener("dragend", () => {
                dragId = null;
                $$(".entry-short, .entry-long").forEach((c) => c.classList.remove("dragging", "drag-over"));
            });
        });
    }

    function initSpeech() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            voiceBtn.disabled = true;
            voiceBtn.title = "Speech recognition not supported in this browser";
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        let finalTranscript = "";

        recognition.onresult = (event) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalTranscript += t + " ";
                else interim += t;
            }
            const base = roughInput.value.replace(/\s+$/, "");
            const spoken = (finalTranscript + interim).trim();
            roughInput.value = base ? `${base} ${spoken}` : spoken;
        };

        recognition.onerror = () => stopListening();
        recognition.onend = () => {
            if (listening) recognition.start();
        };
    }

    function startListening() {
        if (!recognition) return;
        listening = true;
        voiceBtn.classList.add("btn-listening");
        voiceBtn.textContent = "Stop";
        voiceStatus.textContent = "Listening… speak your thoughts";
        voiceStatus.classList.add("active");
        try {
            recognition.start();
        } catch {
            /* already started */
        }
    }

    function stopListening() {
        listening = false;
        voiceBtn.classList.remove("btn-listening");
        voiceBtn.textContent = "Speak";
        voiceStatus.textContent = "";
        voiceStatus.classList.remove("active");
        if (recognition) {
            try {
                recognition.stop();
            } catch {
                /* ignore */
            }
        }
    }

    function toggleVoice() {
        if (listening) stopListening();
        else startListening();
    }

    function exportData() {
        const blob = new Blob([JSON.stringify(loadStore(), null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `daily-notes-backup-${todayKey()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (!data.days) throw new Error("Invalid format");
                saveStore(data);
                render();
                alert("Notes imported successfully.");
            } catch {
                alert("Could not import — invalid JSON file.");
            }
        };
        reader.readAsText(file);
    }

    function bindGlobalEvents() {
        $("#capture-btn").addEventListener("click", captureThought);
        $("#clear-rough").addEventListener("click", () => {
            roughInput.value = "";
        });

        roughInput.addEventListener("keydown", (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                captureThought();
            }
        });

        roughInput.addEventListener("paste", () => {
            voiceStatus.textContent = "Pasted — hit Capture or ⌘/Ctrl+Enter";
            setTimeout(() => {
                if (!listening) voiceStatus.textContent = "";
            }, 3000);
        });

        voiceBtn.addEventListener("click", toggleVoice);

        dayPicker.addEventListener("change", () => {
            currentDay = dayPicker.value;
            render();
        });

        $("#prev-day").addEventListener("click", () => {
            const d = parseDayKey(currentDay);
            d.setDate(d.getDate() - 1);
            currentDay = formatDayKey(d);
            render();
        });

        $("#next-day").addEventListener("click", () => {
            const d = parseDayKey(currentDay);
            d.setDate(d.getDate() + 1);
            currentDay = formatDayKey(d);
            render();
        });

        $("#today-btn").addEventListener("click", () => {
            currentDay = todayKey();
            render();
        });

        modalCancel.addEventListener("click", closeModal);
        modalConfirm.addEventListener("click", confirmModal);
        modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) closeModal();
        });

        $("#export-btn").addEventListener("click", exportData);
        $("#import-btn").addEventListener("click", () => $("#import-file").click());
        $("#import-file").addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) importData(file);
            e.target.value = "";
        });
    }

    initSpeech();
    bindGlobalEvents();
    if (window.DailyNotesSheet) DailyNotesSheet.bindSettingsUI();
    dayPicker.value = currentDay;
    render();
})();
