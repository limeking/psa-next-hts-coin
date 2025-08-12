import { useEffect, useState, useCallback } from "react";
import { fetchWatchlist, saveWatchlist } from "../services/watchlistApi";

export default function useWatchlist() {
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    try { setSymbols(await fetchWatchlist()); } finally { setLoading(false); }
  })(); }, []);

  const add = useCallback((arr) => {
    setSymbols(prev => Array.from(new Set([...(prev||[]), ...(arr||[])])));
  }, []);
  const remove = useCallback((sym) => {
    setSymbols(prev => (prev||[]).filter(s => s !== sym));
  }, []);
  const save = useCallback(async () => { await saveWatchlist(symbols); }, [symbols]);

  return { symbols, setSymbols, add, remove, save, loading };
}
