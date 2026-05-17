const SUPABASE_URL='https://lemwzcchuazqpsyzsoff.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_dXOuhuPizNsQgCXtqQYY4A_DBk6WCGV';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

const APP={year:new Date().getFullYear(),admin:false};
const $=id=>document.getElementById(id);

function showView(view){
 ['register','attendance','admin'].forEach(id=>$(id)?.classList.add('hidden'));
 if(view!=='home') $(view)?.classList.remove('hidden');
}
function msg(id,text,type=''){
 const el=$(id); if(!el) return;
 el.className='msg '+type; el.textContent=text;
}
function koDate(v){
 if(!v) return '';
 const d=new Date(v); if(isNaN(d)) return v;
 return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
}
function generationFromStudentNo(v){
 const s=String(v||'').replace(/\D/g,'').slice(-2);
 const yy=Number(s); if(!s||isNaN(yy)) return '';
 return yy>=62?String(yy-61):String(yy+39);
}

async function loadSettings(){
 const {data}=await db.from('app_settings').select('key,value');
 const map=Object.fromEntries((data||[]).map(x=>[x.key,x.value]));
 APP.year=Number(map.CURRENT_YEAR||APP.year);
 if($('alumniName')) $('alumniName').textContent=map.ALUMNI_NAME||'경인교대 파주동문회';
}

async function loadNotices(){
 const box=$('noticeList'); if(box) box.textContent='불러오는 중...';
 const {data,error}=await db.from('notices').select('*').eq('year',APP.year).eq('is_public',true).order('important',{ascending:false}).order('created_at',{ascending:false});
 if(error){console.error(error); if(box) box.textContent='공지사항을 불러오지 못했습니다.'; return;}
 if(box) box.innerHTML=(data||[]).map(n=>`<div class="item"><strong>${n.important?'[중요] ':''}${n.title||''}</strong><div class="muted">${koDate(n.created_at)}</div><div>${String(n.content||'').replace(/\n/g,'<br>')}</div>${n.file_url?`<p><a href="${n.file_url}" target="_blank">첨부파일 보기</a></p>`:''}</div>`).join('')||'공지사항이 없습니다.';
}

async function loadSchools(){
 const {data}=await db.from('schools').select('name').eq('active',true).order('sort_order');
 const html='<option value="">학교 선택</option>'+(data||[]).map(s=>`<option value="${s.name}">${s.name}</option>`).join('');
 if($('regSchool')) $('regSchool').innerHTML=html;
}

async function loadEvents(){
 const {data}=await db.from('events').select('*').eq('year',APP.year).eq('active',true).order('sort_order').order('event_date');
 const html=(data||[]).map(e=>`<option value="${e.id}">${e.title} (${e.event_date||''})</option>`).join('');
 if($('attEvent')) $('attEvent').innerHTML=html;
}

async function registerMember(){
 const name=$('regName')?.value.trim();
 const student_no=$('regStudentNo')?.value.trim();
 const phone=$('regPhone')?.value.trim();
 const position=$('regPosition')?.value;
 const school=$('regSchool')?.value;
 if(!name||!student_no||!phone||!position||!school){msg('registerMsg','모든 항목을 입력해주세요.','error');return;}
 if(!$('regAgree')?.checked){msg('registerMsg','개인정보 동의가 필요합니다.','error');return;}
 const generation=generationFromStudentNo(student_no);
 const {data:member,error}=await db.from('members').insert([{name,student_no,generation,phone,position,school,privacy_agreed:true}]).select('id').single();
 if(error){console.error(error);msg('registerMsg','회원등록 실패: '+error.message,'error');return;}
 await db.from('yearly_memberships').insert([{year:APP.year,member_id:member.id,name,position,school,phone,privacy_agreed:true}]);
 await db.from('fee_payments').insert([{year:APP.year,member_id:member.id,paid:false,amount:feeAmount(position)}]);
 msg('registerMsg',`${name}님 등록 완료 (${generation}기)`,'success');
}
function feeAmount(p){return ['교장','장학관'].includes(p)?100000:['교감','장학사'].includes(p)?80000:60000;}

async function saveAttendance(status){
 const event_id=$('attEvent')?.value;
 const name=$('attName')?.value.trim();
 if(!event_id||!name){msg('attendanceMsg','행사와 이름을 입력해주세요.','error');return;}
 const {data:ms}=await db.from('members').select('*').eq('name',name).limit(5);
 const m=(ms||[])[0]||{};
 const payload={year:APP.year,event_id,member_id:m.id||null,name,generation:m.generation||'',school:m.school||'',position:m.position||'',status};
 const {error}=await db.from('event_attendance').insert([payload]);
 if(error){console.error(error);msg('attendanceMsg','참석 저장 실패: '+error.message,'error');return;}
 msg('attendanceMsg','저장 완료','success');
}

function adminLogin(){
 if($('adminPin')?.value.trim()==='1234'){
  APP.admin=true; $('adminPanel')?.classList.remove('hidden'); msg('adminMsg','관리자 로그인 성공','success'); loadMembers();
 }else msg('adminMsg','PIN 오류','error');
}
async function loadMembers(){
 const {data,error}=await db.from('members').select('*').order('school').order('position').order('name');
 if(error){msg('adminMsg','회원명단 로드 실패','error');return;}
 const html=(data||[]).map(m=>`<div class="item">${m.school||''} / ${m.position||''} / ${m.name||''} / ${m.generation||''}기 / ${m.phone||''}</div>`).join('');
 if($('memberList')) $('memberList').innerHTML=html||'회원 없음';
}
async function saveNotice(){
 const title=$('noticeTitle')?.value.trim(); const content=$('noticeContent')?.value.trim();
 if(!title){msg('adminMsg','공지 제목을 입력해주세요.','error');return;}
 const {error}=await db.from('notices').insert([{year:APP.year,title,content,is_public:true,important:false}]);
 if(error){msg('adminMsg','공지 저장 실패: '+error.message,'error');return;}
 msg('adminMsg','공지 저장 완료','success'); loadNotices();
}
async function saveEvent(){
 const payload={year:APP.year,title:$('eventTitle')?.value.trim(),event_date:$('eventDate')?.value,place:$('eventPlace')?.value.trim(),content:$('eventContent')?.value.trim(),pdf_file_url:$('eventFileUrl')?.value.trim(),active:true,sort_order:1};
 if(!payload.title||!payload.event_date){msg('adminMsg','행사명과 행사일을 입력해주세요.','error');return;}
 const {error}=await db.from('events').insert([payload]);
 if(error){msg('adminMsg','행사 저장 실패: '+error.message,'error');return;}
 msg('adminMsg','행사 저장 완료','success'); loadEvents();
}

window.addEventListener('DOMContentLoaded',async()=>{await loadSettings();await loadNotices();await loadSchools();await loadEvents();});
