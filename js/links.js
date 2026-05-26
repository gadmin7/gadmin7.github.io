(function () {
    const REMOTE_URL =
        "https://raw.githubusercontent.com/gadmin7/gadmin7-links/main/data/links.json";
    const FALLBACK_URL = "data/links.fallback.json";

    const $ = (sel) => document.querySelector(sel);

    let allLinks = [];
    let dataSource = "";

    async function loadCollection() {
        try {
            const res = await fetch(REMOTE_URL, { cache: "no-cache" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            dataSource = "remote";
            return data;
        } catch {
            const res = await fetch(FALLBACK_URL, { cache: "no-cache" });
            if (!res.ok) throw new Error("Could not load links from remote or fallback.");
            dataSource = "fallback";
            return res.json();
        }
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(iso) {
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    function getFilters() {
        return {
            q: $("#search").value.trim().toLowerCase(),
            category: $("#filter-category").value,
            status: $("#filter-status").value,
            tag: $("#filter-tag").value,
            showArchived: $("#show-archived").checked,
        };
    }

    function collectTags(links) {
        const tags = new Set();
        links.forEach((l) => (l.tags || []).forEach((t) => tags.add(t)));
        return [...tags].sort();
    }

    function populateTagFilter(links) {
        const select = $("#filter-tag");
        const current = select.value;
        select.innerHTML = '<option value="">All tags</option>';
        collectTags(links).forEach((tag) => {
            const opt = document.createElement("option");
            opt.value = tag;
            opt.textContent = tag;
            select.appendChild(opt);
        });
        if ([...select.options].some((o) => o.value === current)) select.value = current;
    }

    function matchesFilters(link, f) {
        if (!f.showArchived && link.archived) return false;
        if (f.category && link.category !== f.category) return false;
        if (f.status && (link.status || "") !== f.status) return false;
        if (f.tag && !(link.tags || []).includes(f.tag)) return false;
        if (f.q) {
            const hay = [link.title, link.description, link.notes, link.url, ...(link.tags || [])]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            if (!hay.includes(f.q)) return false;
        }
        return true;
    }

    function sortLinks(links) {
        return [...links].sort((a, b) => {
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;
            return new Date(b.addedAt) - new Date(a.addedAt);
        });
    }

    function renderCard(link) {
        const status = link.status || "to-read";
        const tags = (link.tags || [])
            .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
            .join("");
        const notes = link.notes
            ? `<p class="link-notes">${escapeHtml(link.notes)}</p>`
            : "";

        return `<li class="link-card${link.featured ? " featured" : ""}">
            <h2><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a></h2>
            ${link.description ? `<p class="link-desc">${escapeHtml(link.description)}</p>` : ""}
            <div class="link-meta">
                <span class="badge">${escapeHtml(link.category)}</span>
                <span class="badge status-${escapeHtml(status)}">${escapeHtml(status)}</span>
                ${tags}
                <span>· ${formatDate(link.addedAt)}</span>
            </div>
            ${notes}
        </li>`;
    }

    function render() {
        const f = getFilters();
        const filtered = sortLinks(allLinks.filter((l) => matchesFilters(l, f)));
        const list = $("#link-list");
        const empty = $("#empty-state");

        list.innerHTML = filtered.map(renderCard).join("");
        list.classList.toggle("hidden", filtered.length === 0);
        empty.classList.toggle("hidden", filtered.length > 0);
    }

    let collectionUpdatedAt = "";

    function updateSourceNote() {
        const el = $("#data-source-note");
        if (dataSource === "remote") {
            const updated = collectionUpdatedAt ? ` · updated ${formatDate(collectionUpdatedAt)}` : "";
            el.innerHTML = `Loaded from <a href="${REMOTE_URL}" target="_blank" rel="noopener">gadmin7-links</a>${updated}`;
        } else {
            el.textContent =
                "Using local fallback — push gadmin7-links to GitHub for live sync.";
        }
    }

    async function init() {
        const loading = $("#loading");
        const error = $("#error-state");

        try {
            const data = await loadCollection();
            collectionUpdatedAt = data.updatedAt;
            allLinks = data.links || [];
            populateTagFilter(allLinks);
            loading.classList.add("hidden");
            updateSourceNote();
            render();

            $("#search").addEventListener("input", render);
            $("#filter-category").addEventListener("change", render);
            $("#filter-status").addEventListener("change", render);
            $("#filter-tag").addEventListener("change", render);
            $("#show-archived").addEventListener("change", render);
        } catch (e) {
            loading.classList.add("hidden");
            error.textContent = e.message || "Failed to load links.";
            error.classList.remove("hidden");
        }
    }

    init();
})();
