import { analyze } from '../src/algorithms/scoring'
import { BRANDS } from '../src/data/brands'
const SET = [
 ['pаypal.com',1],['аррӏе.com',1],['gооgle.com',1],['phonepе.com',1],['microsоft.com',1],['hdfcbаnk.com',1],['аmazon.in',1],
 ['paypa1.com',1],['g00gle.com',1],['faceb00k.com',1],['amaz0n.in',1],
 ['secure-paypal.xyz',1],['amazon-kyc-update.tk',1],['sbi-rewards.tk',1],['hdfcbank.account-verify.com',1],['paytm-cashback.online',1],
 ['paypal.com',0],['google.com',0],['hdfcbank.com',0],['amazon.in',0],['microsoft.com',0],['flipkart.com',0],
 ['randomblog.dev',0],['mycoolwebsite.com',0],['example.org',0],['notabank.net',0],
] as [string,number][]
function lev(a:string,b:string){const n=a.length,m=b.length;const d=Array.from({length:n+1},()=>new Array(m+1).fill(0));for(let i=1;i<=n;i++)d[i][0]=i;for(let j=1;j<=m;j++)d[0][j]=j;for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[n][m]}
const cores=BRANDS.filter(b=>b.core.length>=4)
function base(dom:string,t:number){const h=dom.split('/')[0];const labels=h.split('.');const sld=labels[labels.length-2]??'';const reg=labels.slice(-2).join('.');if(BRANDS.some(b=>b.domain===reg))return false;let mn=99;for(const b of cores)mn=Math.min(mn,lev(sld,b.core));return mn<=t}
function metrics(pred:(d:string)=>boolean){let tp=0,fn=0,fp=0,tn=0;for(const [d,ph] of SET){const p=pred(d);if(ph&&p)tp++;else if(ph&&!p)fn++;else if(!ph&&p)fp++;else tn++}return{recall:tp/(tp+fn),fpr:fp/(fp+tn),acc:(tp+tn)/SET.length}}
const pg=metrics(d=>analyze(d).level!=='safe')
const b1=metrics(d=>base(d,1))
const b3=metrics(d=>base(d,3))
const f=(m:any)=>`recall ${Math.round(m.recall*100)}%  FPR ${Math.round(m.fpr*100)}%  acc ${Math.round(m.acc*100)}%`
console.log('Unmaskr       ', f(pg))
console.log('Baseline (t=1)   ', f(b1))
console.log('Baseline (t=3)   ', f(b3))
