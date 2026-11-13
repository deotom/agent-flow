/** Decorative local-clock daylight; the garden faces east on the left.
 * Uses a 06:00–18:00 sun path, without requiring location access or a weather service.
 */
export function officeDaylight(date: Date) {
  const hour=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600
  const stops: readonly (readonly [number,string,string,number])[] = [
    [0,'#101b39','#354569',.08],[5,'#172744','#68647a',.1],
    [6,'#a391b1','#f4bb85',.4],[8,'#70b6df','#d2e6df',.9],
    [12,'#559ed3','#c9e1e5',1],[16,'#7eb2cd','#e4d7ae',.85],
    [17,'#b58da4','#f5c087',.6],[18,'#615a83','#d89476',.3],
    [19,'#142440','#425272',.08],[24,'#101b39','#354569',.08],
  ]
  const index=stops.findIndex((stop,i)=>i>0&&hour<=stop[0])
  const a=stops[Math.max(0,index-1)],b=stops[index<0?stops.length-1:index]
  const t=(hour-a[0])/(b[0]-a[0]||1)
  const color=(from:string,to:string)=>'#'+[1,3,5].map(i=>Math.round(parseInt(from.slice(i,i+2),16)*(1-t)+parseInt(to.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('')
  const progress=(hour-6)/12
  return {top:color(a[1],b[1]),horizon:color(a[2],b[2]),light:a[3]+(b[3]-a[3])*t,
    sun:hour>=6&&hour<18?{x:.06+.88*progress,y:.43-.39*Math.sin(progress*Math.PI)}:null,
    shadow:Math.cos(progress*Math.PI),night:hour<5.5||hour>=18.5}
}
