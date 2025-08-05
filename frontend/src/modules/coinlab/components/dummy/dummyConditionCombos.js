export const dummyConditionCombos = [
    {
      id: 1,
      name: '상승률 3% 이상',
      conditions: [{ type: '상승률', operator: '>', value: 3 }],
    },
    {
      id: 2,
      name: '거래대금 10억↑',
      conditions: [{ type: '거래대금', operator: '>=', value: 1000000000 }],
    },
    {
      id: 3,
      name: 'RSI 30 이상',
      conditions: [{ type: 'RSI', operator: '>', value: 30 }],
    },
    {
      id: 4,
      name: 'MA5 > MA20',
      conditions: [{ type: 'MA5', operator: '>', value: 'MA20' }],
    },
    {
      id: 5,
      name: 'AI 테마',
      conditions: [{ type: '테마', operator: '=', value: 'AI' }],
    },
  ];
  