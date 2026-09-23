import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = "https://bdasgggmksubcntqicfr.supabase.co";
const SUPABASE_KEY = "sb_publishable_XNHu3v0-mBOp89Q5uPHV_Q_FxPZ3y2m";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const PLACE_NAMES = {
  CANCHA1:"Cancha 1", CANCHA2:"Cancha 2", M01:"Mesa VIP", M02:"Mesa 2", M03:"Mesa 3",
  M04:"Mesa 4", M05:"Mesa 5", M06:"Mesa 6", M07:"Mesa 7", M08:"Mesa 8",
  M09:"Mesa 9", M10:"Mesa 10", M11:"Mesa 11", M12:"Mesa 12"
};

const qs = new URLSearchParams(location.search);
const place = (qs.get("place") || qs.get("mesa") || "M01").toUpperCase();
const state = { categories:[], products:[], groups:[], options:[], links:[], cart:[], current:null, selectedCategory:"all" };

const $ = s => document.querySelector(s);
const money = n => "L " + Number(n || 0).toLocaleString("es-HN",{minimumFractionDigits:2,maximumFractionDigits:2});
const toast = msg => { const t=$("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2300); };

$("#placeName").textContent = PLACE_NAMES[place] || place;
$("#heroAction").onclick = () => $("#products").scrollIntoView({behavior:"smooth"});
$("#searchButton").onclick = () => $("#search").classList.toggle("hidden");
$("#search").oninput = renderProducts;
$("#cartButton").onclick = $("#cartDock").onclick = () => { renderCart(); $("#cartDialog").showModal(); };
$("#orderButton").onclick = showOrderStatus;
$("#bellButton").onclick = () => $("#bellDialog").showModal();
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
document.querySelectorAll("[data-reason]").forEach(b=>b.onclick=()=>callStaff(b.dataset.reason));

function productTotal(item){
  const p = state.products.find(x=>x.id===item.product_id);
  const extras = item.option_ids.reduce((sum,id)=>sum+Number(state.options.find(o=>o.id===id)?.price_delta||0),0);
  return (Number(p?.price||0)+extras)*item.qty;
}
function cartTotal(){ return state.cart.reduce((s,i)=>s+productTotal(i),0); }
function updateDock(){
  const count=state.cart.reduce((s,i)=>s+i.qty,0);
  $("#cartCount").textContent=count; $("#dockCount").textContent=count; $("#dockTotal").textContent=money(cartTotal())+" →";
  $("#cartDock").classList.toggle("hidden",count===0);
}
async function load(){
  const [c,p,g,o,l] = await Promise.all([
    sb.from("categories").select("*").eq("active",true).order("sort_order"),
    sb.from("products").select("*").eq("active",true).order("sort_order"),
    sb.from("option_groups").select("*").eq("active",true).order("sort_order"),
    sb.from("options").select("*").eq("active",true).order("sort_order"),
    sb.from("product_option_groups").select("*")
  ]);
  const err = c.error||p.error||g.error||o.error||l.error;
  if(err) toast("No se pudo cargar el menú");
  state.categories=c.data||[]; state.products=p.data||[]; state.groups=g.data||[]; state.options=o.data||[]; state.links=l.data||[];
  renderCategories(); renderProducts();
  setTimeout(()=>$("#splash").classList.add("fade"),250);
}
function renderCategories(){
  const nav=$("#categories"); nav.innerHTML="";
  const all=document.createElement("button"); all.textContent="Todo"; all.className=state.selectedCategory==="all"?"active":"";
  all.onclick=()=>{state.selectedCategory="all";renderCategories();renderProducts()}; nav.append(all);
  state.categories.forEach(c=>{const b=document.createElement("button");b.textContent=c.name;b.className=state.selectedCategory===c.id?"active":"";b.onclick=()=>{state.selectedCategory=c.id;renderCategories();renderProducts()};nav.append(b)});
}
function renderProducts(){
  const q=$("#search").value.trim().toLowerCase();
  let items=state.products.filter(p=>(!q||(p.name+" "+(p.description||"")).toLowerCase().includes(q))&&(state.selectedCategory==="all"||p.category_id===state.selectedCategory));
  const out=$("#products"); out.innerHTML="";
  if(!items.length){
    out.innerHTML='<div class="empty"><h3>Menú listo para cargar</h3><p>No hay productos visibles todavía. Cuando se agreguen productos en Distrito 504 POS aparecerán aquí automáticamente.</p></div>';
    return;
  }
  items.forEach(p=>{const el=document.createElement("article");el.className="product";el.innerHTML='<div><span class="station">'+(p.station==="LB"?"LA BANDEJA":"BEER STATION")+'</span><h3>'+escapeHtml(p.name)+'</h3><p>'+escapeHtml(p.description||"")+'</p></div><footer><b>'+money(p.price)+'</b><button>Agregar</button></footer>';el.querySelector("button").onclick=()=>openProduct(p);out.append(el)});
}
function openProduct(p){
  state.current={product:p, option_ids:[]};
  $("#detailBrand").textContent=p.station==="LB"?"LA BANDEJA":"BEER STATION";
  $("#detailName").textContent=p.name; $("#detailDescription").textContent=p.description||""; $("#itemNote").value="";
  const groups=state.links.filter(x=>x.product_id===p.id).map(x=>state.groups.find(g=>g.id===x.option_group_id)).filter(Boolean);
  const wrap=$("#optionGroups"); wrap.innerHTML="";
  groups.forEach(g=>{const box=document.createElement("div");box.className="option-group";box.innerHTML="<h4>"+escapeHtml(g.name)+(g.required?" *":"")+"</h4>";state.options.filter(o=>o.option_group_id===g.id).forEach(o=>{const row=document.createElement("label");row.className="option";const type=g.max_selections===1?"radio":"checkbox";row.innerHTML='<span><input type="'+type+'" name="g_'+g.id+'" value="'+o.id+'"> '+escapeHtml(o.name)+'</span><b>'+(Number(o.price_delta)?("+"+money(o.price_delta)):"")+"</b>";row.querySelector("input").onchange=()=>refreshConfiguredPrice();box.append(row)});wrap.append(box)});
  refreshConfiguredPrice(); $("#productDialog").showModal();
}
function selectedOptionIds(){ return [...$("#optionGroups").querySelectorAll("input:checked")].map(x=>x.value); }
function refreshConfiguredPrice(){ const ids=selectedOptionIds();const extra=ids.reduce((s,id)=>s+Number(state.options.find(o=>o.id===id)?.price_delta||0),0);$("#detailPrice").textContent=money(Number(state.current?.product.price||0)+extra); }
$("#addConfigured").onclick=()=>{
  if(!state.current)return; const p=state.current.product; const option_ids=selectedOptionIds();
  state.cart.push({product_id:p.id,qty:1,option_ids,note:$("#itemNote").value.trim()}); updateDock(); $("#productDialog").close(); toast("Agregado al pedido");
};
function renderCart(){
  const box=$("#cartItems"); box.innerHTML="";
  state.cart.forEach((i,idx)=>{const p=state.products.find(x=>x.id===i.product_id);const el=document.createElement("div");el.className="cart-line";el.innerHTML='<div><b>'+escapeHtml(p?.name||"Producto")+'</b><small>'+i.qty+' × '+money(productTotal({...i,qty:1}))+(i.note?" · "+escapeHtml(i.note):"")+'</small></div><div><b>'+money(productTotal(i))+'</b><button data-i="'+idx+'">Quitar</button></div>';el.querySelector("button").onclick=()=>{state.cart.splice(idx,1);renderCart();updateDock()};box.append(el)});
  $("#cartTotal").textContent=money(cartTotal());
  if(!state.cart.length)box.innerHTML='<div class="empty">Tu carrito está vacío.</div>';
}
$("#sendOrder").onclick=async()=>{
  const name=$("#customerName").value.trim(); if(!name)return toast("Escribe tu nombre"); if(!state.cart.length)return toast("Agrega productos");
  const btn=$("#sendOrder"); btn.disabled=true; btn.textContent="Enviando…";
  const payload={place,name,items:state.cart.map(x=>({product_id:x.product_id,qty:x.qty,option_ids:x.option_ids,note:x.note}))};
  const {data,error}=await sb.rpc("place_public_order",{p_payload:payload});
  btn.disabled=false;btn.textContent="Enviar pedido";
  if(error)return toast(error.message||"No se pudo enviar");
  const saved=JSON.parse(localStorage.getItem("d504_orders")||"[]"); saved.unshift({order_id:data.order_id,tracking_token:data.tracking_token,total:data.total,created_at:new Date().toISOString()}); localStorage.setItem("d504_orders",JSON.stringify(saved.slice(0,10)));
  state.cart=[];updateDock();$("#cartDialog").close();toast("Pedido enviado ✅");
};
async function callStaff(reason){
  $("#bellMessage").textContent="Enviando solicitud…";
  const {error}=await sb.rpc("call_staff_public",{p_payload:{place,reason}});
  $("#bellMessage").textContent=error?(error.message||"No se pudo enviar"):"Solicitud enviada. Ya avisamos al personal.";
}
async function showOrderStatus(){
  const saved=JSON.parse(localStorage.getItem("d504_orders")||"[]"); const box=$("#orderStatus"); box.innerHTML="";
  if(!saved.length){box.innerHTML='<div class="empty">Todavía no has enviado pedidos desde este dispositivo.</div>';$("#statusDialog").showModal();return}
  for(const it of saved){const {data}=await sb.rpc("get_public_order_status",{p_tracking_token:it.tracking_token});const el=document.createElement("div");el.className="status-card";el.innerHTML="<b>"+statusLabel(data?.status||"RECEIVED")+"</b><div>"+money(data?.total??it.total)+"</div><small>"+new Date(data?.created_at||it.created_at).toLocaleString("es-HN")+"</small>";box.append(el)}
  $("#statusDialog").showModal();
}
function statusLabel(s){return {RECEIVED:"Recibido",PREPARING:"Preparando",READY:"Listo",ON_THE_WAY:"En camino",DELIVERED:"Entregado",CANCELLED:"Cancelado"}[s]||s}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
load();