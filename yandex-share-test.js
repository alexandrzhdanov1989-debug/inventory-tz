"use strict";
const API="https://cloud-api.yandex.net/v1/disk";
const CLIENT_ID="25b2715eec4b4b2cba466552b2fedfba";
const REDIRECT="https://alexandrzhdanov1989-debug.github.io/inventory-tz/";
const $=x=>document.getElementById(x);
const logLines=[];
const token=sessionStorage.getItem("tz_yandex_token")||"";
function log(s){logLines.push(s);$("logs").textContent=logLines.join("\n")}
function status(s){return s===200?"доступ есть":s===401?"не авторизован":s===403?"запрещено":s===404?"не найдено или недоступно":s===429?"ограничение запросов":`HTTP ${s}`}
async function api(label,path){
  const qs=new URLSearchParams({path,limit:"5",offset:"0"});
  let response;
  try {response=await fetch(API+"/resources?"+qs,{headers:{Authorization:"OAuth "+token},cache:"no-store"})}
  catch(e){log(`${label}: сетевая ошибка (возможна блокировка CORS).`);return {ok:false,network:true}}
  let data={};try{data=await response.json()}catch{}
  log(`${label}: HTTP ${response.status} (${status(response.status)}), тип: ${data.type||"—"}`);
  if(response.ok&&data.type==="dir"){
    const total=data._embedded?.total;
    if(Number.isFinite(total))log(`  Элементов в папке: ${total}`);
    if(data.resource_id)log("  Идентификатор ресурса доступен (не публикуется).");
  }
  if(!response.ok&&data.error)log("  Ошибка API: "+String(data.error).slice(0,65).replace(/[\n\r]/g," "));
  return {ok:response.ok,type:data.type||"",status:response.status};
}
async function run(){
  $("run").disabled=true;logLines.length=0;$("logs").textContent="";
  if(!token){log("Сначала войдите через Яндекс.");$("run").disabled=false;return}
  log("Проверка доступа только на чтение. OAuth-права не изменяются.");
  try {
    const check=await api("Проверка app:/ (контроль)","app:/");
    if(!check.ok){log("Контрольный доступ не получен. Проверьте вход и OAuth-разрешения.");return}
    const paths=["disk:/Reestr_TZ/TEST","disk:/TEST"];
    const custom=$("custom").value.trim();
    if(custom){if(!/^disk:\/[^?#]{1,290}$/i.test(custom)){log("Дополнительный путь должен начинаться с disk:/ и не содержать ? или #.");return}if(!paths.includes(custom))paths.push(custom)}
    let count=0;
    for(const path of paths){const r=await api("Проверка "+path,path);if(r.ok&&r.type==="dir")count++}
    if(count)log("ИТОГ: Доступ к обычной папке по одному из путей подтверждён. Следующий шаг — проверка записи тестовой операции под двумя аккаунтами.");
    else log("ИТОГ: Доступ к TEST по проверенным путям НЕ подтверждён. При наличии приглашения на сайте Диска вероятно ограничение app_folder. Не расширяйте OAuth-права ради этого теста.");
  }catch(e){log("Ошибка выполнения: "+(e?.name||"Error"))}
  finally{$("run").disabled=false}
}
$("session").textContent=token?"OAuth-сессия обнаружена в этой вкладке.":"Нет OAuth-сессии в этой вкладке.";
$("run").disabled=!token;
const authError=sessionStorage.getItem("tz_yandex_error");
if(authError){log("Ошибка последнего входа: "+authError.slice(0,120));sessionStorage.removeItem("tz_yandex_error")}
$("login").addEventListener("click",()=>{
  const state="tztest-"+crypto.randomUUID();
  sessionStorage.setItem("tz_yandex_expected_state",state);
  localStorage.setItem("tz_yandex_pending",JSON.stringify({state,destination:"share",createdAt:Date.now()}));
  sessionStorage.removeItem("tz_yandex_token");
  const u=new URL("https://oauth.yandex.ru/authorize");
  u.searchParams.set("response_type","token");
  u.searchParams.set("client_id",CLIENT_ID);
  u.searchParams.set("redirect_uri",REDIRECT);
  u.searchParams.set("state",state);
  u.searchParams.set("force_confirm","yes");
  window.location.assign(u.toString());
});
$("run").addEventListener("click",run);
$("copy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(logLines.join("\n"));$("copy").textContent="Скопировано"}catch{$("copy").textContent="Выделите текст отчёта вручную"}});
