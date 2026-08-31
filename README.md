# StreamAN

Frontend anime streaming — **React 19 + Vite 7 + Tailwind 4 + TypeScript (strict)**,
dibuild menjadi **satu file HTML** (`dist/index.html`) berkat `vite-plugin-singlefile`.

Alur inti: **Home → Search → Detail → Episode → Watch**.

```
UI (pages/components)  →  src/lib/service.ts  →  Provider Adapter  →  API/Gateway eksternal
```

| Tier     | Provider                          | Fungsi                                        | Sumber video? |
| -------- | --------------------------------- | --------------------------------------------- | ------------- |
| konten  | Otakudesu → KuramaAnime → Oploverz | katalog, detail, episode, **episode-stream**   | ✅ via gateway |
| metadata | Jikan → AniList                    | katalog, detail, sinopsis (fallback)           | ❌ tidak pernah |

Aturan yang dijaga kode (lihat komentar invarian di `src/lib/service.ts`):

1. **Identity isolation** — `nativeId` satu provider tidak pernah dikirim ke provider lain.
   Id internal selalu `${provider}:${nativeId}`; episode hanya diminta ke provider pemiliknya.
2. **Direct provider priority** — id `foo:X` mencoba `foo` lebih dulu, sisanya fallback.
3. **Metadata ≠ konten** — Jikan/AniList tidak pernah menjadi sumber playback. Trailer resmi
   (YouTube nocookie) ditampilkan terpisah sebagai konten informasi, bukan pengganti episode.
4. **Tanpa episode sintetis** — kalau provider mengirim list kosong, UI menampilkan empty state.
5. **Host allowlist** — setiap `embedUrl`/`fileUrl` dilewatkan `src/lib/security.ts`; sumber dari
   domain tak dikenal ditolak dan alasannya ditampilkan.

---

## 1. Struktur file

```
index.html                     # shell + meta/OG + favicon inline (tanpa aset eksternal)
package.json                   # name: "streaman"
vite.config.ts                 # react + tailwind v4 + viteSingleFile
tsconfig.json                  # strict, verbatimModuleSyntax, noUnusedLocals, noEmit
.env.example                   # satu-satunya tempat config (tidak ada API key)

src/main.tsx                   # bootstrap React
src/App.tsx                   # routing (HashRouter): /, /search, /anime/:id, /anime/:id/watch[/:epId], *
src/index.css                  # @theme Tailwind v4 (token warna/font/animasi + kelas .streaman-bg/.skeleton)
src/vite-env.d.ts              # tipe import.meta.env (VITE_STREAMAN_*)

src/lib/types.ts               # kontrak data: Anime, Episode, StreamSource, RequestMeta, ListResult, ...
src/lib/config.ts              # baca env, TTL cache, hasGateway()
src/lib/errors.ts              # StreamAnError (kode kanonik) + helper toStreamAnError
src/lib/cache.ts               # cache in-memory TTL + LRU
src/lib/http.ts                # rate limiter per provider, retry+backoff, timeout, abort
src/lib/security.ts            # allowlist host media (https only)
src/lib/service.ts             # rantai fallback, cache, invarian identitas, playback
src/lib/providers/types.ts     # ProviderAdapter + buildId/splitId/normTitle
src/lib/providers/index.ts     # registry: contentProviders, metadataProviders, providers
src/lib/providers/jikan.ts     # REST /anime, /top, /seasons, /episodes
src/lib/providers/anilist.ts   # GraphQL (trending/latest/search/detail + identity resolution)
src/lib/providers/gateway.ts   # factory content provider di atas gateway berlisensi
src/lib/providers/otakudesu.ts # ┐
src/lib/providers/kurama.ts    # ├ tiga adapter tipis hasil createGatewayProvider(...)
src/lib/providers/oploverz.ts  # ┘

src/hooks/useAsync.ts          # fetch + abort + reload; status idle|loading|success|error
src/hooks/useAnime.ts          # useAnimeFix: detail(+hint) → episodes, terurut & ter-abort
src/utils/cn.ts                # clsx + tailwind-merge

src/components/Layout.tsx      # header/nav/search/form + panel "Provider & fallback" + footer
src/components/ErrorBoundary.tsx
src/components/ui.tsx          # Chip, Skeleton, EmptyState, ErrorState
src/components/TracePanel.tsx  # jejak rantai fallback (resolvedBy, attempts, note)
src/components/AnimeCard.tsx   # kartu + detailHref()/watchHref() (selalu bawa ?t= & ?y=)

src/pages/Home.tsx             # hero + rail trending/latest
src/pages/Search.tsx           # /search?q=&page=, paginasi, empty vs error
src/pages/AnimeDetail.tsx      # sinopsis, fakta, episode, trailer resmi
src/pages/Watch.tsx            # player, pemilih episode, shortcut ← →
src/pages/NotFound.tsx         # 404
```

---

## 2. Install & jalankan

```bash
npm install          # pasang dependency (semua versi dipin di package.json)

npm run dev          # http://localhost:5173  — development, HMR
npm run typecheck    # tsc --noEmit
npm run build        # tsc --noEmit && vite build  →  dist/index.html (satu file)
npm run preview      # sajikan hasil build di http://localhost:4173
```

Tanpa konfigurasi apa pun aplikasi sudah jalan: Jikan/AniList adalah API publik tanpa key.
Provider konten **sengaja offline** selama `VITE_STREAMAN_GATEWAY_URL` kosong — tidak ada
scraping/bypass di sisi klien, Watch hanya menawarkan trailer resmi.

## 3. Konfigurasi (`VITE_STREAMAN_*`)

Nilai hanya dibaca di `src/lib/config.ts` (lihat `.env.example`); dev: `.env.local`, build: env di panel host.

| Variabel                               | Default                        | Artinya                                                        |
| -------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| `VITE_STREAMAN_GATEWAY_URL`            | _(kosong)_                     | backend internal berlisensi = satu-satunya sumber episode-stream |
| `VITE_STREAMAN_JIKAN_URL`              | `https://api.jikan.moe/v4`     | override basis Jikan                                            |
| `VITE_STREAMAN_ANILIST_URL`            | `https://graphql.anilist.co`   | override endpoint GraphQL                                       |
| `VITE_STREAMAN_TRUSTED_MEDIA_HOSTS`     | _(kosong)_                     | tambahan host media tepercaya (CSV) untuk `<iframe>/<video>`     |

Kontrak yang diharapkan gateway (dipetakan `src/lib/providers/gateway.ts`):

```
GET {gateway}/v1/{otakudesu|kurama|oploverz}/trending?limit=
GET {gateway}/v1/{...}/latest?limit=
GET {gateway}/v1/{...}/search?q=&page=
GET {gateway}/v1/{...}/anime/{nativeId}
GET {gateway}/v1/{...}/anime/{nativeId}/episodes
GET {gateway}/v1/{...}/anime/{nativeId}/episode/{nativeEpisodeId}/sources
```

Respons: `{ items[] }` / `{ anime }` / `{ episodes[] }` / `{ sources[] }`; setiap sumber
episode **wajib** di-flag `"authorized": true` oleh backend — kalau tidak, service layer
menolak playback (`SOURCE_UNAVAILABLE`), bukan memutar asal-asalan.

## 4. Deploy

Hasil build = satu file statis, jadi semua host statis bisa dipakai.

**Vercel**
```bash
npm i -g vercel
vercel                    # framework: Vite · build: npm run build · output: dist
# atau di dashboard: Build Command `npm run build`, Output Directory `dist`
# Environment variables: isi VITE_STREAMAN_* bila perlu (di-bake saat build, bukan runtime)
```

**Netlify**
```bash
npm i -g netlify-cli
netlify deploy --build --prod        # build: npm run build · publish: dist
```
`netlify.toml` (opsional, hanya jika pindah ke BrowserRouter — lihat catatan di bawah):
```toml
[build]  command = "npm run build"  publish = "dist"
[[redirects]] from = "/*" to = "/index.html" status = 200
```

**Cloudflare Pages**
```bash
npm i -g wrangler
npm run build
wrangler pages deploy dist --project-name streaman
```
Dashboard: Framework preset **Vite** · Build command `npm run build` · Build output directory `dist`.

**Hosting statis mana pun (termasuk membuka lokal):** unggah `dist/index.html`. Selesai.

> Routing memakai **HashRouter** (`#/anime/...`) supaya satu file ini bekerja di host statis
> apa pun — termasuk `file://` — tanpa aturan rewrite. Kalau lebih suka URL bersih
> (`/anime/...`): ganti `HashRouter` → `BrowserRouter` di `src/App.tsx` dan tambahkan rewrite
> SPA di host (`vercel.json`/`netlify.toml`/`_redirects`: `/* → /index.html 200`).

---

## 5. Checklist verifikasi

- [x] `npm run typecheck` dan `npm run build` lulus tanpa error TypeScript.
- [x] Build menghasilkan **satu** `dist/index.html` (≈395 kB, JS+CSS inline, tanpa aset eksternal).
- [x] Tidak ada lagi penanda nama project lama di mana pun (wordmark `StreamAN`, kelas latar
      `.streaman-bg`, error `StreamAnError`/`StreamAnErrorCode`, env `VITE_STREAMAN_GATEWAY_URL`).
- [x] Semua import resolve (dibuktikan `tsc --noEmit` di atas).
- [x] Tidak ada API key yang di-hardcode; semua config lewat `src/lib/config.ts` + env.
- [x] Uji nyata di Chromium headless terhadap hasil build: branding, panel provider (5 baris),
      Home/Search/Detail/Watch/404, TracePanel, animasi & token Tailwind ter-generate, nol error konsol.
- [x] Uji rantai konten dengan mock gateway: trending/detail/episode/source benar-benar datang dari
      `otakudesu`, sumber `authorized` masuk `<iframe>`, sumber tak authorized dibuang, host asing
      (http) ditolak allowlist, dan episode tanpa sumber menampilkan pesan yang benar.
- [x] Tanpa gateway: Watch jujur menampilkan `SOURCE_UNAVAILABLE` + trailer resmi (bukan episode).

Dua hal yang **tidak** bisa diverifikasi dari sisi klien: angka/TTL internal provider publik
(kalau Jikan/AniList sedang 5xx, aplikasi menampilkan error + jejak rantai, bukan data palsu)
dan keabsahan lisensi konten — itu tanggung jawab gateway.

## 6. Menambah provider?

Satu file adapter baru + daftarkan di `src/lib/providers/index.ts`. Tidak ada perubahan UI:
`operations`, `tier`, dan `availability()` yang menentukan apa yang boleh dilakukan provider itu.



