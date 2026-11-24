const skinTones=['#f0c4a1','#d9a37e','#bd855f','#a46b4a','#895339','#6c4232'] as const
const startingTones=[1,0,4,2,0,5,3,4,1,2] as const
// Preserve the first roster and rotate the three traits on separate cycles.
export function officePaintedAvatarLook(slot:number,hairstyles:6|10=10){
 const safe=Number.isSafeInteger(slot)&&slot>=0?slot:0
 const hair=safe%hairstyles,group=Math.floor(safe/hairstyles)
 const tone=(startingTones[hair]+group)%skinTones.length
 const cloak=(hair+group%skinTones.length*5+Math.floor(group/skinTones.length))%6
 return {hair,cloak,tone,skin:skinTones[tone]}
}
