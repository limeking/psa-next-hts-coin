export async function fetchDataList() {
    const res = await fetch("/api/coin_backtest/data/list");
    return res.json();
  }
  export async function downloadData(market, interval, count) {
    return fetch("/api/coin_backtest/data/download", {
      method: "POST",
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({market, interval, count})
    }).then(r => r.json());
  }
  export async function deleteData(filename) {
    return fetch("/api/coin_backtest/data/delete", {
      method: "POST",
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({filename})
    }).then(r => r.json());
  }
  
  export async function fetchBithumbKrwTickers() {
    const res = await fetch("/api/coin_backtest/bithumb/krw-tickers");
    return res.json();
  }