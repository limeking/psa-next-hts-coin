// src/modules/coinlab/components/Chart/CommonChartPanel.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chart, CandlestickSeries, HistogramSeries } from "lightweight-charts-react-wrapper";
import { useChartStore } from "../../hooks/useChartStore";
import { fetchCandles } from "../../api/coinlab";

export default function CommonChartPanel() {
  const { symbol, interval } = useChartStore();
  const [data, setData] = useState(null);       // { candles:[], symbol, interval }
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const chartRef = useRef(null);

  useEffect(() => {
    let dead = false;
    async function run() {
      if (!symbol) return;
      setLoading(true);
      setErr(null);
      try {
        const res = await fetchCandles(symbol, interval, 500);
        if (!dead) setData(res);
      } catch (e) {
        if (!dead) setErr(e?.message || "Failed to load candles");
      } finally {
        if (!dead) setLoading(false);
      }
    }
    run();
    return () => { dead = true; };
  }, [symbol, interval]);

  const candleData = useMemo(() => data?.candles ?? [], [data]);
  const volumeData = useMemo(
    () => candleData.map(c => ({
      time: c.time,
      value: c.volume ?? 0,
      color: c.close >= c.open ? undefined : undefined, // 기본 색(테마) 사용
    })),
    [candleData]
  );

  if (!symbol) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm opacity-70">
        좌측 결과를 클릭하면 차트가 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-sm font-medium border-b">
        {symbol} · {interval} 차트
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-sm">불러오는 중…</div>
      )}
      {err && (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">
          {String(err)}
        </div>
      )}
      {!loading && !err && (
        <div className="flex-1" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
           {/* 상단: 캔들 (부모 div가 높이를 보장, 차트는 autoSize로 채움) */}
          <div style={{ height: "70%", minHeight: 0 }}>
            <Chart
              ref={chartRef}
              autoSize
              rightPriceScale={{ borderVisible: false }}
              timeScale={{ borderVisible: false, timeVisible: true, secondsVisible: false }}
              localization={{ locale: "ko-KR" }}
            >
              <CandlestickSeries data={candleData} />
            </Chart>
          </div>

          {/* 하단: 거래량 */}
          <div style={{ height: "30%", minHeight: 0 }}>
            <Chart
              autoSize
              rightPriceScale={{ borderVisible: false }}
              timeScale={{ borderVisible: false, timeVisible: true, secondsVisible: false }}
              localization={{ locale: "ko-KR" }}
            >
              <HistogramSeries data={volumeData} priceFormat={{ type: "volume" }} />
            </Chart>
          </div>
        </div>
      )}
    </div>
  );
}
