"use strict";
// Diagnostic only. No inventory data is accessed or uploaded.
const CLIENT_ID='25b2715eec4b4b2cba466552b2fedfba';
const REDIRECT='https://alexandrzhdanov1989-debug.github.io/inventory-tz/';
const API='https://cloud-api.yandex.net/v1/disk';
let token=sessionStorage.getItem('tz_yandex_token')||'';
const $=id=>document.getElementById(id);
const lines=[];
function log(message){
 const at=new Date().toLocaleTimeString('ru-RU',{hour12:false});
 lines.push(`[${at}] ${message}`);
 $('status').textContent=lines.join('\n');
}
function startLog(){lines.length=0;$('status').textContent='';}
function setUi(){
 $('test').disabled=!token;
 $('profile').textContent=token?'Сессия авторизована. Можно выполнить проверку.':'Нет подключения';
}
function shortError(e){
 if(e instanceof TypeError)return `Сетевой сбой (${e.message}). Возможны CORS, блокировка браузером или отсутствие сети. HTTP-ответ недоступен.`;
 return String(e.message||e);
}
async function request(stage,url,options={},withAuth=true){
 const method=options.method||'GET';
 let r;
 // Never display tokens, temporary signed URLs or request headers in diagnostic output.
 try{
  const headers={...(options.headers||{})};
  if(withAuth)headers.Authorization='OAuth '+token;
  r=await fetch(url,{...options,headers,cache:'no-store'});
 }catch(e){throw Error(`${stage}: ${shortError(e)}`);}
 log(`  HTTP ${r.status} (${method})`);
 return r;
}
async function apiJson(stage,url,options={}){
 const r=await request(stage,url,options);
 const raw=await r.text();let data;
 try{data=JSON.parse(raw)}catch{data={};}
 if(!r.ok){
  // Only show status and machine-readable Yandex code (never echo potentially sensitive response text).
  let code=(data.error||'').toString().slice(0,100);
  throw Error(`${stage}: HTTP ${r.status}${code?' · '+code:''}`);
 }
 return data;
}
$('login').onclick=()=>{
 const state='tztest-'+crypto.randomUUID();
 sessionStorage.setItem('tz_yandex_expected_state',state);
 sessionStorage.removeItem('tz_yandex_error');
 const u=new URL('https://oauth.yandex.ru/authorize');
 u.searchParams.set('response_type','token');
 u.searchParams.set('client_id',CLIENT_ID);
 u.searchParams.set('redirect_uri',REDIRECT);
 u.searchParams.set('state',state);
 location.href=u.toString();
};
$('logout').onclick=()=>{
 token='';sessionStorage.removeItem('tz_yandex_token');sessionStorage.removeItem('tz_yandex_error');
 setUi();startLog();log('Сессия этого устройства очищена. Токен у Яндекса не отозван.');
};
$('test').onclick=async()=>{
 if(!token){log('Сначала войдите через Яндекс.');return;}
 $('test').disabled=true;startLog();
 const filename='pwa-diagnostic-'+crypto.randomUUID()+'.json';
 const path='app:/'+filename;
 const payload={test:'TZ_YANDEX_APP_FOLDER',id:crypto.randomUUID(),createdAt:new Date().toISOString()};
 let stage='';
 try{
  stage='1. Проверка профиля';log(stage+'…');
  const user=await apiJson(stage,'https://login.yandex.ru/info?format=json');
  log('  Идентификатор получен: '+(user.id?'да':'нет'));
  stage='2. Проверка app:/';log(stage+'…');
  try{
   await apiJson(stage,API+'/resources?path='+encodeURIComponent('app:/'));
   log('  Папка доступна.');
  }catch(e){
   if(/HTTP 404(?:\D|$)/.test(e.message))log('  Папка ещё не существует (HTTP 404). Продолжаем.');
   else throw e;
  }
  stage='3. Получение ссылки загрузки';log(stage+'…');
  const upload=await apiJson(stage,API+'/resources/upload?'+new URLSearchParams({path,overwrite:'false'}));
  if(!upload.href||!upload.href.startsWith('https://'))throw Error(stage+': API не вернул HTTPS-ссылку');
  log('  HTTPS-ссылка получена.');
  stage='4. Загрузка JSON';log(stage+'…');
  let r=await request(stage,upload.href,{method:upload.method||'PUT',body:new Blob([JSON.stringify(payload)],{type:'application/json'})},false);
  if(!r.ok)throw Error(stage+': HTTP '+r.status);
  log('  Файл загружен.');
  stage='5. Получение ссылки скачивания';log(stage+'…');
  const download=await apiJson(stage,API+'/resources/download?path='+encodeURIComponent(path));
  if(!download.href||!download.href.startsWith('https://'))throw Error(stage+': API не вернул HTTPS-ссылку');
  log('  HTTPS-ссылка получена.');
  stage='6. Скачивание и сверка';log(stage+'…');
  r=await request(stage,download.href,{},false);
  if(!r.ok)throw Error(stage+': HTTP '+r.status);
  const read=await r.json();
  if(read.id!==payload.id||read.test!==payload.test)throw Error(stage+': содержимое не совпало');
  log('УСПЕХ: тестовый файл записан и прочитан.');
  log('Это подтверждает только личную папку приложения, не обмен между ПХ.');
 }catch(e){
  log('ОШИБКА НА ЭТАПЕ «'+stage+'»: '+shortError(e));
  log('Основные данные инвентаризации не затронуты.');
 }finally{setUi();}
};
$('copy').onclick=()=>{
 const text=$('status').textContent;
 if(navigator.clipboard?.writeText){navigator.clipboard.writeText(text).catch(()=>{});}
 else{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove();}
};
const returnedError=sessionStorage.getItem('tz_yandex_error');
setUi();
if(returnedError){startLog();log('Ошибка входа: '+returnedError);sessionStorage.removeItem('tz_yandex_error');}
