import type { OfficeArchitectureArt, OfficeScene } from '../../../lib/office-types'
import { officeDoorBounds, officeInteriorDoor } from '../../../lib/office-navigation'

type Ctx = CanvasRenderingContext2D

/** The doorway is shared by main-room travel and the private cutaway view. */
export function drawOfficeInteriorDoors(c: Ctx, scene: OfficeScene, activeDoorFloorId: string | null = null, art?:OfficeArchitectureArt|null) {
  const scale = scene.width / 450
  const doors = scene.floors.filter(floor => floor.annexOf
    ? !scene.floors.some(parent => parent.id === floor.annexOf)
    : floor.kind === 'team' && scene.floors.some(annex => annex.annexOf === floor.id))
  for (const floor of doors) {
    const height = floor.height ?? 0
    if (floor.constructing || height < 60 * scale) continue
    const annex = scene.floors.find(item => item.annexOf === floor.id)
    const open = activeDoorFloorId === floor.id || activeDoorFloorId === annex?.id || activeDoorFloorId === floor.annexOf
    const point=officeInteriorDoor(scene,floor.id),bounds=officeDoorBounds(scene,floor.id)
    if(!point||!bounds)continue
    c.save()
    c.beginPath(); c.rect(0, floor.y, scene.width * .89, height); c.clip()
    if(art){
      c.drawImage(open?art.doorOpen:art.doorClosed,bounds.x,bounds.y,bounds.width,bounds.height)
      c.restore();continue
    }
    c.translate(point.x,point.y); c.scale(scale, scale)
    c.fillStyle = '#30251e'; c.fillRect(-17, -77, 34, 80)
    c.fillStyle = '#ac7a45'; c.fillRect(-16, -77, 4, 79); c.fillRect(12, -77, 4, 79); c.fillRect(-16, -77, 32, 5)
    c.fillStyle = '#e1ba7a'; c.fillRect(-15, -76, 2, 77); c.fillRect(-15, -76, 30, 2)
    c.fillStyle = open ? '#152b28' : '#79532f'; c.fillRect(-12, -72, 24, 73)
    if (open) {
      const glow = 'rgba(246,202,122,.12)'
      c.fillStyle = glow; c.fillRect(-10, -68, 20, 69)
      c.fillStyle = '#c39c60'; c.fillRect(-12, -72, 5, 73); c.fillRect(-7, -70, 2, 69)
    } else {
      c.fillStyle = '#9a6c3c'; c.fillRect(-10, -69, 19, 66)
      c.strokeStyle = '#654329'; c.lineWidth = .8; c.beginPath()
      for (const x of [-5, 1, 7]) { c.moveTo(x, -68); c.lineTo(x, -4) }
      c.stroke()
      c.fillStyle = '#3c514b'; c.fillRect(-7, -65, 14, 18)
      c.fillStyle = '#c7cfaa'; c.fillRect(-6, -64, 12, 15)
      c.strokeStyle = '#78613b'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -64); c.lineTo(0, -49); c.stroke()
      c.fillStyle = '#e6c67e'; c.beginPath(); c.ellipse(7, -31, 1.8, 1.8, 0, 0, Math.PI * 2); c.fill()
    }
    c.fillStyle = '#b59b6e'; c.fillRect(-17, 0, 34, 1)
    c.fillStyle = '#463a28'; c.fillRect(-13, -45, 26, 9)
    c.fillStyle = '#f5dfab'; c.font = 'bold 5px sans-serif'; c.textAlign = 'center'; c.fillText(floor.annexOf ? 'WORK' : 'REST', 0, -39)
    c.fillStyle = '#d8b45f'; c.fillRect(-3, -84, 6, 7)
    c.fillStyle = '#ffe4a2'; c.beginPath(); c.ellipse(0, -81, 2, 3, 0, 0, Math.PI * 2); c.fill()
    c.restore()
  }
}
