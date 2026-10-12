/* 2027 calendar data + holidays (computed, not hard-coded) */
(function(){
  const Y = 2027;
  function easter(y){ // Anonymous Gregorian algorithm
    const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
      h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
      month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
    return new Date(y,month-1,day);
  }
  const add=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
  function nthWeekday(y,m,wd,n){ const d=new Date(y,m,1); const off=(wd-d.getDay()+7)%7; return new Date(y,m,1+off+7*(n-1)); }
  function lastWeekday(y,m,wd){ const d=new Date(y,m+1,0); const off=(d.getDay()-wd+7)%7; return new Date(y,m,d.getDate()-off); }
  const E=easter(Y);
  const ht=[ // Haiti
    [new Date(Y,0,1),"Independence Day"],[new Date(Y,0,2),"Ancestors' Day"],
    [add(E,-48),"Carnival Monday"],[add(E,-47),"Mardi Gras"],[add(E,-2),"Good Friday"],
    [new Date(Y,4,1),"Labour Day"],[add(E,39),"Ascension"],[new Date(Y,4,18),"Flag Day"],
    [add(E,60),"Corpus Christi"],[new Date(Y,7,15),"Assumption"],[new Date(Y,9,17),"Dessalines Day"],
    [new Date(Y,10,1),"All Saints"],[new Date(Y,10,2),"All Souls"],[new Date(Y,10,18),"Vertières"],[new Date(Y,11,25),"Christmas"]];
  const us=[ // United States (federal)
    [new Date(Y,0,1),"New Year"],[nthWeekday(Y,0,1,3),"MLK Day"],[nthWeekday(Y,1,1,3),"Presidents' Day"],
    [lastWeekday(Y,4,1),"Memorial Day"],[new Date(Y,5,19),"Juneteenth"],[new Date(Y,6,4),"Independence Day"],
    [nthWeekday(Y,8,1,1),"Labor Day"],[nthWeekday(Y,9,1,2),"Columbus Day"],[new Date(Y,10,11),"Veterans Day"],
    [nthWeekday(Y,10,4,4),"Thanksgiving"],[new Date(Y,11,25),"Christmas"]];
  const key=d=>d.getMonth()+'-'+d.getDate();
  const H={};
  ht.forEach(([d,n])=>{(H[key(d)]=H[key(d)]||{ht:[],us:[]}).ht.push(n);});
  us.forEach(([d,n])=>{(H[key(d)]=H[key(d)]||{ht:[],us:[]}).us.push(n);});
  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function month(m){
    const first=new Date(Y,m,1).getDay(), days=new Date(Y,m+1,0).getDate();
    const cells=[]; for(let i=0;i<first;i++) cells.push(null);
    for(let d=1;d<=days;d++){ const h=H[m+'-'+d]; cells.push({d, sun:new Date(Y,m,d).getDay()===0, sat:new Date(Y,m,d).getDay()===6, ht:!!(h&&h.ht.length), us:!!(h&&h.us.length)}); }
    while(cells.length%7) cells.push(null);
    const hol=[]; for(let d=1;d<=days;d++){ const h=H[m+'-'+d]; if(!h) continue;
      const names=[...new Set([...h.ht,...h.us])]; hol.push({d,ht:h.ht.length>0,us:h.us.length>0,name:names.join(' / ')}); }
    return {name:MONTHS[m], index:m, cells, hol};
  }
  window.CAL={year:Y, months:[...Array(12).keys()].map(month), easter:E};
})();
