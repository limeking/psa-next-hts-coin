import React, { useEffect, useMemo, useState } from "react";
import { fetchStrategies } from "../api/strategies";

// 한국어 라벨 매핑
const LABELS = {
  fast: "빠른선",
  slow: "느린선",
  direction: "방향",
  length: "기간",
  low: "하단 밴드",
  high: "상단 밴드",
  signal: "시그널",
  n: "기간(n)",
  mult: "배수(mult)",
  min_volume: "최소 거래량",
  volume_sma_n: "거래량 SMA 기간",
  volume_sma_mult: "거래량 SMA 배수",
  min_volume_change_pct: "거래량 변화율(%) 최소",
};

// enum 후보 (필요 시 확장)
const ENUMS = {
  direction: [
    { value: "up", label: "상향(골든/돌파)" },
    { value: "down", label: "하향(데드/이탈)" },
  ],
};

export default function StrategySelector({ value, onChange }) {
  /**
   * value 구조 예:
   * { strategyCode: "MA_CROSS" | null, strategyParams: { fast:5, slow:20, ... } }
   */
  const [strategies, setStrategies] = useState({});
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState(value?.strategyCode ?? null);
  const [params, setParams] = useState(value?.strategyParams ?? {});

  // 목록 로드
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchStrategies();
        if (!mounted) return;
        setStrategies(data);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 코드가 바뀌면 defaults로 초기화 (최초 선택 시)
  useEffect(() => {
    if (!code || !strategies[code]) return;
    const defaults = strategies[code]?.defaults || {};
    // 기존 params 유지하면서 defaults가 없는 키는 채워넣기
    setParams(prev => ({ ...defaults, ...prev }));
  }, [code, strategies]);

  // 부모로 변경사항 반영
  useEffect(() => {
    if (onChange) onChange({ strategyCode: code, strategyParams: params });
  }, [code, params, onChange]);

  const options = useMemo(() => {
    // API 없거나 실패해도 기존 하드코어 옵션으로 폴백 가능 (원하시면 아래 주석 해제)
    // const fallback = {
    //   "MA_CROSS": { defaults: { fast: 5, slow: 20, direction: "up" }, desc: "이평선 골든/데드 크로스" },
    //   "RSI_BANDS": { defaults: { length: 14, low: 30, high: 70 }, desc: "RSI 밴드(30/70) 크로스" },
    //   "MA_BREAKOUT": { defaults: { length: 20 }, desc: "MA n선 돌파/이탈" },
    //   "MACD_CROSS": { defaults: { fast: 12, slow: 26, signal: 9 }, desc: "MACD 라인-시그널 크로스" },
    //   "VOLUME_SPIKE": { defaults: { n: 20, mult: 2.0 }, desc: "거래량 스파이크" },
    // };
    return strategies; // || fallback;
  }, [strategies]);

  const currentDesc = code ? options[code]?.desc : null;
  const currentDefaults = code ? (options[code]?.defaults || {}) : {};

  const handleParamChange = (k, v) => {
    setParams(prev => ({ ...prev, [k]: v }));
  };

  const renderParamInput = (k, v) => {
    // enum 처리
    if (ENUMS[k]) {
      return (
        <select
          value={String(v)}
          onChange={(e) => handleParamChange(k, e.target.value)}
        >
          {ENUMS[k].map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    // 숫자/문자 구분 (단순 처리)
    const isNumber = typeof v === "number" || /^[0-9.\-]+$/.test(String(v));
    return (
      <input
        type={isNumber ? "number" : "text"}
        value={String(v)}
        onChange={(e) => {
          const raw = e.target.value;
          const num = Number(raw);
          handleParamChange(k, isNaN(num) ? raw : num);
        }}
        step="any"
      />
    );
  };

  // 파라미터 키 목록: defaults 우선, 그 다음 현재 params에만 있는 키(예: 거래량 필터)
  const paramKeys = useMemo(() => {
    const keys = new Set([...Object.keys(currentDefaults), ...Object.keys(params || {})]);
    return Array.from(keys);
  }, [currentDefaults, params]);

  return (
    <div className="strategy-selector">
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ minWidth: 80 }}>전략</label>
        {loading ? (
          <span>불러오는 중…</span>
        ) : (
          <select
            value={code || ""}
            onChange={(e) => setCode(e.target.value || null)}
          >
            <option value="">선택 없음</option>
            {Object.entries(options).map(([k, meta]) => (
              <option key={k} value={k}>
                {meta.desc ? `${meta.desc} (${k})` : k}
              </option>
            ))}
          </select>
        )}
      </div>

      {code && (
        <>
          {currentDesc && (
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
              {currentDesc}
            </div>
          )}

          <div style={{ marginTop: 12, padding: 12, border: "1px solid #333", borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>전략 파라미터</div>
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 8, columnGap: 12 }}>
              {paramKeys.map((k) => (
                <React.Fragment key={k}>
                  <div style={{ alignSelf: "center" }}>{LABELS[k] || k}</div>
                  <div>{renderParamInput(k, params?.[k] ?? currentDefaults[k])}</div>
                </React.Fragment>
              ))}
            </div>

            <details style={{ marginTop: 12 }}>
              <summary>거래량 필터(선택)</summary>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 8, columnGap: 12 }}>
                {["min_volume", "volume_sma_n", "volume_sma_mult", "min_volume_change_pct"].map((k) => (
                  <React.Fragment key={k}>
                    <div style={{ alignSelf: "center" }}>{LABELS[k]}</div>
                    <input
                      type="number"
                      step="any"
                      value={params?.[k] ?? ""}
                      onChange={(e) => handleParamChange(k, e.target.value === "" ? undefined : Number(e.target.value))}
                      placeholder="비우면 미적용"
                    />
                  </React.Fragment>
                ))}
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
