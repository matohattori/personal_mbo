// script.js
let currentUser = null;

function showPage(id) {
  const ids = ['page-login','page-register','page-user','page-admin'];
  ids.forEach(pid=>{
    document.getElementById(pid).classList.toggle('hidden', pid!==id);
  });
  updateHeader();
}

function updateHeader() {
  const h = document.getElementById('header-user-info');
  if (!currentUser) { h.textContent=''; return; }
  h.innerHTML = `<span class="mr-3 text-sm">${currentUser.name} (${currentUser.role})</span>
    <button id="btn-logout" class="text-sm underline">ログアウト</button>`;
  document.getElementById('btn-logout').onclick = async () => {
    await apiPost('logout',{});
    currentUser=null;
    showPage('page-login');
  };
}

async function apiPost(action, payload) {
  const form = new URLSearchParams();
  form.append('action', action);
  Object.entries(payload||{}).forEach(([k,v])=>form.append(k,v));
  const res = await fetch('api.php',{method:'POST',body:form,credentials:'include'});
  const json = await res.json().catch(()=>null);
  if (!res.ok) throw new Error(json && json.error ? json.error : 'エラー');
  return json;
}

// login/register
async function handleLogin(){
  const uid=document.getElementById('login-user-id').value.trim();
  const pw=document.getElementById('login-password').value;
  const err=document.getElementById('login-error');
  err.classList.add('hidden'); err.textContent='';
  try{
    const r=await apiPost('login',{uid,password:pw});
    currentUser=r.user;
    await loadInitialData();
  }catch(e){err.textContent=e.message;err.classList.remove('hidden');}
}
async function handleRegister(){
  const uid=document.getElementById('register-user-id').value.trim();
  const name=document.getElementById('register-name').value.trim();
  const pw=document.getElementById('register-password').value;
  const pw2=document.getElementById('register-password-confirm').value;
  const err=document.getElementById('register-error');
  err.classList.add('hidden'); err.textContent='';
  if(!uid||!name||!pw||!pw2){err.textContent='すべて入力してください';err.classList.remove('hidden');return;}
  if(pw!==pw2){err.textContent='パスワードが一致しません';err.classList.remove('hidden');return;}
  try{
    const r=await apiPost('register',{uid,name,password:pw});
    currentUser=r.user;
    await loadInitialData();
  }catch(e){err.textContent=e.message;err.classList.remove('hidden');}
}

async function loadInitialData(){
  if(!currentUser)return;
  const d=await apiPost('init',{});
  window._goalTypes=d.goalTypes||[];
  window._userGoals=d.userGoals||[];
  window._adminGoals=d.adminGoals||[];
  if(currentUser.role==='admin'){
    renderAdminGoalTypes();
    renderAdminGoals();
    showPage('page-admin');
  }else{
    renderGoalTypeOptions();
    renderUserGoalList();
    renderUserGoalEditList();
    showPage('page-user');
  }
}

// user tabs
function switchUserTab(tab){
  ['list','edit','password'].forEach(t=>{
    const btn=document.querySelector(`button.user-tab[data-user-tab="${t}"]`);
    const pane=document.getElementById(`user-tab-${t}`);
    if(t===tab){btn.classList.add('bg-blue-600','text-white');btn.classList.remove('bg-gray-200','text-gray-800');pane.classList.remove('hidden');}
    else{btn.classList.remove('bg-blue-600','text-white');btn.classList.add('bg-gray-200','text-gray-800');pane.classList.add('hidden');}
  });
}

function renderGoalTypeOptions(){
  const sel=document.getElementById('goal-edit-type');
  sel.innerHTML='';
  (window._goalTypes||[]).forEach(gt=>{
    const o=document.createElement('option');o.value=gt.id;o.textContent=gt.name;sel.appendChild(o);
  });
}

function renderUserGoalList(){
  const tb=document.getElementById('user-goal-list-body');
  tb.innerHTML='';
  (window._userGoals||[]).forEach((g,i)=>{
    const tr=document.createElement('tr');tr.className='cursor-pointer hover:bg-blue-50';
    const majors=g.majors||[];
    const cell=(idx)=>{const m=majors[idx-1]; if(!m||!m.content)return ''; const term=m.due_term==='下期末'?'下':'上'; const mark=m.done?'■':'□'; return `${term}[${mark}]`;};
    tr.innerHTML=`<td class="border px-2 py-1 text-center">${i+1}</td>
      <td class="border px-2 py-1">${g.goal_type_name||''}</td>
      <td class="border px-2 py-1">${g.title||''}</td>
      <td class="border px-2 py-1 text-center">${cell(1)}</td>
      <td class="border px-2 py-1 text-center">${cell(2)}</td>
      <td class="border px-2 py-1 text-center">${cell(3)}</td>
      <td class="border px-2 py-1 text-center">${cell(4)}</td>
      <td class="border px-2 py-1 text-center">${cell(5)}</td>`;
    tr.onclick=()=>openUserGoalDetail(g.id);
    tb.appendChild(tr);
  });
}

function openUserGoalDetail(id){
  const g=(window._userGoals||[]).find(x=>x.id==id); if(!g)return;
  const c=document.getElementById('user-goal-detail-content');
  c.dataset.goalId=id; c.innerHTML='';
  const block=(label,val)=>{const d=document.createElement('div');d.innerHTML=`<span class="font-semibold">${label}：</span>${(val||'').replace(/\n/g,'<br>')}`;return d;};
  c.appendChild(block('目標種別',g.goal_type_name||'')); 
  c.appendChild(block('目標',g.title||'')); 
  c.appendChild(block('自分の課題',g.issue||'')); 
  c.appendChild(block('やること概要',g.summary||'')); 
  const majorsDiv=document.createElement('div');majorsDiv.className='mt-2 space-y-1';
  (g.majors||[]).forEach((m,i)=>{
    const row=document.createElement('div');row.className='flex items-center gap-2 text-xs';
    row.innerHTML=`<span class="font-semibold">M${i+1}</span><span>${m.content||''}</span>
      <span class="ml-auto">${m.due_term}</span>
      <label class="flex items-center gap-1">
        <input type="checkbox" data-major-index="${i}" ${m.done?'checked':''}>
        <span>完了</span>
      </label>`;
    majorsDiv.appendChild(row);
  });
  c.appendChild(majorsDiv);
  c.appendChild(block('メモ',g.memo||''));
  document.getElementById('user-goal-detail').classList.remove('hidden');
}

async function saveUserGoalProgress(){
  const c=document.getElementById('user-goal-detail-content');
  const id=c.dataset.goalId; if(!id)return;
  const checks=c.querySelectorAll('input[type="checkbox"][data-major-index]');
  const arr=[]; checks.forEach(cb=>arr.push({index:parseInt(cb.dataset.majorIndex,10),done:cb.checked?'1':'0'}));
  await apiPost('update_major_done',{goal_id:id,majors:JSON.stringify(arr)});
  const d=await apiPost('get_user_goals',{});
  window._userGoals=d.userGoals||[];
  renderUserGoalList();
  document.getElementById('user-goal-detail').classList.add('hidden');
}

function renderUserGoalEditList(){
  const ul=document.getElementById('user-goal-edit-list');
  ul.innerHTML='';
  (window._userGoals||[]).forEach(g=>{
    const li=document.createElement('li');li.className='flex justify-between items-center';
    li.innerHTML=`<span>${g.goal_type_name||''} / ${g.title||''}</span>
      <button class="text-xs text-blue-600 underline">編集</button>`;
    li.querySelector('button').onclick=()=>openGoalEditForm(g.id);
    ul.appendChild(li);
  });
}

function openGoalEditForm(id){
  const fw=document.getElementById('user-goal-edit-form-wrapper');
  const f=document.getElementById('user-goal-edit-form');
  f.reset();
  document.getElementById('goal-edit-id').value=id||'';
  const g=(window._userGoals||[]).find(x=>x.id==id);
  if(g){
    document.getElementById('goal-edit-type').value=g.goal_type_id||'';
    document.getElementById('goal-edit-title').value=g.title||'';
    document.getElementById('goal-edit-issue').value=g.issue||'';
    document.getElementById('goal-edit-summary').value=g.summary||'';
    document.getElementById('goal-edit-memo').value=g.memo||'';
    const majors=g.majors||[];
    [1,2,3,4,5].forEach(n=>{
      const m=majors[n-1]||{};
      document.getElementById(`major${n}-content`).value=m.content||'';
      const term=m.due_term||'上期末';
      f.querySelectorAll(`input[name="major${n}-term"]`).forEach(r=>r.checked=(r.value===term));
    });
  }else{
    [1,2,3,4,5].forEach(n=>{
      document.getElementById(`major${n}-content`).value='';
      f.querySelectorAll(`input[name="major${n}-term"]`).forEach(r=>r.checked=(r.value==='上期末'));
    });
    document.getElementById('goal-edit-memo').value='';
  }
  fw.classList.remove('hidden');
}

async function saveGoal(){
  const id=document.getElementById('goal-edit-id').value;
  const type=document.getElementById('goal-edit-type').value;
  const title=document.getElementById('goal-edit-title').value.trim();
  const issue=document.getElementById('goal-edit-issue').value;
  const summary=document.getElementById('goal-edit-summary').value;
  const memo=document.getElementById('goal-edit-memo').value;
  if(!title){alert('目標を入力してください');return;}
  const f=document.getElementById('user-goal-edit-form');
  const majors=[];
  [1,2,3,4,5].forEach(n=>{
    const content=document.getElementById(`major${n}-content`).value;
    const term=f.querySelector(`input[name="major${n}-term"]:checked`).value;
    majors.push({index:n,content,due_term:term});
  });
  await apiPost('save_goal',{id,goal_type_id:type,title,issue,summary,memo,majors:JSON.stringify(majors)});
  const d=await apiPost('get_user_goals',{});
  window._userGoals=d.userGoals||[];
  renderUserGoalList();renderUserGoalEditList();
  document.getElementById('user-goal-edit-form-wrapper').classList.add('hidden');
}

async function deleteGoal(){
  const id=document.getElementById('goal-edit-id').value;
  if(!id){document.getElementById('user-goal-edit-form-wrapper').classList.add('hidden');return;}
  if(!confirm('この目標を削除しますか？'))return;
  await apiPost('delete_goal',{id});
  const d=await apiPost('get_user_goals',{});
  window._userGoals=d.userGoals||[];
  renderUserGoalList();renderUserGoalEditList();
  document.getElementById('user-goal-edit-form-wrapper').classList.add('hidden');
}

async function changePassword(){
  const msg=document.getElementById('password-change-message');
  msg.classList.add('hidden');msg.textContent='';
  const current=document.getElementById('password-current').value;
  const newp=document.getElementById('password-new').value;
  const newp2=document.getElementById('password-new-confirm').value;
  if(!current||!newp||!newp2){msg.textContent='すべて入力してください';msg.classList.remove('hidden');msg.classList.add('text-red-600');return;}
  if(newp!==newp2){msg.textContent='新しいパスワードが一致しません';msg.classList.remove('hidden');msg.classList.add('text-red-600');return;}
  try{
    await apiPost('update_password',{current,newpass:newp});
    msg.textContent='パスワードを変更しました';msg.classList.remove('hidden');msg.classList.remove('text-red-600');msg.classList.add('text-green-600');
  }catch(e){msg.textContent=e.message;msg.classList.remove('hidden');msg.classList.remove('text-green-600');msg.classList.add('text-red-600');}
}

// admin
function switchAdminTab(tab){
  ['goals','types','password'].forEach(t=>{
    const btn=document.querySelector(`button.admin-tab[data-admin-tab="${t}"]`);
    const pane=document.getElementById(`admin-tab-${t}`);
    if(t===tab){btn.classList.add('bg-blue-600','text-white');btn.classList.remove('bg-gray-200','text-gray-800');pane.classList.remove('hidden');}
    else{btn.classList.remove('bg-blue-600','text-white');btn.classList.add('bg-gray-200','text-gray-800');pane.classList.add('hidden');}
  });
}

function renderAdminGoalTypes(){
  const ul=document.getElementById('admin-goal-type-list');
  const sel=document.getElementById('admin-filter-type');
  ul.innerHTML=''; sel.innerHTML='<option value="">すべて</option>';
  (window._goalTypes||[]).forEach(gt=>{
    const li=document.createElement('li');li.className='flex justify-between items-center';
    li.innerHTML=`<span>${gt.name}</span><button class="text-xs text-red-600 underline">削除</button>`;
    li.querySelector('button').onclick=async()=>{
      if(!confirm(`「${gt.name}」を削除しますか？`))return;
      await apiPost('delete_goal_type',{id:gt.id});
      const d=await apiPost('get_goal_types',{});window._goalTypes=d.goalTypes||[];
      renderAdminGoalTypes();renderGoalTypeOptions();
    };
    ul.appendChild(li);
    const opt=document.createElement('option');opt.value=gt.id;opt.textContent=gt.name;sel.appendChild(opt);
  });
}

function renderAdminGoals(nameFilter='',typeId=''){
  const tb=document.getElementById('admin-goal-list-body');
  tb.innerHTML='';
  (window._adminGoals||[])
    .filter(g=>{
      if(nameFilter && !g.user_name.includes(nameFilter))return false;
      if(typeId && String(g.goal_type_id)!==String(typeId))return false;
      return true;
    })
    .forEach((g,i)=>{
      const tr=document.createElement('tr');tr.className='cursor-pointer hover:bg-blue-50';
      const majors=g.majors||[];
      const cell=(idx)=>{const m=majors[idx-1]; if(!m||!m.content)return ''; const term=m.due_term==='下期末'?'下':'上'; const mark=m.done?'■':'□'; return `${term}[${mark}]`;};
      tr.innerHTML=`<td class="border px-2 py-1 text-center">${i+1}</td>
        <td class="border px-2 py-1">${g.user_name||''}</td>
        <td class="border px-2 py-1">${g.goal_type_name||''}</td>
        <td class="border px-2 py-1">${g.title||''}</td>
        <td class="border px-2 py-1 text-center">${cell(1)}</td>
        <td class="border px-2 py-1 text-center">${cell(2)}</td>
        <td class="border px-2 py-1 text-center">${cell(3)}</td>
        <td class="border px-2 py-1 text-center">${cell(4)}</td>
        <td class="border px-2 py-1 text-center">${cell(5)}</td>`;
      tr.onclick=()=>openAdminGoalDetail(g.id);
      tb.appendChild(tr);
    });
}

function openAdminGoalDetail(id){
  const g=(window._adminGoals||[]).find(x=>x.id==id); if(!g)return;
  const c=document.getElementById('admin-goal-detail-content');
  c.dataset.goalId=id; c.innerHTML='';
  const block=(label,val)=>{const d=document.createElement('div');d.innerHTML=`<span class="font-semibold">${label}：</span>${(val||'').replace(/\n/g,'<br>')}`;return d;};
  c.appendChild(block('名前',g.user_name||'')); 
  c.appendChild(block('目標種別',g.goal_type_name||'')); 
  c.appendChild(block('目標',g.title||'')); 
  c.appendChild(block('自分の課題',g.issue||'')); 
  c.appendChild(block('やること概要',g.summary||'')); 
  const majors=g.majors||[]; const md=document.createElement('div');md.className='mt-2 space-y-1';
  majors.forEach((m,i)=>{const row=document.createElement('div');row.className='flex items-center gap-2 text-xs';
    row.innerHTML=`<span class="font-semibold">M${i+1}</span><span>${m.content||''}</span>
      <span class="ml-auto">${m.due_term}</span><span>${m.done?'完了':'未完了'}</span>`;md.appendChild(row);});
  c.appendChild(md);
  c.appendChild(block('メモ',g.memo||''));
  document.getElementById('admin-memo').value=g.admin_memo||'';
  document.getElementById('admin-goal-detail').classList.remove('hidden');
}

async function saveAdminMemo(){
  const c=document.getElementById('admin-goal-detail-content');
  const id=c.dataset.goalId; if(!id)return;
  const memo=document.getElementById('admin-memo').value;
  await apiPost('save_admin_memo',{goal_id:id,memo});
  const d=await apiPost('get_admin_goals',{});
  window._adminGoals=d.adminGoals||[];
  document.getElementById('admin-goal-detail').classList.add('hidden');
}

async function addGoalType(){
  const input=document.getElementById('admin-goal-type-new');
  const name=input.value.trim(); if(!name)return;
  await apiPost('add_goal_type',{name});
  input.value='';
  const d=await apiPost('get_goal_types',{});
  window._goalTypes=d.goalTypes||[];
  renderAdminGoalTypes();renderGoalTypeOptions();
}

async function changePasswordAdmin(){
  const msg=document.getElementById('admin-password-change-message');
  if(!msg) return;
  msg.classList.add('hidden');msg.textContent='';
  const current=document.getElementById('admin-password-current').value;
  const newp=document.getElementById('admin-password-new').value;
  const newp2=document.getElementById('admin-password-new-confirm').value;
  if(!current||!newp||!newp2){msg.textContent='すべて入力してください';msg.classList.remove('hidden');msg.classList.add('text-red-600');return;}
  if(newp!==newp2){msg.textContent='新しいパスワードが一致しません';msg.classList.remove('hidden');msg.classList.add('text-red-600');return;}
  try{
    await apiPost('update_password',{current,newpass:newp});
    msg.textContent='パスワードを変更しました';msg.classList.remove('hidden');msg.classList.remove('text-red-600');msg.classList.add('text-green-600');
  }catch(e){msg.textContent=e.message;msg.classList.remove('hidden');msg.classList.remove('text-green-600');msg.classList.add('text-red-600');}
}

function setupEvents(){
  document.getElementById('btn-login').onclick=handleLogin;
  document.getElementById('btn-go-register').onclick=()=>showPage('page-register');
  document.getElementById('btn-back-login').onclick=()=>showPage('page-login');
  document.getElementById('btn-register').onclick=handleRegister;

  document.querySelectorAll('button.user-tab').forEach(b=>b.onclick=()=>switchUserTab(b.dataset.userTab));
  document.getElementById('btn-user-goal-save').onclick=saveUserGoalProgress;
  document.getElementById('btn-user-goal-close').onclick=()=>document.getElementById('user-goal-detail').classList.add('hidden');
  document.getElementById('btn-goal-new').onclick=()=>openGoalEditForm('');
  document.getElementById('btn-goal-save').onclick=saveGoal;
  document.getElementById('btn-goal-delete').onclick=deleteGoal;
  document.getElementById('btn-goal-cancel').onclick=()=>document.getElementById('user-goal-edit-form-wrapper').classList.add('hidden');
  document.getElementById('btn-password-change').onclick=changePassword;

  document.querySelectorAll('button.admin-tab').forEach(b=>b.onclick=()=>switchAdminTab(b.dataset.adminTab));
  document.getElementById('btn-admin-filter').onclick=()=>{
    const name=document.getElementById('admin-filter-name').value.trim();
    const type=document.getElementById('admin-filter-type').value;
    renderAdminGoals(name,type);
  };
  document.getElementById('btn-admin-goal-close').onclick=()=>document.getElementById('admin-goal-detail').classList.add('hidden');
  document.getElementById('btn-admin-memo-save').onclick=saveAdminMemo;
  document.getElementById('btn-admin-goal-type-add').onclick=addGoalType;
  const adminPwBtn=document.getElementById('btn-admin-password-change');
  if(adminPwBtn){adminPwBtn.onclick=changePasswordAdmin;}
}

window.addEventListener('DOMContentLoaded',()=>{setupEvents();showPage('page-login');});
