let state = {
    images: null,
    rendered: 0,
    batch: 10,
    scrollY: 0,
    observer: null,
    mounted: false,
    cols: [],
};

const STORAGE_KEY = "galleryStateV1";
const COLUMN_COUNT = 2;

function saveState() {
    const payload = {
        rendered: state.rendered,
        scrollY: window.scrollY || 0,
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);

        if (Number.isFinite(parsed.rendered)) {
            state.rendered = parsed.rendered;
        }

        if (Number.isFinite(parsed.scrollY)) {
            state.scrollY = parsed.scrollY;
        }
    } catch {
        // ignore
    }
}

async function loadImages() {
    if (state.images) return state.images;

    const resp = await fetch("assets/data/derpi.json", { cache: "no-store" });
    if (!resp.ok) {
        throw new Error(`Failed to load derpi.json: ${resp.status}`);
    }

    const data = await resp.json();
    state.images = Array.isArray(data.images) ? data.images : [];

    return state.images;
}

function setupColumns(grid) {
    grid.innerHTML = "";

    state.cols = Array.from({ length: COLUMN_COUNT }, () => {
        const el = document.createElement("div");
        el.className = "gallery-col";
        grid.appendChild(el);
        return { el };
    });
}

function getColumnRenderedHeight(col) {
    return col.el.scrollHeight || col.el.getBoundingClientRect().height || 0;
}

function getShortestColumn() {
    if (state.cols.length === 0) return null;
    if (state.cols.length === 1) return state.cols[0];

    const leftHeight = getColumnRenderedHeight(state.cols[0]);
    const rightHeight = getColumnRenderedHeight(state.cols[1]);

    return leftHeight <= rightHeight ? state.cols[0] : state.cols[1];
}

function createGalleryItem(img) {
    const link = document.createElement("a");
    link.className = "gallery-item";
    link.href = img.link;
    link.target = "_blank";
    link.rel = "noopener";

    const image = document.createElement("img");
    image.loading = "lazy";
    image.decoding = "async";
    image.src = img.thumb;
    image.alt = `Artwork ${img.id}`;

    if (
        Number.isFinite(img.width) &&
        Number.isFinite(img.height) &&
        img.width > 0 &&
        img.height > 0
    ) {
        image.width = img.width;
        image.height = img.height;
    }

    link.appendChild(image);
    return link;
}

function renderImageToColumn(img, col) {
    if (!img?.thumb || !img?.link || !col) return;

    const node = createGalleryItem(img);
    col.el.appendChild(node);

    // форсим пересчет layout, чтобы следующая картинка
    // уже сравнивалась по актуальной высоте колонок
    void col.el.offsetHeight;
}

function renderNext() {
    if (!state.images || !state.cols.length) return;

    const start = state.rendered;
    const end = Math.min(state.rendered + state.batch, state.images.length);
    if (start >= end) return;

    const chunk = state.images.slice(start, end);

    for (const img of chunk) {
        const col = getShortestColumn();
        renderImageToColumn(img, col);
    }

    state.rendered = end;
}

function setupObserver(appEl) {
    const sentinel = appEl.querySelector("#gallery-sentinel");
    if (!sentinel) return;

    if (state.observer) {
        state.observer.disconnect();
    }

    state.observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;

                renderNext();
                saveState();
            }
        },
        {
            root: null,
            rootMargin: "800px 0px",
            threshold: 0,
        }
    );

    state.observer.observe(sentinel);
}

export async function mountGallery(appEl) {
    loadState();

    const grid = appEl.querySelector("#gallery");
    const meta = appEl.querySelector("#gallery-meta");
    if (!grid) return;

    const images = await loadImages();

    setupColumns(grid);

    const target = Math.min(state.rendered || state.batch, images.length);
    state.rendered = 0;

    while (state.rendered < target) {
        renderNext();
    }

    if (meta) {
        meta.textContent = `Items: ${images.length}`;
    }

    setupObserver(appEl);

    requestAnimationFrame(() => {
        if (state.scrollY > 0) {
            window.scrollTo(0, state.scrollY);
        }
    });

    if (!state.mounted) {
        state.mounted = true;

        window.addEventListener(
            "scroll",
            () => {
                saveState();
            },
            { passive: true }
        );
    }
}

export function unmountGallery() {
    saveState();

    if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
    }
}
