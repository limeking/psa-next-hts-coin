// frontend/src/modules/coinlab/api/conditionSearchApi.js

// 백엔드가 배열([]) 또는 {searches:[...]} 혹은 단일객체를 줄 수 있으니 모두 흡수
function normalizeList(data) {
  try {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.searches)) return data.searches;
    if (data && data.name && data.combo) return [data];
    return [];
  } catch {
    return [];
  }
}

export async function fetchConditionSearchList() {
  const res = await fetch('/api/coinlab/condition_search');
  if (!res.ok) throw new Error('Failed to fetch condition_search');
  const j = await res.json();
  return normalizeList(j);
}

export async function saveConditionSearchList(list) {
  // 무엇이 오든 백엔드에는 "배열 형태"로 저장
  const payload = normalizeList(list);
  const res = await fetch('/api/coinlab/condition_search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save condition_search');
  return res.json();
}
