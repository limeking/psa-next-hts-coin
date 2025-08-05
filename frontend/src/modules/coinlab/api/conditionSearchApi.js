// src/modules/coinlab/api/conditionSearchApi.js

export async function fetchConditionSearchList() {
    const res = await fetch('/api/coinlab/condition_search');
    if (!res.ok) throw new Error("불러오기 실패");
    return res.json();
  }
  
  export async function saveConditionSearchList(list) {
    const res = await fetch('/api/coinlab/condition_search', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(list),
    });
    if (!res.ok) throw new Error("저장 실패");
    return res.json();
  }
  