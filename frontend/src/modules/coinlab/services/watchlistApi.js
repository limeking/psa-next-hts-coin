export async function fetchWatchlist() {
    const r = await fetch("/api/coinlab/watchlist");
    const j = await r.json();
    return Array.isArray(j?.symbols) ? j.symbols : [];
  }
  export async function saveWatchlist(symbols) {
    await fetch("/api/coinlab/watchlist", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ symbols })
    });
  }
  
  // 관심종목 이름 목록 불러오기
export async function fetchWatchlistNames() {
  const res = await fetch("/api/coinlab/watchlist_names");
  if (!res.ok) throw new Error("Failed to fetch watchlist names");
  return res.json(); // ["단타(250816)", "상승률10%이상(0816)", ...]
}

export async function fetchWatchlistSymbols(name) {
  const qs = name ? `?name=${encodeURIComponent(name)}` : "";
  const r = await fetch(`/api/coinlab/watchlist${qs}`);
  if (!r.ok) throw new Error("Failed to fetch watchlist");
  const j = await r.json();
  return Array.isArray(j?.symbols) ? j.symbols : [];
}
