"use client"

import { cn } from "@/lib/utils"

export type CardShape = "Circle" | "Triangle" | "Cross" | "Square" | "Star" | "Whot"

interface WhotCardProps {
  shape?: CardShape | string
  number?: number
  variant?: "face" | "back"
  className?: string
  accent?: string
  label?: string
  faded?: boolean
}

const WHOT_INK = "#8b2037"
const WHOT_BG = "var(--card)"
const WHOT_SPRITE_SRC = "/whotdrawing.svg"
const WHOT_BACK_VIEWBOX = "903.58352 99.89340 197.35558 312.69339"
const WHOT_FRAME_VIEWBOX = "440.33955 435.96146 197.35558 312.69339"
const WHOT_BACK_ID = "g186"
const WHOT_FRAME_ID = "rect27"
const WHOT_WHOT_FACE_ID = "g246"
const WHOT_WHOT_FACE_VIEWBOX = "675.58332 99.89340 197.35558 312.69339"
const WHOT_FACE_WIDTH = 197.35558
const WHOT_FACE_HEIGHT = 312.69339
const WHOT_FACE_VIEWBOX = `0 0 ${WHOT_FACE_WIDTH} ${WHOT_FACE_HEIGHT}`

type FaceTextSpec = {
  x: number
  y: number
  transform: string
}

type ShapeTemplate = {
  offsetX: number
  offsetY: number
  shapeIds: string[]
  topText: FaceTextSpec
  bottomText: FaceTextSpec
}

const WHOT_SHAPE_TEMPLATES: Record<Exclude<CardShape, "Whot">, ShapeTemplate> = {
  Circle: {
    offsetX: 193.82826,
    offsetY: 98.70435,
    shapeIds: ["ellipse63", "circle10", "circle12"],
    topText: { x: 210.90817, y: 141.95665, transform: "scale(0.95120444,1.0512987)" },
    bottomText: { x: -403.22528, y: -344.78622, transform: "scale(-0.95120444,-1.0512987)" },
  },
  Triangle: {
    offsetX: 1163.28142,
    offsetY: 435.51529,
    shapeIds: ["path181", "path182", "path183"],
    topText: { x: 1230.093, y: 460.07001, transform: "scale(0.95120444,1.0512987)" },
    bottomText: { x: -1420.3075, y: -662.8996, transform: "scale(-0.95120444,-1.0512987)" },
  },
  Cross: {
    offsetX: 675.39314,
    offsetY: 436.33957,
    shapeIds: ["rect40", "rect62", "rect43", "rect44", "rect46", "rect47"],
    topText: { x: 717.17676, y: 460.85474, transform: "scale(0.95120444,1.0512987)" },
    bottomText: { x: -909.49384, y: -663.68427, transform: "scale(-0.95120444,-1.0512987)" },
  },
  Square: {
    offsetX: 440.33955,
    offsetY: 435.96146,
    shapeIds: ["rect26", "rect24", "rect25"],
    topText: { x: 470.06516, y: 460.49509, transform: "scale(0.95120444,1.0512987)" },
    bottomText: { x: -660.27966, y: -663.32465, transform: "scale(-0.95120444,-1.0512987)" },
  },
  Star: {
    offsetX: 437.58332,
    offsetY: 99.8934,
    shapeIds: ["path37", "path162", "path163"],
    topText: { x: 467.16757, y: 140.82562, transform: "scale(0.95120444,1.0512987)" },
    bottomText: { x: -659.48468, y: -343.65518, transform: "scale(-0.95120444,-1.0512987)" },
  },
}

const WhotSprite = ({
  id,
  viewBox,
  className,
}: {
  id: string
  viewBox: string
  className?: string
}) => {
  const href = `${WHOT_SPRITE_SRC}#${id}`
  return (
    <svg
      viewBox={viewBox}
      className={cn("h-full w-full", className)}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <use href={href} xlinkHref={href} />
    </svg>
  )
}

const WhotUse = ({ id }: { id: string }) => {
  const href = `${WHOT_SPRITE_SRC}#${id}`
  return <use href={href} xlinkHref={href} />
}

export function WhotCard({
  shape,
  number,
  variant = "face",
  className,
  label,
  faded = false,
}: WhotCardProps) {
  // Normalize shape
  const shapeStr = shape?.toString() ?? ""
  let displayShape = "Circle"
  if (shapeStr.includes("Triangle")) displayShape = "Triangle"
  else if (shapeStr.includes("Cross")) displayShape = "Cross"
  else if (shapeStr.includes("Square")) displayShape = "Square"
  else if (shapeStr.includes("Star")) displayShape = "Star"
  else if (shapeStr.includes("Whot")) displayShape = "Whot"

  const displayNumber = number !== undefined ? number.toString() : ""
  const isWhot = displayShape === "Whot"
  const faceTemplate = !isWhot ? WHOT_SHAPE_TEMPLATES[displayShape as Exclude<CardShape, "Whot">] : null
  const faceNumber = isWhot ? "20" : displayNumber || "?"

  return (
    <div
      className={cn(
        "relative select-none overflow-hidden rounded-[6px] bg-card transition-transform hover:scale-105",
        "aspect-[197/312] w-full border border-black/5 shadow-sm",
        faded && "opacity-80",
        className
      )}
    >
      {variant === "back" ? (
        <WhotSprite id={WHOT_BACK_ID} viewBox={WHOT_BACK_VIEWBOX} className="absolute inset-0" />
      ) : isWhot ? (
        <WhotSprite
          id={WHOT_WHOT_FACE_ID}
          viewBox={WHOT_WHOT_FACE_VIEWBOX}
          className="absolute inset-0"
        />
      ) : (
        <svg
          viewBox={WHOT_FACE_VIEWBOX}
          className="absolute inset-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="0" y="0" width={WHOT_FACE_WIDTH} height={WHOT_FACE_HEIGHT} fill={WHOT_BG} />
          {faceTemplate ? (
            <g transform={`translate(${-faceTemplate.offsetX} ${-faceTemplate.offsetY})`}>
              {faceTemplate.shapeIds.map((id) => (
                <WhotUse key={id} id={id} />
              ))}
              <text
                x={faceTemplate.topText.x}
                y={faceTemplate.topText.y}
                transform={faceTemplate.topText.transform}
                fontFamily="'Times New Roman', serif"
                fontSize="50.1095"
                fill="none"
                stroke={WHOT_INK}
                strokeWidth="5.26389"
                strokeOpacity="1"
              >
                {faceNumber}
              </text>
              <text
                x={faceTemplate.bottomText.x}
                y={faceTemplate.bottomText.y}
                transform={faceTemplate.bottomText.transform}
                fontFamily="'Times New Roman', serif"
                fontSize="50.1095"
                fill="none"
                stroke={WHOT_INK}
                strokeWidth="5.26389"
                strokeOpacity="1"
              >
                {faceNumber}
              </text>
            </g>
          ) : null}
        </svg>
      )}
      {/* Always render frame to ensure consistent border alignment */}
      <WhotSprite
        id={WHOT_FRAME_ID}
        viewBox={WHOT_FRAME_VIEWBOX}
        className="pointer-events-none absolute inset-0 mix-blend-multiply opacity-60"
      />
    </div>
  )
}
