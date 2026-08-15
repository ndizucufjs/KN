import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios, { API } from "../services/apiClient";

/**
 * usePagedList — P2 server-side pagination hook (kontrak {items,total,page,page_size,has_more}).
 *
 * Fitur:
 *  - fetch halaman via ?page=&page_size=&q=  (plus params filter tambahan)
 *  - state loading / error / empty
 *  - debounced search (default 350ms) → reset ke halaman 1
 *  - auto reset ke halaman 1 saat params filter berubah
 *  - kompatibel mundur: bila BE balikan array telanjang, tetap ditangani.
 *
 * @param {string} endpoint  path relatif setelah /api, mis. "/inventory/rolls"
 * @param {object} opts      { pageSize, params, search, enabled, debounceMs }
 */
export function usePagedList(endpoint, opts = {}) {
  const {
    pageSize: initialSize = 20,
    params = {},
    search = "",
    enabled = true,
    debounceMs = 350,
  } = opts;

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debSearch, setDebSearch] = useState(search);

  const paramsKey = useMemo(() => JSON.stringify(params || {}), [params]);
  const debTimer = useRef(null);
  const reqSeq = useRef(0);

  // Debounce search input.
  useEffect(() => {
    if (debTimer.current) clearTimeout(debTimer.current);
    debTimer.current = setTimeout(() => setDebSearch(search), debounceMs);
    return () => debTimer.current && clearTimeout(debTimer.current);
  }, [search, debounceMs]);

  // Reset ke halaman 1 saat query pencarian / filter / ukuran halaman berubah.
  useEffect(() => { setPage(1); }, [debSearch, paramsKey, pageSize]);

  const fetchPage = useCallback(async () => {
    if (!enabled) return;
    const seq = ++reqSeq.current;   // guard urutan respons (hindari data basi)
    setLoading(true);
    try {
      const res = await axios.get(`${API}${endpoint}`, {
        params: {
          ...(JSON.parse(paramsKey) || {}),
          page,
          page_size: pageSize,
          ...(debSearch ? { q: debSearch } : {}),
        },
      });
      if (seq !== reqSeq.current) return;   // respons kadaluarsa → abaikan
      const d = res.data;
      if (Array.isArray(d)) {
        setItems(d);
        setTotal(d.length);
        setHasMore(false);
      } else {
        const list = Array.isArray(d?.items) ? d.items : [];
        setItems(list);
        setTotal(Number.isFinite(d?.total) ? d.total : list.length);
        setHasMore(Boolean(d?.has_more));
      }
      setError("");
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setError(e.response?.data?.detail || "Gagal memuat data.");
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [endpoint, page, pageSize, debSearch, paramsKey, enabled]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items, total, page, pageSize, hasMore, loading, error, totalPages,
    setPage, setPageSize,
    next: () => setPage((p) => (hasMore ? p + 1 : p)),
    prev: () => setPage((p) => Math.max(1, p - 1)),
    refresh: fetchPage,
    isEmpty: !loading && items.length === 0,
  };
}

export default usePagedList;
