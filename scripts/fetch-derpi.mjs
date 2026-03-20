import fs from "node:fs/promises";

const OUT_FILE = "assets/data/derpi.json";

const QUERY = "artist:polnocnykot";
const ALLOW_EXPLICIT = false;

const SORT_FIELD = "created_at";
const SORT_DIR = "desc";

const PER_PAGE = 50;
const MAX_PAGES = 50;
const STOP_ON_EMPTY = true;

const REQUEST_DELAY_MS = 350;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function buildQuery() {
    const parts = [QUERY];
    if (!ALLOW_EXPLICIT) parts.push("-rating:explicit");
    return parts.join(", ");
}

async function fetchPage({ q, page }) {
    const url = new URL("https://derpibooru.org/api/v1/json/search/images");
    url.searchParams.set("q", q);
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sf", SORT_FIELD);
    url.searchParams.set("sd", SORT_DIR);

    const resp = await fetch(url, {
        headers: {
            "User-Agent": "github-pages-gallery/1.0 (GitHub Actions)",
            "Accept": "application/json",
        },
    });

    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Derpibooru API error: ${resp.status} ${resp.statusText}\nURL: ${url}\n${text}`);
    }

    return resp.json();
}

function normalize(img) {
    return {
        id: img.id,
        thumb: img.representations?.thumb,
        full: img.representations?.full,
        link: `https://derpibooru.org/images/${img.id}`,
        width: img.width ?? null,
        height: img.height ?? null,
    };
}

async function main() {
    const q = buildQuery();
    const byId = new Map();

    console.log(`[derpi] Query: ${q}`);
    console.log(`[derpi] per_page=${PER_PAGE}, max_pages=${MAX_PAGES}`);

    let lastPageCount = null;

    for (let page = 1; page <= MAX_PAGES; page++) {
        const data = await fetchPage({ q, page });
        const images = data.images || [];
        lastPageCount = images.length;

        console.log(`[derpi] page ${page}: ${images.length} items`);

        for (const img of images) {
            const n = normalize(img);
            if (!n.thumb) continue;
            byId.set(n.id, n);
        }

        if (STOP_ON_EMPTY && images.length === 0) {
            console.log(`[derpi] stop: empty page reached at page ${page}`);
            break;
        }

        if (images.length > 0 && images.length < PER_PAGE) {
            console.log(`[derpi] stop: last page (returned < per_page) at page ${page}`);
            break;
        }

        await sleep(REQUEST_DELAY_MS);
    }

    const imagesOut = Array.from(byId.values());

    await fs.mkdir("assets/data", { recursive: true });
    await fs.writeFile(
        OUT_FILE,
        JSON.stringify(
            {
                updatedAt: new Date().toISOString(),
                query: q,
                perPage: PER_PAGE,
                maxPages: MAX_PAGES,
                count: imagesOut.length,
                images: imagesOut,
            },
            null,
            2
        )
    );

    console.log(`[derpi] Saved ${imagesOut.length} unique images -> ${OUT_FILE}`);
    if (lastPageCount === 0) {
        console.log(`[derpi] Note: last fetched page was empty; check QUERY correctness if count is unexpectedly low.`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
