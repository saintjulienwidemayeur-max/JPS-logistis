// Demo data for the showcase video, created through the site's real API (local server only).
import { readFileSync } from 'node:fs';
const B='http://localhost:3000', F='http://localhost:4555', PH=process.argv[2];
const j=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return t}};
const adm=(await j(await fetch(B+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'demo-admin-2026'})}))).token;
const A={Authorization:'Bearer '+adm};
const aj=(m,u,b)=>fetch(B+u,{method:m,headers:{...A,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(j);
// keep only the RAV4 (used for the pre-order demo) from the seeded list
for(const v of await aj('GET','/api/admin/vehicules')) if(v.id!=='rav16') await aj('DELETE','/api/admin/vehicules/'+v.id);
const NEW=[['gle-coupe','Mercedes-Benz','GLE Coupé','mercedes-gle-coupe','Rouge','#8E1419',true],['q8','Audi','Q8','audi-q8','Blanc','#E9EAEC',true],
 ['evoque','Range Rover','Evoque','range-rover-evoque','Gris','#6F7379',true],['gx','Lexus','GX','lexus-gx','Noir','#202226',false],
 ['glc-coupe','Mercedes-Benz','GLC Coupé','mercedes-glc-coupe','Blanc','#ECEDEF',false],['q3','Audi','Q3 Sportback','audi-q3','Gris','#7D8187',false],
 ['hs','MG','HS','mg-hs','Rouge','#A3141A',false],['x70','Jetour','X70 Plus','jetour-x70','Gris','#6F7379',false]];
const IDS={};
for(const [id,ma,mo,img,c,hx,ved] of NEW){
  const r=await aj('POST','/api/admin/vehicules',{id,marque:ma,modele:mo,annee:null,couleur:c,hex:hx,km:null,prix:null,statut:'disponible',type:'SUV',forme:'suv',moteur:null,trans:'Automatique',traction:null,places:id==='x70'?7:5,delai:null,note:'Financement disponible',vedette:ved});
  if(r.error) console.log('veh',id,r.error); IDS[id]=r.id;
  const f=new FormData(); f.append('photos',new File([readFileSync(`${PH}/${img}.jpg`)],img+'.jpg',{type:'image/jpeg'}));
  const u=await fetch(B+`/api/admin/vehicules/${r.id}/photos`,{method:'POST',headers:A,body:f}).then(j); if(u.error) console.log('photo',id,u.error);
}
// client account
const ins=await fetch(B+'/api/compte/inscription',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nom:'Jean-Marc Pierre',tel:'+509 3700 1234',email:'jm.pierre@exemple.ht',mot_de_passe:'demo-client-2026'})});
const cookie=(ins.headers.get('set-cookie')||'').split(';')[0]; console.log('client',ins.status);
const dossier=async(o,ck)=>{const f=new FormData();for(const[k,v]of Object.entries({conditions_acceptees:'1',...o}))f.append(k,v);return j(await fetch(B+'/api/dossiers',{method:'POST',headers:ck?{Cookie:ck}:{},body:f}))};
const paid=async d=>{if(!d.paiement_id)return {};await fetch(F+'/_set/'+d.paiement_id+'/succeeded',{headers:{Authorization:'Bearer sk_test_local'}});await new Promise(r=>setTimeout(r,4200));return j(await fetch(B+'/api/dossiers/'+d.ref))};
const L=(a)=>JSON.stringify({lignes:a,champs:{}});
const D=async(o,ck)=>{const r=await dossier(o,ck);console.log('dossier',o.service,JSON.stringify(r).slice(0,200));return r};
const d1=await D({service:'precommande',vehicule_id:'rav16',methode:'moncash',client_nom:'Jean-Marc Pierre',client_tel:'+509 3700 1234',donnees:L([['Véhicule','Toyota RAV4 2016'],['Paiement','90 % à la commande']])},cookie);
const d2=await D({service:'consultation',methode:'carte',client_email:'jm.pierre@exemple.ht',client_nom:'Jean-Marc Pierre',client_tel:'+509 3700 1234',donnees:L([['Budget','25 000 $'],['Usage','Famille']])},cookie);
const d3=await D({service:'essai',vehicule_id:IDS['gle-coupe'],methode:'natcash',client_nom:'Jean-Marc Pierre',client_tel:'+509 3700 1234',donnees:L([['Véhicule','Mercedes-Benz GLE Coupé'],['Date souhaitée','Samedi 10 h']])},cookie);
console.log(d1.ref,d2.ref,d3.ref,d1.error||'',d2.error||'',d3.error||'');
for(const d of [d1,d2,d3]) console.log((await paid(d)).paiement?.statut);
// other demo clients (no account) for the admin dashboard
const others=[['Nadège Louis','+509 3711 2233','recherche','moncash'],['Samuel Étienne','+509 3722 3344','financement','natcash'],['Christelle Joseph','+509 3733 4455','vendre','moncash'],['Ricardo Jean','+509 3744 5566','consultation','moncash']];
for(const [n,t,s,m] of others){const d=await dossier({service:s,methode:m,client_nom:n,client_tel:t,donnees:L([['Demande','Démo']])});if(d.error)console.log(s,d.error);else if(s!=='recherche')await paid(d);}
// move files forward
console.log(await aj('PATCH','/api/admin/dossiers/'+d1.ref,{etape:2}).then(x=>x.etape??x));
console.log(await aj('PATCH','/api/admin/dossiers/'+d2.ref,{etape:1}).then(x=>x.etape??x));
// a quote
const dv=await aj('POST','/api/admin/devis',{client_nom:'Jean-Marc Pierre',client_email:'jm.pierre@exemple.ht',client_tel:'+509 3700 1234',lignes:[{description:'Recherche et achat accompagné — Audi Q8',quantite:1,prix_unitaire:50},{description:'Inspection et rapport du véhicule',quantite:1,prix_unitaire:30},{description:'Préparation des documents',quantite:1,prix_unitaire:25}],frais_supplementaires:0});
console.log('devis',dv.numero,dv.jeton,dv.error||'');
console.log(JSON.stringify({adm,cookie,d1:d1.ref,d2:d2.ref,d3:d3.ref,devis:dv.jeton}));
