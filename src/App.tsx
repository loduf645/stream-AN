import { HashRouter, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Search } from "./pages/Search";
import { AnimeDetail } from "./pages/AnimeDetail";
import { Watch } from "./pages/Watch";
import { NotFound } from "./pages/NotFound";

/**
 * ROUTING STREAMAN — empat rute, tidak lebih:
 *
 *   /                                  Home (trending + latest)
 *   /search?q=&page=                   Search
 *   /anime/:animeId                    Detail (+ daftar episode)
 *   /anime/:animeId/watch[/:episodeId] Watch (episodeId opsional → episode pertama)
 *   *                                  404
 *
 * `:animeId` selalu `${provider}:${nativeId}` (lihat lib/types.ts) sehingga
 * service layer tahu provider mana yang boleh disentuh lebih dulu — identitas
 * itu tidak pernah diubah di router.
 *
 * Kenapa HashRouter: hasil build adalah SATU file HTML (vite-plugin-singlefile)
 * yang harus bisa dibuka dari host statis mana pun — termasuk `file://` atau
 * folder statis tanpa aturan rewrite. Dengan hash, deep link `/anime/...` tetap
 * bekerja tanpa konfigurasi server. Pindah ke BrowserRouter hanya perlu menukar
 * import + menambah aturan rewrite SPA di host (lihat README bagian deploy).
 */
export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="anime/:animeId" element={<AnimeDetail />} />
            <Route path="anime/:animeId/watch" element={<Watch />} />
            <Route path="anime/:animeId/watch/:episodeId" element={<Watch />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;





