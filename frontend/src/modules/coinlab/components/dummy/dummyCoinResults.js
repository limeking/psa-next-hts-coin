// src/modules/coinlab/components/dummy/dummyCoinResults.js

export const dummyCoinResults = [
    { symbol: 'BTC_KRW', name: '비트코인', rate: 4.1, price: 92000000, volume: 15000000000, rsi: 40, theme: '플랫폼' },
    { symbol: 'ETH_KRW', name: '이더리움', rate: 3.6, price: 5000000, volume: 3200000000, rsi: 28, theme: 'DeFi' },
    { symbol: 'HIPPO_KRW', name: '히포코인', rate: 8.2, price: 1200, volume: 700000000, rsi: 38, theme: 'AI' },
    { symbol: 'XRP_KRW', name: '리플', rate: 2.1, price: 1200, volume: 200000000, rsi: 42, theme: 'AI' },
  ];
  
  // 이 아래가 바로 차트(캔들) 더미 데이터!
  export const dummyCandles = {
    'BTC_KRW': [
      { time: 1722566400, open: 90000000, high: 93000000, low: 89500000, close: 92000000, volume: 1500 },
      { time: 1722652800, open: 92000000, high: 94000000, low: 91000000, close: 93000000, volume: 1800 },
      { time: 1722739200, open: 93000000, high: 95000000, low: 92500000, close: 94000000, volume: 1400 },
    ],
    'ETH_KRW': [
      { time: 1722566400, open: 4800000, high: 5100000, low: 4700000, close: 5000000, volume: 1800 },
      { time: 1722652800, open: 5000000, high: 5100000, low: 4900000, close: 5050000, volume: 1900 },
      { time: 1722739200, open: 5050000, high: 5300000, low: 5000000, close: 5200000, volume: 1700 },
    ],
    'HIPPO_KRW': [
      { time: 1722566400, open: 1100, high: 1250, low: 1000, close: 1200, volume: 2000 },
      { time: 1722652800, open: 1200, high: 1300, low: 1150, close: 1280, volume: 1800 },
      { time: 1722739200, open: 1280, high: 1320, low: 1200, close: 1300, volume: 1700 },
    ],
    'XRP_KRW': [
      { time: 1722566400, open: 1150, high: 1250, low: 1000, close: 1200, volume: 1200 },
      { time: 1722652800, open: 1200, high: 1280, low: 1150, close: 1260, volume: 1100 },
      { time: 1722739200, open: 1260, high: 1300, low: 1200, close: 1290, volume: 900 },
    ],
  };
  