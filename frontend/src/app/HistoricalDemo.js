import React, {useState} from 'react';
import {View, Text, Pressable, ScrollView, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {historicalCases, resolveHistoricalCase} from '../services/historicalDemo';

export default function HistoricalDemo({onBack}) {
  const [id,setId] = useState(() => resolveHistoricalCase(typeof window !== 'undefined'
    ? new URLSearchParams(window.location?.search || '').get('case') : '').id);
  const item = resolveHistoricalCase(id);
  const choose = (next) => {
    setId(next);
    if(typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('demo','history'); url.searchParams.set('case',next);
      window.history.replaceState(null,'',url.toString());
    }
  };
  return <SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.content}>
    <Pressable accessibilityRole="button" onPress={onBack} style={s.button}><Text style={s.text}>返回一般模式</Text></Pressable>
    <Text style={s.title}>歷史案例 · 最終配置</Text>
    <Text style={s.notice}>固定歷史結果，非即時 AI 討論，僅核對配置算術，未通過新版一致性驗證，討論理由尚未驗收。</Text>
    <View style={s.tabs}>{historicalCases.map(x=><Pressable key={x.id} accessibilityRole="button" accessibilityState={{selected:id===x.id}}
      onPress={()=>choose(x.id)} style={[s.button,id===x.id && s.selected]}><Text style={s.text}>案例 {x.id}</Text></Pressable>)}</View>
    <Text style={s.heading}>{item.title}</Text><Text style={s.muted}>歷史產生時間：{item.date}</Text>
    <View style={s.cards}>{[['股票',item.stocks],['現金',item.cash]].map(([label,value])=><View key={label} style={s.card}>
      <Text style={s.text}>{label}</Text><Text style={s.percent}>{value.toFixed(2)}%</Text></View>)}</View>
    {item.note && <Text style={s.notice}>{item.note}</Text>}
    <Text style={s.heading}>各項配置</Text>
    {item.rows.map(([name,base,delta,target])=><View key={name} style={s.row}>
      <Text style={s.heading}>{name}　{target.toFixed(2)}%</Text>
      <Text style={s.muted}>原配置 {base.toFixed(2)}%，{delta===0?'維持不變':`${delta>0?'增加':'減少'} ${Math.abs(delta)} 個百分點`}</Text>
    </View>)}
    <Text style={s.notice}>此頁不呼叫討論服務，也不套用配置，網頁版重新整理會保留目前案例。舊討論文字未列為合格展示內容，因此本頁不播放會議紀錄。</Text>
    <Text selectable style={s.source}>來源快取：{item.sourceKey}</Text>
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#292b2d'},content:{padding:20,paddingBottom:45,maxWidth:740,width:'100%',alignSelf:'center',gap:16},
  text:{color:'#fff',fontSize:16},title:{color:'#fff',fontSize:26,fontWeight:'700'},heading:{color:'#fff',fontSize:18,fontWeight:'600'},
  muted:{color:'#cbd1d9',fontSize:15,lineHeight:24},notice:{color:'#efdbab',fontSize:15,lineHeight:25},
  tabs:{flexDirection:'row',flexWrap:'wrap',gap:10},button:{padding:12,borderRadius:12,backgroundColor:'#41464d',alignSelf:'flex-start'},selected:{backgroundColor:'#245fa5'},
  cards:{flexDirection:'row',flexWrap:'wrap',gap:12},card:{flexGrow:1,minWidth:130,padding:20,borderRadius:18,borderWidth:2,borderColor:'#3186dc'},
  percent:{color:'#74b8ff',fontSize:34,fontWeight:'700',marginTop:8},row:{padding:14,borderRadius:12,backgroundColor:'#383c41',gap:8},source:{color:'#abb5c0',fontSize:12,lineHeight:20}});
