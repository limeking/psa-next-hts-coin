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
  