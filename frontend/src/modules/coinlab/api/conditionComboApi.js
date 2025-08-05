// src/modules/coinlab/api/conditionComboApi.js

export async function fetchConditionList() {
    const res = await fetch('/api/coinlab/condition_list');
    if (!res.ok) throw new Error("불러오기 실패");
    return res.json();
  }
  
  export async function saveConditionList(list) {
    const res = await fetch('/api/coinlab/condition_list', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(list),
    });
    if (!res.ok) throw new Error("저장 실패");
    return res.json();
  }
  