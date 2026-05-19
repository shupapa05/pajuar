const APP={year:new Date().getFullYear(),pin:'1234'};
const $=id=>document.getElementById(id);

function msg(id,t,c=''){const e=$(id);if(e){e.className='msg '+c;e.textContent=t;}}
function allSections(){return Array.from(document.querySelectorAll('main>section'));}
function showView(v){allSections().forEach(s=>s.classList.add('hidden'));if(v==='home'){allSections().forEach(s=>s.classList.remove('hidden'));['register','attendance','admin'].forEach(x=>$(x)?.classList.add('hidden'));window.scrollTo(0,0);return;}$(v)?.classList.remove('hidden');window.scrollTo(0,0);}
function openAdminWindow(){window.open('index.html?admin=1','_blank');}
function setupAdmin(){document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='관리자')b.onclick=()=>openAdminWindow();});if(location.search.includes('admin=1'))showView('admin');}
function gen(v){const n=Number(String(v||'').replace(/\D/g,'').slice(-2));if(isNaN(n))return'';return n>=62?String(n-61):String(n+39);}
function fee(p){return ['교장','장학관'].includes(p)?100000:['교감','장학사'].includes(p)?80000:60000;}
function dateKo(v){const d=new Date(v);return isNaN(d)?'':`${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;}

// PDF 첨부 2개 이상 지원
function setupFileInputs() {
  const addBtn = $('addFileBtn');
  if(!addBtn) return;
  addBtn.addEventListener('click', () => {
    const container = $('fileInputs');
    const row = document.createElement('div');
    row.classList.add('file-row');
    row.innerHTML = `
      <input type="text" class="file-name" placeholder="파일명">
      <input type="text" class="file-url" placeholder="PDF 주소">
      <button type="button" class="removeFileBtn">삭제</button>
    `;
    container.appendChild(row);
    row.querySelector('.removeFileBtn').addEventListener('click',()=>row.remove());
  });
}

async function uploadEventPdfIfNeeded(fileInput){
  const file = fileInput.files && fileInput.files[0];
  if(!file) return null;
  if(file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw Error('PDF 파일만 첨부 가능합니다.');
  const safe = file.name.replace(/[^a-zA-Z0-9_.-]/g,'_');
  const path = 'event-'+Date.now()+'-'+safe;
  const up = await db.storage.from('event-guides').upload(path,file,{contentType:'application/pdf',upsert:false});
  if(up.error) throw up.error;
  const pub = db.storage.from('event-guides').getPublicUrl(path);
  return {name:file.name,url:pub.data.publicUrl};
}

async function saveEvent(){
  try{
    const btn = $('saveEventBtn');
    btn.disabled=true;
    btn.textContent='저장 중...';

    const rows = document.querySelectorAll('#fileInputs .file-row');
    const pdfFiles = [];
    for(const row of rows){
      const fileInput = row.querySelector('input[type="file"]');
      let pdf=null;
      if(fileInput && fileInput.files && fileInput.files[0]){
        pdf = await uploadEventPdfIfNeeded(fileInput);
      } else {
        const name = row.querySelector('.file-name')?.value.trim();
        const url = row.querySelector('.file-url')?.value.trim();
        if(name && url) pdf={name,url};
      }
      if(pdf) pdfFiles.push(pdf);
    }

    const p = {
      year: APP.year,
      title: $('eventTitle').value.trim(),
      event_date: $('eventDate').value,
      place: $('eventPlace').value.trim(),
      content: $('eventContent').value.trim(),
      pdfs: pdfFiles,
      active: true,
      sort_order: 1
    };

    const { error } = await db.from('events').insert([p]);
    if(error) return msg('adminMsg','행사 저장 실패','error');
    msg('adminMsg','행사 저장 완료','success');
    loadEvents();
  } catch(e){
    msg('adminMsg',e.message,'bad');
  } finally {
    const btn = $('saveEventBtn');
    btn.disabled=false;
    btn.textContent='행사 저장';
  }
}

function displayEventDetail(event){
  const container = $('eventDetailContainer');
  container.innerHTML=`<h2>${event.title}</h2><p>${event.content}</p>`;
  if(!event.pdfs || !event.pdfs.length) return;
  if(event.pdfs.length===1){
    container.innerHTML+=`<a href="${event.pdfs[0].url}" target="_blank">${event.pdfs[0].name}</a>`;
  } else {
    const list = document.createElement('ul');
    event.pdfs.forEach(pdf=>{
      const li = document.createElement('li');
      li.innerHTML=`<a href="${pdf.url}" target="_blank">${pdf.name}</a>`;
      list.appendChild(li);
    });
    container.appendChild(list);
  }
}

addEventListener('DOMContentLoaded',async()=>{
  setupAdmin();
  await loadSettings();
  await loadNotices();
  await loadSchools();
  await loadEvents();
  setupFileInputs();
});
