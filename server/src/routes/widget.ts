import { Router } from "express";

// Serves the embeddable widget script. Clients add ONE line to any website:
//   <script src="https://<host>/widget.js" data-key="tm_xxx" defer></script>
export const widgetRouter = Router();

const WIDGET_JS = String.raw`(function(){
  var s = document.currentScript;
  if(!s){ var all=document.getElementsByTagName('script'); s=all[all.length-1]; }
  var key = s.getAttribute('data-key');
  if(!key){ console.error('[TradiesMate] widget: missing data-key'); return; }
  var base = (function(){ try{ return new URL(s.src, location.href).origin; }catch(e){ return ''; } })();
  var color = s.getAttribute('data-color') || '#1f3864';
  var accent = s.getAttribute('data-accent') || '#f0a500';
  var label = s.getAttribute('data-label') || 'Get a quote';
  var title = s.getAttribute('data-title') || 'Request a callback';
  var mode = s.getAttribute('data-mode') || 'floating';
  var targetSel = s.getAttribute('data-target');

  var css = ''
    + '.tmw-btn{position:fixed;right:18px;bottom:18px;z-index:2147483000;background:'+accent+';color:#111;border:none;border-radius:999px;padding:14px 20px;font:600 15px system-ui,sans-serif;box-shadow:0 10px 24px -8px rgba(0,0,0,.4);cursor:pointer}'
    + '.tmw-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:2147483001;display:none;align-items:center;justify-content:center}'
    + '.tmw-overlay.open{display:flex}'
    + '.tmw-card{background:#fff;color:#0f172a;width:min(420px,92vw);border-radius:16px;padding:22px;font:14px system-ui,sans-serif;box-shadow:0 24px 60px -20px rgba(0,0,0,.5);max-height:90vh;overflow:auto}'
    + '.tmw-card h3{margin:0 0 4px;font-size:18px;color:'+color+'}'
    + '.tmw-card p.sub{margin:0 0 12px;color:#64748b}'
    + '.tmw-card label{display:block;font-weight:600;margin:10px 0 4px}'
    + '.tmw-card input,.tmw-card textarea{width:100%;box-sizing:border-box;padding:11px;border:1px solid #d5dbe6;border-radius:9px;font:inherit}'
    + '.tmw-card .tmw-send{margin-top:14px;width:100%;background:'+accent+';color:#111;border:none;border-radius:9px;padding:13px;font-weight:700;cursor:pointer}'
    + '.tmw-card .tmw-x{float:right;border:none;background:none;font-size:22px;cursor:pointer;color:#94a3b8;line-height:1}'
    + '.tmw-hp{position:absolute;left:-9999px}'
    + '.tmw-inline{display:inline-block}'
    + '.tmw-msg{margin-top:10px;font-weight:600}';
  var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  var overlay=document.createElement('div'); overlay.className='tmw-overlay';
  overlay.innerHTML='<div class="tmw-card">'
    + '<button class="tmw-x" aria-label="Close">&times;</button>'
    + '<h3>'+title+'</h3><p class="sub">No obligation — we\'ll call you straight back.</p>'
    + '<form class="tmw-form">'
    + '<input class="tmw-hp" name="company" tabindex="-1" autocomplete="off" aria-hidden="true"/>'
    + '<label>Your name</label><input name="name" required/>'
    + '<label>Phone</label><input name="phone" required/>'
    + '<label>Postcode</label><input name="postcode" autocomplete="postal-code" placeholder="e.g. SW1A 1AA"/>'
    + '<label>What do you need?</label><textarea name="msg" rows="3"></textarea>'
    + '<label>Photo of the problem (optional)</label><input name="photos" type="file" accept="image/*" multiple/>'
    + '<button type="submit" class="tmw-send">Send enquiry</button>'
    + '<div class="tmw-msg" style="display:none"></div>'
    + '</form></div>';
  document.body.appendChild(overlay);

  function open(){ overlay.classList.add('open'); }
  function close(){ overlay.classList.remove('open'); }
  overlay.addEventListener('click', function(e){ if(e.target===overlay) close(); });
  overlay.querySelector('.tmw-x').addEventListener('click', close);

  if(mode==='inline' && targetSel && document.querySelector(targetSel)){
    var b=document.createElement('button'); b.className='tmw-btn tmw-inline'; b.textContent=label; b.style.position='static';
    b.addEventListener('click', open); document.querySelector(targetSel).appendChild(b);
  } else {
    var fab=document.createElement('button'); fab.className='tmw-btn'; fab.textContent=label;
    fab.addEventListener('click', open); document.body.appendChild(fab);
  }

  function readAsDataURL(file){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){res(r.result);}; r.onerror=rej; r.readAsDataURL(file); }); }

  async function uploadPhotos(files){
    var urls=[]; var max=Math.min(files.length,4);
    for(var i=0;i<max;i++){
      try{
        var dataUrl=await readAsDataURL(files[i]);
        var r=await fetch(base+'/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contentType:files[i].type,dataBase64:dataUrl})});
        var j=await r.json(); if(j&&j.url) urls.push(j.url);
      }catch(e){ /* skip a failed photo */ }
    }
    return urls;
  }

  overlay.querySelector('.tmw-form').addEventListener('submit', async function(e){
    e.preventDefault();
    var f=e.target; var msgEl=f.querySelector('.tmw-msg'); var btn=f.querySelector('.tmw-send');
    if(f.company.value){ return; }
    btn.disabled=true; btn.textContent='Sending…';
    var photos=[];
    if(f.photos.files && f.photos.files.length){ photos=await uploadPhotos(f.photos.files); }
    try{
      await fetch(base+'/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({routeKey:key,name:f.name.value,phone:f.phone.value,postcode:f.postcode.value,message:f.msg.value,photos:photos,source:'widget'})});
      msgEl.style.display='block'; msgEl.style.color='#16a34a'; msgEl.textContent='Thanks! We\'ve got your message and will call you back shortly.';
      f.reset(); btn.textContent='Sent ✓';
      setTimeout(function(){ close(); btn.disabled=false; btn.textContent='Send enquiry'; msgEl.style.display='none'; }, 2500);
    }catch(err){
      msgEl.style.display='block'; msgEl.style.color='#b91c1c'; msgEl.textContent='Something went wrong — please call us.';
      btn.disabled=false; btn.textContent='Send enquiry';
    }
  });
})();`;

widgetRouter.get("/widget.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(WIDGET_JS);
});
