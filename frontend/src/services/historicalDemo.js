// Immutable historical snapshots, NOT live results or approved model reasoning.
export const historicalCases = [
  {id:'A', title:'5 萬・中性・中間戶股票池', date:'2026-09-15 12:38',
    sourceKey:'884119b3f62324f675f8894183fe79d71ca3de6552af670d68dcd7f79968046d',
    stocks:72.24,cash:27.76,
    rows:[['聯電',23.38,6.62,30],['光寶科',3.88,0,3.88],['長榮',23.37,-10,13.37],['廣達',2.69,-1,1.69],['中華電',23.3,0,23.3],['現金',23.38,4.38,27.76]]},
  {id:'B', title:'5 萬・中性・小戶股票池', date:'2026-09-15 21:37',
    sourceKey:'45628a6de823023c5caa41312d8d39f61e5a481e9b0b28882f4846ec9a708e7d',
    stocks:88.29,cash:11.71,
    rows:[['富邦金',26.02,0,26.02],['玉山金',26.02,3.98,30],['國泰金',2.87,0,2.87],['第一金',26,0,26],['兆豐金',3.4,0,3.4],['現金',15.69,-3.98,11.71]]},
  {id:'C', title:'80 萬・保守・中間戶股票池', date:'2026-09-16 00:11',
    sourceKey:'ab99380af9fd5a59265a12d0de4869c5ad29ff50143f7514b4cdfaf269453986',
    stocks:72.59,cash:27.4,
    rows:[['聯電',28.43,-2,26.43],['研華',8.07,3,11.07],['緯創',12.93,0,12.93],['光寶科',1.65,0,1.65],['廣達',20.51,0,20.51],['現金',28.4,-1,27.4]],
    note:'各項比例四捨五入後合計 99.99%，原始配置顯示值也有相同差異。'},
];

export function resolveHistoricalCase(id) {
  return historicalCases.find(item => item.id === id) || historicalCases[0];
}
