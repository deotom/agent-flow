import { OFFICE_GARDEN_LIFT_SILL_OFFSET, officeNavigation } from '../../../lib/office-navigation'
import type { OfficeLiftVisual, OfficeScene } from '../../../lib/office-types'
import { drawLitGardenLamp, drawUnlitGardenLamp } from './office-garden-art'

// Source rectangles in world-lift.webp, cut from the 992px-wide Office concept.
const gardenDoor = { x: 7, y: 54, width: 92, height: 176 }
const landing = { x: 107, y: 0, width: 136, center: 67,
  door: { x: 25, y: 100, width: 88, height: 418 },
  sill: { y: 531, height: 31 } }
const shaft = { x: 0, y: 240, width: 126, height: 170, center: 59 }
const landingPanelHeight = 172
// The landing coordinate crosses the top of the stone, behind its rounded front lip.
const sillSurfaceDepth = 3

interface Rect { x: number; y: number; width: number; height: number }

function drawLeaves(c: CanvasRenderingContext2D, atlas: CanvasImageSource, source: Rect, opening: Rect, open: number) {
  c.save()
  c.beginPath()
  c.rect(opening.x, opening.y, opening.width, opening.height)
  c.clip()
  const half = opening.width / 2
  for (const side of [0, 1]) {
    const shift = (side === 0 ? -1 : 1) * half * open
    c.drawImage(atlas, source.x + source.width / 2 * side, source.y, source.width / 2, source.height,
      opening.x + half * side + shift, opening.y, half, opening.height)
  }
  c.restore()
}

function gardenOpening(center: number, y: number, scale: number): Rect {
  return { x: center - 24 * scale, y: y - 80 * scale, width: 48 * scale, height: 80 * scale }
}

function referenceLiftGeometry(nav: ReturnType<typeof officeNavigation>) {
  const unit = nav.scale * 450 / 992
  const center = nav.shaftX
  const left = center - shaft.center * unit
  const width = shaft.width * unit
  const shaftTop = nav.top + (4.5 + OFFICE_GARDEN_LIFT_SILL_OFFSET) * nav.scale
  const shaftBottom = Math.max(shaftTop, ...nav.landings.map(stop => stop.y))
  const shaftHeight = shaftBottom - shaftTop
  const opening = gardenOpening(center, nav.hatch.y, nav.scale)
  const shaftCavityWidth = landing.door.width * unit
  const shaftCavityLeft = center - shaftCavityWidth / 2
  return { unit, center, left, width, shaftTop, shaftBottom, shaftHeight, opening, shaftCavityWidth, shaftCavityLeft }
}

/** Keep Desktop lift riders inside the garden opening and underground shaft cavity, behind the garden sill and jambs. */
export function clipOfficeReferenceLiftRider(c: CanvasRenderingContext2D, scene: OfficeScene) {
  const { opening, shaftCavityLeft, shaftCavityWidth, shaftTop, shaftHeight } = referenceLiftGeometry(officeNavigation(scene))
  c.beginPath()
  c.rect(opening.x, opening.y, opening.width, opening.height)
  if (shaftHeight > 0) c.rect(shaftCavityLeft, shaftTop, shaftCavityWidth, shaftHeight)
  c.clip()
}

function drawGardenDoors(c: CanvasRenderingContext2D, atlas: CanvasImageSource, center: number, y: number, scale: number, open: number, lampOn:boolean) {
  // The garden plate already includes the timber arch, railing, vines and sill.
  const opening = gardenOpening(center, y, scale)
  c.save()
  if (lampOn) c.filter = 'brightness(0.64)'
  drawLeaves(c, atlas, gardenDoor, opening, open)
  // The fixed wooden panel includes the lantern and both sides up to the jambs.
  const unit = opening.width / gardenDoor.width
  const height = gardenDoor.y * unit
  const top = opening.y - height
  c.drawImage(atlas, gardenDoor.x, 0, gardenDoor.width, gardenDoor.y, opening.x, top, opening.width, height)
  c.restore()
  const paintLamp = lampOn ? drawLitGardenLamp : drawUnlitGardenLamp
  paintLamp(c,opening.x+(53-gardenDoor.x)*unit,top+34*unit,scale*.91,scale)
}

export function drawOfficeReferenceLift(
  c: CanvasRenderingContext2D, atlas: CanvasImageSource, nav: ReturnType<typeof officeNavigation>,
  front: boolean, car: OfficeLiftVisual, stops: readonly { y: number; surface: boolean; open: number; waiting?: boolean }[],gardenLampOn=true,
) {
  const unit = nav.scale * 450 / 992
  const center = nav.shaftX
  c.save()
  if (front) {
    for (const stop of stops) {
      if (stop.surface) {
        drawGardenDoors(c, atlas, center, stop.y, nav.scale, stop.open,gardenLampOn)
        continue
      }
      const { door } = landing
      const left = center - landing.center * unit
      const width = landing.width * unit
      const panelHeight = landingPanelHeight * unit
      const lowerTop = stop.y - sillSurfaceDepth * nav.scale
      const top = lowerTop - panelHeight - door.y * unit
      const opening = { x: left + door.x * unit, y: lowerTop - panelHeight, width: door.width * unit, height: panelHeight }
      c.save()
      if (stop.open > 0) {
        c.beginPath()
        c.rect(left, top, width, lowerTop - top)
        c.rect(opening.x, opening.y, opening.width, opening.height)
        c.clip('evenodd')
      }
      // Preserve the lantern arch. Fit the leaves between it and the floor-level sill.
      c.drawImage(atlas, landing.x, landing.y, landing.width, door.y, left, top, width, door.y * unit)
      c.drawImage(atlas, landing.x, landing.y + door.y, landing.width, door.height, left, opening.y, width, panelHeight)
      c.restore()
      if (stop.open > 0) {
        drawLeaves(c, atlas, { ...door, x: landing.x + door.x, y: landing.y + door.y }, opening, stop.open)
      }
      c.drawImage(atlas, landing.x, landing.sill.y, landing.width, landing.sill.height,
        left, lowerTop, width, landing.sill.height * unit)
      const scale=nav.scale,plateX=left+2*scale,plateY=stop.y-43*scale
      c.fillStyle='#4c311d'
      c.fillRect(plateX,plateY,7*scale,12*scale)
      c.fillStyle=stop.open>.95?'#bfdb97':stop.waiting?'#ffb54c':'#cc9455'
      c.fillRect(plateX+2*scale,plateY+3*scale,3*scale,5*scale)
    }
  } else {
    const { unit, center, left, width, shaftTop, shaftHeight, opening } = referenceLiftGeometry(nav)
    c.beginPath()
    c.rect(left, shaftTop, width, shaftHeight)
    c.rect(opening.x, opening.y, opening.width, opening.height)
    c.clip()
    if (shaftHeight > 0) c.drawImage(atlas, shaft.x, shaft.y, shaft.width, shaft.height, left, shaftTop, width, shaftHeight)
    const atGarden = car.y <= nav.hatch.y + nav.scale
    const cabinWidth = atGarden ? opening.width : landing.door.width * unit
    const cabinLeft = atGarden ? opening.x : center - cabinWidth / 2
    const cabinHeight = atGarden ? nav.hatch.y - opening.y : landingPanelHeight * unit + sillSurfaceDepth * nav.scale
    const cabinTop = car.y - cabinHeight
    c.drawImage(atlas, shaft.x + 12, shaft.y, shaft.width - 24, shaft.height, cabinLeft, cabinTop, cabinWidth, cabinHeight)
    c.fillStyle = '#26130c75'
    c.fillRect(cabinLeft, cabinTop, cabinWidth, cabinHeight)
    c.fillStyle = '#e6b26b'
    c.fillRect(cabinLeft, car.y-2*nav.scale, cabinWidth, 2 * nav.scale)
  }
  c.restore()
}
