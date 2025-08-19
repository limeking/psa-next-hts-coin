import React, { useEffect, useState } from "react";
import { fetchConditionSearchList } from "../../api/conditionSearchApi";

/**
 * props:
 * - value: 현재 선택된 comboName (string|null)
 * - onChange: (name) => void
 * - placeholder?: string
 */
export default function ConditionComboPicker({ value, onChange, placeholder = "조건검색식 조합을 선택하세요" }) {
  const [loading, setLoading] = useState(false);
  const [combos, setCombos] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        // 백엔드에서 등록된 조건검색 조합 리스트를 받아옴
        // 예상 응답 예시: [{name:"단타콤보A"}, {name:"모멘텀B"}, ...]
        const list = await fetchConditionSearchList();
        if (!mounted) return;
        setCombos(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!mounted) return;
        setError("조합 목록을 불러오지 못했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="w-full">
      <label className="text-sm text-gray-400 block mb-1">조건검색식 조합</label>
      <select
        className="w-full border rounded-md px-3 py-2 bg-transparent"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value || null)}
        disabled={loading || (!!error && combos.length === 0)}
      >
        <option value="">{loading ? "불러오는 중..." : placeholder}</option>
        {combos.map((c) => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
